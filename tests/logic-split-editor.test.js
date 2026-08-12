// View Logic: pohon berkas di kiri, isi berkasnya di kanan — tata letak VS Code.
//
// Sebelumnya panel berkas mengisi seluruh view dan mengklik berkas tak
// melakukan apa pun: daftar nama tanpa cara melihat isinya.
//
// Yang dijaga di sini adalah hal-hal yang mudah rusak tanpa terlihat rusak:
//   - editor memuat SUMBER, bukan hasil preview yang sudah ditulis ulang
//   - editor dibuat SEKALI, modelnya yang diganti tiap pindah berkas
//   - node pohon membawa PATH, bukan cuma nama
//   - berkas aktif ditandai TETAP, bukan cuma saat hover

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const APP = fs.readFileSync(path.join(AKAR, "public", "app.jsx"), "utf8");
const SRV = fs.readFileSync(path.join(AKAR, "server.cjs"), "utf8");

describe("split berkas + editor di view Logic", () => {
  test("keduanya dirender berdampingan, pohon dulu baru editor", () => {
    const iPohon = APP.indexOf("<LogicFileTree");
    const iKode = APP.indexOf("<LogicCodePane");
    expect(iPohon).toBeGreaterThan(0);
    expect(iKode).toBeGreaterThan(iPohon);
  });

  test("editor memuat SUMBER, bukan hasil preview", () => {
    // /preview-file biasa menyuntikkan <base> ke berkas HTML supaya link
    // relatifnya resolve saat di-preview. Benar untuk preview, SALAH untuk
    // editor: yang tampil bukan lagi isi berkasnya, dan pemakai membaca satu
    // baris yang tidak ada di disk.
    expect(APP).toMatch(/\/preview-file\?raw=1&path=/);
    expect(SRV).toMatch(/qs\.get\("raw"\) === "1"/);
    // Dan mode mentah harus keluar SEBELUM penulisan ulang HTML dilakukan.
    const iRaw = SRV.indexOf('qs.get("raw") === "1"');
    const iBase = SRV.indexOf("const baseTag =");
    expect(iRaw).toBeGreaterThan(0);
    expect(iBase).toBeGreaterThan(iRaw);
  });

  test("editor dibuat SEKALI, modelnya yang diganti", () => {
    // Membuat ulang editor tiap klik menumpuk observer Monaco — jalur yang
    // persis sudah pernah meledak di repo ini (monaco-dekat-layar.test.js).
    // Jendela dihitung sampai fungsi BERIKUTNYA, bukan panjang tebakan — angka
    // tetap pernah dipakai di sini, dan sudah sekali gagal diam-diam saat
    // opsi baru ditambahkan di dalam LogicCodePane mendorong kode yang diuji
    // keluar dari jendela tanpa satu pun baris di badan uji berubah.
    const i = APP.indexOf("function LogicCodePane(");
    const j = APP.indexOf("\nfunction ", i + 1);
    const blok = APP.slice(i, j > i ? j : APP.length);
    expect(blok).toMatch(
      /if \(dibuang \|\| !hostRef\.current \|\| edRef\.current\) return;/,
    );
    expect(blok).toMatch(/ed\.setModel\(window\.monaco\.editor\.createModel\(/);
    // Model lama dibuang SESUDAH yang baru dipasang.
    const iSet = blok.indexOf("ed.setModel(");
    const iDispose = blok.indexOf("lama.dispose()");
    expect(iDispose).toBeGreaterThan(iSet);
  });

  test("node pohon membawa path, bukan cuma nama", () => {
    // Dua "index.html" di folder berbeda tak terbedakan lewat nama saja.
    expect(APP).toMatch(/rel: pre \+ f\.name/);
    expect(APP).toMatch(/walk\(rootNode, 0, ""\)/);
  });

  test("berkas hanya bisa diklik kalau ia berkas, bukan folder", () => {
    expect(APP).toMatch(
      /n\.type !== "folder" && onPilih && onPilih\(n\.rel \|\| n\.name\)/,
    );
  });

  test("berkas aktif ditandai TETAP, bukan cuma saat hover", () => {
    // Begitu tetikus bergerak, tanpa ini tak ada lagi yang memberi tahu isi
    // editor di kanan milik berkas yang mana.
    expect(APP).toMatch(
      /n\.rel && n\.rel === terpilih \? "#1b2431" : "transparent"/,
    );
  });

  test("state berkas terpilih dipegang bersama, bukan di dalam pohon", () => {
    // Dua panel memakainya: pohon untuk menandai, editor untuk memuat.
    expect(APP).toMatch(
      /const \[logicBerkas, setLogicBerkas\] = useState\(""\)/,
    );
    expect(APP).toMatch(/terpilih=\{logicBerkas\}/);
    expect(APP).toMatch(/rel=\{logicBerkas\}/);
  });
});

describe("ikon per bahasa di pohon berkas", () => {
  const IKON = fs.readFileSync(
    path.join(AKAR, "public", "app", "IkonBahasa.jsx"),
    "utf8",
  );

  test("SVG asli dari material-icon-theme, DI-VENDOR bukan jadi dependensi", () => {
    // Paketnya berisi 1250 SVG (1,6 MB) sementara yang muncul di pohon ini
    // cuma puluhan. Menjadikannya dependensi runtime berarti menanggung
    // seluruhnya demi sebagian kecil — dan aplikasi ini memuat asetnya tanpa
    // CDN maupun bundler saat jalan.
    expect(IKON).toMatch(/const IKON_BAHASA = \{/);
    expect(IKON).toMatch(/DIHASILKAN OLEH scripts\/ikon-bahasa\/build\.cjs/);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(AKAR, "package.json"), "utf8"),
    );
    const dep = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(dep).not.toContain("material-icon-theme");
  });

  test("bisa dihasilkan ulang, bukan hasil salin sekali", () => {
    // Tanpa skripnya, memperbarui satu ikon berarti menyunting berkas hasil
    // dengan tangan — dan berkas hasil yang disunting tangan berhenti bisa
    // dipercaya sebagai cerminan sumbernya.
    expect(
      fs.existsSync(path.join(AKAR, "scripts", "ikon-bahasa", "build.cjs")),
    ).toBe(true);
  });

  test("isinya SVG sungguhan, bukan monogram huruf", () => {
    expect(IKON).toMatch(/<svg /);
    expect(IKON).not.toMatch(/teks: "/);
  });

  test("bahasa yang lazim dipakai punya ikonnya", () => {
    // Modulnya DIEVALUASI, bukan dicocokkan sebagai teks. Berkas ini dihasilkan
    // JSON.stringify lalu dirapikan prettier, yang melepas tanda kutip pada
    // kunci yang tak membutuhkannya — asersi berbasis regex `"js":` lulus
    // sebelum dirapikan lalu merah sesudahnya, dan kegagalannya tak ada
    // hubungannya dengan ikonnya.
    const tabel = new Function(IKON + "; return IKON_BAHASA;")();
    for (const e of ["js", "ts", "jsx", "py", "html", "css", "json", "md"])
      expect(Object.keys(tabel)).toContain(e);
    for (const [ext, svg] of Object.entries(tabel))
      expect(String(svg).startsWith("<svg")).toBe(true);
  });

  test("dimuat SEBELUM app.jsx memakainya", () => {
    const html = fs.readFileSync(
      path.join(AKAR, "public", "index.html"),
      "utf8",
    );
    expect(html).toContain('"/app/IkonBahasa.jsx"');
  });

  test("nama khusus menang atas ekstensi", () => {
    // README.md tetap ikon info, bukan monogram — namanya lebih memberi tahu
    // daripada ekstensinya.
    const i = APP.indexOf("function tsjFileType(");
    const blok = APP.slice(i, i + 900);
    expect(blok.indexOf('return "info"')).toBeLessThan(
      blok.indexOf('return "lang:" + ext'),
    );
  });

  test("penyorot Monaco terpisah dari ikon", () => {
    // Keduanya menjawab pertanyaan berbeda: "ikon apa" vs "penyorot mana".
    expect(APP).toMatch(/function bahasaMonaco\(nama\)/);
  });
});

// Latar editor mengikuti wadahnya, bukan dipatok Monaco.
//
// vs-dark memaksa #1e1e1e — warna yang tak sama dengan satu pun permukaan
// aplikasi ini, jadi editornya jadi kotak abu di atas panel yang warnanya lain.
//
// Tema Monaco bersifat GLOBAL: opsi `theme` saat create mengubahnya untuk SEMUA
// editor. Jadi mematoknya ke satu warna cuma memindahkan ketidakcocokan ke
// editor yang duduk di permukaan lain — keluaran tool, blok kode di chat, dan
// panel kode ini semuanya berlatar berbeda.
describe("latar editor mengikuti wadahnya", () => {
  const HTML = fs.readFileSync(
    path.join(__dirname, "..", "public", "index.html"),
    "utf8",
  );
  const STEPS = fs.readFileSync(
    path.join(__dirname, "..", "public", "app", "AgentSteps.jsx"),
    "utf8",
  );
  const BLOKS = fs.readFileSync(
    path.join(__dirname, "..", "public", "app", "CodeBlocks.jsx"),
    "utf8",
  );

  test("tema sendiri didefinisikan sekali, saat Monaco siap", () => {
    expect(HTML).toMatch(/defineTheme\("wolfspace-gelap"/);
    expect(HTML).toMatch(/base: "vs-dark"/);
  });

  test("latarnya TRANSPARAN, bukan warna mati", () => {
    // Inilah yang membuat satu tema global tetap cocok di tiga permukaan.
    expect(HTML).toMatch(/"editor\.background": "#00000000"/);
  });

  test("SEMUA editor memakai tema itu, tak ada yang tertinggal", () => {
    // Satu editor yang tertinggal di vs-dark akan berlatar #1e1e1e sendirian —
    // dan karena temanya global, ia juga menyeret yang lain saat dibuat.
    for (const src of [APP, STEPS, BLOKS]) {
      expect(src).toMatch(/theme: "wolfspace-gelap"/);
      expect(src).not.toMatch(/theme: "vs-dark"/);
    }
  });

  test("panel kode sewarna dengan panel berkas di sebelahnya", () => {
    // Keduanya harus terbaca sebagai satu permukaan, bukan dua panel yang
    // kebetulan bersebelahan.
    // Jendela dihitung sampai fungsi BERIKUTNYA, bukan panjang tebakan:
    // gaya akar LogicFileTree ada ~120 baris di dalam badannya, jauh di luar
    // jendela pendek mana pun.
    const potong = (nama) => {
      const i = APP.indexOf("function " + nama + "(");
      expect(i).toBeGreaterThan(0);
      const j = APP.indexOf("\nfunction ", i + 1);
      return APP.slice(i, j > i ? j : APP.length);
    };
    expect(potong("LogicFileTree")).toContain('background: "#0c1219"');
    expect(potong("LogicCodePane")).toContain('background: "#0c1219"');
  });
});

// Panel berkas di view Logic bisa DIATUR lebarnya, dengan pola yang sama
// dengan resizer sidebar (public/app/Sidebar.jsx): state localStorage
// terpisah, batas atas/bawah, kelas "resizing" selama diseret.
//
// Disamakan sengaja, bukan kebetulan sama: dua panel yang bisa diatur
// lebarnya dengan cara berbeda terasa seperti dua aplikasi berbeda.
describe("panel berkas Logic bisa diatur lebarnya", () => {
  test("state lebar disimpan sendiri, terpisah dari sidebar", () => {
    expect(APP).toMatch(/const \[lfWidth, setLfWidth\] = React\.useState/);
    expect(APP).toMatch(/wolfspace_logicfiles_width/);
    expect(APP).not.toMatch(/wolfspace_sidebar_width.*lfWidth/);
  });

  test("batas lebar wajar: tak bisa hilang, tak bisa menelan layar", () => {
    expect(APP).toMatch(
      /Math\.max\(160, Math\.min\(500, startWidth \+ deltaX\)\)/,
    );
  });

  test("handle resizer ada dan tersambung ke handler seret", () => {
    expect(APP).toMatch(/className="logic-filetree-resizer"/);
    expect(APP).toMatch(/onMouseDown=\{handleLfResizerMouseDown\}/);
  });

  test("lebar akhir disimpan ke localStorage saat seret berhenti", () => {
    expect(APP).toMatch(
      /localStorage\.setItem\("wolfspace_logicfiles_width", String\(finalWidth\)\)/,
    );
  });

  test("gaya resizer meniru sidebar: sama posisi, sama warna hover", () => {
    const CSS = fs.readFileSync(
      path.join(AKAR, "public", "styles.css"),
      "utf8",
    );
    const iSb = CSS.indexOf(".sb-resizer {");
    const iLf = CSS.indexOf(".logic-filetree-resizer {");
    expect(iSb).toBeGreaterThan(0);
    expect(iLf).toBeGreaterThan(0);
    // 500 karakter, bukan 300 -- aturan hover ada di RULE TERPISAH, sesudah
    // penutup "}" yang pertama. Jendela 300 memotong tepat di tengah nilai
    // rgba() dan membuat asersi merah karena panjang teks, bukan karena
    // isinya salah.
    const blokSb = CSS.slice(iSb, iSb + 500);
    const blokLf = CSS.slice(iLf, iLf + 500);
    for (const properti of [
      "right: -3px",
      "width: 7px",
      "cursor: col-resize",
    ]) {
      expect(blokSb).toContain(properti);
      expect(blokLf).toContain(properti);
    }
    expect(blokLf).toContain("rgba(96, 165, 250, 0.4)");
  });
});

// Garis solid di panel kode Logic — DUA SUMBER TERPISAH, ditemukan berurutan.
//
// Laporan pertama ("garis biru membentang") diperbaiki dengan mematikan
// minimap: LogicCodePane satu-satunya dari tiga editor Monaco di aplikasi ini
// yang mengaktifkannya, dan slider minimap (kotak penunjuk viewport) pada
// berkas pendek di panel sempit memenuhi hampir seluruh tingginya — terlihat
// persis seperti satu garis solid, bukan seperti minimap.
//
// Laporan LANJUTAN, dengan screenshot baru, membuktikan itu belum semuanya:
// garis horizontal masih terlihat tepat di bawah header, pada berkas KOSONG
// tanpa minimap sama sekali. Penyebab kedua: kotak highlight "baris aktif",
// bawaan Monaco kalau renderLineHighlight tak disetel (default "all"). Pada
// baris pertama, batas ATASNYA berimpit dengan tepi editor, jadi yang
// terlihat cuma satu garis membentang penuh persis di bawah header panel.
describe("garis solid di panel kode: dua penyebab, dua perbaikan", () => {
  const LOGIC = (() => {
    const i = APP.indexOf("function LogicCodePane(");
    const j = APP.indexOf("\nfunction ", i + 1);
    return APP.slice(i, j > i ? j : APP.length);
  })();
  const STEPS = fs.readFileSync(
    path.join(AKAR, "public", "app", "AgentSteps.jsx"),
    "utf8",
  );
  const BLOKS = fs.readFileSync(
    path.join(AKAR, "public", "app", "CodeBlocks.jsx"),
    "utf8",
  );

  test("penyebab #1 — minimap MATI, sama seperti dua editor lainnya", () => {
    expect(LOGIC).toMatch(/minimap: \{ enabled: false \}/);
    expect(LOGIC).not.toMatch(/minimap: \{ enabled: true \}/);
  });

  test("penyebab #2 — highlight baris aktif MATI, sama seperti dua editor lainnya", () => {
    // Panel ini baca-saja; tak ada yang sedang mengedit, jadi menyorot
    // "baris aktif" tak berarti apa-apa selain artefak visual.
    expect(LOGIC).toMatch(/renderLineHighlight: "none"/);
  });

  test("ketiga editor Monaco konsisten pada KEDUA opsi", () => {
    for (const src of [APP, STEPS, BLOKS]) {
      expect(src).toMatch(/minimap: \{ enabled: false \}/);
      expect(src).toMatch(/renderLineHighlight: "none"/);
    }
  });
});
