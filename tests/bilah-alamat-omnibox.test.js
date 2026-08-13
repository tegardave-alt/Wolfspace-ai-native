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
  const MAIN = baca("electron/main.js");
  const PRELOAD = baca("electron/preload.js");
  const APP = baca("public/app.jsx");

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
    const t = MAIN.slice(MAIN.indexOf("function _brBuat()"));
    expect(t).toMatch(/nodeIntegration: false/);
    expect(t).toMatch(/contextIsolation: true/);
    expect(t).toMatch(/sandbox: true/);
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
