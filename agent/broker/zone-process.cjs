// ── Capability zone (process-isolated) ──
// Runs untrusted task code in a SEPARATE Node process launched with
// `--permission` and zero --allow-fs-read/--allow-fs-write grants. Node's
// runtime denies fs access at the native binding layer for that whole
// process — this holds even against the classic vm-escape technique that
// broke the earlier vm.createContext-based zone (see agent/broker/README.md
// for the side-by-side test result).
//
// The zone process's ONLY channel to the outside world is IPC messages
// forwarded here and validated by the Broker before anything executes.
"use strict";

const { fork, spawn, execFileSync } = require("child_process");
const path = require("path");
const { getPlatformAdapter } = require("../platform/index.cjs");

const WORKER = path.join(__dirname, "zone-worker.cjs");

// ── Nama flag permission berbeda menurut versi Node ──
//
// KENAPA ADA. Model permission Node stabil di v23 sebagai `--permission`; di
// v20-v22 namanya `--experimental-permission`. Kode ini dulu memakai
// `--permission` tanpa syarat, jadi di Node 20 SETIAP zona mati seketika:
//     $ node --permission -e 0
//     node: bad option: --permission        (exit 9)
// Diukur pada Node 20.15.1 asli. Akibatnya berlapis dan tak terlihat dari mesin
// pengembangan yang memakai Node 24:
//   - CI dipatok Node 20, jadi 7 dari 15 suite merah pada tiap push;
//   - Dockerfile memakai node:20-bookworm-slim, jadi deployment hosted punya
//     capability_exec yang mati total;
//   - package.json menjanjikan engines ">=18", janji yang tak pernah benar.
// Yang muncul ke pemakai hanya "zone process exited with code 9" — tanpa
// petunjuk bahwa penyebabnya nama flag.
//
// GAGAL TERTUTUP di bawah v20. Menjalankan zona tanpa flag apa pun akan tetap
// "berhasil", tapi tanpa satu pun pembatasan berkas — persis jenis penurunan
// jaminan diam-diam yang sudah berkali-kali jadi masalah di berkas ini. Lebih
// baik menolak dengan alasan yang bisa dibaca.
function flagPermission(major, worker) {
  if (major >= 23) return ["--permission"];
  if (major >= 20) {
    return [
      "--experimental-permission",
      // --no-warnings menemani flag eksperimental: tanpa itu tiap zona mencetak
      // ExperimentalWarning ke stderr, dan stderr zona ikut dilaporkan ke
      // pemanggil (_withIo di agent/tools/index.cjs), sehingga setiap hasil
      // capability_exec jadi kotor.
      "--no-warnings",
      // v20 menuntut izin baca EKSPLISIT untuk skrip masuknya sendiri; v23+
      // mengizinkannya implisit. Tanpa baris ini zona mati sebelum sempat
      // berjalan:
      //     Error: Access to this API has been restricted
      //     at internalModuleStat (node:internal/modules/cjs/loader)
      // Diukur langsung di Node 20.15.1. Grant-nya sesempit mungkin — satu
      // berkas, yaitu sumber worker itu sendiri, yang bukan rahasia. Semua
      // akses berkas lain tetap ditolak.
      "--allow-fs-read=" + worker,
    ];
  }
  return null;
}

const _MAJOR_LOKAL = Number(String(process.versions.node).split(".")[0]);

// ── Pengurungan jaringan (opsional, hanya Linux) ──
//
// `--permission` menutup berkas tapi TIDAK menyentuh jaringan sama sekali —
// model permission Node memang tak punya dimensi itu, jadi tak ada flag yang
// bisa ditambahkan. Karena itu kode zona bisa memanggil https.get() langsung dan
// berhasil; di README itu satu-satunya baris tabel serangan yang lolos.
//
// Menambalnya DARI DALAM zona tidak bisa dijadikan batas. Diuji dengan mengganti
// http/https/net/tls/dgram di require.cache lalu diserang: `require('node:https')`
// tembus (kunci cache berbeda) dan `process.binding('tcp_wrap')` tembus (berada
// di BAWAH lapisan modul) — 2 dari 5 percobaan, tanpa usaha berarti. Itu
// kesalahan yang sama persis dengan versi vm.createContext dulu: menyembunyikan
// referensi, bukan mencabut kemampuan.
//
// Batas yang benar ada di kernel. `unshare -n` memberi proses network namespace
// kosong (hanya loopback, tanpa rute). Yang menentukan bagi arsitektur ini:
// kanal IPC SELAMAT, karena socketpair-nya sudah terbuka sebelum proses masuk
// namespace. Jadi request() tetap bekerja seperti sebelumnya — broker di host
// yang punya jaringan, zona tidak.
//
// Terukur di WSL2 (kernel 6.18, node v24.16.0):
//     tanpa netns   -> https.get berhasil, status 403 (sampai ke server)
//     dengan netns  -> EAI_AGAIN, dan IPC tetap HIDUP
//     ongkos spawn  -> 78,3 ms vs 95,0 ms median; rentang tumpang tindih
// Tak ada overhead terukur, tanpa daemon, tanpa pool kontainer.
//
// Windows tak punya padanannya: aturan firewall bersifat per-executable dan
// proses zona adalah node.exe yang SAMA dengan host, jadi tak bisa dibedakan.
// Di sana nilainya null dan perilakunya tetap seperti semula (fork biasa).
// ── Zona di WSL, broker tetap di Windows ──
//
// Pengurungan jaringan hanya ada di kernel Linux. Sebelum ini, memakainya di
// Windows menuntut SELURUH backend pindah ke WSL — dan itu terlalu banyak untuk
// sesuatu yang cuma dibutuhkan zona. Jalur ini membundel fungsinya saja: broker
// tetap di proses server Windows, hanya worker zona yang dijalankan di WSL.
//
// Bisa karena dua hal yang diuji lebih dulu:
//   1. zone-worker.cjs hanya me-require modul BUILTIN (vm, module), jadi bisa
//      dijalankan langsung dari /mnt/c tanpa perlu repo disinkronkan ke WSL.
//   2. pipa stdio diteruskan wsl.exe DAN selamat di dalam `unshare -n` — karena
//      pipa bukan jaringan. Jembatan TCP mustahil di sini: zona tanpa rute
//      jaringan tak bisa menelepon balik brokernya. Diuji: ping/pong lewat,
//      sementara https di dalam zona tetap EAI_AGAIN.
// Menyediakan zone-worker.cjs DI DALAM distro, tanpa bergantung pada /mnt.
//
// KENAPA. Semula worker dijalankan langsung dari /mnt/c — enak, karena ia hanya
// me-require modul builtin sehingga repo tak perlu disinkronkan. Tapi /mnt itu
// milik konfigurasi distro, bukan milik kita: satu baris `[automount] enabled =
// false` di /etc/wsl.conf membuatnya kosong, dan seluruh jalur WSL mati diam-
// diam ke fork tanpa pengurungan. Itu bukan hipotesis — terjadi di mesin ini
// begitu distro dikeraskan, dan justru pengerasan itu yang BENAR: distro yang
// tak bisa melihat berkas Windows adalah postur yang lebih kuat, bukan lebih
// lemah. Jadi yang harus menyesuaikan adalah kita.
//
// CARANYA. Isi worker dialirkan lewat stdin wsl.exe ke dalam distro. Arah ini
// tetap bekerja meski `[interop] enabled = false`, karena yang dimatikan interop
// adalah memanggil biner Windows DARI DALAM WSL — bukan sebaliknya.
//
// Nama berkasnya memuat sha1 isinya, jadi tak perlu ada pemeriksaan basi sama
// sekali: isi berbeda = jalur berbeda. Menyalin ulang hanya terjadi saat worker
// benar-benar berubah, dan hasilnya bertahan lintas proses.
function siapkanWorker(distro) {
  const jalankan = (perintah, input) =>
    execFileSync("wsl.exe", ["-d", distro, "--", "sh", "-c", perintah], {
      stdio: input === undefined ? "ignore" : ["pipe", "ignore", "ignore"],
      ...(input === undefined ? {} : { input }),
      timeout: 20000,
    });

  // Jalur /mnt tetap dicoba lebih dulu bila memang terpasang: nol penyalinan,
  // dan selalu mengikuti berkas di disk tanpa perantara.
  const viaMnt = winKeWsl(WORKER);
  if (viaMnt) {
    try {
      jalankan(`test -f ${viaMnt}`);
      return viaMnt;
    } catch (_) {
      /* /mnt tak terpasang — lanjut ke penyalinan */
    }
  }

  let isi;
  try {
    isi = require("fs").readFileSync(WORKER);
  } catch (e) {
    _wslAlasan = `worker tak terbaca di sisi Windows (${WORKER}): ${e.code || e.message}`;
    return null;
  }
  const sha = require("crypto").createHash("sha1").update(isi).digest("hex");

  // /opt bila bisa ditulis, kalau tidak /tmp (hilang saat distro mati, dan itu
  // tak apa — penyalinannya cuma beberapa puluh KB dan hanya sekali per proses).
  for (const dir of ["/opt/wolfspace", "/tmp/wolfspace"]) {
    const tujuan = `${dir}/zone-worker-${sha}.cjs`;
    try {
      jalankan(`test -f ${tujuan}`);
      return tujuan; // sudah ada dari proses sebelumnya
    } catch (_) {
      /* belum ada — salin */
    }
    try {
      jalankan(
        `mkdir -p ${dir} && cat > ${tujuan}.tmp && mv ${tujuan}.tmp ${tujuan}`,
        isi,
      );
      return tujuan;
    } catch (_) {
      /* tak bisa menulis di sini — coba lokasi berikutnya */
    }
  }
  _wslAlasan = `worker tak bisa disalin ke dalam distro "${distro}" — /opt dan /tmp keduanya tak bisa ditulis`;
  return null;
}

let _wslCache;
let _wslAlasan = null; // kenapa WSL tak dipakai — dulu dibuang oleh catch(_)
function wslZona() {
  if (_wslCache !== undefined) return _wslCache;
  _wslCache = null;
  if (process.platform !== "win32") {
    _wslAlasan = "bukan Windows";
    return _wslCache;
  }
  if (process.env.WOLFSPACE_ZONE_WSL === "0") {
    _wslAlasan = "dimatikan lewat WOLFSPACE_ZONE_WSL=0";
    return _wslCache;
  }
  const distro = process.env.WOLFSPACE_WSL_DISTRO || "WolfspaceTest";
  const nodeWsl = process.env.WOLFSPACE_WSL_NODE || "/opt/node24/bin/node";
  const workerWsl = siapkanWorker(distro);
  if (!workerWsl) return _wslCache; // alasannya sudah diisi siapkanWorker
  // Empat syarat, diuji NYATA dan dibedakan SATU PER SATU lewat kode keluar.
  // Rangkaian `a && b && c` yang lama cuma bisa bilang "gagal" — padahal "distro
  // tak ada" dan "Node di dalamnya terlalu tua" menuntut tindakan yang sama
  // sekali berbeda. Tetap satu panggilan wsl.exe, jadi tak menambah ongkos.
  const SEBAB = {
    11: () =>
      `Node tak ada / tak bisa dieksekusi di ${nodeWsl} (di dalam distro "${distro}")`,
    12: () =>
      `worker hilang dari dalam WSL di ${workerWsl} setelah sempat disiapkan — distro mungkin di-restart di tengah jalan`,
    13: () =>
      `Node di ${nodeWsl} ada tapi flag permission-nya ditolak — biner rusak, atau bukan Node sungguhan`,
    14: () =>
      `unshare tak bisa membuat network namespace di distro "${distro}"`,
  };
  // Tak ada kode 15: pemeriksaan versi pindah ke sisi JS setelah probe, karena
  // shell tak lagi menghitungnya sendiri. Entri mati di tabel ini akan jadi
  // keterangan yang tak pernah muncul — persis jenis dokumentasi yang menyesatkan
  // pembacanya.
  try {
    // Kode keluar 0 SAJA tak cukup untuk tahap Node: sebuah biner yang
    // mengabaikan flag tak dikenal (mis. /bin/echo) juga keluar 0, dan probe
    // akan menyatakan pengurungan aktif padahal tidak. Terbukti saat menguji ini.
    // Karena itu Node diminta MENCETAK versinya — hanya Node yang bisa — dan
    // angkanya sekalian menentukan flag mana yang dipakai nanti.
    const keluar = execFileSync(
      "wsl.exe",
      [
        "-d",
        distro,
        "--",
        "sh",
        "-c",
        // Versi diambil DULU tanpa flag apa pun; flag yang sesuai baru diuji di
        // panggilan kedua. Urutan sebaliknya mustahil — memakai --permission
        // untuk mendeteksi versi akan gagal di Node 20 justru pada distro yang
        // sebenarnya didukung.
        //
        // TANPA `$(...)`: substitusi perintah TIDAK selamat menyeberang wsl.exe
        // (terukur: `sh: syntax error: unexpected "("`). Karena itu versinya
        // dicetak langsung oleh Node dan diurai di sisi JS.
        `test -x ${nodeWsl} || exit 11; test -f ${workerWsl} || exit 12; ` +
          `unshare -n true || exit 14; ` +
          `${nodeWsl} -e 'process.stdout.write("NODEV"+process.versions.node)' || exit 13`,
      ],
      { stdio: ["ignore", "pipe", "pipe"], timeout: 20000, encoding: "utf8" },
    );
    const v = /NODEV(\d+)\./.exec(keluar || "");
    if (!v) {
      _wslAlasan = `${nodeWsl} di distro "${distro}" keluar bersih tapi bukan Node — tak mencetak versi apa pun`;
      return _wslCache;
    }
    const flag = flagPermission(Number(v[1]), workerWsl);
    if (!flag) {
      _wslAlasan =
        `Node ${v[1]}.x di ${nodeWsl} terlalu tua — model permission butuh Node >= 20 ` +
        `(v20-v22: --experimental-permission, v23+: --permission)`;
      return _wslCache;
    }
    // Flag TIDAK diasumsikan bekerja hanya karena angka versinya cocok. Ini
    // pemeriksaan yang dulu menangkap /bin/echo lolos sebagai "Node"; menghapusnya
    // berarti kembali percaya pada tebakan.
    try {
      execFileSync(
        "wsl.exe",
        ["-d", distro, "--", nodeWsl, ...flag, "-e", "0"],
        { stdio: "ignore", timeout: 20000 },
      );
    } catch (_) {
      _wslAlasan = `Node ${v[1]}.x di ${nodeWsl} menolak ${flag[0]} — biner rusak atau bukan Node sungguhan`;
      return _wslCache;
    }
    _wslCache = { distro, nodeWsl, workerWsl, flag };
  } catch (e) {
    // WSL tak siap — jatuh ke fork biasa. Alasannya DISIMPAN, tidak dibuang.
    _wslCache = null;
    if (e.code === "ETIMEDOUT" || /timed? ?out/i.test(String(e.message))) {
      _wslAlasan = `distro "${distro}" tak menjawab dalam 20 detik`;
    } else if (SEBAB[e.status]) {
      _wslAlasan = SEBAB[e.status]();
    } else {
      // Kode keluar di luar 11-14 berarti wsl.exe sendiri yang gagal — distro
      // tak terdaftar, WSL tak terpasang. Pesannya ada di stderr wsl.exe, yang
      // UTF-16; tanpa penyaringan NUL hasilnya terbaca sebagai "D.i.s.t.r.o".
      const se = String(e.stderr || "")
        .replace(/ /g, "")
        .trim()
        .split("\n")[0];
      // status -1 datang sebagai 4294967295 (unsigned). Angka itu tak berarti
      // apa-apa bagi yang membacanya, jadi dinormalkan.
      const kode = e.status === 4294967295 ? -1 : e.status;
      _wslAlasan =
        `wsl.exe gagal menjalankan distro "${distro}" (kode ${kode}) — ` +
        (se || "distro kemungkinan tak terdaftar; cek `wsl -l -v`");
    }
  }
  return _wslCache;
}

// Status pengurungan untuk SATU eksekusi zona, dalam bentuk yang bisa
// dilampirkan ke hasil.
//
// KENAPA ADA. Sebelum ini, gagalnya WSL berarti zona diam-diam berjalan tanpa
// pengurungan jaringan: tak ada log, tak ada penanda di hasil, dan `--permission`
// yang masih menahan berkas membuat semuanya TERLIHAT normal. Itu pola yang sama
// dengan gerbang Docker lama yang sudah dibuang — pengaman yang bisa mati
// sendiri tanpa memberi tahu. Yang berbahaya bukan tak adanya pengurungan
// (kadang memang tak tersedia), tapi tak adanya cara membedakan keduanya.
function statusKurungan(ns, wsl, matiSengaja) {
  if (ns) return { transport: "linux-netns", jaringanTerkurung: true };
  if (wsl)
    return {
      transport: "wsl-netns",
      jaringanTerkurung: true,
      distro: wsl.distro,
    };
  let alasan;
  if (matiSengaja) alasan = "dimatikan pemanggil (opts.netns=false)";
  else if (process.platform === "win32") alasan = _wslAlasan || "WSL tak siap";
  else if (process.platform === "linux")
    alasan =
      "unshare tak bisa membuat namespace — butuh CAP_SYS_ADMIN atau user namespace";
  else alasan = `platform ${process.platform} tak punya network namespace`;
  return { transport: "fork", jaringanTerkurung: false, alasan };
}

// Peringatan SEKALI JALAN, langsung ke stderr.
//
// Sengaja TIDAK lewat agent/debug.cjs: logger itu digerbang VERBOSE/DEBUG_ON,
// yang keduanya mati secara default — peringatan turunnya jaminan keamanan
// justru paling perlu terlihat pada orang yang tak menyalakan apa pun. Sekali
// jalan, bukan per eksekusi, supaya tak membanjiri keluaran agent.
let _sudahLapor = false;
function laporSekali(st) {
  if (_sudahLapor || st.jaringanTerkurung) return;
  _sudahLapor = true;
  try {
    process.stderr.write(
      "[WOLFSPACE:broker] PERINGATAN: zona kapabilitas berjalan TANPA pengurungan " +
        "jaringan.\n" +
        "  alasan   : " +
        st.alasan +
        "\n" +
        "  akibat   : kode di dalam zona bisa menghubungi jaringan langsung; " +
        "berkas TETAP ditahan --permission.\n" +
        (process.platform === "win32"
          ? "  perbaikan: pastikan distro WSL hidup dan Node >= 23 ada di dalamnya " +
            "(WOLFSPACE_WSL_DISTRO / WOLFSPACE_WSL_NODE).\n"
          : ""),
    );
  } catch (_) {}
}

function winKeWsl(p) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(String(p));
  if (!m) return null;
  return "/mnt/" + m[1].toLowerCase() + "/" + m[2].replace(/\\/g, "/");
}

let _netnsCache;
function netnsWrapper() {
  if (_netnsCache !== undefined) return _netnsCache;
  _netnsCache = null;
  if (process.platform === "linux") {
    try {
      execFileSync("unshare", ["-n", "true"], {
        stdio: "ignore",
        timeout: 3000,
      });
      _netnsCache = "unshare";
    } catch (_) {
      _netnsCache = null; // butuh CAP_SYS_ADMIN / user-ns — jalan tanpa pengurungan
    }
  }
  return _netnsCache;
}

// Berapa banyak keluaran zona yang DISIMPAN. Ini BUKAN batas berapa yang
// dibaca: pipa harus terus dikuras apa pun isinya (lihat makeSink).
const MAX_CAPTURE = 256 * 1024;

// Penampung yang SELALU mengonsumsi, tapi hanya menyimpan sampai `limit`.
//
// Ini inti perbaikannya. Sebelumnya stdout dibuka sebagai 'pipe' tapi tak
// pernah dibaca sama sekali — hanya stderr yang punya listener. Begitu buffer
// pipa OS penuh (~64 KB), proses zona MEMBLOK selamanya di console.log lalu
// mati kena timeout. Terukur pada kode yang sama persis, hanya beda volume:
//     tanpa cetak        -> 42 dalam 167 ms
//     cetak ~2 KB        -> 42 dalam 185 ms
//     cetak ~200 KB      -> TIMEOUT 8 detik
// Kegagalannya senyap: pesannya cuma "zone timeout", tanpa petunjuk bahwa
// penyebabnya adalah mencetak terlalu banyak — orang akan menyalahkan kodenya
// sendiri, bukan sandbox-nya. Untuk sandbox yang tugasnya menjalankan kode
// asing, "program yang banyak mencetak akan menggantung" adalah cacat yang
// pasti ketemu di pemakaian pertama.
//
// Membatasi yang disimpan TIDAK boleh berarti berhenti membaca — kalau
// listenernya dilepas setelah penuh, deadlock-nya kembali persis seperti semula.
function makeSink(limit) {
  let kept = "";
  let total = 0;
  return {
    push(chunk) {
      const s = chunk.toString();
      total += s.length;
      if (kept.length < limit) kept += s.slice(0, limit - kept.length);
    },
    get text() {
      return kept;
    },
    get truncated() {
      return total > kept.length;
    },
    get bytes() {
      return total;
    },
  };
}

function runInCapabilityZone(code, broker, opts = {}) {
  const timeoutMs = opts.timeout || 10000;
  const limit = opts.maxCapture || MAX_CAPTURE;

  return new Promise((resolve, reject) => {
    // Dengan netns dipakai spawn, bukan fork: fork tak bisa disisipi pembungkus
    // perintah. `stdio: [..., 'ipc']` tetap memberi kanal child.send/on('message')
    // yang sama, karena Node anak membacanya dari NODE_CHANNEL_FD.
    // Tiga transport, dipilih otomatis. Urutannya bukan preferensi estetika:
    // yang di atas memberi jaminan lebih kuat.
    //   1. Linux    -> unshare -n + fork/spawn, IPC fd. Paling murah.
    //   2. Windows  -> wsl.exe + unshare -n, protokol stdio. Menambah ongkos
    //                  startup wsl.exe, tapi ini SATU-SATUNYA cara mendapat
    //                  pengurungan jaringan di Windows.
    //   3. lainnya  -> fork biasa. Berkas tetap dijaga --permission; jaringan
    //                  tidak. Perilaku lama, apa adanya.
    const ns = opts.netns === false ? null : netnsWrapper();
    const wsl = ns || opts.netns === false ? null : wslZona();
    const kurungan = statusKurungan(ns, wsl, opts.netns === false);
    laporSekali(kurungan);
    // Token framing: acak per eksekusi supaya kode zona tak bisa memalsukan baris
    // protokol dengan mencetak prefiks yang ditebak.
    const token = wsl
      ? "WSZ" + require("crypto").randomBytes(8).toString("hex") + ""
      : "";
    // Node terlalu tua: tolak, jangan jalankan tanpa pembatasan berkas.
    const flagLokal = flagPermission(_MAJOR_LOKAL, WORKER);
    if (!wsl && !flagLokal) {
      return reject(
        Object.assign(
          new Error(
            `Node ${process.versions.node} tak mendukung model permission — ` +
              "capability_exec butuh Node >= 20 (v20-v22: --experimental-permission, " +
              "v23+: --permission). Zona TIDAK dijalankan, karena tanpa flag itu " +
              "kode tugas akan berjalan dengan akses berkas penuh.",
          ),
          { kurungan, stdout: "", stderr: "" },
        ),
      );
    }

    let child;
    if (ns) {
      child = spawn(ns, ["-n", process.execPath, ...flagLokal, WORKER], {
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
    } else if (wsl) {
      child = spawn(
        "wsl.exe",
        [
          "-d",
          wsl.distro,
          "--",
          "env",
          "WOLFSPACE_ZONE_TOKEN=" + token,
          "unshare",
          "-n",
          wsl.nodeWsl,
          // Flag ditentukan dari versi Node DI DALAM distro, bukan versi lokal —
          // keduanya bisa berbeda jauh.
          ...wsl.flag,
          wsl.workerWsl,
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
    } else {
      child = fork(WORKER, [], {
        execArgv: flagLokal, // tanpa --allow-fs-read/write => fs ditolak se-proses
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
    }

    // Satu cara mengirim, apa pun transportnya.
    const kirimKeZona = (msg) => {
      if (wsl) {
        try {
          child.stdin.write(JSON.stringify(msg) + "\n");
        } catch (_) {}
        return;
      }
      try {
        child.send(msg);
      } catch (_) {}
    };

    let settled = false;
    const out = makeSink(limit);
    const err = makeSink(limit);
    // Di transport WSL, stdout membawa DUA hal: baris protokol (berprefiks token)
    // dan keluaran cetak kode zona. Dipisahkan di sini — baris protokol diambil,
    // sisanya masuk ke penampung keluaran seperti biasa, jadi jaminan "keluaran
    // zona kembali utuh" tetap berlaku di kedua transport.
    if (wsl) {
      let sisa = "";
      child.stdout.on("data", (c) => {
        sisa += c.toString();
        let i;
        while ((i = sisa.indexOf("\n")) !== -1) {
          const baris = sisa.slice(0, i);
          sisa = sisa.slice(i + 1);
          if (baris.startsWith(token)) {
            try {
              tanganiPesanZona(JSON.parse(baris.slice(token.length)));
            } catch (_) {}
          } else {
            out.push(baris + "\n");
          }
        }
      });
      // Ekor tanpa newline saat proses berakhir — tetap keluaran user.
      child.stdout.on("end", () => {
        if (sisa) out.push(sisa);
      });
    } else {
      child.stdout.on("data", (c) => out.push(c));
    }
    child.stderr.on("data", (c) => err.push(c));

    // Keluaran ikut dilampirkan ke KEGAGALAN juga, bukan cuma keberhasilan —
    // saat zona timeout atau melempar, apa yang sempat dicetaknya justru satu-
    // satunya petunjuk yang tersisa.
    // `kurungan` ikut di io(), bukan hanya di jalur sukses: kalau zona timeout
    // atau melempar, pertanyaan "tadi itu terkurung atau tidak" justru makin
    // penting, bukan makin tak relevan.
    const io = () => ({
      stdout: out.text,
      stderr: err.text,
      truncated: out.truncated || err.truncated,
      outBytes: out.bytes,
      errBytes: err.bytes,
      kurungan,
    });

    // Selesaikan SETELAH stdio terkuras, bukan seketika.
    //
    // Dulu `done` dari IPC langsung diikuti SIGKILL. Pesan IPC bisa tiba
    // mendahului data yang masih mengantre di pipa stdout, jadi membunuh anak
    // saat itu juga MEMBUANG keluaran yang belum terbaca. Terukur pada zona yang
    // mencetak ~5 MB: hanya 530.452 byte yang sampai. Di Windows kebetulan tak
    // terlihat karena urutannya berbeda — tersingkap begitu jalur netns memakai
    // spawn. Kehilangan diam-diam seperti ini persis yang harus dihindari.
    //
    // Yang ditunggu adalah 'close' — peristiwa yang menyala setelah proses
    // keluar DAN kedua pipa stdio habis. Terukur pada zona pencetak 5 MB:
    //     +605 ms  pesan done (baru 327.240 B terbaca)
    //     +875 ms  stdout END (5.050.000 B — utuh)
    //     +878 ms  close
    //
    // JANGAN memanggil child.disconnect() di sini. Diukur: dengan disconnect
    // sisi induk, 'exit' tetap menyala (~240 ms) tapi 'close' TIDAK PERNAH
    // menyala, sehingga jaring pengaman DRAIN_MS selalu habis dan setiap
    // eksekusi zona menanggung tambahan ~3 detik. Yang melepas event loop anak
    // adalah process.disconnect() di zone-worker, bukan di sini.
    const DRAIN_MS = 3000;
    let selesai = false;
    const settle = (fn, mkVal, killNow) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (killNow) {
        const adapter = getPlatformAdapter();
        try {
          adapter.killTree(child);
        } catch (_) {
          try {
            child.kill("SIGKILL");
          } catch (__) {}
        }
      }
      const tuntas = () => {
        if (selesai) return;
        selesai = true;
        clearTimeout(grace);
        try {
          child.kill("SIGKILL");
        } catch (_) {}
        fn(mkVal());
      };
      const grace = setTimeout(tuntas, DRAIN_MS);
      child.once("close", tuntas);
    };

    const fail = (e, killNow) =>
      settle(reject, () => Object.assign(e, io()), killNow);

    const timer = setTimeout(() => {
      fail(new Error(`zone timeout (${timeoutMs}ms)`), true);
    }, timeoutMs);

    // SATU penangan untuk kedua transport. Sebelumnya logika ini menempel di
    // child.on("message"), yang hanya ada di kanal IPC — jadi transport stdio
    // akan mengabaikan permintaan kapabilitas sama sekali, dan zona di WSL tak
    // bisa memakai request() untuk apa pun.
    async function tanganiPesanZona(msg) {
      // Laporan percobaan jaringan langsung dari zona. Bukan permintaan — tak
      // ada yang perlu dijawab, cukup dicatat supaya percobaannya terlihat di
      // jejak audit alih-alih gagal dalam diam.
      if (msg.type === "net-attempt") {
        try {
          broker.catatPercobaanLangsung(msg.modul, {
            metode: msg.metode,
            tujuan: msg.tujuan,
          });
        } catch (_) {}
        return;
      }
      if (msg.type === "capability-request") {
        try {
          const result = await broker.request(msg.capability, msg.params);
          if (!settled)
            kirimKeZona({ type: "capability-response", id: msg.id, result });
        } catch (e) {
          if (!settled)
            kirimKeZona({
              type: "capability-response",
              id: msg.id,
              error: e.message,
              errCode: e.code,
            });
        }
        return;
      }
      // io() dipanggil BELAKANGAN (di dalam thunk), setelah stdio terkuras —
      // kalau dievaluasi di sini, isinya kembali terpotong.
      if (msg.type === "done")
        settle(resolve, () => ({ result: msg.result, ...io() }));
      else if (msg.type === "error")
        fail(Object.assign(new Error(msg.message), { code: msg.code }));
    }

    if (!wsl) child.on("message", tanganiPesanZona);

    child.on("error", (e) => fail(e, true));
    child.on("exit", (code) => {
      if (!settled && code !== 0)
        fail(
          new Error(
            `zone process exited with code ${code}: ${err.text.slice(0, 500)}`,
          ),
        );
    });

    // opts.pelapor === false mematikan stub pelapor jaringan di dalam zona.
    // Dipakai uji netns: dengan pelapor aktif, stub melempar sebelum soket
    // dibuat, jadi ujinya akan lulus meski namespace-nya mati. Mematikannya
    // membuat percobaan benar-benar diuji terhadap kernel.
    kirimKeZona({ type: "run", code, pelapor: opts.pelapor !== false });
  });
}

module.exports = {
  runInCapabilityZone,
  statusKurungan,
  wslZona,
  netnsWrapper,
  flagPermission,
};
