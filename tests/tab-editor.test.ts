// ── Editor tabs, the way VS Code has them ──
//
// The header used to show one filename. With several files open, one name only
// ever tells you where you are — never where else you could go.
//
// THE PART THAT WASN'T COSMETIC. Switching files used to DISPOSE the previous
// Monaco model. With a single file that only cost undo history; with tabs,
// switching becomes the most common action there is, so it would have silently
// destroyed unsaved edits every time. Models are now cached per file and only
// disposed when their tab is closed — which is also what makes undo history,
// cursor and scroll survive a switch.
//
// Measured in a real browser (1440x900), against a temp project on disk:
//   open three files   -> tabs ["satu.js","dua.py","tiga.css"], active tiga.css
//   click a tab        -> active satu.js
//   type into it       -> that tab shows dirty
//   switch away, back  -> 3 live models, edit still there
//   close ACTIVE tab   -> ["dua.py","tiga.css"], active dua.py
//   console errors     -> 0

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const baca = (p) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");
const APP = baca("public/app.tsx");
const CSS = baca("public/styles.css");
const tanpaKomentar = (t) =>
  t
    .split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join("\n");
const B = tanpaKomentar(APP);
const aturan = (sel) => {
  const i = CSS.indexOf(sel + " {");
  return i < 0 ? "" : CSS.slice(i, CSS.indexOf("\n}", i) + 3);
};

describe("model tidak dibuang saat pindah tab", () => {
  test("ada cache model per berkas", () => {
    // The cache moved from a per-instance ref to MODULE scope when the editor
    // area learned to split. Panes can show the same file at once, and a model
    // per pane means two buffers over one path: type in one, save from the
    // other, and the first pane's work is gone without a word.
    expect(B).toMatch(/const _modelBerkas = new Map\(\)/);
    // `let`, not `const`: the shared map outlives any single pane, so an entry
    // disposed elsewhere can still be sitting in it. That case is cleared and
    // refetched rather than handed to setModel — which is the crash the
    // ErrorBoundary reported as "Model is disposed!".
    expect(B).toMatch(/let sudahAda = _modelBerkas\.get\(rel\)/);
  });

  test("model lama TIDAK dibuang saat berpindah", () => {
    // Ini yang dulu menghancurkan suntingan: dispose dipanggil di jalur
    // pergantian berkas.
    const i = B.indexOf("React.useEffect(() => {\n    if (!rel) return;");
    const blok = B.slice(i, i + 2600);
    expect(blok).not.toMatch(/lama\.dispose\(\)/);
  });

  test("dibuang hanya saat tabnya DITUTUP di SEMUA grup", () => {
    // Tanpa ini, membuka banyak berkas menumpuk model tanpa pernah melepasnya.
    //
    // tabsSemua, bukan tabs: gabungan dari setiap grup editor. Kalau ditambat
    // ke tab milik satu grup saja, model yang masih ditampilkan grup sebelah
    // ikut dibuang dan pane itu mendadak kosong di tengah suntingan.
    expect(B).toMatch(/const hidup = new Set\(tabsSemua\)/);
    expect(B).toMatch(/_modelBerkas\.delete\(k\)/);
  });

  test("TIDAK dibuang saat satu panelnya dilepas", () => {
    // Kebalikan dari yang dulu dituntut di sini, dan sengaja.
    //
    // Dulu panel membuang seluruh modelnya saat dilepas, dan itu benar selama
    // panelnya cuma satu. Begitu layar bisa dipecah dua, panel yang ditutup
    // akan menghancurkan buffer yang masih dipakai panel yang bertahan. Jadi
    // pelepasan sekarang dikemudikan oleh tabsSemua di atas: model mati kalau
    // tak ada satu pun grup yang membukanya.
    expect(B).not.toMatch(/peta\.clear\(\)/);
    expect(B).toMatch(/_modelBerkas\.delete\(k\)/);
  });
});

describe("keadaan tab", () => {
  test("urutannya milik pemakai, jadi array bukan Set", () => {
    // Tab tak lagi satu daftar untuk seluruh editor: tiap GRUP punya
    // daftarnya sendiri, seperti VS Code. Yang dijaga tetap sama — urutannya
    // milik pemakai, jadi array.
    expect(B).toMatch(
      /const \[logicGrup, setLogicGrup\] = useState(?:<[^>]*>)?\(\[\{ tabs: \[\], aktif: "" \}\]\)/,
    );
  });

  test("menutup tab AKTIF menyerahkan fokus ke tetangga", () => {
    // Kanan dulu, lalu kiri — seperti editor mana pun. Membiarkan panel kosong
    // membuat menutup terasa seperti kehilangan tempat.
    expect(B).toMatch(/sisa\[i\] \|\| sisa\[i - 1\] \|\| ""/);
    // Dan hanya kalau yang ditutup memang yang aktif. Sekarang per grup.
    expect(B).toMatch(/g\.aktif !== rel \? g\.aktif :/);
  });

  test("menggeser memindahkan, bukan menukar", () => {
    // Menukar dua posisi bukan yang dilakukan editor mana pun saat tab diseret.
    expect(B).toMatch(/n\.splice\(b, 0, n\.splice\(a, 1\)\[0\]\)/);
  });

  test("kotor dilacak PER BERKAS", () => {
    // Satu penanda hanya menggambarkan berkas aktif, sementara bilah tab harus
    // menandai setiap berkas yang punya suntingan belum tersimpan.
    // Ikut naik ke module scope bersama modelnya: berkas itu kotor atau tidak,
    // dan lewat pane mana Anda melihatnya tak mengubah jawabannya.
    expect(B).toMatch(/const _kotorBerkas = new Map\(\)/);
    expect(B).toMatch(/_kotorBerkas\.set\(rel, true\)/);
    expect(B).toMatch(/_kotorBerkas\.set\(target, false\)/);
  });
});

describe("bilah tab", () => {
  test("bisa diseret untuk diurutkan", () => {
    expect(B).toMatch(/draggable/);
    expect(B).toMatch(/onDragStart=/);
    expect(B).toMatch(/onDrop=/);
  });

  test("dragOver MENCEGAH bawaan — kalau tidak, jatuhnya ditolak", () => {
    // Tanpa preventDefault peramban menolak drop dan seluruh gerakannya
    // diam-diam tak melakukan apa pun.
    const i = B.search(/onDragOver=\{\(e(?:: \w+)?\) => \{/);
    expect(i).toBeGreaterThan(0);
    expect(B.slice(i, i + 260)).toMatch(/e\.preventDefault\(\)/);
  });

  test("tombol tutup tidak ikut memilih tabnya", () => {
    expect(B).toMatch(
      /e\.stopPropagation\(\);\s*\n\s*if \(onTutupTab\) onTutupTab\(t\)/,
    );
  });

  test("klik tengah menutup, seperti editor lain", () => {
    expect(B).toMatch(/e\.button === 1 && onTutupTab/);
  });

  test("bilahnya MENGGULIR, tidak memeras tabnya", () => {
    // Tab yang mengecil agar muat berhenti terbaca jauh sebelum berhenti muat.
    const b = aturan(".tab-strip");
    expect(b).toMatch(/overflow-x: auto/);
    expect(aturan(".tab")).toMatch(/flex: 0 0 auto/);
    expect(aturan(".tab")).toMatch(/max-width: 190px/);
  });

  test("titik kotor dan tombol × berbagi SATU slot", () => {
    // Kalau tombolnya menambah lebar saat hover, barisnya bergeser tepat saat
    // pemakai hendak mengklik.
    // `position: absolute` disetel pada aturan gabungan (titik DAN silang
    // sekaligus), jadi yang dicari aturan itu — bukan blok masing-masing.
    expect(CSS).toMatch(
      /\.tab-tutup \.tab-titik,\s*\n\.tab-tutup \.tab-silang \{[^}]*position: absolute/,
    );
    expect(CSS).toMatch(/\.tab-tutup\.kotor \.tab-silang \{\s*opacity: 0;/);
  });

  test("× tetap terjangkau pada berkas yang kotor", () => {
    // Kalau tidak, satu-satunya cara menutup pekerjaan yang belum tersimpan
    // adalah menyimpannya dulu.
    expect(CSS).toMatch(/\.tab:hover \.tab-tutup \.tab-silang/);
  });

  test("fokus papan ketik terlihat", () => {
    expect(aturan(".tab-tutup:focus-visible")).toMatch(/outline:/);
  });
});
