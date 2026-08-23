// ── Menu tata letak (☰) pindah dari bilah atas ke KAKI sidebar ──
//
// Bilah atas tempat tindakan sehari-hari; tata letak diatur sekali lalu
// dilupakan, jadi tempatnya bersama pengaturan lain di sidebar.
//
// Dipisah jadi komponennya sendiri, bukan disalin: isinya ~150 baris, dan dua
// salinan harus tetap sepakat soal posisi panel, tampilan chat, dan Code —
// tiga hal yang justru paling sering berubah.
//
// Terukur di peramban sungguhan (1280x800):
//   sidebar terbuka : tombol 22x28 di x=10 dalam sidebar; panel 222x242 @40,546
//   sidebar dilipat : tombol di x=19 (sidebar 60px); panel @49, utuh di layar
//   Escape menutup  : ya          galat konsol: 0

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const baca = (p) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");
const KOMP = baca("public/app/Components.tsx");
const SB = baca("public/app/Sidebar.tsx");
const APP = baca("public/app.tsx");
const CSS = baca("public/styles.css");
const tanpaKomentar = (t) =>
  t
    .split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join("\n");

describe("menu diekstrak, bukan disalin", () => {
  test("ada komponen MenuTataLetak tersendiri", () => {
    expect(KOMP).toMatch(/function MenuTataLetak\(\{/);
  });

  test("hanya SATU tempat yang menggambar isinya", () => {
    // Dua salinan berarti dua daftar opsi yang harus tetap sepakat.
    // Kelasnya kini dirakit (menampung varian "ke-atas"), jadi yang dihitung
    // NAMA KELASNYA di mana pun ia disebut — bukan bentuk atribut tertentu.
    const semua = (KOMP + SB + APP).match(/"tb-menu-bungkus/g) || [];
    expect(semua.length).toBe(1);
    const judul = (KOMP + SB).match(/tb-menu-kepala/g) || [];
    expect(judul.length).toBe(2); // "Posisi panel" + "Tampilan", sekali saja
  });

  test("TopBar tidak lagi memegang menunya", () => {
    const i = KOMP.indexOf("function TopBar(");
    const blok = tanpaKomentar(KOMP.slice(i));
    expect(blok).not.toMatch(/tb-menu-bungkus/);
    expect(blok).not.toMatch(/barisPosisi/);
  });

  test("prop tata letak dioper ke Sidebar, bukan ke TopBar", () => {
    const iSb = APP.indexOf("<Sidebar");
    const sb = APP.slice(iSb, APP.indexOf("/>", iSb));
    for (const p of [
      "posisi",
      "setPosisi",
      "chatVisible",
      "setChatVisible",
      "logicOpen",
      "setLogicOpen",
    ])
      expect(sb).toMatch(new RegExp(p + "=\{"));
    const iTb = APP.indexOf("<TopBar");
    const tb = APP.slice(iTb, APP.indexOf("/>", iTb));
    expect(tb).not.toMatch(/setPosisi=\{/);
  });
});

describe("panelnya tidak terpotong sidebar", () => {
  test("memakai position: fixed saat arah ke atas", () => {
    // `.sidebar.collapsed` memakai overflow: hidden untuk menyembunyikan label
    // selama animasi lebar, dan itu MEMOTONG panel menu. Terukur sebelum
    // diperbaiki: panelnya terpangkas di x=232, separuh pilihan hilang.
    const b = tanpaKomentar(KOMP);
    expect(b).toMatch(/position: "fixed"/);
    expect(b).toMatch(/style=\{kotakMenu \|\| undefined\}/);
  });

  test("koordinatnya DIUKUR, bukan dipatok", () => {
    // Sidebar bisa diubah lebarnya DAN dilipat; angka tetap apa pun akan salah
    // di salah satu keadaan. Terbukti: x=40 saat terbuka, x=49 saat dilipat.
    const b = tanpaKomentar(KOMP);
    expect(b).toMatch(/getBoundingClientRect\(\)/);
    expect(b).toMatch(/left: Math\.round\(r\.right \+ 8\)/);
    // Diukur ulang saat jendela berubah selagi menu terbuka.
    expect(b).toMatch(/addEventListener\("resize", hitung\)/);
    expect(b).toMatch(/removeEventListener\("resize", hitung\)/);
  });

  test("diukur sebelum dicat, supaya tak ada lompatan", () => {
    expect(KOMP).toMatch(/React\.useLayoutEffect\(/);
  });
});

describe("tempatnya di kaki sidebar", () => {
  test("didorong ke dasar, bukan diletakkan sesudah bagian tertentu", () => {
    // Bagian Conversation/View/Tools bisa dibuka-tutup; tanpa margin-top auto,
    // tombolnya ikut naik-turun mengikuti isi di atasnya.
    const i = CSS.indexOf(".sb-menu-kaki {");
    expect(i).toBeGreaterThan(0);
    expect(CSS.slice(i, CSS.indexOf("\n}", i))).toMatch(/margin-top: auto/);
  });

  test("tetap ada saat sidebar dilipat — labelnya saja yang hilang", () => {
    expect(SB).toMatch(/<MenuTataLetak/);
    expect(SB).toMatch(/arah="atas"/);
    expect(SB).toMatch(/\{!collapsed && <span className="sb-menu-kaki-label">/);
  });
});
