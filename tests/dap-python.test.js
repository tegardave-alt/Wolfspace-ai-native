// ── Klien DAP, dengan debugpy sebagai adapter pertama ──
//
// KENAPA ADA. Jalur debug sebelumnya membaca TEKS dari PTY: menunggu prompt
// `(Pdb)` muncul lalu menebak keadaan dari situ. Itu bekerja, tapi tiap bahasa
// menuntut tabel kata perintahnya sendiri, titik henti harus DIKETIK, isi
// variabel kembali sebagai teks bebas, dan akhir sesi hanya bisa DITEBAK.
//
// Terbukti pada debugpy sungguhan (Python 3.11.9, debugpy 1.8.21):
//   titik henti terpasang : [{"verified":true,"line":7}]   <- dari NOMOR BARIS
//   berhenti karena       : breakpoint
//   berhenti di baris     : 7   berkas="hitung ku.py"      <- nama berspasi
//   variabel              : ["x=6:int","y=7:int"]          <- DATA, bukan teks
//   evaluate x*y          : 42
//   sesudah stepIn        : baris=2  fungsi=tambah
//   akhir sesi            : terminated                     <- kejadian, bukan tebakan
//   keluaran program      : ["SELESAI 13"]

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { KlienDap, mulaiSesi, klienPython } = require("../core/dap.ts");

const SRC = fs.readFileSync(require.resolve("../core/dap.ts"), "utf8");
const tanpaKomentar = (t) =>
  t
    .split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join("\n");

// ── Pembingkaian pesan, TANPA adapter ──
//
// Bagian yang paling mudah salah dan paling sunyi kalau salah. Diuji dengan
// menyuapkan byte langsung ke pemecahnya, jadi ia berjalan di mana pun — tak
// bergantung pada Python maupun debugpy.
describe("pembingkaian pesan DAP", () => {
  // Objek kosong yang memakai ulang pemecah aslinya, tanpa melahirkan proses.
  const pemecah = () => {
    const k = Object.create(KlienDap.prototype);
    k._sisa = Buffer.alloc(0);
    k._menunggu = new Map();
    const masuk = [];
    k.emit = (nama, ...a) => {
      if (nama === "kejadian") masuk.push({ event: a[0], body: a[1] });
      return true;
    };
    return { k, masuk };
  };
  const bingkai = (obj) => {
    const b = Buffer.from(JSON.stringify(obj), "utf8");
    return Buffer.concat([
      Buffer.from("Content-Length: " + b.length + "\r\n\r\n", "ascii"),
      b,
    ]);
  };

  test("satu pesan utuh terbaca", () => {
    const { k, masuk } = pemecah();
    k._terima(
      bingkai({
        type: "event",
        event: "stopped",
        body: { reason: "breakpoint" },
      }),
    );
    expect(masuk).toEqual([
      { event: "stopped", body: { reason: "breakpoint" } },
    ]);
  });

  test("dua pesan dalam SATU potongan terbaca dua-duanya", () => {
    const { k, masuk } = pemecah();
    k._terima(
      Buffer.concat([
        bingkai({ type: "event", event: "a", body: {} }),
        bingkai({ type: "event", event: "b", body: {} }),
      ]),
    );
    expect(masuk.map((m) => m.event)).toEqual(["a", "b"]);
  });

  test("pesan yang TERPOTONG di tengah ditunggu, bukan dibuang", () => {
    // TCP/pipa tak menjamin batas pesan. Tanpa penyangga, pesan yang terbelah
    // dua potongan hilang diam-diam — dan sesinya berhenti tanpa satu pun galat.
    const { k, masuk } = pemecah();
    const b = bingkai({
      type: "event",
      event: "stopped",
      body: { threadId: 1 },
    });
    k._terima(b.slice(0, 12));
    expect(masuk).toHaveLength(0);
    k._terima(b.slice(12, 30));
    expect(masuk).toHaveLength(0);
    k._terima(b.slice(30));
    expect(masuk).toHaveLength(1);
    expect(masuk[0].body).toEqual({ threadId: 1 });
  });

  test("Content-Length dihitung BYTE, bukan panjang string", () => {
    // Ini jebakannya. String JavaScript dihitung dalam unit UTF-16; satu emoji
    // atau satu huruf beraksen di nama berkas sudah cukup membuat keduanya
    // berbeda, dan sesudah itu SELURUH aliran tergeser — pesan berikutnya
    // terbaca dari tengah.
    const { k, masuk } = pemecah();
    const isi = {
      type: "event",
      event: "output",
      body: { output: "kopi ☕ naïve 🐛" },
    };
    const b = bingkai(isi);
    // Panjang byte memang berbeda dari panjang string di sini.
    expect(Buffer.byteLength(JSON.stringify(isi), "utf8")).toBeGreaterThan(
      JSON.stringify(isi).length,
    );
    k._terima(
      Buffer.concat([
        b,
        bingkai({ type: "event", event: "sesudah", body: {} }),
      ]),
    );
    expect(masuk.map((m) => m.event)).toEqual(["output", "sesudah"]);
    expect(masuk[0].body.output).toBe("kopi ☕ naïve 🐛");
  });

  test("pemecahnya memakai Buffer, bukan string", () => {
    const b = tanpaKomentar(SRC);
    expect(b).toMatch(/Buffer\.concat\(\[this\._sisa, potongan\]\)/);
    expect(b).toMatch(/toString\("utf8"\)/);
  });
});

describe("kekokohan klien", () => {
  const B = tanpaKomentar(SRC);

  test("setiap request punya batas waktu", () => {
    // Adapter yang menerima request tapi tak pernah menjawab tak bisa
    // dibedakan dari yang sedang bekerja lama; tanpa batas, seluruh alur
    // berhenti tanpa satu pun pesan.
    expect(B).toMatch(/batasMs = 15000/);
    expect(B).toMatch(/tak ada balasan untuk/);
  });

  test("adapter yang mati MENGGAGALKAN janji yang menggantung", () => {
    expect(B).toMatch(
      /for \(const \{ gagal \} of this\._menunggu\.values\(\)\)/,
    );
    expect(B).toMatch(/adapter berhenti/);
  });

  test("permintaan adapter yang tak didukung DIJAWAB, bukan didiamkan", () => {
    // Membiarkannya menggantung membuat adapter menunggu selamanya dan sesinya
    // seolah macet tanpa sebab.
    expect(B).toMatch(/tidak didukung: /);
    // Bentuknya kini bergantung pada apakah pemanggil menyanggupi permintaan
    // itu (lihat startDebugging), jadi yang dikunci JAWABANNYA ada — bukan
    // ejaan salah satu cabangnya.
    expect(B).toMatch(/type: "response"/);
    expect(B).toMatch(/success: !!sanggup/);
  });

  test("stderr adapter tidak dibuang diam-diam", () => {
    expect(B).toMatch(/emit\("galat-adapter"/);
  });

  test("urutan pembukaan sesi: launch TIDAK ditunggu sebelum initialized", () => {
    // Ini yang paling mudah salah, dan salahnya bukan galat melainkan titik
    // henti yang diam-diam tak terpasang: respons `launch` baru datang sesudah
    // program mulai, sementara adapter menunggu titik henti dulu — saling
    // menunggu, dan sesinya membeku.
    const i = SRC.indexOf("async function mulaiSesi");
    const blok = tanpaKomentar(
      SRC.slice(i, SRC.indexOf("function klienPython")),
    );
    const iSiap = blok.indexOf('klien.tunggu("initialized")');
    const iLaunch = blok.indexOf('klien.kirim("launch"');
    const iTunggu = blok.indexOf("await siap");
    const iTitik = blok.indexOf('kirim("setBreakpoints"');
    const iDone = blok.indexOf('kirim("configurationDone"');
    const iAwaitLaunch = blok.indexOf("await janjiLaunch");
    expect(iSiap).toBeGreaterThan(-1);
    expect(iLaunch).toBeGreaterThan(iSiap); // janji dipasang SEBELUM launch
    expect(iTunggu).toBeGreaterThan(iLaunch);
    expect(iTitik).toBeGreaterThan(iTunggu); // titik henti sesudah initialized
    expect(iDone).toBeGreaterThan(iTitik);
    expect(iAwaitLaunch).toBeGreaterThan(iDone); // launch ditunggu paling akhir
  });
});

// ── Uji hidup: butuh Python + debugpy ──
const punyaDebugpy = (() => {
  try {
    execFileSync(
      process.env.WOLFSPACE_PYTHON || "python",
      ["-c", "import debugpy"],
      {
        stdio: "ignore",
        timeout: 20000,
      },
    );
    return true;
  } catch (_) {
    return false;
  }
})();
const kalauDebugpy = punyaDebugpy ? describe : describe.skip;

kalauDebugpy("sesi debug Python sungguhan (butuh debugpy)", () => {
  let dir, skrip, k, keluaran, selesai;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ws-dap-"));
    // Nama BERSPASI disengaja: path yang tak dikutip/di-escape dengan benar
    // adalah cara paling lazim jalur seperti ini rusak.
    skrip = path.join(dir, "hitung ku.py");
    fs.writeFileSync(
      skrip,
      [
        "def tambah(a, b):",
        "    hasil = a + b",
        "    return hasil",
        "",
        "x = 6",
        "y = 7",
        "z = tambah(x, y)",
        "print('SELESAI', z)",
        "",
      ].join("\n"),
      "utf8",
    );
    k = klienPython({ cwd: dir });
    keluaran = [];
    k.on("output", (b) => keluaran.push(String((b && b.output) || "")));
    selesai = k.tunggu("terminated", 40000);
  }, 60000);

  afterAll(() => {
    try {
      k && k.tutup();
    } catch (_) {}
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  });

  test("titik henti dipasang dari NOMOR BARIS dan diakui adapter", async () => {
    const tp = await mulaiSesi(
      k,
      {
        type: "debugpy",
        request: "launch",
        name: "uji",
        program: skrip,
        cwd: dir,
        console: "internalConsole",
        justMyCode: true,
      },
      { [skrip]: [7] },
    );
    expect(tp).toHaveLength(1);
    // `verified` berarti adapter BENAR-BENAR memasangnya. Titik henti yang
    // diterima tapi tak terpasang adalah kegagalan paling membingungkan:
    // programnya jalan terus seolah tak ada yang diminta.
    expect(tp[0].verified).toBe(true);
    expect(tp[0].line).toBe(7);
  }, 60000);

  test("berhenti TEPAT di baris itu, di berkas berspasi", async () => {
    const b = await k.tunggu("stopped", 30000);
    expect(b.reason).toBe("breakpoint");
    const st = await k.kirim("stackTrace", { threadId: b.threadId, levels: 1 });
    expect(st.stackFrames[0].line).toBe(7);
    expect(path.basename(st.stackFrames[0].source.path)).toBe("hitung ku.py");
    global.__utas = b.threadId;
    global.__bingkai = st.stackFrames[0].id;
  }, 60000);

  test("variabel kembali sebagai DATA bernama dan bertipe", async () => {
    const sc = await k.kirim("scopes", { frameId: global.__bingkai });
    const lokal = sc.scopes.find((s) => /local/i.test(s.name)) || sc.scopes[0];
    const vs = await k.kirim("variables", {
      variablesReference: lokal.variablesReference,
    });
    const peta = {};
    for (const v of vs.variables)
      peta[v.name] = { nilai: v.value, tipe: v.type };
    expect(peta.x).toEqual({ nilai: "6", tipe: "int" });
    expect(peta.y).toEqual({ nilai: "7", tipe: "int" });
  }, 60000);

  test("ekspresi bisa dievaluasi di titik henti", async () => {
    const ev = await k.kirim("evaluate", {
      expression: "x * y",
      frameId: global.__bingkai,
      context: "repl",
    });
    expect(ev.result).toBe("42");
  }, 60000);

  test("stepIn benar-benar MASUK ke dalam fungsi", async () => {
    await k.kirim("stepIn", { threadId: global.__utas });
    const b2 = await k.tunggu("stopped", 30000);
    const st2 = await k.kirim("stackTrace", {
      threadId: b2.threadId,
      levels: 1,
    });
    expect(st2.stackFrames[0].name).toBe("tambah");
    expect(st2.stackFrames[0].line).toBe(2);
  }, 60000);

  test("akhir sesi adalah KEJADIAN, bukan tebakan atas prompt", async () => {
    await k.kirim("continue", { threadId: global.__utas });
    // Yang diuji KEDATANGAN kejadiannya, bukan isinya: debugpy mengirim
    // `terminated` tanpa badan, jadi memeriksa nilainya akan gagal pada sesi
    // yang justru berjalan benar. Kalau ia tak pernah datang, `tunggu` menolak
    // dengan batas waktunya sendiri dan uji ini gagal di baris berikut.
    let tiba = false;
    selesai.then(() => (tiba = true));
    await selesai;
    expect(tiba).toBe(true);
    await new Promise((r) => setTimeout(r, 600));
    expect(keluaran.join("")).toMatch(/SELESAI 13/);
  }, 60000);
});

// ── Adapter kedua: js-debug untuk JavaScript ──
//
// js-debug adalah adapter Node/JavaScript RESMI dari microsoft/vscode-js-debug
// (MIT) — yang sama dengan yang dipakai VS Code. Tak ada paketnya di npm
// (@vscode/js-debug dan js-debug-adapter dua-duanya 404), jadi ia diambil dari
// rilis GitHub lewat scripts/ambil-js-debug.ts.
//
// DUA HAL YANG MEMBUATNYA BEDA DARI debugpy, dan dua-duanya sempat menggagalkan
// percobaan pertama tanpa satu pun pesan galat:
//   1. ia bicara lewat SOKET TCP, bukan stdio;
//   2. sesi yang kita buka BUKAN yang men-debug — ia mengirim permintaan BALIK
//      `startDebugging` untuk melahirkan sesi ANAK. Klien yang menolak
//      permintaan balik membuat anak itu tak pernah lahir: titik henti kembali
//      `verified:false` dan `stopped` tak pernah datang.
//
// Terbukti lewat rute yang sama dengan Python:
//   python  berhenti baris=6  x=6 y=7  terpasang=[{"baris":6,"sah":true}]
//   js      berhenti baris=4  x=6 y=7  terpasang=[…,{"baris":4,"sah":true}]
//   md      GAGAL MULAI: belum ada adapter DAP untuk berkas ini
describe("pemilihan adapter", () => {
  const { adapterUntuk } = require("../core/dap-sesi.ts");

  test("ekstensi menentukan adapter", () => {
    expect(adapterUntuk("/a/b.py")).toBe("python");
    for (const e of ["js", "mjs", "cjs", "ts", "tsx", "jsx"])
      expect(adapterUntuk("/a/b." + e)).toBe("js");
  });

  test("yang tak punya adapter DITOLAK, bukan dicoba diam-diam", () => {
    // Mencobanya berarti melahirkan adapter yang pasti gagal, dan galatnya
    // muncul dari dalam adapter — jauh dari sebabnya.
    for (const n of ["/a/b.md", "/a/b.json", "/a/b.rb", "/a/b"])
      expect(adapterUntuk(n)).toBeNull();
  });

  test("peta di UI dan di server memuat ekstensi yang SAMA", () => {
    // Dua daftar yang harus sepakat pasti akan menyimpang: yang satu mengirim
    // berkas ke jalur DAP yang lalu ditolak server, yang satu membiarkannya
    // lewat PTY padahal jalur yang lebih baik tersedia.
    const APP = fs
      .readFileSync(path.join(__dirname, "..", "public", "app.tsx"), "utf8")
      .replace(/\r\n/g, "\n");
    const i = APP.search(/const _ADAPTER_DAP(?:: [^=]+)? = \{/);
    expect(i).toBeGreaterThan(0);
    const blok = APP.slice(i, APP.indexOf("};", i));
    for (const e of ["py", "js", "mjs", "cjs", "ts", "tsx", "jsx"])
      expect(blok.includes(e + ":")).toBe(true);
  });
});

describe("pengambil js-debug", () => {
  const SKRIP = fs.readFileSync(
    path.join(__dirname, "..", "scripts", "ambil-js-debug.cjs"),
    "utf8",
  );

  test("tak satu pun path Windows dioper ke tar", () => {
    // Dua-duanya sudah terbukti gagal di mesin ini:
    //   -f "C:\..."  -> GNU tar membacanya sebagai <host>:<path> gaya rsh dan
    //                   menjawab "Cannot connect to C: resolve failed";
    //   -C "C:\..."  -> garis miring terbaliknya di-escape, lalu "Cannot open".
    expect(SKRIP).toMatch(/\["-xzf", path\.basename\(arsip\)\]/);
    expect(SKRIP).toMatch(/cwd: path\.dirname\(arsip\)/);
    expect(SKRIP).toMatch(/fs\.cpSync\(hasilEkstrak, TUJUAN/);
  });

  test("dijalankan sendiri, bukan otomatis saat aplikasi mulai", () => {
    // Mengunduh sesuatu diam-diam saat pemakai menekan Debug adalah hal yang
    // tak boleh dilakukan aplikasi tanpa diminta.
    const DAP = fs.readFileSync(require.resolve("../core/dap.ts"), "utf8");
    expect(DAP).not.toMatch(/https\.get/);
    expect(DAP).toMatch(/Jalankan: node scripts\/ambil-js-debug\.cjs/);
  });
});

describe("klien js-debug", () => {
  const DAP = fs.readFileSync(require.resolve("../core/dap.ts"), "utf8");
  const B = tanpaKomentar(DAP);

  test("startDebugging DIJAWAB BERHASIL, bukan ditolak", () => {
    // Menolaknya membuat js-debug membatalkan seluruh sesi — titik henti tak
    // pernah terpasang dan `stopped` tak pernah datang, tanpa pesan apa pun.
    expect(B).toMatch(
      /pesan\.command === "startDebugging" && this\._balasStartDebugging/,
    );
    expect(B).toMatch(/success: !!sanggup/);
  });

  test("penanda disetel SEBELUM launch, bukan sesudah", () => {
    // startDebugging tiba saat launch sedang dikerjakan; menyetelnya belakangan
    // berarti permintaan pertamalah yang ditolak.
    const i = B.indexOf("function _bungkusJs");
    const blok = B.slice(i, B.indexOf("function klienJs"));
    expect(blok.indexOf("induk._balasStartDebugging = true")).toBeLessThan(
      blok.indexOf('pesan.command !== "startDebugging"'),
    );
  });

  test("titik henti DIINGAT lalu dikirim ulang ke sesi anak", () => {
    // Titik henti dipasang sebelum anak lahir; tanpa pengiriman ulang, ia
    // terpasang di sesi yang tidak menjalankan apa pun.
    expect(B).toMatch(
      /if \(perintah === "setBreakpoints"\) titikDiingat\.push/,
    );
    expect(B).toMatch(
      /for \(const t of titikDiingat\) await anak\.kirim\("setBreakpoints", t\)/,
    );
  });

  test("permintaan sesudah anak lahir diarahkan ke ANAK", () => {
    // Induknya tak tahu apa-apa soal keadaan program.
    expect(B).toMatch(/const aktif = \(\) => anakKlien \|\| induk/);
  });

  test("porta dipilihkan sistem, bukan dipatok", () => {
    // Nomor tetap berarti dua jendela WOLFSPACE tak bisa men-debug bersamaan,
    // dan bentrokannya muncul sebagai sesi yang gagal tanpa sebab jelas.
    expect(B).toMatch(/berkasServer, "0", "127\.0\.0\.1"/);
    expect(B).toMatch(/listening at \[\^:\]\*:/);
  });

  test("klien soket TIDAK melahirkan proses", () => {
    // Konstruktor KlienDap selalu spawn; mewarisinya berarti satu proses lahir
    // lalu langsung dibuang tiap klien soket dibuat.
    const i = B.indexOf("function klienDariSoket");
    const blok = B.slice(i, i + 900);
    expect(blok).toMatch(/Object\.create\(KlienDap\.prototype\)/);
    expect(blok).not.toMatch(/spawn\(/);
  });

  test("server js-debug ikut mati bersama kliennya", () => {
    // Kalau tidak, tiap sesi debug meninggalkan satu proses Node yang hidup
    // sampai aplikasi ditutup.
    const i = B.indexOf("muka.tutup = ");
    expect(B.slice(i, i + 300)).toMatch(/prosesServer\.kill\(\)/);
  });
});
