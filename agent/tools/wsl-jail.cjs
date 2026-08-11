// ── Shell terkurung kernel di Windows, lewat WSL + CIFS + bwrap ──
//
// MASALAH YANG DIPECAHKAN. Di Windows, tool `bash` tak punya batas nyata:
// penjaganya memindai TEKS perintah, dan perintah yang merakit path saat jalan
// lolos begitu saja. Terukur — sebuah folder benar-benar dibuat di Desktop dari
// dalam workspace yang "terkurung".
//
// Namespace Linux (bash-jail.cjs) memberi batas sungguhan, tapi hanya ada di
// Linux. Dan distro WSL tak bisa melihat berkas Windows: automount mati, dan
// kernelnya tak punya drvfs.
//
// JALAN KELUARNYA. Folder TETAP di Windows, dibagikan lewat SMB, lalu di-mount
// ke dalam distro sebagai /work. Prosesnya berjalan di dalam bwrap yang hanya
// mengikat /work — jadi shell bekerja dengan API berkas biasa (cat, npm, git)
// sementara batasnya ditegakkan kernel Linux.
//
// Terukur sesudah terpasang:
//   /work di dalam bwrap   65 entri, bisa ditulis
//   /root                  tak terlihat
//   /etc                   tak bisa ditulis
//   jaringan               terputus
//   200 berkas kecil       3 detik (CIFS) vs 1 detik (lokal)
//
// DUA HAL YANG DIPELAJARI DENGAN MAHAL, dan keduanya jadi keputusan di sini:
//
//   1. `credentials=/path` TIDAK BEKERJA di klien CIFS distro ini. Ia ditolak
//      tanpa menghasilkan satu pun event logon di Windows — artinya permintaan
//      tak pernah terkirim. Delapan percobaan mount gagal karenanya. Yang
//      bekerja: user= dan pass= langsung sebagai opsi mount.
//
//   2. MOUNT HILANG saat distro menganggur. WSL2 mematikan VM-nya, dan mount
//      ikut lenyap. Karena itu setiap eksekusi memastikan mount-nya ada lebih
//      dulu — memasangnya sekali di awal tidak cukup.
//
// TIDAK BISA DIGABUNG DENGAN APPCONTAINER, dan itu sudah diukur.
//
// "Gabungkan saja keduanya" hanya punya satu arti teknis: menjalankan wsl.exe
// dari DALAM AppContainer, supaya perintahnya melewati dua batas sekaligus.
// Terukur:
//   wsl -d <distro> -- echo hidup   DI LUAR container   ok, 4589 ms
//   wsl -d <distro> -- echo hidup   DI DALAM container  Access is denied
//   wsl --list                      DI DALAM container  Access is denied
// wsl.exe bicara ke utility VM lewat perangkat dan COM, dan AppContainer
// menutup namespace perangkat. Jadi keduanya BUKAN lapisan yang bisa ditumpuk;
// mereka dua jalur eksekusi yang saling meniadakan.
//
// DAN JALUR INI BUKAN LAGI SOAL JARINGAN. Sempat dinyatakan begitu, lalu
// terbantah: AppContainer sudah menutup jaringan keluar (DNS gagal, TCP
// AccessDenied, loopback ditolak) karena profilnya dibuat tanpa kapabilitas
// jaringan. Yang tersisa sebagai nilai unik jalur ini cuma satu, dan memang
// yang paling mahal untuk ditiru: KERNEL TERPISAH. WSL2 adalah utility VM
// Hyper-V dengan kernelnya sendiri, jadi pelarian dari sini menuntut menembus
// batas VM, bukan sekadar pemeriksaan akses.
//
// KENAPA TETAP OPT-IN, bukan bawaan seperti AppContainer: perintah di sini
// dijalankan `sh` POSIX, bukan cmd/PowerShell. Setiap perintah Windows yang
// sudah ditulis model patah. Perubahan bahasa perintah harus dipilih sadar.
"use strict";

const { execFileSync } = require("child_process");
const _penegakan = require("../penegakan.cjs");

const DISTRO = process.env.WOLFSPACE_WSL_DISTRO || "WolfspaceTest";
const SHARE = process.env.WOLFSPACE_WSL_SHARE || "wolfws";
const KRED = "/root/.smbcred";
const TITIK = "/work";

// Skrip pemasang mount. Idempoten: kalau /work sudah ter-mount, ia tak
// melakukan apa-apa. Sandi dibaca DI DALAM distro dari berkas mode 600 dan tak
// pernah melewati argumen, log, maupun proses Windows.
// SATU BARIS, dipisah ';' — bukan gaya penulisan, melainkan keharusan.
// wsl.exe MERUSAK baris baru di dalam argumen: skrip multi-baris sampai ke
// dalam distro dalam keadaan terpotong, dan gejalanya menyesatkan — `sed`
// mengembalikan kosong sehingga tampak seperti berkas kredensial yang rusak,
// padahal berkasnya utuh. Kesalahan yang sama pernah membuat berkas kredensial
// tertulis 0 byte saat dikirim lewat argumen ber-newline.
const SKRIP_MOUNT = [
  "grep -q ' " + TITIK + " ' /proc/mounts && exit 0",
  "IP=$(ip route | awk '/^default/{print $3}')",
  "U=$(sed -n 's/^username=//p' " + KRED + ")",
  "P=$(sed -n 's/^password=//p' " + KRED + ")",
  '[ -n "$U" ] && [ -n "$P" ] || { echo "kredensial kosong atau ' +
    KRED +
    ' tak terbaca"; exit 3; }',
  "mkdir -p " + TITIK,
  // user=/pass=, BUKAN credentials= — lihat catatan (1) di kepala berkas.
  'mount -t cifs "//$IP/' +
    SHARE +
    '" ' +
    TITIK +
    ' -o "user=$U,pass=$P,vers=3.0,uid=0,gid=0,file_mode=0644,dir_mode=0755"',
].join("\n");

let _siapCache = null;
let _skripTerpasang = false;

function _wsl(args, opts) {
  return execFileSync("wsl.exe", ["-d", DISTRO, "--", ...args], {
    encoding: "utf8",
    timeout: (opts && opts.timeout) || 30000,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

// Skrip dipasang sebagai BERKAS lewat stdin, lalu dijalankan dengan `sh
// /path`. Alasannya bukan kerapian: mengirim skrip sebagai ARGUMEN ke wsl.exe
// terbukti rusak — baris baru hilang DAN kutip tunggal dimakan lapisan kutip
// Windows, sehingga `sed -n 's/^username=//p'` mengembalikan kosong padahal
// berkas kredensialnya utuh. Gejalanya menyesatkan: tampak seperti kredensial
// rusak, padahal yang rusak pengirimannya. Lewat stdin, isi skrip sampai apa
// adanya.
const JALUR_SKRIP = "/tmp/wolfspace-mount.sh";

function _pasangSkrip() {
  if (_skripTerpasang) return;
  execFileSync(
    "wsl.exe",
    ["-d", DISTRO, "--", "sh", "-c", "cat > " + JALUR_SKRIP],
    {
      input: SKRIP_MOUNT,
      timeout: 25000,
      windowsHide: true,
      stdio: ["pipe", "ignore", "pipe"],
    },
  );
  _skripTerpasang = true;
}

/**
 * Apakah jalur ini bisa dipakai? Diperiksa SEKALI lalu di-cache, karena tiap
 * pemeriksaan membangunkan distro (~3 detik saat dingin).
 * @returns {{siap: boolean, alasan: string}}
 */
function tersedia() {
  if (_siapCache) return _siapCache;
  _siapCache = { siap: false, alasan: "belum diperiksa" };
  if (process.platform !== "win32") {
    _siapCache = { siap: false, alasan: "hanya untuk Windows" };
    return _siapCache;
  }
  try {
    const out = _wsl(["sh", "-c", "test -f " + KRED + " && command -v bwrap"], {
      timeout: 25000,
    });
    if (!String(out).includes("bwrap")) {
      _siapCache = { siap: false, alasan: "bwrap tak ada di distro " + DISTRO };
      return _siapCache;
    }
    // MOUNT-nya ikut diperiksa, bukan hanya prasyaratnya.
    //
    // Sebelum ini tersedia() hanya memastikan kredensial ada dan bwrap
    // terpasang, lalu melapor "siap". Terukur: ia melapor siap sementara
    // setiap eksekusi gagal "mount //IP/wolfws on /work failed: Permission
    // denied" -- aturan firewall SMB-nya hilang. Hasilnya laporan yang lebih
    // kuat daripada kenyataannya, persis cacat yang dibuang dari jalur bash.
    //
    // Yang membuat jalur ini terkurung adalah /work, bukan bwrap-nya. Kalau
    // /work tak pernah terpasang, tak ada yang terkurung, dan menyebutnya siap
    // menyesatkan siapa pun yang membacanya.
    const m = pastikanMount();
    if (!m.ok) {
      _siapCache = { siap: false, alasan: "mount /work gagal: " + m.alasan };
      return _siapCache;
    }
    _siapCache = { siap: true, alasan: "" };
  } catch (e) {
    _siapCache = {
      siap: false,
      alasan:
        "distro " +
        DISTRO +
        " tak siap atau " +
        KRED +
        " tak ada (" +
        String(e.code || e.message).slice(0, 60) +
        ")",
    };
  }
  return _siapCache;
}

/** Pasang mount bila belum ada. Dipanggil sebelum SETIAP eksekusi. */
function pastikanMount() {
  try {
    _pasangSkrip();
    _wsl(["sh", JALUR_SKRIP], { timeout: 40000 });
    return { ok: true };
  } catch (e) {
    const pesan = String((e.stderr || "") + (e.stdout || "") + e.message);
    return { ok: false, alasan: pesan.replace(/\s+/g, " ").slice(0, 160) };
  }
}

// Argumen bwrap: rootfs BACA-SAJA, /work terikat baca-tulis, sisanya tertutup.
// --unshare-net dipisah sebagai opsi supaya perintah yang memang butuh jaringan
// (npm install) bisa memintanya secara sadar, bukan mendapatkannya diam-diam.
function _argBwrap(jaringan) {
  const a = [
    "bwrap",
    "--ro-bind",
    "/usr",
    "/usr",
    "--ro-bind",
    "/bin",
    "/bin",
    "--ro-bind",
    "/lib",
    "/lib",
    "--ro-bind",
    "/sbin",
    "/sbin",
    "--ro-bind",
    "/etc",
    "/etc",
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    "--tmpfs",
    "/tmp",
    "--bind",
    TITIK,
    TITIK,
    "--chdir",
    TITIK,
    "--die-with-parent",
  ];
  try {
    // /opt kerap berisi runtime (node) di distro ini; diikat bila ada.
    _wsl(["test", "-d", "/opt"], { timeout: 15000 });
    a.splice(10, 0, "--ro-bind", "/opt", "/opt");
  } catch (_) {}
  if (!jaringan) a.push("--unshare-net");
  return a;
}

/**
 * Jalankan perintah SHELL POSIX di dalam kurungan.
 *
 * CATATAN PENTING bagi pemanggil: ini bukan PowerShell. Perintah dijalankan
 * `sh` di dalam Linux, jadi `dir`, `Get-ChildItem`, dan `%VAR%` tidak berlaku.
 * Itu konsekuensi yang tak bisa dihindari dari memindahkan eksekusi ke tempat
 * yang punya batas kernel.
 *
 * @param {string} perintah
 * @param {{timeout?: number, jaringan?: boolean}} [opts]
 */
async function jalankan(perintah, opts) {
  const o = opts || {};
  const siap = tersedia();
  if (!siap.siap) {
    return {
      ok: false,
      output: "jalur WSL tak tersedia: " + siap.alasan,
      ..._penegakan.label("penasihat", "tak-tersedia"),
    };
  }
  const m = pastikanMount();
  if (!m.ok) {
    return {
      ok: false,
      output:
        "mount " +
        TITIK +
        " gagal: " +
        m.alasan +
        "\nJalankan ulang penyiapan share, atau periksa " +
        KRED,
      ..._penegakan.label("penasihat", "mount-gagal"),
    };
  }
  try {
    const out = _wsl([..._argBwrap(!!o.jaringan), "sh", "-c", perintah], {
      timeout: o.timeout || 120000,
    });
    return {
      ok: true,
      output: String(out).slice(0, 8000),
      ..._penegakan.label("kernel", "wsl-bwrap"),
    };
  } catch (e) {
    const teks = String((e.stdout || "") + (e.stderr || "")).trim();
    return {
      // Kode keluar bukan-nol adalah HASIL yang sah bagi banyak perintah
      // (grep tak menemukan, test gagal). Keluarannya tetap dikembalikan.
      ok: false,
      output:
        (teks || String(e.message)).slice(0, 8000) +
        (e.killed ? "\n[dihentikan: lewat batas waktu]" : ""),
      ..._penegakan.label("kernel", "wsl-bwrap"),
    };
  }
}

module.exports = { tersedia, pastikanMount, jalankan, DISTRO, TITIK };
