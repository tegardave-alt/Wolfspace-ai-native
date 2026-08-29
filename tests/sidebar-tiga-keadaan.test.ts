// ── Sidebar punya TIGA keadaan, bukan dua ──
//
//   penuh     232px, label terlihat
//   ringkas    60px, ikon saja
//   sembunyi    0px, yang tersisa HANYA tombol pembukanya
//
// Keadaan ketiga sengaja seminimal itu: menyembunyikan sidebar berarti benar
// benar mengosongkan tepi kiri, bukan menyisakan sederet tombol mengambang.
//
// Terukur di peramban sungguhan (1280x800), satu tombol diputar berurutan:
//   penuh    -> lebar 232, .app.has-sidebar.sb-penuh,    tombol 31x31 @188,7
//   ringkas  -> lebar  60, .app.has-sidebar.sb-ringkas,  tombol 36x36 @12,5
//   sembunyi -> lebar   0, .app.has-sidebar.sb-sembunyi, tombol 36x36 @10,10
//   penuh    -> kembali ke 232
//   bertahan sesudah muat ulang; galat konsol: 0

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const baca = (p) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");
const APP = baca("public/app.tsx");
const SB = baca("public/app/Sidebar.tsx");
const CSS = baca("public/styles.css");
const tanpaKomentar = (t) =>
  t
    .split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join("\n");
const aturan = (sel) => {
  const i = CSS.indexOf(sel + " {");
  return i < 0 ? "" : CSS.slice(i, CSS.indexOf("\n}", i) + 3);
};

describe("keadaan disimpan sebagai kata, dan nilai lama diterjemahkan", () => {
  test("bukan boolean lagi", () => {
    expect(APP).toMatch(/const \[sbMode, setSbMode\] = useState/);
    expect(tanpaKomentar(APP)).not.toMatch(/sbCollapsed/);
  });

  test("nilai lama '1'/'0' masih dimengerti", () => {
    // Tanpa terjemahan ini, pemakai yang sudah punya nilai lama di localStorage
    // mendapat sidebar yang kembali ke bawaan tanpa sebab yang terlihat.
    const i = APP.indexOf("const [sbMode, setSbMode]");
    const blok = APP.slice(i, APP.indexOf("});", i));
    expect(blok).toMatch(/v === "1" \? "ringkas" : "penuh"/);
    // Dan nilai yang tak dikenal tetap jatuh ke bawaan yang sah.
    expect(blok).toMatch(
      /v === "penuh" \|\| v === "ringkas" \|\| v === "sembunyi"/,
    );
  });

  test("siklusnya satu arah, supaya bisa dihafal", () => {
    expect(APP).toMatch(
      /const _URUT_SB(?:: [^=]+)? = \["penuh", "ringkas", "sembunyi"\]/,
    );
    expect(APP).toMatch(
      /\(_URUT_SB\.indexOf\(m(?:: \w+)?\) \+ 1\) % _URUT_SB\.length/,
    );
  });
});

describe("keadaan ketiga menyisakan tepat satu hal", () => {
  test("lebarnya nol dan tak menyisakan bingkai", () => {
    const b = aturan(".sidebar.sembunyi");
    expect(b).toMatch(/width: 0/);
    expect(b).toMatch(/padding: 0/);
    expect(b).toMatch(/border-right: none/);
  });

  test("overflow VISIBLE — kalau tidak, tombolnya ikut terpotong", () => {
    // .collapsed memakai overflow: hidden untuk menyembunyikan label selama
    // animasi lebar. Pada lebar NOL aturan itu memotong tombolnya sendiri, dan
    // yang tersisa jadi tak ada sama sekali: tak ada jalan kembali.
    expect(aturan(".sidebar.sembunyi")).toMatch(/overflow: visible/);
    expect(aturan(".sidebar.collapsed")).toMatch(/overflow: hidden/);
  });

  test("hanya kepala yang bertahan", () => {
    expect(aturan(".sidebar.sembunyi > *:not(.sb-head)")).toMatch(
      /display: none/,
    );
  });

  test("tombolnya mengambang dengan position: fixed", () => {
    // Induknya berlebar nol, jadi acuan absolut tak memberi ruang yang bisa
    // dipakai.
    const b = aturan(".sidebar.sembunyi .sb-toggle");
    expect(b).toMatch(/position: fixed/);
    expect(b).toMatch(/z-index: 40/);
  });

  test("sejajar dengan tombol panel kanan, lewat garis tengah bilah", () => {
    // The INTENT of this test has not changed: the floating button must line
    // up with the right-panel button in the top bar. The MECHANISM had to.
    //
    // It used to assert top: 0 together with height: 46px — span the whole bar
    // and centre the icon inside it. That is exactly what put the button's top
    // 8px inside the WINDOW'S RESIZE BAND. titleBarStyle "hidden" removes the
    // title bar and keeps the resizable frame, so Windows answers
    // WM_NCHITTEST along every edge first. Measured: SM_CYSIZEFRAME 4 +
    // SM_CXPADDEDBORDER 4 = 8px, and probed HTTOP through y=6 with HTCLIENT
    // first appearing at y=8.
    //
    // Pressing the top of the button therefore started a window resize instead
    // of showing the sidebar. This test passed the whole time, because it was
    // asserting the mechanism that caused it.
    //
    // Alignment is now checked against the bar's CENTRE LINE, which is what
    // "aligned" actually means and which no longer forces the box to touch the
    // edge. The band itself is guarded in
    // tests/sb-toggle-luar-pita-resize.test.ts.
    const b = aturan(".sidebar.sembunyi .sb-toggle");
    expect(b).toMatch(/align-items: center/);
    // The bar's own height still has to be the reference.
    expect(aturan(".topbar")).toMatch(/height: 46px/);

    const angka = (blok: string, prop: string): number => {
      const bersih = blok.replace(/\/\*[\s\S]*?\*\//g, "");
      for (const baris of bersih.split("\n")) {
        const t = baris.trim();
        if (t.startsWith(prop + ":")) {
          return parseFloat(t.slice(prop.length + 1).trim());
        }
      }
      throw new Error("declaration not found: " + prop);
    };
    const pusat = angka(b, "top") + angka(b, "height") / 2;
    expect(Math.abs(pusat - 46 / 2)).toBeLessThanOrEqual(1);
  });

  test("transparan, seperti tombol bilah atas lainnya", () => {
    // Kotak berlatar sendiri di pojok kiri terbaca seperti elemen asing,
    // bukan seperti bagian bilah. Terukur: background rgba(0,0,0,0),
    // border 0px none.
    const b = aturan(".sidebar.sembunyi .sb-toggle");
    expect(b).toMatch(/background: transparent/);
    expect(b).toMatch(/border: none/);
    expect(b).not.toMatch(/border: 1px solid/);
  });

  test("bilah atas diberi ruang untuk tombol yang mengambang", () => {
    // .sb-toggle memakai position: fixed di x=10..46 dan mengambang DI ATAS isi
    // halaman, jadi apa pun di pojok kiri-atas tertimpa. Terukur di halaman API
    // Settings sebelum diperbaiki: tombol x=10..46, lambang kunci x=39..67 —
    // bertabrakan 7px. Sesudahnya lambang itu mulai di x=73.
    //
    // Yang diberi ruang BARIS HEADER-nya saja: menggeser seluruh halaman akan
    // mengambil kembali ruang yang justru jadi alasan sidebar disembunyikan.
    // Dicari lewat indeks, bukan `aturan()`: selektornya berisi baris baru
    // (dua selektor dipisah koma), dan menuliskannya sebagai satu string di
    // sini sudah sekali berubah jadi dua baris yang merusak berkas ini.
    const i = CSS.indexOf(".app.sb-sembunyi .topbar");
    expect(i).toBeGreaterThan(0);
    expect(CSS.slice(i, CSS.indexOf("}", i))).toMatch(/padding-left: 58px/);
  });

  test("SEMUA bilah atas ikut, bukan satu halaman saja", () => {
    // Bug ini muncul persis karena halaman baru tak ikut dipikirkan waktu
    // tombolnya dibuat — jadi aturannya menyebut keduanya sekaligus.
    const i = CSS.indexOf(".app.sb-sembunyi .topbar");
    expect(i).toBeGreaterThan(0);
    const blok = CSS.slice(i, CSS.indexOf("}", i));
    expect(blok).toMatch(/\.topbar/);
    expect(blok).toMatch(/\.hub-header/);
  });

  test("pegangan pengubah lebar ikut hilang", () => {
    // Menyeret sesuatu yang tak terlihat hanya menghasilkan sidebar berlebar
    // aneh saat ia ditampilkan lagi.
    expect(aturan(".sidebar.sembunyi .sb-resizer")).toMatch(/display: none/);
  });
});

describe("tombolnya mengatakan apa yang akan terjadi", () => {
  test("judulnya berbeda di tiap keadaan", () => {
    // "Open panel" di ketiga keadaan tak memberi tahu apa pun — yang berguna
    // adalah apa yang terjadi kalau ditekan SEKARANG.
    for (const t of ["Compact — icons only", "Hide sidebar", "Show sidebar"])
      expect(SB).toMatch(new RegExp(t.replace(/[—]/g, ".")));
  });

  test("mode diteruskan ke pembaca layar", () => {
    expect(SB).toMatch(/aria-label=\{"Sidebar: " \+ mode\}/);
  });

  test("kode lama yang bertanya 'sedang ringkas?' tetap benar", () => {
    // Diturunkan sekali dari mode alih-alih menyunting belasan pemakainya:
    // "ringkas" dan "sembunyi" sama-sama menyembunyikan label.
    expect(SB).toMatch(/const collapsed = mode !== "penuh"/);
  });
});
