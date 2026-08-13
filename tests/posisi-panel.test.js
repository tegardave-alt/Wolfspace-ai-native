// Panel bisa dipindah sisi — dan geometrinya harus benar di KEEMPAT kombinasi.
//
// CARA KERJANYA. .chat-split membungkus (flex-wrap), jadi panel yang lebarnya
// 100% otomatis turun ke baris berikutnya — itulah "bawah". Yang lebarnya
// sebagian tetap di baris pertama — itulah "kanan". Urutan visual diatur
// `order`, bukan urutan di sumber. Dipilih begini supaya blok preview yang
// panjangnya ~590 baris tak perlu dipotong-tempel hanya untuk pindah posisi.
//
// YANG SUDAH TERBUKTI RUSAK, dan itu sebabnya berkas ini ada. Versi pertama
// memberi chat `flex: 1 1 <lebarAtas>%`. Baris pertama lalu diukur sebagai
//   chat 65% + preview 35% + pembagi 6px = 1006px di layar 1000px
// dan di wadah yang membungkus, kelebihan sekecil apa pun mendorong panel yang
// diminta di KANAN turun ke baris berikutnya. Terukur di harness geometri
// Playwright: preview diminta di kanan, mendarat di x=0 y=420. Tiga dari empat
// kombinasi salah, dan TAK SATU PUN gagal saat dikompilasi — yang keliru cuma
// angkanya.
//
// Dua invarian yang menyembuhkannya dikunci di sini:
//   1. chat berbasis SISA (flex: 1 1 0%), bukan persentase
//   2. tiap panel menanggung 6px pembaginya sendiri (calc(x% - 6px))
//
// Sesudah itu, keempat kombinasi terukur benar:
//   preview kanan, terminal bawah : chat 650x420  term 1000x174  prev 344x420
//   preview kanan, terminal kanan : chat 350x600  term  294x600  prev 344x600
//   preview bawah, terminal bawah : chat 1000x210 term 1000x174  prev 1000x204
//   preview bawah, terminal kanan : chat 700x390  term  294x390  prev 1000x204

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const baca = (p) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");
const APP = baca("public/app.jsx");
const CSS = baca("public/styles.css");
const KOMP = baca("public/app/Components.jsx");

describe("wadahnya membungkus, dan urutannya ditentukan order", () => {
  test(".chat-split memakai flex-wrap", () => {
    const i = CSS.indexOf(".chat-split {");
    const blok = CSS.slice(i, CSS.indexOf("}", i));
    expect(blok).toMatch(/flex-wrap:\s*wrap/);
  });

  test("pembagi mendatar punya kursor yang benar", () => {
    // Tanpa row-resize, pemakai tak punya petunjuk bahwa pembagi bawah bisa
    // digeser — dan arah gesernya berbeda dari yang di kanan.
    const i = CSS.indexOf(".split-divider-h {");
    expect(i).toBeGreaterThan(0);
    expect(CSS.slice(i, CSS.indexOf("}", i))).toMatch(/cursor:\s*row-resize/);
  });
});

describe("dua invarian yang mencegah panel terdorong turun", () => {
  test("chat berbasis SISA, bukan persentase", () => {
    // `flex: 1 1 <lebarAtas>%` adalah bentuk yang rusak: basisnya ikut dihitung
    // saat menentukan pembungkusan baris.
    expect(APP).toMatch(/flex: "1 1 0%"/);
    expect(APP).not.toMatch(/flex: "1 1 " \+ lebarAtas/);
    // lebarAtas tetap dipakai — sebagai lebar MINIMUM, supaya chat tak diperas.
    expect(APP).toMatch(/minWidth: lebarAtas \+ "%"/);
  });

  test("tiap panel menanggung 6px pembaginya sendiri", () => {
    const t = APP.slice(
      APP.indexOf("const gayaPanel ="),
      APP.indexOf("const gayaPembagi ="),
    );
    expect(t).toMatch(/height: "calc\(" \+ pct \+ "% - 6px\)"/);
    expect(t).toMatch(/flex: "0 0 calc\(" \+ pct \+ "% - 6px\)"/);
  });

  test("sisi menentukan sumbu: bawah pakai tinggi, kanan pakai lebar", () => {
    // Dipotong dengan panjang tetap, bukan sampai "return (": penanda itu
    // muncul lebih dulu di berkas ini (komponen lain), jadi irisannya kosong
    // dan ujinya lulus tanpa memeriksa apa pun.
    const t = APP.slice(
      APP.indexOf("const gayaPanel ="),
      APP.indexOf("const gayaPanel =") + 900,
    );
    expect(t).toMatch(/width: "100%"/); // bawah -> memenuhi baris, memaksa wrap
    expect(t).toMatch(/order: 2/); // bawah selalu sesudah yang di kanan
    expect(t).toMatch(/order: 1/); // kanan
  });
});

describe("ukuran dihitung per sumbu, tidak saling potong", () => {
  test("lebar hanya dikurangi panel KANAN, tinggi hanya panel BAWAH", () => {
    // Memakai satu angka untuk dua sumbu membuat chat menyusut dua kali padahal
    // cuma satu panel yang terbuka.
    const t = APP.slice(
      APP.indexOf("const lebarAtas ="),
      APP.indexOf("const gayaPanel ="),
    );
    expect(t).toMatch(/_terminalKanan \? terminalPct : 0/);
    expect(t).toMatch(/_previewKanan \? panelPct : 0/);
    expect(t).toMatch(/_terminalBawah \? terminalPct : 0/);
    expect(t).toMatch(/_previewBawah \? panelPct : 0/);
  });
});

describe("satu penggeser untuk dua sumbu", () => {
  test("sumbu mengikuti posisi panel, bukan dipatok clientX", () => {
    // Dulu ada dua salinan identik yang keduanya memakai clientX. Begitu panel
    // bisa pindah ke bawah, menggeser pembagi mendatar mengubah ukuran memakai
    // koordinat yang salah sumbu.
    expect(APP).toMatch(/const geserPembagi = \(sumbu, set\)/);
    expect(APP).toMatch(/sumbu === "x" \? ev\.clientX : ev\.clientY/);
    expect(APP).not.toMatch(/const onPanelDividerDown/);
    expect(APP).not.toMatch(/const onTerminalDividerDown/);
    expect(APP).toMatch(
      /geserPembagi\(\s*\n?\s*posisi\.terminal === "bawah" \? "y" : "x"/,
    );
    expect(APP).toMatch(
      /geserPembagi\(\s*\n?\s*posisi\.preview === "bawah" \? "y" : "x"/,
    );
  });
});

describe("pilihannya bertahan dan divalidasi", () => {
  test("disimpan ke localStorage", () => {
    expect(APP).toMatch(/localStorage\.setItem\("wolfspace_posisi"/);
    expect(APP).toMatch(/localStorage\.getItem\("wolfspace_posisi"/);
  });

  test("nilai dari localStorage DIVALIDASI, bukan dipercaya", () => {
    // Posisi yang tak dikenal membuat panelnya tak dirender di mana pun —
    // panel hilang tanpa jejak, dan penyebabnya ada di localStorage, bukan kode.
    const t = APP.slice(
      APP.indexOf("const [posisi, setPosisi]"),
      APP.indexOf(
        'useEffect(() => {\n    try {\n      localStorage.setItem("wolfspace_posisi"',
      ),
    );
    expect(t).toMatch(/v === "kanan" \|\| v === "bawah"/);
  });

  test("bawaannya mengikuti kebiasaan: preview kanan, terminal bawah", () => {
    // Terminal dulu di KANAN bersama preview. Untuk keluaran perintah yang
    // berbentuk baris panjang, kolom sempit memaksanya membungkus terus.
    expect(APP).toMatch(/preview: "kanan", terminal: "bawah"/);
  });
});

describe("tombol pindahnya ada dan jujur", () => {
  test("hanya muncul untuk panel yang SEDANG TERBUKA", () => {
    // Menawarkan "pindah ke bawah" untuk panel yang tak terlihat hanya membuat
    // pemakai menebak apakah kliknya berhasil.
    expect(KOMP).toMatch(
      /const tombolPindah = \(apa, terbuka, label\) =>\s*\n?\s*terbuka &&/,
    );
    expect(KOMP).toMatch(/tombolPindah\("preview", panelOpen/);
    expect(KOMP).toMatch(/tombolPindah\("terminal", terminalOpen/);
  });

  test("judulnya menyebut ke mana ia akan pindah", () => {
    expect(KOMP).toMatch(/posisi\[apa\] === "kanan" \? "bawah" : "kanan"/);
  });

  test("prop-nya benar-benar dioper dari app.jsx", () => {
    expect(APP).toMatch(/posisi=\{posisi\}/);
    expect(APP).toMatch(/setPosisi=\{setPosisi\}/);
  });
});
