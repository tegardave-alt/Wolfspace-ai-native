// Splitting the editor area, the way VS Code does it.
//
// WHAT IT ADDS. The code area used to be one pane over one active file. It can
// now be split in two: each half keeps its own tab strip and its own active
// file, both read from the one file tree, and exactly one half has focus — the
// one a plain click in the tree opens into.
//
// THE PART THAT IS NOT COSMETIC. Monaco models had been cached PER PANE. Two
// panes can show the same file at once, and a model per pane means two
// independent buffers over one path: type in one, save from the other, and the
// first pane's work is overwritten with nothing said. So the cache moved to
// module scope and is shared, which is what VS Code does between editor groups
// and for the same reason. Its disposal had to move with it — keyed on the
// union across panes, or closing a tab in one half would destroy a buffer the
// other half is still displaying.
//
// NOT VERIFIED IN A RUNNING WINDOW. These are source assertions. The behaviour
// they describe has not been watched in the app.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const baca = (p) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");
const APP = baca("public/app.tsx");
const CSS = baca("public/styles.css");

describe("grup editor", () => {
  test("dua grup, dan batasnya disebut sekali", () => {
    // Dipatok dua: itu yang diminta, dan jalur ketiga yang tak pernah diuji
    // lebih buruk daripada jalur yang tidak ada.
    expect(APP).toMatch(/const MAKS_GRUP = 2/);
  });

  test("tiap grup punya tab DAN berkas aktifnya sendiri", () => {
    expect(APP).toMatch(/useState<any\[\]>\(\[\{ tabs: \[\], aktif: "" \}\]\)/);
    expect(APP).toMatch(/const \[grupFokus, setGrupFokus\] = useState\(0\)/);
  });

  test("berkas aktif adalah TURUNAN, bukan state kedua", () => {
    // Menyimpannya terpisah berarti dua sumber kebenaran untuk "berkas yang
    // mana", dan keduanya menyimpang begitu layar dipecah.
    expect(APP).toMatch(
      /\(logicGrup\[grupFokus\] && logicGrup\[grupFokus\]\.aktif\) \|\| ""/,
    );
  });

  test("union tab dihitung untuk pelepasan model", () => {
    // Inilah yang menjaga buffer grup sebelah tetap hidup.
    expect(APP).toMatch(/const logicTabsSemua = useMemo/);
    expect(APP).toMatch(/tabsSemua=\{logicTabsSemua\}/);
  });

  test("memecah membawa berkas aktif ke grup baru", () => {
    // Memecah ke pane kosong membuat gerakannya mendarat di ketiadaan.
    const i = APP.indexOf("const pecahGrup = useCallback");
    expect(i).toBeGreaterThan(-1);
    const blok = APP.slice(i, i + 700);
    expect(blok).toMatch(/if \(gs\.length >= MAKS_GRUP\) return gs/);
    expect(blok).toMatch(
      /gs\.concat\(\{ tabs: rel \? \[rel\] : \[\], aktif: rel \}\)/,
    );
  });

  test("grup yang kehabisan tab MENUTUP, dan yang terakhir tidak", () => {
    const i = APP.indexOf("const tutupTab = useCallback");
    const blok = APP.slice(i, i + 1800);
    expect(blok).toMatch(/hasil\.length > 1 \? hasil\.filter/);
    // Kalau yang terakhir ikut ditutup, area editor hilang tanpa jalan kembali.
    expect(blok).toMatch(/bersih\.length \? bersih : \[hasil\[0\]\]/);
  });

  test("menghapus berkas menutup tabnya di SEMUA grup", () => {
    // Berkas yang lenyap dari disk tak boleh tersisa sebagai tab di paruh mana
    // pun — kalau tidak, ia jadi baris yang memuat 404.
    const i = APP.indexOf("const tutupTab = useCallback");
    expect(APP.slice(i, i + 600)).toMatch(
      /typeof grup === "number" && k !== grup/,
    );
  });
});

describe("cara memecahnya", () => {
  test("tombol Split ada dan menyebut pintasannya", () => {
    // The class is no longer a bare string: the button became a TOGGLE, and it
    // carries an `aktif` modifier while a split is open. What this test is
    // about — that the control exists and names its shortcut — is unchanged.
    expect(APP).toMatch(/"tab-pecah"/);
    expect(APP).toMatch(/Split editor \(Ctrl\+/);
  });

  test("Ctrl+backslash ditambatkan ke editor, bukan ke window", () => {
    // Pintasan segenerik ini tak boleh menyala saat pemakai sedang mengetik di
    // kotak chat di halaman lain.
    const i = APP.indexOf('el.addEventListener("keydown", tekan)');
    expect(i).toBeGreaterThan(-1);
    const blok = APP.slice(Math.max(0, i - 900), i);
    expect(blok).toMatch(/bisaPecah && onPecah/);
  });

  test("Alt+klik di pohon membuka di pane sebelah", () => {
    expect(APP).toMatch(/onPilih\(n\.rel \|\| n\.name, e\.altKey\)/);
    expect(APP).toMatch(/keSamping \? bukaDiSamping\(rel\) : bukaTab\(rel\)/);
  });

  test("menekan di dalam pane merebut fokus SEBELUM isinya bereaksi", () => {
    // Bubble, bukan capture, dan klik langsung ke tab di pane yang tak fokus
    // akan membuka berkasnya ke pane yang SATUNYA.
    expect(APP).toMatch(
      /onMouseDownCapture=\{\(\) => onFokus && onFokus\(\)\}/,
    );
  });
});

describe("pembagi antar grup", () => {
  test("lebarnya persen, bukan piksel", () => {
    // Area kode berubah lebar tiap kali pohon berkas diseret atau jendela
    // diubah ukurannya; pembagi berbasis piksel akan hanyut.
    expect(APP).toMatch(/const \[pecahPct, setPecahPct\] = useState\(50\)/);
    expect(APP).toMatch(/flex: "0 0 " \+ pecahPct \+ "%"/);
  });

  test("dijepit supaya tak ada pane yang bisa diseret sampai hilang", () => {
    // Pane di 0% tak bisa diraih lagi, dan satu-satunya jalan keluar adalah
    // menutup splitnya.
    expect(APP).toMatch(/Math\.max\(15, Math\.min\(85, p\)\)/);
  });

  test("pegangannya lebih lebar dari garisnya", () => {
    const i = CSS.indexOf(".editor-split-resizer {");
    expect(i).toBeGreaterThan(-1);
    const blok = CSS.slice(i, CSS.indexOf("\n}", i));
    expect(blok).toMatch(/width:\s*7px/);
    expect(blok).toMatch(/cursor:\s*col-resize/);
  });
});

// ── Umur model, setelah crash sungguhan ──
//
// Yang dilaporkan: "[ErrorBoundary] Error: Model is disposed!" dari
// LogicCodePane, dan seluruh renderer ikut jatuh.
//
// Begitu cache model dibagi antar pane, EMPAT tempat masih memperlakukannya
// seolah milik sendiri:
//
//   1. cleanup saat pane dilepas memanggil m.dispose() pada model editornya —
//      menghancurkan buffer yang mungkin masih tampil di pane sebelah, dan
//      meninggalkan entri mati di dalam map bersama;
//   2. efek pelepasan membuang model tanpa melepasnya dulu dari editor mana
//      pun yang sedang memegangnya;
//   3. `if (!rel) return` meninggalkan editor memegang model yang baru saja
//      dibuang saat tab terakhir ditutup;
//   4. entri basi dari map bersama diserahkan langsung ke setModel.
//
// Monaco melempar dari dalam pada layout BERIKUTNYA, bukan saat dispose, jadi
// crash-nya muncul terpisah dari sebabnya.
describe("umur model bersama", () => {
  const PANE = APP.slice(
    APP.indexOf("function LogicCodePane("),
    APP.indexOf("function LogicFileTree("),
  );

  test("melepas satu pane TIDAK membuang modelnya", () => {
    // Model itu milik _modelBerkas dan bisa jadi masih tampil di pane sebelah.
    const i = PANE.indexOf("dibuang = true;");
    expect(i).toBeGreaterThan(-1);
    const blok = PANE.slice(i, i + 700);
    expect(blok).not.toMatch(/m\.dispose\(\)/);
    expect(blok).toMatch(/setModel\(null\)/);
    expect(blok).toMatch(/_editorHidup\.delete/);
  });

  test("setiap editor hidup terdaftar", () => {
    // Tanpa daftar ini, pelepasan tak punya cara menemukan pane lain yang
    // masih memegang model yang akan dibuang.
    expect(APP).toMatch(
      // Bertipe. Sebagai `new Set()` polos, anggotanya keluar sebagai
      // `unknown` dan ed.getModel() di atasnya adalah error tsc — yang
      // lolos selama ini karena esbuild membuang tipe tanpa memeriksanya.
      /const _editorHidup = new Set<any>\(\)/,
    );
    expect(PANE).toMatch(/_editorHidup\.add\(edRef\.current\)/);
  });

  test("dilepas dari SEMUA editor sebelum dibuang", () => {
    const i = PANE.indexOf("const hidup = new Set(tabsSemua)");
    const blok = PANE.slice(i, i + 900);
    expect(blok).toMatch(/for \(const ed of _editorHidup\)/);
    // Urutannya yang menentukan: lepas dulu, baru buang.
    expect(blok.indexOf("_editorHidup")).toBeLessThan(
      blok.indexOf("m.dispose()"),
    );
  });

  test("tanpa berkas, editor MELEPAS, bukan diam", () => {
    const i = PANE.indexOf("if (!rel) {");
    expect(i).toBeGreaterThan(-1);
    expect(PANE.slice(i, i + 400)).toMatch(/setModel\(null\)/);
  });

  test("entri basi tak pernah diserahkan ke setModel", () => {
    // Map-nya hidup lebih lama daripada pane mana pun, jadi entri yang sudah
    // dibuang di tempat lain bisa tersisa di sana.
    expect(PANE).toMatch(/sudahAda\.isDisposed && sudahAda\.isDisposed\(\)/);
    expect(PANE).toMatch(/_modelBerkas\.delete\(rel\)/);
  });
});
