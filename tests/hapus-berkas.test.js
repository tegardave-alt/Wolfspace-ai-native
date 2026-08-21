// ── Deleting a file from the tree ──
//
// Confinement reuses _kurungDiAkar, the same rule as writing and creating.
// That matters more here than anywhere else: a path escape on write corrupts a
// file, a path escape on delete removes one.
//
// Measured against the real request path (server.emit):
//   ordinary file        -> 200, gone from disk
//   same file again      -> 404 "file not found"
//   a FOLDER             -> 400, folder still there
//   outside the root     -> 403, neighbour file untouched
//   .env                 -> 403, still there
//   root === path        -> 403
//   missing path         -> 400
//
// And in a real browser (1440x900), with the file open in a tab:
//   right-click satu.js  -> menu shows, names the file
//   Delete file          -> gone from disk, gone from the tree, tab closed
//   console errors       -> 0

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const baca = (p) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");
const SRV = baca("server.cjs");
const APP = baca("public/app.jsx");
const CSS = baca("public/styles.css");
const tanpaKomentar = (t) =>
  t
    .split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join("\n");
const B = tanpaKomentar(APP);

describe("rute hapus", () => {
  const i = SRV.indexOf('req.url === "/ww/hapus-berkas"');
  const RUTE = SRV.slice(i, i + 2200);

  test("ada, dan memakai kurungan BERSAMA", () => {
    // Aturan keamanan yang disalin adalah aturan yang akan menyimpang.
    expect(i).toBeGreaterThan(0);
    expect(RUTE).toMatch(/_kurungDiAkar\(p\.root, p\.path\)/);
    expect(RUTE).toMatch(/if \(kurung\.galat\) return tolak\(/);
  });

  test("folder butuh niat EKSPLISIT, bukan sekadar berupa folder", () => {
    // Folder kini bisa dihapus, tapi hanya dengan folder:true. Rinciannya di
    // describe "hapus folder" di bawah; yang dikunci di sini: berupa folder
    // saja TIDAK cukup.
    expect(RUTE).toMatch(/st\.isDirectory\(\)/);
    expect(RUTE).toMatch(/if \(p\.folder !== true\)/);
  });

  test("berkas yang tak ada dijawab 404, bukan 500", () => {
    expect(RUTE).toMatch(/return tolak\(404, "file not found"\)/);
  });
});

describe("menu klik-kanan", () => {
  test("berlaku untuk berkas MAUPUN folder, dan tahu bedanya", () => {
    expect(B).toMatch(/onContextMenu=\{\(e\) => \{/);
    const i = B.indexOf("onContextMenu={(e) => {");
    expect(B.slice(i, i + 300)).toMatch(/folder: n\.type === "folder"/);
  });

  test("menyimpan KOORDINAT dan sasaran, bukan sekadar boolean", () => {
    // Menu harus muncul di tempat penunjuk berada, dan harus tahu berkas mana
    // ia dibuka.
    // Ditulis multi-baris sejak langkah konfirmasi ditambahkan, jadi yang
    // dicocokkan ketiga bidangnya — bukan bentuk satu barisnya.
    const i = B.indexOf("setMenuKonteks({");
    expect(i).toBeGreaterThan(0);
    const blok = B.slice(i, i + 220);
    expect(blok).toMatch(/x: e\.clientX/);
    expect(blok).toMatch(/y: e\.clientY/);
    expect(blok).toMatch(/rel: n\.rel \|\| n\.name/);
  });

  test("ditutup oleh klik di luar DAN Escape", () => {
    // Hanya salah satunya membuat menu terasa macet.
    expect(B).toMatch(/document\.addEventListener\("mousedown", tutup\)/);
    expect(B).toMatch(/e\.key === "Escape" && setMenuKonteks\(null\)/);
    expect(B).toMatch(/removeEventListener\("mousedown", tutup\)/);
  });

  test("klik di dalam menu tidak ikut menutupnya", () => {
    expect(B).toMatch(/onMouseDown=\{\(e\) => e\.stopPropagation\(\)\}/);
  });

  test("aksi merusak diberi warna merusak", () => {
    expect(B).toMatch(/className="pohon-menu-opsi bahaya"/);
    const i = CSS.indexOf(".pohon-menu-opsi.bahaya {");
    expect(i).toBeGreaterThan(0);
    expect(CSS.slice(i, CSS.indexOf("}", i))).toMatch(/color: #f85149/);
  });
});

describe("sesudah dihapus", () => {
  test("konfirmasinya DIGAMBAR APLIKASI, bukan window.confirm", () => {
    // window.confirm tak dipakai di mana pun lagi di aplikasi ini, jadi tak ada
    // yang membuktikan ia bekerja di build Electron-nya — dan dialog yang
    // diblokir mengembalikan false, yang membuat fungsinya keluar diam-diam dan
    // kliknya terlihat mati. Persis keluhan yang dilaporkan.
    expect(B).not.toMatch(/window\.confirm\(/);
    expect(B).not.toMatch(/window\.alert\(/);
    expect(B).toMatch(/Delete permanently\? This cannot be undone\./);
    expect(B).toMatch(/Yes, delete/);
    expect(B).toMatch(/menuKonteks\.konfirmasi/);
  });

  test("dua langkah: menu dulu, konfirmasi kemudian", () => {
    // Terukur: langkah 1 -> ["Delete file"], langkah 2 -> ["Yes, delete",
    // "Cancel"]. Cancel meninggalkan berkasnya utuh di disk.
    expect(B).toMatch(
      /setMenuKonteks\(\(m\) => m && \{ \.\.\.m, konfirmasi: true \}\)/,
    );
  });

  test("gagal MENAHAN menu tetap terbuka, dengan alasannya", () => {
    // Menutupnya akan meninggalkan berkas yang masih ada di disk dan tak ada
    // apa pun di layar yang mengatakan itu.
    const i = B.indexOf("} catch (e) {");
    const blok = B.slice(
      B.indexOf("const hapusBerkas = async"),
      B.indexOf("const [draf,"),
    );
    expect(blok).toMatch(/setHapusGalat\(String/);
    const iCatch = blok.indexOf("} catch (e) {");
    expect(blok.slice(iCatch)).not.toMatch(/setMenuKonteks\(null\)/);
  });

  test("tak bisa ditekan dua kali selagi berjalan", () => {
    expect(B).toMatch(/if \(!rel \|\| !akarAda \|\| hapusSibuk\) return/);
    expect(B).toMatch(/disabled=\{hapusSibuk\}/);
  });

  test("hilang dari daftar berkas DAN tabnya ditutup", () => {
    // Meninggalkan salah satunya berarti baris yang tak membuka apa pun, dan
    // tab yang memuat 404.
    const i = B.indexOf("onHapus={(rel) => {");
    expect(i).toBeGreaterThan(0);
    const blok = B.slice(i, i + 400);
    expect(blok).toMatch(
      /setDevFiles\(\(prev\) => prev\.filter\(\(x\) => x !== rel\)\)/,
    );
    expect(blok).toMatch(/tutupTab\(rel\)/);
  });
});

// ── New folder, beside New file ──
//
// The folder route shares the create route rather than getting its own: same
// confinement, same "must not already exist" rule, only the last step differs.
// A second route would mean a second copy of the guard, and a security rule
// that exists twice is a security rule that will drift.
//
// Measured against the real request path:
//   new folder        -> 200 {"folder":true,"path":"src"}, really a directory
//   same name again   -> 409 "already exists"
//   nested "a/b/c"    -> 200, whole chain created
//   outside the root  -> 403, nothing created
//   ".env"            -> 403
//   plain file        -> 200, really a file
//
// And in a real browser (1440x900):
//   header buttons    -> ["New folder","New file"], folder x1087 < file x1113
//   placeholder       -> "folder-name"
//   type "src", Enter -> directory on disk, "src" in the tree, NO tab opened
//   "a/b"             -> nested, both levels shown
//   duplicate name    -> input row stays open, shows "already exists"
//   console errors    -> only the expected 409
describe("folder baru", () => {
  const iBuat = SRV.indexOf('req.url === "/ww/buat-berkas"');
  const RUTE_BUAT = SRV.slice(iBuat, iBuat + 3000);

  test("berbagi rute dan kurungan dengan pembuatan berkas", () => {
    expect(RUTE_BUAT).toMatch(/p\.folder === true/);
    expect(RUTE_BUAT).toMatch(/fs\.mkdirSync\(berkas, \{ recursive: true \}\)/);
    // Tak ada rute kedua yang menyalin aturannya.
    expect(SRV).not.toMatch(/req\.url === "\/ww\/buat-folder"/);
  });

  test("menolak menimpa yang sudah ada", () => {
    expect(RUTE_BUAT).toMatch(/return tolak\(409, "already exists"\)/);
  });

  test("tombolnya di KIRI tombol berkas", () => {
    // Terukur: folder x1087, file x1113.
    const iFolder = B.indexOf('mulaiBuat("folder")');
    const iBerkas = B.indexOf('mulaiBuat("berkas")');
    expect(iFolder).toBeGreaterThan(0);
    expect(iBerkas).toBeGreaterThan(0);
    expect(iFolder).toBeLessThan(iBerkas);
  });

  test("jenis disimpan bersama drafnya, bukan diputuskan saat submit", () => {
    // Placeholder, ikon, dan teks galat semuanya harus sepakat dengannya;
    // memutuskan saat submit membuat barisnya berbohong sampai saat itu.
    expect(B).toMatch(
      /const \[jenisBaru, setJenisBaru\] = React\.useState\("berkas"\)/,
    );
    expect(B).toMatch(
      /placeholder=\{jenisBaru === "folder" \? "folder-name" : "file-name\.js"\}/,
    );
  });

  test("folder TIDAK membuka tab — tak ada yang bisa dibuka", () => {
    expect(B).toMatch(
      /if \(jenisBaru === "folder"\) \{\s*\n\s*if \(onBuatFolder\)/,
    );
  });

  test("folder kosong tetap muncul di pohon", () => {
    // Pohon dibangun dari daftar BERKAS; folder tanpa isi tak meninggalkan
    // jejak di sana dan akan dibuat di disk lalu tak pernah terlihat.
    expect(B).toMatch(/function buildDevTree\(paths, root, folders\)/);
    expect(B).toMatch(/for \(const raw of folders \|\| \[\]\)/);
    expect(B).toMatch(/const \[devFolders, setDevFolders\] = useState\(\[\]\)/);
    expect(B).toMatch(/folders=\{devFolders\}/);
  });

  test("daftar folder ikut direset saat ganti proyek", () => {
    const i = B.indexOf("setDevFiles([]);");
    expect(B.slice(i, i + 120)).toMatch(/setDevFolders\(\[\]\)/);
  });
});

// ── Deleting a folder ──
//
// This one takes everything inside it, so the guards are stricter than for a
// file. Measured against the real request path:
//   folder WITHOUT folder:true -> 400, folder untouched
//   hitung:true                -> 200 {"jumlah":3}, nothing deleted
//   delete folder with content -> 200 {"jumlah":3}, sibling file survives
//   empty folder               -> 200 {"jumlah":0}
//   outside the root           -> 403
//   the root ITSELF            -> 403, root still there
//
// And in a real browser, with a file from inside it open as a tab:
//   right-click "src"  -> "Delete folder"
//   confirm step       -> "Delete this folder and the 2 items inside it? …"
//   confirm            -> gone from disk, sibling survives,
//                         tree ["luar.js"], tab closed, 0 page errors
describe("hapus folder", () => {
  const i = SRV.indexOf('req.url === "/ww/hapus-berkas"');
  const RUTE = SRV.slice(i, i + 4000);

  test("butuh folder:true — bukan sekadar kebetulan berupa folder", () => {
    // Satu salah-klik pada baris folder tak boleh bisa mengangkat subpohon
    // hanya karena barisnya kebetulan folder.
    expect(RUTE).toMatch(/if \(p\.folder !== true\)/);
    expect(RUTE).toMatch(/folders need folder:true to be deleted/);
  });

  test("jumlah isinya dihitung dari DISK, bukan dari pohon", () => {
    // Pohon hanya menampilkan berkas yang disentuh agent, jadi hitungannya
    // sendiri akan MENGECILKAN kerusakan — dan angka yang disetujui pemakai
    // harus angka yang sebenarnya.
    expect(RUTE).toMatch(/fs\.readdirSync\(d, \{ withFileTypes: true \}\)/);
    expect(RUTE).toMatch(/if \(p\.hitung === true\)/);
    expect(B).toMatch(/const hitungIsi = async \(rel\)/);
    expect(B).toMatch(/hitung: true/);
  });

  test("menghitung TIDAK menghapus", () => {
    const iH = RUTE.indexOf("if (p.hitung === true)");
    const iR = RUTE.indexOf("fs.rmSync(");
    expect(iH).toBeGreaterThan(0);
    expect(iR).toBeGreaterThan(iH); // penghapusan ada SESUDAH jalan keluar
  });

  test("peringatannya menyebut ANGKANYA", () => {
    // "dan semua isinya" tak memberi tahu seberapa besar yang hilang.
    expect(B).toMatch(/Delete this folder and the/);
    expect(B).toMatch(/jumlahIsi \+/);
    expect(B).toMatch(/Delete this empty folder\?/);
  });

  test("akar workspace sendiri tetap ditolak", () => {
    // path.relative(akar, akar) === "" -> ditolak _kurungDiAkar.
    const iK = SRV.indexOf("function _kurungDiAkar");
    expect(SRV.slice(iK, iK + 700)).toMatch(/!dalam \|\|/);
  });

  test("isinya hilang dari KEDUA daftar, dan tabnya ditutup", () => {
    const iH = B.indexOf("onHapusFolder={(rel) => {");
    expect(iH).toBeGreaterThan(0);
    const blok = B.slice(iH, iH + 700);
    expect(blok).toMatch(/x === rel \|\| x\.startsWith\(rel \+ "\/"\)/);
    expect(blok).toMatch(/tutupTab\(x\)/);
    expect(blok).toMatch(/setDevFolders\(/);
  });

  test("klik-kanan kini juga untuk folder", () => {
    const iC = B.indexOf("onContextMenu={(e) => {");
    const blok = B.slice(iC, iC + 300);
    expect(blok).not.toMatch(/if \(n\.type === "folder"\) return/);
    expect(blok).toMatch(/folder: n\.type === "folder"/);
  });
});
