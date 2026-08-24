// Bilah alamat panel preview bekerja seperti bilah alamat browser.
//
// KENAPA ADA. Sebelumnya cabangnya cuma dua: diawali http/https/app berarti URL,
// SELAIN ITU dianggap path berkas. Panel itu karena itu hanya berguna untuk satu
// hal — melihat berkas hasil generate agent. Mengetik "github.com" mencoba
// membuka BERKAS bernama "github.com"; mengetik sebuah pertanyaan tak melakukan
// apa pun sama sekali.
//
// Yang paling mudah rusak saat menambahkan penafsiran ini adalah kasus yang
// PALING SERING dipakai: "index.html" juga cocok dengan bentuk nama domain
// (label + titik + akhiran huruf). Kalau urutan pemeriksaannya terbalik, membuka
// berkas .html — fungsi asli panel ini — berubah jadi menjelajah ke situs
// "index.html". Itu sebabnya urutannya diuji, bukan cuma hasilnya.
//
// Pilihan mesin cari bawaannya juga bukan selera. Panel ini <iframe>, dan
// sebagian besar mesin menolak di-frame lewat headernya sendiri — terukur:
//   Google / Brave / Startpage : X-Frame-Options SAMEORIGIN -> tak bisa
//   Mojeek                     : frame-ancestors 'none'     -> tak bisa
//   Bing                       : tanpa header pembatas      -> hasil ter-render

const fs = require("fs");
const path = require("path");

// electron/main.js is generated and NOT committed, so it may not exist in a
// fresh clone. Building it here is also more honest than reading disk: the
// assertions below describe what the build produces.
const bangunMain = () => require("../scripts/build-main.cjs").bangun();

// electron/preload.js is generated and NOT committed, so it may not exist in a
// fresh clone. Building it here is also more honest than reading disk.
const bangunPreload = () => require("../scripts/build-preload.cjs").bangun();

const AKAR = path.resolve(__dirname, "..");
const baca = (p) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");

// Dipakai setiap kali asersinya berbentuk "TIDAK boleh ada X". Berkas-berkas
// ini penuh catatan tentang KENAPA sebuah bentuk ditinggalkan, dan catatan itu
// mengutip bentuknya — jadi tanpa penyaring ini, komentar yang benar justru
// menggagalkan ujinya.
const tanpaKomentar = (t) =>
  t
    .split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join("\n");
const SRC = baca("public/app/usePreviewPanel.tsx");

// Fungsinya DIAMBIL dari sumber lalu dijalankan — bukan ditulis ulang menurut
// tafsiran, supaya yang diuji memang jalur produksi.
const ambil = (nama) => {
  const i = SRC.indexOf("function " + nama + "(");
  if (i < 0) throw new Error("tak ketemu: " + nama);
  return SRC.slice(i, SRC.indexOf("\n}", i) + 2);
};
const ambilConst = (nama) => {
  const i = SRC.indexOf("const " + nama + " =");
  if (i < 0) throw new Error("const tak ketemu: " + nama);
  return SRC.slice(i, SRC.indexOf(";\n", i) + 1);
};

// The extracted source is TRANSPILED first, exactly as index.html loads a .tsx
// file. Since usePreviewPanel migrated, that source carries type annotations —
// and a raw eval() stops at the first colon. Transpiling here preserves this
// file's claim: what runs is the production path, not a reinterpretation.
globalThis.self = globalThis;
const Babel = require(
  require("path").join(__dirname, "..", "public/vendor/babel.min.js"),
);
const _sumberGabungan =
  "(function(){" +
  "const localStorage = undefined;" + // paksa jalur bawaan mesin cari
  ambilConst("_EKSTENSI_BERKAS") +
  ambilConst("_BENTUK_HOST") +
  ambilConst("_BENTUK_LOKAL") +
  ambilConst("_MESIN_BAWAAN") +
  ambil("_mesinCari") +
  ambil("tafsirkanAlamat") +
  "return tafsirkanAlamat;})()";
const tafsirkanAlamat = eval(
  Babel.transform(_sumberGabungan, {
    presets: ["typescript"],
    filename: "omnibox.ts",
  }).code,
);

describe("berkas tetap menang — fungsi asli panel tak boleh rusak", () => {
  test.each([
    ["index.html", "index.html"],
    ["laporan.htm", "laporan.htm"],
    ["catatan.md", "catatan.md"],
    [
      "C:\\Users\\dave\\proyek\\index.html",
      "C:\\Users\\dave\\proyek\\index.html",
    ],
    ["c:/Users/dave/a.html", "c:/Users/dave/a.html"],
    ["\\\\server\\share\\a.html", "\\\\server\\share\\a.html"],
    ["/home/dave/a.html", "/home/dave/a.html"],
    ["./dist/index.html", "./dist/index.html"],
    ["../situs/index.html", "../situs/index.html"],
    ["kai-website/index.html", "kai-website/index.html"],
  ])("%s -> berkas", (masuk, jalur) => {
    const t = tafsirkanAlamat(masuk);
    expect(t.jenis).toBe("berkas");
    expect(t.url).toBe("/preview-file?path=" + encodeURIComponent(jalur));
    // Yang ditampilkan di bilah adalah PATH-nya, bukan /preview-file?path=…
    expect(t.tampil).toBe(jalur);
  });

  test("path berspasi tetap berkas selama absolut", () => {
    const p = "C:\\My Documents\\situs baru\\index.html";
    expect(tafsirkanAlamat(p).jenis).toBe("berkas");
  });

  // Inti dari urutan pemeriksaan. Kalau ini gagal, penafsiran domain sudah
  // dipindah ke ATAS pemeriksaan ekstensi dan panel berhenti membuka berkas.
  test("index.html BUKAN dianggap domain, walau bentuknya mirip", () => {
    const t = tafsirkanAlamat("index.html");
    expect(t.jenis).toBe("berkas");
    expect(t.url).not.toContain("https://");
  });
});

describe("URL dan domain diperlakukan seperti browser", () => {
  test.each([
    "http://localhost:3000",
    "https://github.com/tegardave-alt",
    "app://WOLFSPACE/index.html",
    "file:///C:/a.html",
  ])("skema eksplisit dipakai apa adanya: %s", (u) => {
    const t = tafsirkanAlamat(u);
    expect(t.jenis).toBe("url");
    expect(t.url).toBe(u);
  });

  test.each([
    ["github.com", "https://github.com"],
    ["www.google.com/search?q=a", "https://www.google.com/search?q=a"],
    ["sub.domain.co.uk", "https://sub.domain.co.uk"],
  ])("domain telanjang -> https: %s", (masuk, keluar) => {
    const t = tafsirkanAlamat(masuk);
    expect(t.jenis).toBe("url");
    expect(t.url).toBe(keluar);
  });

  test.each([
    ["localhost:3000", "http://localhost:3000"],
    ["localhost:5173/app", "http://localhost:5173/app"],
    ["127.0.0.1:8090", "http://127.0.0.1:8090"],
    ["192.168.1.5:8080", "http://192.168.1.5:8080"],
  ])("host lokal -> http, bukan https: %s", (masuk, keluar) => {
    // https ke port dev gagal dengan galat sertifikat yang tak menjelaskan
    // apa pun kepada pemakai.
    expect(tafsirkanAlamat(masuk).url).toBe(keluar);
  });
});

describe("sisanya dicari di web", () => {
  test.each([
    "cara pakai regex lookahead",
    "electron webview vs iframe",
    "wolfspace",
    "apa itu AppContainer",
  ])("teks bebas -> pencarian: %s", (q) => {
    const t = tafsirkanAlamat(q);
    expect(t.jenis).toBe("cari");
    expect(t.url).toContain(encodeURIComponent(q));
    // Bilahnya tetap menampilkan yang diketik, bukan URL mesin carinya.
    expect(t.tampil).toBe(q);
  });

  test("mesin bawaannya yang TERBUKTI bisa di-frame", () => {
    // Google/Brave/Startpage/Mojeek menolak di-frame lewat header mereka
    // sendiri; memilih salah satunya membuat panel ini kosong tanpa penjelasan.
    expect(tafsirkanAlamat("uji").url).toContain("bing.com");
  });

  test("kueri di-encode, bukan disisipkan mentah", () => {
    const t = tafsirkanAlamat("a&b=c d");
    expect(t.url).not.toContain("a&b=c d");
    expect(t.url).toContain(encodeURIComponent("a&b=c d"));
  });
});

describe("masukan kosong tidak melakukan apa-apa", () => {
  test.each([
    ["", "kosong"],
    ["   ", "spasi"],
    [null, "null"],
    [undefined, "undefined"],
  ])("%s -> null", (v) => {
    expect(tafsirkanAlamat(v)).toBeNull();
  });
});

describe("situs luar digambar WebContentsView, bukan iframe/webview", () => {
  // TIGA jalur dicoba, dua di antaranya buntu dan itu dicatat supaya tak
  // diulang:
  //
  //   <iframe>  : renderer ini TIDAK BISA memuat situs luar sama sekali.
  //               Permintaan subFrame dikirim lalu net::ERR_ABORTED sebelum
  //               satu pun header respons kembali. Yang disingkirkan sebagai
  //               penyebab, masing-masing diuji terpisah: atribut sandbox, CSP
  //               <meta> produksi, X-Frame-Options situsnya, User-Agent
  //               Electron, dan jaringan (net.fetch dari proses main -> 200,
  //               473 KB dari Bing). Uji pemakai memutuskannya: wikipedia.org
  //               pun kosong, padahal Wikipedia terbukti boleh di-frame.
  //
  //   <webview> : Electron CRASH — FATAL:check.cc(361) Check failed: false,
  //               NOTREACHED. Tag itu memang jalur yang tak dianjurkan Electron.
  //
  //   WebContentsView : WebContents penuh, seperti tab browser, dipasang
  //               sebagai lapisan di atas jendela. Tak ada pembatasan frame
  //               yang berlaku padanya.
  const MAIN = bangunMain();
  const PRELOAD = bangunPreload();
  const APP = baca("public/app.tsx");

  test("dua jalur buntu itu benar-benar sudah dilepas", () => {
    // webviewTag menyala = Electron crash lagi begitu panel dipakai.
    expect(MAIN).not.toMatch(/webviewTag: true/);
    // Elemennya, bukan penyebutannya di komentar — catatan kenapa jalur itu
    // ditinggalkan justru harus tetap ada.
    expect(APP).not.toMatch(/<webview[\s/]/);
    expect(APP).not.toMatch(/webviewRef/);
  });

  test("view dibuat di proses main dan dipasang ke jendela", () => {
    expect(MAIN).toMatch(/WebContentsView/);
    expect(MAIN).toMatch(/contentView\.addChildView/);
    expect(MAIN).toMatch(/function browserAksi\(p\)/);
    expect(MAIN).toMatch(/channel === "browser"/);
  });

  test("isi web asing dikurung serapat mungkin", () => {
    // Ini memuat situs sembarang; nodeIntegration menyala di sini akan
    // memberi halaman asing akses Node.
    // sandbox OS-nya sendiri terpaksa dilepas di mesin ini — alasannya diukur
    // dan dikunci di describe "kurungan view browser dilonggarkan seperlunya".
    // Yang TIDAK boleh ikut dilonggarkan adalah dua ini.
    const t = MAIN.slice(MAIN.indexOf("function _brBuat()"));
    expect(t).toMatch(/nodeIntegration: false/);
    expect(t).toMatch(/contextIsolation: true/);
  });

  test("posisinya disuapi terus, bukan sekali saja", () => {
    // View MENGAMBANG di atas jendela — ia tak ikut bergerak saat panel
    // di-resize, sidebar dibuka, atau jendela diubah ukurannya.
    expect(SRC).toMatch(/new ResizeObserver/);
    expect(SRC).toMatch(/getBoundingClientRect\(\)/);
    expect(SRC).toMatch(/aksi: "sembunyi"/);
  });

  test("disembunyikan saat panel tak lagi menampilkan alamat luar", () => {
    // Kalau tidak, ia menutupi UI aplikasi — ia bukan bagian dari DOM dan
    // tak tunduk pada CSS mana pun.
    const t = SRC.slice(SRC.indexOf("if (!ipc || !alamatLuar)"));
    expect(t).toMatch(/aksi: "sembunyi"/);
  });

  test("proses main yang belum diperbarui gagal dengan ANGGUN", () => {
    // Denyut memanggil IPC 2,5x per detik. Tanpa .catch, satu proses main yang
    // belum diperbarui membanjiri konsol dengan
    //   "unknown invoke channel: browser"
    // tanpa henti — dan pemakai TETAP tak diberi tahu apa yang harus dilakukan.
    // WebContentsView dibuat oleh proses main, dan hot-reload tak menjangkau
    // proses itu; aplikasi memang harus ditutup dan dibuka lagi.
    expect(SRC).toMatch(/\.catch\(\(e\) => \{/);
    expect(SRC).toMatch(/mati = true/);
    expect(SRC).toMatch(/unknown invoke channel/i);
    expect(SRC).toMatch(/Quit and reopen WOLFSPACE/);
  });

  test("pendengar resize dilepas saat panel dibongkar", () => {
    // Tanpa ini tiap perpindahan alamat menambah satu pendengar yang menembak
    // IPC selamanya.
    expect(SRC).toMatch(/window\.removeEventListener\("resize", onResize\)/);
  });

  test("keadaan datang lewat IPC, bukan dari DOM", () => {
    // Viewnya hidup di proses lain; panel tak punya cara lain untuk tahu.
    expect(PRELOAD).toMatch(/onBrowser:/);
    expect(PRELOAD).toMatch(/"WOLFSPACE:browser"/);
    expect(MAIN).toMatch(/did-fail-load/);
    expect(SRC).toMatch(/ipc\.onBrowser\(/);
    expect(SRC).toMatch(/m\.t === "gagal"/);
  });

  test("UI memakai wadah penanda posisi, dan iframe TETAP untuk berkas lokal", () => {
    // Visual Picker menjangkau contentDocument iframe — jalur itu tak boleh
    // ikut hilang.
    expect(APP).toMatch(/ref=\{preview\.slotRef\}/);
    expect(APP).toMatch(/ref=\{preview\.iframeRef\}/);
  });
});

describe("navigate() memakai penafsir ini, bukan cabang lamanya", () => {
  test("cabang dua-arah yang lama sudah hilang", () => {
    // Bentuk lama: `const isHttp = val.startsWith("http://") || …` lalu
    // ternary ke /preview-file. Selama itu masih ada, teks bebas tetap
    // diperlakukan sebagai nama berkas.
    expect(SRC).not.toMatch(/const isHttp =/);
    expect(SRC).toMatch(/const t = tafsirkanAlamat\(urlOrPath\);/);
  });
});

// ── Diagnostik: saat panel putih, HARUS bisa dijawab "mesin mana" ──
//
// Electron dua mesin: renderer (web) dan main (node). Layar putih di panel bisa
// berarti lima hal yang di layar tampak persis sama:
//
//   1. view tak pernah dibuat            (main)
//   2. dibuat, gagal dipasang ke jendela (main)
//   3. terpasang, tapi bounds-nya nol    (renderer mengirim kotak kosong)
//   4. terpasang & berukuran, halamannya yang gagal dimuat (jaringan/situs)
//   5. termuat, tapi tertutup lapisan lain (susunan)
//
// Versi pertama justru MENELAN pembedanya: addChildView dibungkus
// `try { } catch (_) {}`, jadi kemungkinan (2) hilang tanpa jejak. Berkas ini
// mengunci agar tiap kemungkinan meninggalkan catatan yang bisa dibaca.
describe("panel putih harus bisa dilacak ke mesin yang benar", () => {
  const MAIN2 = bangunMain();

  test("tidak ada lagi catch kosong yang menelan sebabnya", () => {
    // Komentar dibuang dulu: catatan tentang KENAPA bentuk itu ditinggalkan
    // justru harus tetap ada, dan ia mengutip bentuknya.
    const t = MAIN2.slice(
      MAIN2.indexOf("function browserAksi(p)"),
      MAIN2.indexOf("function apiCall("),
    )
      .split("\n")
      .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
      .join("\n");
    expect(t).not.toMatch(/catch \(_\) \{\}/);
  });

  test("tiap kegagalan sisi main meninggalkan catatan", () => {
    for (const jejak of [
      "addChildView FAILED",
      "setBounds FAILED",
      "loadURL REFUSED",
      "bounds ZERO from renderer",
    ])
      expect(MAIN2).toContain(jejak);
  });

  test("keadaan lengkap bisa diminta kapan saja", () => {
    expect(MAIN2).toMatch(/function _brKeadaan\(\)/);
    expect(MAIN2).toMatch(/aksi === "diagnosa"/);
    // Yang membedakan kelima kemungkinan di atas.
    for (const medan of ["memuat", "rusak", "bounds", "anakDiJendela"])
      expect(MAIN2).toContain(medan);
  });

  test("view dipasang sekali, bukan tiap denyut", () => {
    // Memanggil addChildView 2,5x per detik memindahkan view ke urutan teratas
    // berulang kali — kerja sia-sia yang juga bisa mengacaukan lapisan lain.
    expect(MAIN2).toMatch(/if \(!anak\.includes\(b\.tampil\)\)/);
  });

  test("kedua sisi mencatat, bukan cuma satu", () => {
    expect(MAIN2).toMatch(/function _brLog\(/);
    expect(SRC).toMatch(/\[browser:renderer\]/);
    expect(SRC).toMatch(/\[browser:peristiwa\]/);
  });

  test("bounds nol dilaporkan ke pemakai, bukan cuma dicatat", () => {
    expect(SRC).toMatch(/Panel has zero size/);
  });
});

// ── Kenapa view browser TIDAK ber-sandbox ──
//
// Terukur berlapis di mesin ini:
//   net.fetch dari proses main   -> 200            (jaringan sehat)
//   resolveProxy                 -> DIRECT         (tak ada proxy)
//   permintaan navigasi          -> TERKIRIM, bahkan mengikuti pengalihan
//                                   wikipedia.org -> www.wikipedia.org
//   webRequest.onErrorOccurred   -> TIDAK PERNAH menyala
//   loadURL                      -> ERR_FAILED (-2)
//
// Jaringannya berhasil; yang gagal PEMBUATAN PROSES renderer untuk menampung
// halamannya. Tiga pilihan diuji, dan hanya yang paling sempit yang dipakai:
//   --no-sandbox (seluruh aplikasi)   -> berhasil, jauh melebihi kebutuhan
//   site isolation dimatikan          -> TETAP GAGAL
//   sandbox: false pada view ini saja -> berhasil, 2022 karakter ter-render
describe("kurungan view browser dilonggarkan seperlunya saja", () => {
  const M = bangunMain();
  const t = M.slice(
    M.indexOf("function _brBuat()"),
    M.indexOf("function browserAksi("),
  );
  // The REASONING lives in electron/main.ts. main.js is built from it by
  // scripts/build-main.cjs and esbuild strips comments, so asserting the
  // explanation against the build output would only prove it is absent.
  const S = baca("electron/main.ts");
  const ts = S.slice(
    S.indexOf("function _brBuat()"),
    S.indexOf("function browserAksi("),
  );

  test("sandbox dimatikan HANYA untuk view ini, bukan seluruh aplikasi", () => {
    expect(t).toMatch(
      /sandbox: process\.env\.WOLFSPACE_BROWSER_SANDBOX === "1"/,
    );
    expect(M).not.toMatch(/appendSwitch\("no-sandbox"\)/);
  });

  test("yang menahan risikonya TIDAK ikut dilonggarkan", () => {
    // Tanpa keduanya, halaman asing punya jalan ke Node dan ke konteks preload.
    expect(t).toMatch(/nodeIntegration: false/);
    expect(t).toMatch(/contextIsolation: true/);
    expect(t).toMatch(/webSecurity: true/);
  });

  test("ada jalan kembali untuk mesin yang sehat", () => {
    expect(t).toContain("WOLFSPACE_BROWSER_SANDBOX");
  });

  test("alasannya tercatat dengan angkanya, bukan cuma 'tidak jalan'", () => {
    for (const jejak of ["ERR_FAILED", "onErrorOccurred", "site isolation"])
      expect(ts).toContain(jejak);
  });
});

// ── Suara di panel browser ──
//
// Gejala: YouTube hanya mau memutar kalau di-mute. Terukur di WebContentsView:
//   AudioContext.state    -> "running"  (kebijakan autoplay BUKAN sebabnya;
//                                        diuji dengan userGesture=true)
//   isCurrentlyAudible()  -> false      (audio tak mengalir ke keluaran)
//   audioMuted            -> false      (bukan di-mute juga)
// Sesudah AudioServiceSandbox dimatikan: isCurrentlyAudible() -> true.
//
// Sebabnya sama dengan dua gejala sebelumnya di mesin ini: proses UTILITAS
// Chromium ber-sandbox tak bisa lahir — GPU (STATUS_DLL_NOT_FOUND), renderer
// lintas-situs (ERR_FAILED), dan kini audio service.
describe("audio panel browser", () => {
  // Komentar dibuang: catatan tentang KENAPA pilihan ini diambil justru harus
  // tetap ada, dan ia mengutip nama-nama saklarnya.
  const M = tanpaKomentar(bangunMain());

  test("HANYA ADA SATU appendSwitch disable-features", () => {
    // Ini yang paling mudah salah: panggilan kedua MENIMPA yang pertama, tidak
    // menggabung. Menambahkan fitur lewat panggilan baru diam-diam membuang
    // yang lama, dan gejalanya cuma "yang tadi dimatikan hidup lagi".
    const n = (M.match(/appendSwitch\([\s\S]{0,20}?"disable-features"/g) || [])
      .length;
    expect(n).toBe(1);
  });

  test("daftarnya memuat keduanya", () => {
    const i = M.indexOf('"disable-features"');
    const blok = M.slice(i, i + 200);
    expect(blok).toContain("CalculateNativeWinOcclusion");
    expect(blok).toContain("AudioServiceSandbox");
  });

  test("audio tetap di proses terpisah — yang dilepas hanya sandbox-nya", () => {
    // AudioServiceOutOfProcess juga menyembuhkan, tapi memindahkan audio ke
    // DALAM proses browser: satu crash audio ikut menjatuhkan aplikasi.
    expect(M).not.toContain("AudioServiceOutOfProcess");
  });
});
