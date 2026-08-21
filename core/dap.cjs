"use strict";
/**
 * ── Klien Debug Adapter Protocol ──
 *
 * DAP adalah bahasa standar antara editor dan debugger — spesifikasi terbuka
 * (MIT, dari Microsoft) yang sama dengan yang dipakai VS Code. Berkas ini sisi
 * EDITOR-nya: ia bicara dengan proses adapter (debugpy, js-debug, dlv dap) dan
 * menerjemahkan pesannya jadi janji dan kejadian.
 *
 * KENAPA ADA. Jalur debug sebelumnya membaca TEKS dari PTY: menunggu prompt
 * `debug>`/`(Pdb)` muncul, lalu menebak keadaan dari situ. Itu bekerja, tapi
 * tiap bahasa menuntut tabel kata perintahnya sendiri, dan tak satu pun
 * keadaan bisa dibaca sebagai data — titik henti harus diketik, isi variabel
 * kembali sebagai teks bebas, dan berakhirnya sesi hanya bisa DITEBAK dari
 * prompt yang muncul kembali.
 *
 * Dengan DAP semuanya jadi data: `setBreakpoints` menerima nomor baris,
 * `variables` mengembalikan pasangan nama-nilai, dan `terminated` adalah
 * kejadian yang pasti — bukan tebakan atas keluaran layar.
 *
 * BENTUK KAWATNYA sama seperti LSP: header `Content-Length`, baris kosong,
 * lalu badan JSON.
 *
 *     Content-Length: 92\r\n
 *     \r\n
 *     {"seq":1,"type":"request","command":"initialize","arguments":{…}}
 *
 * Tiga jenis pesan: `request` (kita -> adapter), `response` (jawaban atas
 * request, dicocokkan lewat `request_seq`), dan `event` (adapter -> kita,
 * tanpa diminta).
 */

const { spawn } = require("child_process");
const { EventEmitter } = require("events");

const PEMISAH = "\r\n\r\n";

class KlienDap extends EventEmitter {
  /**
   * @param {string} perintah  biner adapter (mis. "python")
   * @param {string[]} argumen argumennya (mis. ["-m", "debugpy.adapter"])
   * @param {object} opsi      { cwd, env }
   */
  constructor(perintah, argumen, opsi = {}) {
    super();
    this._seq = 1;
    this._menunggu = new Map(); // seq -> { selesai, gagal }
    this._sisa = Buffer.alloc(0);
    this._mati = false;

    this.proses = spawn(perintah, argumen, {
      cwd: opsi.cwd || process.cwd(),
      env: { ...process.env, ...(opsi.env || {}) },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.proses.stdout.on("data", (b) => this._terima(b));
    // stderr adapter BUKAN keluaran program yang di-debug — itu datang sebagai
    // kejadian `output`. Yang di sini pesan adapter sendiri saat ia bermasalah,
    // dan membuangnya berarti kegagalan adapter jadi senyap total.
    this.proses.stderr.on("data", (b) =>
      this.emit("galat-adapter", b.toString("utf8")),
    );
    this.proses.on("exit", (kode) => {
      this._mati = true;
      // Setiap janji yang masih menggantung DIGAGALKAN. Tanpa ini, adapter yang
      // mati di tengah jalan meninggalkan pemanggil menunggu selamanya.
      for (const { gagal } of this._menunggu.values())
        gagal(new Error("adapter berhenti (kode " + kode + ")"));
      this._menunggu.clear();
      this.emit("keluar", kode);
    });
    this.proses.on("error", (e) =>
      this.emit("galat-adapter", String(e.message)),
    );
  }

  // ── Membaca aliran byte jadi pesan utuh ──
  //
  // Dipotong lewat Buffer, bukan string: Content-Length dihitung dalam BYTE,
  // sementara panjang string JavaScript dihitung dalam unit UTF-16. Satu
  // karakter non-ASCII di nama berkas atau isi variabel sudah cukup membuat
  // keduanya berbeda, dan sesudah itu seluruh aliran tergeser.
  _terima(potongan) {
    this._sisa = Buffer.concat([this._sisa, potongan]);
    for (;;) {
      const batas = this._sisa.indexOf(PEMISAH);
      if (batas < 0) return;
      const kepala = this._sisa.slice(0, batas).toString("ascii");
      const cocok = /Content-Length:\s*(\d+)/i.exec(kepala);
      if (!cocok) {
        // Header tanpa panjang tak bisa dipulihkan — buang sampai pemisah
        // berikutnya alih-alih menganggap sisanya badan pesan.
        this._sisa = this._sisa.slice(batas + PEMISAH.length);
        continue;
      }
      const panjang = Number(cocok[1]);
      const awal = batas + PEMISAH.length;
      if (this._sisa.length < awal + panjang) return; // belum utuh, tunggu
      const badan = this._sisa.slice(awal, awal + panjang).toString("utf8");
      this._sisa = this._sisa.slice(awal + panjang);
      let pesan;
      try {
        pesan = JSON.parse(badan);
      } catch (e) {
        this.emit("galat-adapter", "badan bukan JSON: " + badan.slice(0, 120));
        continue;
      }
      this._salurkan(pesan);
    }
  }

  _salurkan(pesan) {
    if (pesan.type === "response") {
      const nunggu = this._menunggu.get(pesan.request_seq);
      if (!nunggu) return;
      this._menunggu.delete(pesan.request_seq);
      if (pesan.success) nunggu.selesai(pesan.body);
      else
        nunggu.gagal(
          new Error(
            pesan.message || "permintaan '" + pesan.command + "' ditolak",
          ),
        );
      return;
    }
    if (pesan.type === "event") {
      this.emit("kejadian", pesan.event, pesan.body);
      this.emit(pesan.event, pesan.body);
      return;
    }
    if (pesan.type === "request") {
      // Adapter boleh MEMINTA sesuatu ke klien (mis. runInTerminal,
      // startDebugging). Yang tak kita dukung dijawab tegas — membiarkannya
      // menggantung membuat adapter menunggu selamanya dan sesinya seolah macet
      // tanpa sebab.
      //
      // `startDebugging` DIJAWAB BERHASIL bila pemanggil menyanggupinya. Ini
      // bukan basa-basi: js-debug memakainya untuk melahirkan sesi anak yang
      // benar-benar men-debug, dan menjawab gagal membuatnya membatalkan
      // seluruh sesi — titik henti tak pernah terpasang, `stopped` tak pernah
      // datang, dan tak ada satu pun pesan yang menyebut kenapa.
      const sanggup =
        pesan.command === "startDebugging" && this._balasStartDebugging;
      this._tulis({
        seq: this._seq++,
        type: "response",
        request_seq: pesan.seq,
        success: !!sanggup,
        command: pesan.command,
        ...(sanggup ? {} : { message: "tidak didukung: " + pesan.command }),
      });
      this.emit("permintaan-adapter", pesan);
    }
  }

  _tulis(pesan) {
    if (this._mati || !this.proses.stdin.writable) return;
    const badan = Buffer.from(JSON.stringify(pesan), "utf8");
    this.proses.stdin.write(
      "Content-Length: " + badan.length + PEMISAH,
      "ascii",
    );
    this.proses.stdin.write(badan);
  }

  /** Kirim request, dapatkan janji atas body responsnya. */
  kirim(perintah, argumen, batasMs = 15000) {
    if (this._mati) return Promise.reject(new Error("adapter sudah berhenti"));
    const seq = this._seq++;
    return new Promise((selesai, gagal) => {
      // Batas waktu WAJIB: adapter yang menerima request tapi tak pernah
      // menjawab tak bisa dibedakan dari yang sedang bekerja lama, dan tanpa
      // batas ini seluruh alur berhenti tanpa satu pun pesan.
      const jam = setTimeout(() => {
        this._menunggu.delete(seq);
        gagal(new Error("tak ada balasan untuk '" + perintah + "'"));
      }, batasMs);
      this._menunggu.set(seq, {
        selesai: (b) => {
          clearTimeout(jam);
          selesai(b);
        },
        gagal: (e) => {
          clearTimeout(jam);
          gagal(e);
        },
      });
      this._tulis({
        seq,
        type: "request",
        command: perintah,
        arguments: argumen,
      });
    });
  }

  /** Menunggu satu kejadian, dengan batas waktu. */
  tunggu(kejadian, batasMs = 15000) {
    return new Promise((selesai, gagal) => {
      const jam = setTimeout(() => {
        this.off(kejadian, pada);
        gagal(new Error("kejadian '" + kejadian + "' tak pernah datang"));
      }, batasMs);
      const pada = (b) => {
        clearTimeout(jam);
        selesai(b);
      };
      this.once(kejadian, pada);
    });
  }

  tutup() {
    this._mati = true;
    try {
      this.proses.kill();
    } catch (_) {}
  }
}

/**
 * Urutan pembukaan sesi, sesuai spesifikasi DAP.
 *
 * Yang mudah salah adalah URUTANNYA, dan salahnya tidak berupa galat melainkan
 * titik henti yang diam-diam tak terpasang:
 *
 *   1. `initialize`         -> tunggu responsnya
 *   2. `launch`             -> JANGAN ditunggu di sini. Responsnya baru datang
 *                              sesudah program benar-benar mulai, sementara
 *                              adapter menunggu kita mengirim titik henti dulu
 *                              — saling menunggu, dan sesinya membeku.
 *   3. kejadian `initialized` -> BARU adapter siap menerima titik henti
 *   4. `setBreakpoints` + `configurationDone`
 *   5. sesudah itu barulah respons `launch` datang
 */
async function mulaiSesi(klien, argumenLaunch, titikHenti) {
  await klien.kirim("initialize", {
    clientID: "wolfspace",
    clientName: "WOLFSPACE",
    adapterID: argumenLaunch.type || "debugpy",
    locale: "en",
    linesStartAt1: true,
    columnsStartAt1: true,
    pathFormat: "path",
    supportsVariableType: true,
    supportsRunInTerminalRequest: false,
  });

  const siap = klien.tunggu("initialized");
  const janjiLaunch = klien.kirim("launch", argumenLaunch, 30000);
  await siap;

  const hasilTitik = [];
  for (const [berkas, baris] of Object.entries(titikHenti || {})) {
    const b = await klien.kirim("setBreakpoints", {
      source: { path: berkas },
      breakpoints: baris.map((l) => ({ line: l })),
    });
    hasilTitik.push(...((b && b.breakpoints) || []));
  }
  await klien.kirim("configurationDone", {});
  await janjiLaunch;
  return hasilTitik;
}

/** Adapter debugpy: proses Python yang bicara DAP lewat stdio. */
function klienPython(opsi = {}) {
  const py = opsi.python || process.env.WOLFSPACE_PYTHON || "python";
  return new KlienDap(py, ["-m", "debugpy.adapter"], { cwd: opsi.cwd });
}

// ── Klien yang bicara lewat SOKET, bukan stdio ──
//
// js-debug (adapter Node/JavaScript resmi) tak menyediakan mode stdio: ia
// dijalankan sebagai server yang mendengarkan di satu porta TCP. Bentuk
// pesannya sama persis — header Content-Length lalu badan JSON — jadi yang
// berbeda hanya pipanya.
// Dibuat sebagai fungsi PABRIK, bukan subkelas: konstruktor KlienDap selalu
// melahirkan proses, jadi mewarisinya berarti melahirkan satu proses yang
// langsung dibuang setiap kali klien soket dibuat. Yang dipakai ulang di sini
// prototipenya — pemecah pesan, pencocokan seq, dan pengiriman semuanya sama.
function klienDariSoket(soket) {
  const k = Object.create(KlienDap.prototype);
  EventEmitter.call(k);
  k._seq = 1;
  k._menunggu = new Map();
  k._sisa = Buffer.alloc(0);
  k._mati = false;
  k.proses = { stdin: soket, kill: () => soket.destroy() };
  soket.on("data", (b) => k._terima(b));
  soket.on("error", (e) => k.emit("galat-adapter", String(e.message)));
  soket.on("close", () => {
    k._mati = true;
    for (const { gagal } of k._menunggu.values())
      gagal(new Error("sambungan adapter terputus"));
    k._menunggu.clear();
    k.emit("keluar", 0);
  });
  return k;
}

// ── js-debug memakai SESI ANAK, dan itu mengubah bentuk kliennya ──
//
// Ini yang membuat js-debug berbeda dari debugpy, dan yang membuat percobaan
// pertama gagal tanpa penjelasan: titik henti kembali `verified:false` dan
// kejadian `stopped` tak pernah datang.
//
// Sesi yang kita buka BUKAN yang men-debug. Ia sesi induk; begitu `launch`
// dikerjakan, ia mengirim permintaan BALIK `startDebugging` — meminta klien
// membuka sesi KEDUA yang benar-benar menempel ke proses Node-nya. Klien yang
// menolak permintaan balik (seperti versi pertama berkas ini) membuat sesi anak
// itu tak pernah lahir, jadi tak ada yang berhenti dan tak ada yang melapor.
//
// Karena titik henti dipasang SEBELUM anak lahir, ia harus diingat lalu
// dikirim ULANG ke anak begitu ia ada — di sanalah ia benar-benar berlaku.
function _bungkusJs(induk, porta, prosesServer) {
  const net = require("net");
  const muka = new EventEmitter();
  let anakKlien = null;
  const titikDiingat = []; // [{ source, breakpoints }]

  const aktif = () => anakKlien || induk;

  muka.kirim = (perintah, argumen, batas) => {
    // setBreakpoints DIINGAT apa pun tujuannya: kalau anak lahir belakangan,
    // ia butuh daftar yang sama.
    if (perintah === "setBreakpoints") titikDiingat.push(argumen);
    return aktif().kirim(perintah, argumen, batas);
  };
  muka.tunggu = (kejadian, batas = 15000) =>
    new Promise((selesai, gagal) => {
      const jam = setTimeout(() => {
        muka.off(kejadian, pada);
        gagal(new Error("kejadian '" + kejadian + "' tak pernah datang"));
      }, batas);
      const pada = (b) => {
        clearTimeout(jam);
        selesai(b);
      };
      muka.once(kejadian, pada);
    });
  muka.tutup = () => {
    try {
      anakKlien && anakKlien.tutup();
    } catch (_) {}
    try {
      induk.tutup();
    } catch (_) {}
    try {
      prosesServer.kill();
    } catch (_) {}
  };

  induk._balasStartDebugging = true;

  const teruskan = (k) => {
    k.on("kejadian", (nama, badan) => {
      muka.emit("kejadian", nama, badan);
      muka.emit(nama, badan);
    });
    k.on("galat-adapter", (t) => muka.emit("galat-adapter", t));
  };
  teruskan(induk);
  induk.on("keluar", (k) => muka.emit("keluar", k));

  induk.on("permintaan-adapter", (pesan) => {
    if (pesan.command !== "startDebugging") return;
    const konfigurasi =
      (pesan.arguments && pesan.arguments.configuration) || {};
    const soket = net.connect(porta, "127.0.0.1", async () => {
      const anak = klienDariSoket(soket);
      anakKlien = anak;
      teruskan(anak);
      try {
        await anak.kirim("initialize", {
          clientID: "wolfspace",
          adapterID: "pwa-node",
          linesStartAt1: true,
          columnsStartAt1: true,
          pathFormat: "path",
          supportsVariableType: true,
        });
        const siap = anak.tunggu("initialized", 15000);
        const janji = anak.kirim(
          pesan.arguments.request === "attach" ? "attach" : "launch",
          konfigurasi,
          30000,
        );
        await siap;
        for (const t of titikDiingat) await anak.kirim("setBreakpoints", t);
        await anak.kirim("configurationDone", {});
        await janji;
      } catch (e) {
        muka.emit("galat-adapter", "sesi anak gagal: " + String(e.message));
      }
    });
    soket.on("error", (e) =>
      muka.emit("galat-adapter", "sesi anak: " + String(e.message)),
    );
  });

  return muka;
}

/**
 * Adapter js-debug: proses Node yang MENDENGARKAN di porta TCP.
 *
 * Portanya 0 — dipilihkan sistem, lalu dibaca dari baris yang dicetak server.
 * Memilih nomor tetap berarti dua jendela WOLFSPACE tak bisa men-debug
 * bersamaan, dan bentrokannya muncul sebagai sesi yang gagal tanpa sebab jelas.
 */
function klienJs(opsi = {}) {
  const net = require("net");
  const berkasServer =
    opsi.server ||
    require("path").join(
      __dirname,
      "..",
      "vendor",
      "js-debug",
      "src",
      "dapDebugServer.js",
    );
  if (!require("fs").existsSync(berkasServer))
    return Promise.reject(
      new Error(
        "js-debug belum diambil. Jalankan: node scripts/ambil-js-debug.cjs",
      ),
    );
  return new Promise((selesai, gagal) => {
    const anak = spawn(process.execPath, [berkasServer, "0", "127.0.0.1"], {
      cwd: opsi.cwd || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let keluaran = "";
    let sudah = false;
    const jam = setTimeout(() => {
      if (sudah) return;
      sudah = true;
      try {
        anak.kill();
      } catch (_) {}
      gagal(
        new Error(
          "js-debug tak mengumumkan portanya. Keluarannya: " +
            keluaran.slice(0, 200),
        ),
      );
    }, 15000);
    anak.stderr.on("data", (b) => (keluaran += b.toString("utf8")));
    anak.stdout.on("data", (b) => {
      keluaran += b.toString("utf8");
      // Server mencetak "Debug server listening at 127.0.0.1:<porta>".
      const m = /listening at [^:]*:(\d+)/i.exec(keluaran);
      if (!m || sudah) return;
      sudah = true;
      clearTimeout(jam);
      const porta = Number(m[1]);
      const soket = net.connect(porta, "127.0.0.1", () => {
        const induk = klienDariSoket(soket);
        selesai(_bungkusJs(induk, porta, anak));
      });
      soket.on("error", (e) => {
        try {
          anak.kill();
        } catch (_) {}
        gagal(e);
      });
    });
    anak.on("error", (e) => {
      if (sudah) return;
      sudah = true;
      clearTimeout(jam);
      gagal(e);
    });
  });
}

module.exports = {
  KlienDap,
  mulaiSesi,
  klienPython,
  klienJs,
  klienDariSoket,
};
