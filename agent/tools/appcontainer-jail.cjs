// ── Shell terkurung AppContainer: satu direktori, ditegakkan kernel Windows ──
//
// MASALAH YANG DIPECAHKAN. Tool `bash` di Windows hanya bisa MEMINDAI TEKS
// perintah. Terbukti bisa ditembus: perintah yang merakit path saat jalan lolos
// scan dan benar-benar membuat folder di C:\Users\dave\Desktop.
//
// Proses di dalam AppContainer memakai token dengan SID container. Pemeriksaan
// akses berkas jadi WAJIB menyertakan SID itu di DACL objek -- hak user biasa
// TIDAK cukup. Jadi seluruh filesystem tertutup kecuali yang secara eksplisit
// dibuka untuk SID tersebut. Deny-by-default, di kernel.
//
// TERUKUR, pelarian yang sama persis:
//   cwd              C:\Users\dave\WOLFSPACE
//   tulis workspace  BISA          baca workspace   BISA
//   tulis Desktop    EPERM         baca cloud-keys  EPERM
//   baca Documents   EPERM         path DIRAKIT     EPERM
//
// KENAPA INI YANG DIPILIH sebagai bawaan, bukan WSL atau akun terpisah:
//   - perintahnya tetap PowerShell; WSL menggantinya jadi sh POSIX
//   - meluncurkannya TIDAK butuh elevasi; akun terpisah menuntut WOLFSPACE
//     berjalan sebagai Administrator, yang justru memperbesar risiko
//   - tak ada share SMB, mount yang bisa lepas, atau sandi tersimpan
//
// EMPAT JEBAKAN yang dibayar mahal saat membangunnya, dan semuanya dijaga di
// tests/appcontainer-jail.test.js supaya tak kembali:
//   1. stdin NULL membuat node crash TANPA PESAN di InitializeOncePerProcess,
//      dan git melapor "could not open /dev/null". Program butuh handle stdin
//      yang sah; NUL harus dibuka induk lalu diwariskan.
//   2. Keluaran lewat BERKAS menangkap output PowerShell tapi TIDAK output
//      proses anaknya. Pipa diwariskan ke seluruh rantai anak; berkas tidak.
//   3. Lokasi provider PowerShell diam-diam jatuh ke drive lain, sementara cwd
//      proses sendiri BENAR. Dugaan pertama (hak traverse) sudah diuji sampai
//      terbantah: penyebabnya info volume drive yang tertutup, bukan ACL.
//   4. Peluncur harus BINER. Enam versi PowerShell gagal berturut-turut karena
//      marshaling ANSI/Unicode dan penugasan ke medan struct bersarang yang
//      tak menempel -- keduanya tak ada di C#.
"use strict";

const { execFile, execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const _penegakan = require("../penegakan.cjs");

const CONTAINER = process.env.WOLFSPACE_AC_NAME || "wolfspace-jail";
const EXE = path.join(
  __dirname,
  "..",
  "..",
  "scripts",
  "appcontainer",
  "AcLaunch.exe",
);
const PS = path.join(
  process.env.SystemRoot || "C:\\Windows",
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

let _cache = null;

/**
 * Pembuka yang menempatkan PowerShell di folder kerja.
 *
 * KENAPA PERLU. CreateProcessW memasang cwd proses dengan benar -- node di
 * dalam container melaporkan folder yang tepat, dan [Environment]::CurrentDirectory
 * juga tepat. Tapi PowerShell punya lokasi PROVIDER sendiri dan menolak
 * mengadopsinya: `Set-Location` ke folder itu gagal "Access is denied", lokasi
 * provider diam-diam jatuh ke drive lain, dan SETIAP PATH RELATIF mendarat di
 * tempat yang salah -- `Out-File '_x.txt'` gagal padahal workspace jelas bisa
 * ditulis.
 *
 * SEBABNYA BUKAN HAK BERKAS, dan ini sudah diuji sampai terbantah. Dugaan
 * pertama adalah rantai traverse pada C:\ dan C:\Users. Hibah itu dipasang
 * (butuh Administrator) lalu diukur ulang: Set-Location TETAP ditolak. Yang
 * memisahkan penyebabnya:
 *   [IO.Directory]::SetCurrentDirectory(workspace)  -> BERHASIL
 *   Set-Location -LiteralPath workspace             -> Access is denied
 *   [IO.DriveInfo]::new('C:').VolumeLabel/TotalSize -> KOSONG
 * Foldernya terjangkau penuh; yang tak terjangkau adalah informasi VOLUME
 * drive-nya. Provider FileSystem PowerShell menuntut itu, dan AppContainer
 * menutup akses perangkat -- pembatasan yang sama yang mematikan `vol` dan
 * `dir`. Tak ada ACL berkas yang bisa memperbaikinya.
 *
 * New-PSDrive tidak menuntut informasi itu, jadi ia berhasil di tempat
 * Set-Location gagal.
 *
 * @param {string} cwd
 */
function _pembukaCwd(cwd) {
  const q = cwd.replace(/'/g, "''");
  return (
    "try{Set-Location -LiteralPath '" +
    q +
    "' -EA Stop}catch{$null=New-PSDrive -Name WS -PSProvider FileSystem -Root '" +
    q +
    "' -Scope Global -EA SilentlyContinue;Set-Location WS: -EA SilentlyContinue};"
  );
}

/**
 * Apakah jalur ini siap? Diperiksa SEKALI lalu di-cache.
 * @returns {{siap: boolean, alasan: string}}
 */
function tersedia() {
  if (_cache) return _cache;
  if (process.platform !== "win32") {
    _cache = { siap: false, alasan: "hanya untuk Windows" };
    return _cache;
  }
  if (!fs.existsSync(EXE)) {
    _cache = {
      siap: false,
      alasan:
        "AcLaunch.exe belum dikompilasi (" +
        EXE +
        ") — jalankan scripts/appcontainer/build.cmd",
    };
    return _cache;
  }
  try {
    // Uji nyata, bukan asumsi: kalau profil container belum dibuat atau ACL
    // belum dipasang, ini gagal di sini alih-alih pada perintah pertama agent.
    const out = execFileSync(
      EXE,
      [CONTAINER, process.cwd(), PS, "-NoProfile", "-Command", "'siap'"],
      { encoding: "utf8", timeout: 30000, windowsHide: true },
    );
    if (!String(out).includes("siap")) {
      _cache = {
        siap: false,
        alasan: "container menjawab tak terduga: " + String(out).slice(0, 80),
      };
      return _cache;
    }
    _cache = { siap: true, alasan: "" };
  } catch (e) {
    _cache = {
      siap: false,
      alasan: String((e.stderr || "") + " " + e.message)
        .replace(/\s+/g, " ")
        .slice(0, 160),
    };
  }
  return _cache;
}

// Satu-satunya kegagalan yang tersisa, dan ia PERMANEN untuk jalur ini.
//
// git memanggil sanitize_stdfds() saat start, yang membuka /dev/null dengan
// O_RDWR TANPA SYARAT -- bukan hanya kalau fd standar hilang. Jadi mewariskan
// handle stdin/stdout/stderr yang sah tidak menolongnya.
//
// Terukur di dalam container: `cmd /c echo x > NUL` bisa, `> $null` bisa,
// tapi membuka '\\.\NUL' ditolak. Bentuk pertama memakai jalan pintas nama
// perangkat di parser path Win32; bentuk kedua menelusuri direktori objek
// DosDevices, yang tertutup untuk AppContainer. .NET dan node menormalkan
// 'NUL' jadi '\\.\NUL', dan git sampai ke jalur yang sama.
//
// Pesan git sendiri ("Permission denied") mengarahkan orang ke hak berkas
// repo, yang sama sekali bukan penyebabnya. Karena itu dijelaskan di sini.
const _POLA_NUL = /could not open '\/dev\/null'/;

// Korban kedua dari namespace perangkat yang tertutup, dan yang paling sering
// ditemui: `dir`.
//
// cmd.exe membaca label dan nomor seri volume untuk header `dir`, dan itu
// menuntut membuka akar drive sebagai perangkat. Container tak punya hak apa
// pun di sana, jadi `dir` gagal "Access is denied" -- bahkan `dir /b`, yang
// tidak mencetak header sama sekali. Terukur: `vol` gagal dengan pesan yang
// sama persis, sementara `type`, `cd`, `echo >`, dan Get-ChildItem pada path
// absolut yang sama semuanya berhasil.
//
// Pesan "Access is denied" pada perintah SEMUDAH `dir` sangat mudah dibaca
// sebagai "kurungannya rusak" atau "foldernya tak boleh dibaca". Dua-duanya
// salah, dan keduanya mengirim orang memperbaiki hal yang tidak rusak.
const _POLA_VOL = /^\s*(?:@?echo\s+off\s*)?(?:dir|vol)\b/im;

// Korban ketiga, dan yang paling mudah salah dibaca: `del`.
//
// Terukur, semuanya di berkas yang BARU SAJA dibuat container itu sendiri:
//   del <relatif> / del <absolut> / erase   -> Access is denied, berkas tetap ada
//   rmdir                                   -> bisa
//   Remove-Item (PowerShell)                -> bisa
// Jadi bukan hak berkasnya, dan bukan penghapusan pada umumnya -- hanya
// penghapusan BERKAS lewat cmd.exe. Padanannya di PowerShell bekerja penuh.
const _POLA_HAPUS = /^\s*(?:@?echo\s+off\s*)?(?:del|erase)\b/im;

/**
 * @param {string} teks
 * @param {string} [perintah]
 */
function _jelaskan(teks, perintah) {
  if (
    perintah &&
    _POLA_HAPUS.test(perintah) &&
    /Access is denied/i.test(teks)
  ) {
    return (
      teks +
      "\n\n[WOLFSPACE] `del` dan `erase` TIDAK bisa menghapus berkas di dalam " +
      "AppContainer, bahkan berkas yang baru saja dibuat sendiri. Ini bukan " +
      "soal hak berkas: `rmdir` bisa, dan `Remove-Item` pada berkas yang sama " +
      "juga bisa.\n" +
      'Pakai: powershell -NoProfile -Command "Remove-Item -LiteralPath ' +
      "'<jalur>' -Force\""
    );
  }
  if (perintah && _POLA_VOL.test(perintah) && /Access is denied/i.test(teks)) {
    return (
      teks +
      "\n\n[WOLFSPACE] `dir` dan `vol` TIDAK bisa jalan di dalam AppContainer: " +
      "cmd.exe membaca info volume drive untuk keduanya, dan itu perangkat yang " +
      "tertutup untuk container. Foldernya sendiri terbaca dengan baik.\n" +
      "Pakai `Get-ChildItem` (PowerShell) untuk melihat isi folder — terbukti " +
      "bekerja pada path yang sama."
    );
  }
  if (!_POLA_NUL.test(teks)) return teks;
  return (
    teks +
    "\n\n[WOLFSPACE] Ini BUKAN soal izin berkas repo, dan mengubah hak berkas " +
    "tidak akan menolong. git selalu membuka /dev/null (baca+tulis) saat start, " +
    "dan perangkat NUL tidak terbuka untuk baca bagi AppContainer -- menulis ke " +
    "NUL bisa, membacanya tidak. Jadi git tak bisa jalan di dalam kurungan ini " +
    "sama sekali, perintah git apa pun.\n" +
    "PAKAI TOOL `git`. Ia menyediakan operasi bernama (status, diff, log, show, " +
    "berkas, cabang, kepala, blame, tambah, commit, pulihkan, cabang_baru, " +
    "pindah) dengan argv yang dibangun sendiri dan path yang wajib berada di " +
    "dalam workspace. Mengulang perintah ini lewat bash tidak akan pernah " +
    "berhasil, seberapa pun berbedanya cara penulisannya."
  );
}

// Mode gagal paling berbahaya di jalur ini, karena ia SENYAP.
//
// Program yang berkasnya terjangkau container tapi DLL-nya tidak akan lolos
// diluncurkan lalu mati saat memuat pustaka, dengan kode keluar 0xC0000142
// (STATUS_DLL_INIT_FAILED) dan stdout MAUPUN stderr kosong sama sekali.
// Terukur pada `ls`: exe-nya ketemu lewat PATH, DLL-nya ada di Program Files
// yang tertutup, dan hasilnya perintah yang "selesai" tanpa keluaran dan tanpa
// keluhan. Tanpa penjelasan ini, agent membaca kekosongan itu sebagai
// "direktorinya memang kosong" -- kesimpulan yang salah dan tak terbantah.
const KODE_DLL_GAGAL = 0xc0000142;

/** @param {number} kode @returns {string|null} */
function jelaskanKode(kode) {
  if (kode >>> 0 !== KODE_DLL_GAGAL) return null;
  return (
    "Program gagal dimuat di dalam AppContainer (0xC0000142, " +
    "STATUS_DLL_INIT_FAILED) dan tidak menghasilkan keluaran apa pun. " +
    "Keluaran kosong di sini BUKAN berarti hasilnya kosong.\n" +
    "Dua sebab, dan hanya satu yang bisa diperbaiki:\n" +
    "  1. DLL-nya ada di folder yang belum dibuka untuk container — beri hak " +
    "baca pada folder runtime-nya lewat scripts/appcontainer/pasang.ps1.\n" +
    "  2. Programnya memakai runtime MSYS/Cygwin (ls, grep, sed, dan " +
    "kawan-kawan dari Git for Windows). Runtime itu butuh objek kernel " +
    "bersama yang ditutup AppContainer, jadi ia gagal WALAU berkasnya sudah " +
    "bisa dibaca penuh — terukur, sesudah hak baca diberikan. Tak ada izin " +
    "yang bisa memperbaikinya.\n" +
    "Yang setara dan bekerja: perintah bawaan cmd/PowerShell, node, dan biner " +
    "non-MSYS (curl dari mingw64 terbukti jalan)."
  );
}

/**
 * Bungkus shell apa pun supaya jalan DI DALAM container, tanpa mengubah
 * argumennya. Dipakai tool `bash`: ia tetap men-spawn sendiri, jadi seluruh
 * mesin AbortController, timeout, streaming, dan pelacakan proses sesi tetap
 * berlaku. Cabang yang memanggil execFileSync sendiri kehilangan semua itu,
 * dan ikut memblokir event loop.
 *
 * Lingkungan tidak dioper eksplisit: AcLaunch memanggil CreateProcessW dengan
 * lpEnvironment NULL, jadi anak mewarisi lingkungan AcLaunch -- yang sudah
 * dikeraskan oleh pemanggil saat men-spawn AcLaunch.
 *
 * @param {string} cwd
 * @param {string} shBin
 * @param {string[]} shArgs
 * @returns {[string, string[]]}
 */
function bungkus(cwd, shBin, shArgs) {
  return [EXE, [CONTAINER, path.resolve(cwd), _jalurPenuh(shBin), ...shArgs]];
}

let _sid = null;
const _sudahDiberi = new Set();

/**
 * SID container. Tak punya nama ramah -- icacls hanya menerima bentuk
 * S-1-15-2-..., jadi ia diturunkan lewat peluncur lalu di-cache.
 * @returns {string|null}
 */
function sid() {
  if (_sid !== null) return _sid || null;
  try {
    _sid = String(
      execFileSync(EXE, ["--sid", CONTAINER], {
        encoding: "utf8",
        timeout: 15000,
        windowsHide: true,
      }),
    ).trim();
  } catch (_) {
    _sid = "";
  }
  return _sid || null;
}

/**
 * Pastikan container boleh membaca dan menulis SATU folder: workspace yang
 * sedang dipakai.
 *
 * KENAPA TIDAK CUKUP SEKALI SAAT PEMASANGAN. Profil container dipasang dengan
 * hak pada folder WOLFSPACE, tapi agent bisa diarahkan ke workspace mana pun --
 * dan pada workspace lain SEMUA perintah gagal "Access is denied", termasuk
 * `echo`. Gejalanya terlihat seperti kurungannya rusak, padahal justru
 * bekerja: folder itu memang belum pernah dibuka untuk container.
 *
 * Hibahnya sempit dan disengaja: hanya folder yang memang sudah jadi ruang
 * kerja agent, dan hanya folder itu. Tak butuh elevasi selama pemakai memiliki
 * foldernya, dan tak melebarkan apa pun -- agent memang sudah boleh membaca
 * dan menulis di sana; yang berubah cuma apakah TOKEN CONTAINER ikut boleh.
 *
 * HANYA ROOT-nya, bukan folder induknya. Versi sebelumnya ikut memberi hak
 * traverse ke atas, dan itu salah dua kali: tidak perlu (terukur -- workspace
 * di bawah AppData\Local bekerja penuh hanya dengan hibah root: baca, tulis,
 * buat berkas, node, semuanya lewat path absolut), dan sangat mahal --
 * MEMBACA ACL C:\Users\dave\AppData\Local makan 77 ms, MENGUBAHNYA lebih dari
 * 120 detik, karena Windows menyebarkan ulang pewarisan ke ratusan ribu berkas
 * cache di bawahnya.
 *
 * SATU WORKSPACE PADA SATU WAKTU. Hibah untuk workspace lain DICABUT di sini,
 * bukan dibiarkan menumpuk. Tanpa itu container perlahan mengumpulkan akses ke
 * setiap folder yang pernah dipakai agent, dan "terkurung di satu direktori"
 * berubah diam-diam jadi "terkurung di gabungan semua direktori yang pernah
 * dibuka" -- pelonggaran yang tak terlihat di mana pun sampai ada yang
 * memeriksa ACL satu per satu. Lihat cabutSemuaKecuali().
 *
 * @param {string} root
 * @returns {Promise<{siap: boolean, alasan: string}>}
 */
async function siapUntuk(root) {
  const dasar = tersedia();
  if (!dasar.siap) return dasar;
  const s = sid();
  if (!s) return { siap: false, alasan: "SID container tak bisa diturunkan" };
  const r = path.resolve(root || process.cwd());
  const kunci = r.toLowerCase();
  if (_sudahDiberi.has(kunci)) return { siap: true, alasan: "" };
  try {
    const kini = await _icacls([r]);
    if (!kini.includes(s)) {
      await _icacls([r, "/grant", "*" + s + ":(OI)(CI)(M)"]);
    }
    // Folder temp privat container. Ia tak membuatnya sendiri, dan tanpa ini
    // %TEMP% di dalam menunjuk ke tempat yang tidak ada -- lihat envTambahan().
    fs.mkdirSync(path.join(_akarAc(r), "Packages", CONTAINER, "AC", "Temp"), {
      recursive: true,
    });
    _catatHibah(r);
    _sudahDiberi.add(kunci);
    await cabutSemuaKecuali(r);
    return { siap: true, alasan: "" };
  } catch (e) {
    return {
      siap: false,
      alasan:
        "container tak bisa diberi akses ke " +
        r +
        ": " +
        String(e.stderr || e.message)
          .replace(/\s+/g, " ")
          .slice(0, 120),
    };
  }
}

/**
 * icacls, ASINKRON.
 *
 * Versi sinkronnya memblokir event loop, dan biayanya bukan sepele: terukur
 * 0,24 ms per entri pohon, jadi hibah pada workspace 46 ribu berkas menahan
 * seluruh proses ~11 detik. Di aplikasi Electron itu UI yang membeku.
 *
 * @param {string[]} argv
 * @returns {Promise<string>}
 */
function _icacls(argv) {
  return new Promise((res, rej) => {
    execFile(
      "icacls",
      argv,
      { encoding: "utf8", timeout: 600000, windowsHide: true },
      (err, stdout, stderr) => {
        if (err) {
          err.stderr = stderr;
          return rej(err);
        }
        res(String(stdout));
      },
    );
  });
}

// Catatan hibah yang PERNAH diberikan, di luar proses.
//
// Perlu disimpan karena tak ada indeks sistem yang bisa ditanya "folder mana
// saja yang terbuka untuk SID ini" -- ACL disimpan per objek, bukan per subjek.
// Tanpa catatan ini, hibah lama jadi tak terlihat dan tak mungkin dicabut.
const BERKAS_HIBAH = path.join(
  process.env.USERPROFILE || os.homedir(),
  ".wolfspace",
  "ac-hibah.json",
);

// Folder yang TIDAK pernah dicabut otomatis: runtime yang dipakai bersama
// (node, git) dan hibah traverse dekat akar. Semuanya baca+jalankan saja, tak
// memuat data pengguna, dan mencabutnya akan mematikan setiap perintah.
// Dipasang sekali lewat scripts/appcontainer/pasang.ps1.
const TETAP = (process.env.WOLFSPACE_AC_TETAP || "")
  .split(";")
  .map((x) => x.trim())
  .filter(Boolean)
  .concat(["C:\\langs", "C:\\Program Files\\Git", "C:\\", "C:\\Users"])
  .map((x) => x.toLowerCase());

/** @returns {string[]} */
function _bacaHibah() {
  try {
    const j = JSON.parse(fs.readFileSync(BERKAS_HIBAH, "utf8"));
    return Array.isArray(j.kerja) ? j.kerja : [];
  } catch (_) {
    return [];
  }
}

/** @param {string} root */
function _catatHibah(root) {
  const daftar = _bacaHibah();
  if (daftar.some((x) => x.toLowerCase() === root.toLowerCase())) return;
  daftar.push(root);
  try {
    fs.mkdirSync(path.dirname(BERKAS_HIBAH), { recursive: true });
    fs.writeFileSync(
      BERKAS_HIBAH,
      JSON.stringify({ kerja: daftar }, null, 2),
      "utf8",
    );
  } catch (_) {}
}

const _sementara = new Set();

/**
 * Buka SATU folder sementara untuk container, TANPA mencatatnya sebagai folder
 * kerja.
 *
 * Bedanya dengan siapUntuk() menentukan: folder kerja saling menggantikan --
 * membuka yang baru mencabut yang lama. Direktori scratch sandbox_run bukan
 * workspace; ia hidup berdampingan dengan workspace dan mati bersama sesinya.
 * Kalau ia lewat siapUntuk(), setiap panggilan sandbox_run akan MENCABUT hak
 * workspace, dan perintah bash berikutnya membayar hibah ulang belasan detik.
 *
 * ACE-nya ikut terhapus saat foldernya dihapus, jadi tak ada yang menumpuk.
 *
 * @param {string} dir
 * @returns {Promise<boolean>} berhasil atau tidak
 */
async function beriSementara(dir) {
  if (!tersedia().siap) return false;
  const s = sid();
  if (!s) return false;
  const r = path.resolve(dir);
  const k = r.toLowerCase();
  if (_sementara.has(k)) return true;
  try {
    await _icacls([r, "/grant", "*" + s + ":(OI)(CI)(M)"]);
    fs.mkdirSync(path.join(_akarAc(r), "Packages", CONTAINER, "AC", "Temp"), {
      recursive: true,
    });
    _sementara.add(k);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Cabut hak container dari SEMUA folder kerja kecuali yang sedang dipakai.
 *
 * Inilah yang membuat "terkurung di satu direktori" tetap benar dari waktu ke
 * waktu, bukan hanya benar pada hari pertama. Folder runtime di TETAP tidak
 * ikut dicabut -- keduanya baca+jalankan dan tak memuat data pengguna.
 *
 * KONSEKUENSI YANG DISENGAJA: dua instans WOLFSPACE pada workspace berbeda
 * tidak bisa jalan bersamaan; yang kedua akan mencabut hak yang pertama. Itu
 * memang arti "hanya yang sedang dipilih", dan lebih baik daripada diam-diam
 * membiarkan keduanya terbuka.
 *
 * @param {string} aktif
 * @returns {Promise<string[]>} folder yang dicabut
 */
async function cabutSemuaKecuali(aktif) {
  // Harganya nyata dan harus bisa ditolak dengan sadar. Terukur 0,24 ms per
  // entri pohon: mencabut lalu memberi lagi hak pada workspace 46 ribu berkas
  // makan ~20 detik, dan itu dibayar SETIAP kali berpindah workspace. Yang
  // mematikannya menukar jaminan "hanya satu direktori" dengan "gabungan semua
  // direktori yang pernah dibuka" — pelonggaran yang tak terlihat di mana pun,
  // jadi ia harus dipilih, bukan diwarisi.
  if (
    process.env.WOLFSPACE_AC_CABUT === "0" ||
    process.env.WOLFSPACE_AC_CABUT === "false"
  )
    return [];
  const s = sid();
  if (!s) return [];
  const a = path.resolve(aktif).toLowerCase();
  const daftar = _bacaHibah();
  const sisa = [];
  const dicabut = [];
  for (const r of daftar) {
    const k = r.toLowerCase();
    if (k === a || TETAP.includes(k)) {
      sisa.push(r);
      continue;
    }
    if (!fs.existsSync(r)) continue; // hilang -> tak perlu dicabut, tak perlu dicatat
    try {
      await _icacls([r, "/remove:g", "*" + s]);
      dicabut.push(r);
      _sudahDiberi.delete(k);
    } catch (_) {
      sisa.push(r); // gagal dicabut: TETAP tercatat, supaya dicoba lagi nanti
    }
  }
  if (dicabut.length || sisa.length !== daftar.length) {
    try {
      fs.mkdirSync(path.dirname(BERKAS_HIBAH), { recursive: true });
      fs.writeFileSync(
        BERKAS_HIBAH,
        JSON.stringify({ kerja: sisa }, null, 2),
        "utf8",
      );
    } catch (_) {}
  }
  return dicabut;
}

/**
 * Apa saja yang bisa dijangkau container saat ini. Dibuat supaya klaimnya bisa
 * DIPERIKSA, bukan dipercaya: ACL tak punya indeks per-subjek, jadi tanpa
 * daftar ini tak ada cara melihat permukaan aksesnya sekaligus.
 */
function daftarAkses() {
  return {
    sid: sid(),
    kerja: _bacaHibah(),
    tetap: TETAP,
    berkas: BERKAS_HIBAH,
  };
}

/**
 * Variabel yang harus ada saat AcLaunch dijalankan, DI ATAS lingkungan yang
 * sudah dikeraskan pemanggil.
 *
 * CreateProcessW menuntut LOCALAPPDATA untuk membuat proses AppContainer (ia
 * menyiapkan folder profil container di bawah LOCALAPPDATA\Packages). Tanpa
 * itu: kode 203, yang tidak menyebut variabel apa pun.
 *
 * Yang dituntut hanya KEHADIRANNYA untuk membuat prosesnya: terukur berhasil
 * dengan string kosong dan dengan folder yang tidak ada. Karena itu nilainya
 * DIARAHKAN KE DALAM workspace, sama seperti TEMP dan USERPROFILE -- nilai
 * aslinya memuat nama akun asli, yang justru sedang disembunyikan.
 *
 * TAPI NILAINYA TIDAK BEBAS SESUDAH PROSES JALAN. AppContainer MENULIS ULANG
 * TEMP dan TMP di dalam prosesnya menjadi <LOCALAPPDATA>\Packages\<container>\
 * AC\Temp. Kalau folder itu tak ada, TEMP menunjuk ke tempat yang tak ada dan
 * `echo x > %TEMP%\a.txt` gagal "The system cannot find the path specified" --
 * padahal menulis ke path absolut di folder yang sama berhasil. Gejala yang
 * membingungkan, penyebab yang sepele. Foldernya disiapkan di siapUntuk().
 *
 * @param {string} cwd
 * @returns {Record<string, string>}
 */
function envTambahan(cwd) {
  return { LOCALAPPDATA: _akarAc(cwd) };
}

/**
 * Akar LOCALAPPDATA palsu untuk container: sebuah subfolder workspace, bukan
 * workspace itu sendiri. Kalau workspace langsung yang dipakai, AppContainer
 * membuat folder bernama "Packages" tepat di tengah repo orang.
 * @param {string} cwd
 */
function _akarAc(cwd) {
  return path.join(path.resolve(cwd || process.cwd()), ".wolfspace-cmd");
}

/**
 * AcLaunch mengoper shell sebagai lpApplicationName, yang TIDAK menelusuri
 * PATH. Nama telanjang seperti "cmd.exe" gagal dengan kode 203, dan kode itu
 * tidak menyebut-nyebut nama berkas — jadi jejaknya menunjuk ke mana-mana
 * kecuali ke sini. Nama telanjang diselesaikan lebih dulu.
 * @param {string} bin
 */
function _jalurPenuh(bin) {
  if (path.isAbsolute(bin)) return bin;
  const sys = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    bin,
  );
  return fs.existsSync(sys) ? sys : bin;
}

/**
 * Jalankan perintah PowerShell di dalam container.
 *
 * Jalur ringkas untuk pemanggil non-agent (uji, diagnostik). Tool `bash` TIDAK
 * lewat sini -- ia memakai bungkus() di atas.
 * @param {string} perintah
 * @param {{cwd?: string, timeout?: number}} [opts]
 */
async function jalankan(perintah, opts) {
  const o = opts || {};
  const siap = tersedia();
  if (!siap.siap) {
    return {
      ok: false,
      output: "AppContainer tak siap: " + siap.alasan,
      ..._penegakan.label("penasihat", "ac-tak-siap"),
    };
  }
  const cwd = path.resolve(o.cwd || process.cwd());
  try {
    // execFile ASINKRON, bukan execFileSync. Versi sinkron memblokir event loop
    // selama perintah berjalan; di aplikasi Electron itu berarti UI membeku
    // setiap kali perintah dijalankan.
    const out = await new Promise((res, rej) => {
      execFile(
        EXE,
        [
          CONTAINER,
          cwd,
          PS,
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          _pembukaCwd(cwd) + perintah,
        ],
        {
          encoding: "utf8",
          timeout: o.timeout || 120000,
          windowsHide: true,
          maxBuffer: 8 * 1024 * 1024,
        },
        (err, stdout, stderr) => {
          if (err) {
            err.stdout = stdout;
            err.stderr = stderr;
            return rej(err);
          }
          res(stdout);
        },
      );
    });
    return {
      ok: true,
      output: _jelaskan(String(out).slice(0, 8000)) || "(tak ada keluaran)",
      ..._penegakan.label("kernel", "appcontainer"),
    };
  } catch (e) {
    const teks = _jelaskan(String((e.stdout || "") + (e.stderr || "")).trim());
    return {
      // Kode keluar bukan-nol adalah HASIL yang sah bagi banyak perintah
      // (Select-String tak menemukan, test gagal). Keluarannya tetap dikembalikan.
      ok: false,
      output:
        (teks || String(e.message)).slice(0, 8000) +
        (e.killed ? "\n[dihentikan: lewat batas waktu]" : ""),
      ..._penegakan.label("kernel", "appcontainer"),
    };
  }
}

module.exports = {
  tersedia,
  siapUntuk,
  beriSementara,
  cabutSemuaKecuali,
  daftarAkses,
  sid,
  jalankan,
  bungkus,
  envTambahan,
  jelaskan: _jelaskan,
  jelaskanKode,
  CONTAINER,
  EXE,
};
