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

const AKAR = path.resolve(__dirname, "..");
const baca = (p) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");
const SRC = baca("public/app/usePreviewPanel.jsx");

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

const tafsirkanAlamat = eval(
  "(function(){" +
    "const localStorage = undefined;" + // paksa jalur bawaan mesin cari
    ambilConst("_EKSTENSI_BERKAS") +
    ambilConst("_BENTUK_HOST") +
    ambilConst("_BENTUK_LOKAL") +
    ambilConst("_MESIN_BAWAAN") +
    ambil("_mesinCari") +
    ambil("tafsirkanAlamat") +
    "return tafsirkanAlamat;})()",
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

describe("situs luar dimuat lewat <webview>, bukan <iframe>", () => {
  // <iframe> di renderer ini TIDAK BISA memuat situs luar sama sekali.
  // Permintaan subFrame dikirim lalu net::ERR_ABORTED sebelum satu pun header
  // respons kembali. Yang disingkirkan satu per satu sebagai penyebab: atribut
  // sandbox iframe, CSP <meta> produksi, X-Frame-Options situsnya, User-Agent
  // Electron, dan jaringan (net.fetch dari proses main -> 200, 473 KB).
  //
  // Yang memutuskan adalah uji pemakai: wikipedia.org pun kosong, padahal
  // Wikipedia TERBUKTI bisa di-frame (3600 karakter ter-render di Chromium
  // bersih dengan CSP yang sama). Jadi ini bukan kebijakan per-situs.
  const MAIN = baca("electron/main.js");
  const APP = baca("public/app.jsx");

  test("webviewTag dinyalakan", () => {
    expect(MAIN).toMatch(/webviewTag: true,/);
  });

  test("hanya alamat http(s) yang dialihkan ke webview", () => {
    // Berkas lokal HARUS tetap lewat <iframe>: Visual Picker menjangkau
    // contentDocument, dan webview tak mengizinkan itu.
    // Pemeriksaannya dijaga longgar dengan sengaja: yang penting alamatLuar
    // diturunkan dari `url` lewat pola http(s), bukan bentuk persis regexnya.
    expect(SRC).toMatch(/const alamatLuar = .*https.*test\(url\)/);
    expect(SRC).toMatch(/^\s*luar: alamatLuar,$/m);
  });

  test("UI bercabang: webview untuk luar, iframe untuk berkas", () => {
    expect(APP).toMatch(/\{preview\.url && preview\.luar \? \(/);
    expect(APP).toMatch(/<webview/);
    expect(APP).toMatch(/ref=\{preview\.webviewRef\}/);
    // Cabang iframe TIDAK boleh hilang — itu jalur Visual Picker.
    expect(APP).toMatch(/ref=\{preview\.iframeRef\}/);
  });

  test("kegagalan diambil dari peristiwa, bukan ditebak", () => {
    // Versi sebelumnya menebak "situsnya menolak di-frame" — dan wikipedia.org
    // membuktikan tebakan itu keliru menyalahkan situs yang baik-baik saja.
    expect(SRC).toMatch(/addEventListener\("did-fail-load"/);
    expect(SRC).toMatch(/setGagalLuar\(e\.errorDescription/);
    expect(APP).toMatch(/\{preview\.gagalLuar\}/);
    expect(APP).not.toMatch(/Itu keputusan situsnya/);
  });

  test("ERR_ABORTED (-3) tidak dilaporkan sebagai kegagalan", () => {
    // Kode itu juga muncul pada navigasi yang dibatalkan oleh pengalihan biasa;
    // melaporkannya menandai halaman sehat sebagai gagal.
    expect(SRC).toMatch(/e\.errorCode === -3/);
  });

  test("keadaan gagal direset saat pindah alamat, refresh, dan mulai memuat", () => {
    const nav = SRC.slice(
      SRC.indexOf("const navigate ="),
      SRC.indexOf("// Auto-lempar"),
    );
    expect(nav).toMatch(/setGagalLuar\(false\)/);
    const ref = SRC.slice(
      SRC.indexOf("const refresh ="),
      SRC.indexOf("// ── Situs luar"),
    );
    expect(ref).toMatch(/setGagalLuar\(false\)/);
    expect(SRC).toMatch(/addEventListener\("did-start-loading"/);
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
