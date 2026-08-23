// ── Debug di terminal + saran pustaka saat mengetik ──
//
// Yang dipilih untuk debug adalah debugger BER-BARIS-PERINTAH, bukan protokol
// DAP seperti VS Code. Alasannya bukan kemalasan: DAP menuntut adapter per
// bahasa, proses perantara, dan panel variabel/tumpukan sendiri — sementara
// `node inspect` dan `python -m pdb` sudah memberi hal yang sama (titik henti,
// melangkah, memeriksa nilai) DI DALAM PTY yang sudah ada.
//
// Terbukti sampai ujung pada PTY sungguhan:
//   perintah      : node inspect "…\debug ku.js"
//   debugger siap : true   (prompt "debug>" muncul)
//   melangkah     : true   (3x "next" memindahkan debugger ke baris berikutnya)

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const baca = (p) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");
const APP = baca("public/app.tsx");
const SRV = baca("server.cjs");
const SCR = baca("public/app/Screens.tsx");
const KOMP = baca("public/app/Components.tsx");
const tanpaKomentar = (t) =>
  t
    .split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join("\n");
const BERSIH = tanpaKomentar(APP);

// Fungsi DIAMBIL dari sumber lalu dijalankan, supaya yang diuji jalur produksi.
// `const` di dalam eval tak bocor ke lingkup pemanggil, jadi nilainya
// dikembalikan sebagai hasil eval — bukan diharapkan muncul sebagai variabel.
const ambil = (n) => {
  const i = APP.indexOf("function " + n + "(");
  if (i < 0) throw new Error("tak ketemu: " + n);
  return APP.slice(i, APP.indexOf("\n}", i) + 2);
};
const potongObjek = (nama, akhir) => {
  const i = APP.search(new RegExp("const " + nama + "(?:: [^=]+)? ="));
  if (i < 0) throw new Error("tak ketemu: " + nama);
  return APP.slice(i, APP.indexOf(akhir, i) + akhir.length);
};
// The extracted source is TRANSPILED first, exactly as index.html loads a .tsx
// file. Since app.jsx migrated, that source carries type annotations — and a
// raw eval() stops at the first colon. Transpiling here preserves this file's
// claim: what runs is the production path, not a reinterpretation.
globalThis.self = globalThis;
const Babel = require(
  require("path").join(__dirname, "..", "public/vendor/babel.min.js"),
);
const _sumberKotak =
  potongObjek("_PERINTAH_DEBUG", "};") +
  "\n" +
  potongObjek("_AKSI_DEBUG", "\n};") +
  "\n" +
  ambil("ekstensiDari") +
  "\n" +
  ambil("perintahDebug") +
  "\n" +
  ambil("jenisDebugger") +
  "\n({ debug: perintahDebug, jenis: jenisDebugger, AKSI: _AKSI_DEBUG })";
const KOTAK = eval(
  Babel.transform(_sumberKotak, {
    presets: ["typescript"],
    filename: "debug.ts",
  }).code,
);

describe("perintah debug", () => {
  test("memakai `node inspect`, BUKAN `--inspect-brk`", () => {
    // Keduanya sering tertukar. --inspect-brk hanya membuka port lalu mencetak
    // alamat ws:// dan menunggu klien dari luar — di terminal ia terlihat
    // menggantung tanpa sebab. `node inspect` membawa REPL-nya sekalian.
    expect(KOTAK.debug("/a/b.js")).toBe('node inspect "/a/b.js"');
    expect(KOTAK.debug("/a/b.js")).not.toMatch(/--inspect/);
  });

  test("path berspasi tetap satu argumen", () => {
    expect(KOTAK.debug("C:/My Project/a b.py")).toBe(
      'python -m pdb "C:/My Project/a b.py"',
    );
  });

  test("yang tak punya debugger mengembalikan null", () => {
    for (const n of ["/a/i.html", "/a/d.json", "/a/r.md", "/a/x.sh"])
      expect(KOTAK.debug(n)).toBeNull();
  });

  test("tiap debugger punya kata perintahnya SENDIRI", () => {
    // Menyamakannya berbahaya: "s" tak dikenal node inspect, sementara "next"
    // di pdb kebetulan terbaca sebagai "n" yang benar hanya karena berawalan
    // sama — jadi kesalahan seperti itu tak selalu memberi galat.
    expect(KOTAK.jenis("/a/b.js")).toBe("node");
    expect(KOTAK.jenis("/a/b.py")).toBe("pdb");
    expect(KOTAK.AKSI.node.lewati).toBe("next");
    expect(KOTAK.AKSI.pdb.lewati).toBe("n");
    expect(KOTAK.AKSI.node.lewati).not.toBe(KOTAK.AKSI.pdb.lewati);
  });

  test("setiap debugger punya kelima aksi, tak ada yang bolong", () => {
    // Tombol tanpa kata perintah tak melakukan apa pun saat ditekan, dan itu
    // tak bisa dibedakan dari debugger yang sedang tak merespons.
    for (const j of Object.keys(KOTAK.AKSI))
      for (const a of ["lanjut", "lewati", "masuk", "keluar", "berhenti"])
        expect(typeof KOTAK.AKSI[j][a]).toBe("string");
  });

  test("jenisDebugger cocok dengan _PERINTAH_DEBUG, bukan daftar terpisah", () => {
    // Dua daftar yang harus sepakat pasti akan menyimpang.
    const ext = { js: "node", py: "pdb", rb: "rdbg", go: "dlv" };
    for (const e of Object.keys(ext)) {
      expect(KOTAK.jenis("/a/b." + e)).toBe(ext[e]);
      expect(KOTAK.AKSI[ext[e]]).toBeTruthy();
    }
  });
});

describe("bilah debug di terminal", () => {
  const bersihSC = tanpaKomentar(SCR);

  test("DEBUG adalah tab, sejajar TERMINAL dan OUTPUT", () => {
    // Debug adalah SESI yang hidup di terminal — tempatnya bersama keluaran
    // yang ia hasilkan, bukan di sebelah tombol Simpan di header editor.
    expect(bersihSC).toMatch(/setActiveTab\("DEBUG"\)/);
    expect(bersihSC).toMatch(/activeTab === "DEBUG" \? "flex" : "none"/);
    // Dan tombolnya benar-benar HILANG dari header editor.
    expect(BERSIH).not.toMatch(/onClick=\{debug\}/);
  });

  test("kendali muncul selagi ada sesi, pemicu saat belum ada", () => {
    expect(bersihSC).toMatch(/\{!debugAktif \? \(/);
    // Dijaga BERLAPIS: pemicunya ada, DAN ia benar-benar bisa dijalankan.
    // Sejak ketersediaan debugger ikut diperiksa, pemicu bisa ada tapi
    // `mulai`-nya null — memanggilnya langsung akan melempar.
    expect(bersihSC).toMatch(
      /pemicuDebug && pemicuDebug\.mulai && pemicuDebug\.mulai\(\)/,
    );
    expect(bersihSC).toMatch(
      /disabled=\{!\(pemicuDebug && pemicuDebug\.mulai\)\}/,
    );
  });

  test("kelima tombolnya ada dan terhubung", () => {
    for (const a of ["lanjut", "lewati", "masuk", "keluar", "berhenti"])
      expect(bersihSC).toMatch(new RegExp('"' + a + '"'));
    expect(bersihSC).toMatch(/onAksiDebug && onAksiDebug\(aksi\)/);
  });

  test("pemicu debug DIDAFTARKAN dari panel kode, tidak disalin", () => {
    // Kalau panel terminal memanggil perintah debug-nya sendiri, ia melewati
    // "simpan dulu" — dan menjalankan isi berkas yang lama DI BAWAH DEBUGGER
    // adalah bentuk kebingungan yang paling mahal: baris yang disorot debugger
    // tak cocok dengan baris yang terlihat di editor.
    expect(BERSIH).toMatch(/mulai: bisaDebug \? debug : null/);
    expect(BERSIH).toMatch(/onDaftarDebug=\{setPemicuDebug\}/);
    expect(BERSIH).toMatch(/pemicuDebug=\{pemicuDebug\}/);
    // Dilepas saat komponennya hilang, kalau tidak tombolnya tetap hidup
    // menunjuk editor yang sudah tak ada.
    expect(BERSIH).toMatch(/return \(\) => onDaftarDebug\(null\)/);
  });

  test("tetap melompat ke TERMINAL saat perintah dikirim", () => {
    // Yang perlu dilihat orang begitu perintah dikirim adalah KELUARANNYA;
    // melompat ke tab DEBUG justru menyembunyikan baris tempat debugger
    // berhenti.
    const i = bersihSC.indexOf("nonceRef.current = perintah.n");
    expect(bersihSC.slice(i, i + 200)).toMatch(/setActiveTab\("TERMINAL"\)/);
  });

  test("keadaan debug dimatikan saat Stop ditekan", () => {
    // Kalau tidak, bilahnya tetap terlihat padahal sesinya sudah tak ada, dan
    // tombol-tombolnya mengetik ke shell biasa.
    expect(BERSIH).toMatch(/if \(aksi === "berhenti"\) setDebugAktif\(null\)/);
  });

  test("Run dan Debug lewat SATU jalur, syarat simpannya tak bisa beda", () => {
    expect(BERSIH).toMatch(/const kirimKe = React\.useCallback\(/);
    expect(BERSIH).toMatch(/kirimKe\("jalan"\)/);
    expect(BERSIH).toMatch(/kirimKe\("debug"\)/);
    // Akar ikut dioper: app.tsx memerlukannya untuk MENGURUNG path sebelum
    // sesi DAP dibuka, dan hanya panel kode yang tahu akar berkas yang dibuka.
    expect(BERSIH).toMatch(
      /onRun\(abs\(target\), mode, String\(root \|\| ""\)\)/,
    );
  });
});

describe("saran pustaka saat mengetik", () => {
  // Dipotong sampai RUTE BERIKUTNYA, bukan sepanjang tebakan: panjang tetap
  // membuat irisannya melewati batas rute dan ikut membaca /ww/tree, yang
  // memang menyebut node_modules — asersi "tidak boleh ada" lalu gagal karena
  // kode milik orang lain.
  const iRute = SRV.indexOf('req.url.startsWith("/ww/pustaka")');
  const RUTE = SRV.slice(
    iRute,
    SRV.indexOf('req.url.startsWith("/ww/tree")', iRute),
  );

  test("rutenya membaca MANIFES, tidak menelusuri node_modules", () => {
    // Menelusuri node_modules berarti ribuan folder di thread yang sama dengan
    // yang menggambar jendela — dan hasilnya pun lebih buruk: dependensi
    // transitif ikut tersaran padahal bukan milik proyek ini.
    expect(iRute).toBeGreaterThan(0);
    expect(RUTE).toMatch(/package\.json/);
    expect(RUTE).toMatch(/requirements\.txt/);
    expect(tanpaKomentar(RUTE)).not.toMatch(/node_modules/);
    expect(tanpaKomentar(RUTE)).not.toMatch(/readdirSync/);
  });

  test("modul bawaan diambil dari runtime, bukan daftar tulis tangan", () => {
    // Daftar yang ditulis tangan basi diam-diam tiap kali Node naik versi.
    expect(RUTE).toMatch(/require\("module"\)/);
    expect(RUTE).toMatch(/builtinModules/);
  });

  test("penyedia saran dipasang SEKALI, bukan tiap editor dibuat", () => {
    // Mendaftarkannya per-editor menumpuk penyedia dan menggandakan saran tiap
    // kali berkas diganti.
    expect(BERSIH).toMatch(/let _saranTerpasang = false/);
    expect(BERSIH).toMatch(/if \(_saranTerpasang\) return/);
    expect(BERSIH).toMatch(/pasangSaranPustaka\(monaco\)/);
  });

  test("hanya ditawarkan DI DALAM kutip import/require", () => {
    // Tanpa batasan itu, nama paket muncul di tengah kalimat biasa dan
    // menutupi saran yang benar.
    const i = APP.indexOf("const _POLA_IMPOR =");
    const sisa = APP.slice(i);
    const pola = eval(
      sisa
        .slice(0, sisa.indexOf(";") + 1)
        .replace("const _POLA_IMPOR =", "")
        .replace(/;\s*$/, ""),
    );
    expect(pola.test('const x = require("exp')).toBe(true);
    expect(pola.test("import y from 'zo")).toBe(true);
    expect(pola.test('const s = "halo dun')).toBe(false);
    expect(pola.test("const s = 'sekadar teks")).toBe(false);
  });

  test("daftar diambil sekali per akar, bukan tiap ketukan tombol", () => {
    // Penyedia saran dipanggil ulang tiap karakter.
    expect(BERSIH).toMatch(/_pustakaCache/);
    expect(BERSIH).toMatch(
      /_pustakaCache\.akar === akar && _pustakaCache\.janji/,
    );
  });

  test("akar diperbarui saat proyek berganti", () => {
    // Editor tidak dibuat ulang saat pemakai pindah proyek; saran yang
    // tertinggal di akar lama menawarkan pustaka proyek yang salah.
    expect(BERSIH).toMatch(/_akarPustaka = String\(root \|\| ""\)/);
  });
});

describe("bilah judul Logic dihapus", () => {
  test("tak ada lagi header 'Logic' di dalam panel", () => {
    // Panel ini sudah punya dua header di bawahnya — "Files" di pohon berkas
    // dan nama berkas di editor.
    const i = BERSIH.indexOf("{logicOpen && (");
    expect(i).toBeGreaterThan(0);
    const blok = BERSIH.slice(i, i + 1500);
    expect(blok).not.toMatch(/<span>Logic<\/span>/);
    expect(blok).not.toMatch(/Close Logic/);
  });

  test("masih ada jalan menutupnya lewat menu", () => {
    // Menghapus satu-satunya tombol tutup tanpa penggantinya membuat panel yang
    // terbuka tak bisa ditutup lagi.
    expect(KOMP).toMatch(/className="tb-menu-judul">Code</);
    expect(KOMP).toMatch(/setLogicOpen\(nilai\)/);
  });
});

// ── Gaya tombol aksi ──
//
// Ditulis DENGAN GAYA uiverse, bukan disalin dari satu komponen di sana:
// uiverse.io menolak diambil dari lingkungan ini (HTTP 403), jadi menyebut
// nomor komponen tertentu berarti mengaku menyalin sesuatu yang tak dilihat.
//
// Dirender dengan CSS produksi lalu diukur (harness Playwright):
//   Run 61x25  Simpan 81x25  mati 65x25   radius 999px
//   bilah debug 688x27, kelima tombolnya SETINGGI SAMA (27px)
describe("gaya tombol aksi", () => {
  const CSS = baca("public/styles.css");
  const aturan = (sel) => {
    const i = CSS.indexOf(sel + " {");
    return i < 0 ? "" : CSS.slice(i, CSS.indexOf("\n}", i) + 3);
  };

  test("tombolnya memakai kelas, bukan gaya sebaris", () => {
    // Gaya sebaris tak bisa punya :hover, :active, maupun :focus-visible —
    // dan tanpa yang terakhir, tombol jadi tak terlihat saat dijelajahi Tab.
    expect(BERSIH).toMatch(/className="aksi-btn aksi-run"/);
    expect(BERSIH).toMatch(/className="aksi-btn aksi-simpan"/);
    expect(aturan(".aksi-btn:focus-visible")).toMatch(/outline:/);
    expect(aturan(".dbg-btn:focus-visible")).toMatch(/outline:/);
  });

  test("keadaan mati punya gayanya sendiri, bukan cuma diredupkan", () => {
    expect(aturan(".aksi-btn:disabled")).toMatch(/cursor:\s*not-allowed/);
    expect(aturan(".dbg-btn:disabled")).toMatch(/cursor:\s*not-allowed/);
  });

  test("gerakannya dimatikan bagi yang memintanya", () => {
    // Tombol yang bergerak sendiri bukan sekadar selera: bagi sebagian orang
    // ia memicu mual, dan Run/Debug ditekan berkali-kali dalam semenit.
    // Ada BEBERAPA blok prefers-reduced-motion di lembar gaya ini; yang
    // dicari blok yang benar-benar menyebut tombol ini, bukan yang pertama
    // ketemu — memakai yang pertama membuat ujinya menilai aturan milik
    // komponen lain.
    const semua = [
      ...CSS.matchAll(/@media \(prefers-reduced-motion: reduce\)/g),
    ].map((m) => m.index);
    expect(semua.length).toBeGreaterThan(0);
    const blok = semua
      .map((i) => CSS.slice(i, i + 800))
      .find((b) => b.includes(".aksi-btn"));
    expect(blok).toBeTruthy();
    expect(blok).toMatch(/\.dbg-btn/);
    expect(blok).toMatch(/transition: none/);
    expect(blok).toMatch(/transform: none/);
  });

  test("efek kilau memakai elemen semu, bukan elemen tambahan di DOM", () => {
    // Tombol ini dirender ulang tiap ketukan tombol di editor.
    expect(aturan(".aksi-btn::after")).toMatch(/content: ""/);
    expect(BERSIH).not.toMatch(/className="aksi-kilau"/);
  });

  test("tombol debug BERLABEL, bukan ikon telanjang", () => {
    // Panah step over/into/out nyaris tak terbedakan pada 13px, dan menebak
    // tombol mana yang mana di tengah sesi debug adalah kerugian nyata.
    const bersihSC = tanpaKomentar(SCR);
    for (const l of ["Continue", "Step over", "Step into", "Step out", "Stop"])
      expect(bersihSC).toMatch(new RegExp('"' + l + '"'));
    expect(bersihSC).toMatch(/<span>\{label\}<\/span>/);
  });
});

// ── Dua cacat yang ditemukan saat menilai fitur debug ──
//
//  1. Tombol Debug menyala hanya berdasarkan EKSTENSI. Di mesin ini rdbg dan
//     dlv memang TIDAK terpasang (terukur: {"node":true,"pdb":true,
//     "rdbg":false,"dlv":false}), jadi membuka .rb lalu menekan Debug
//     mengirim perintah yang gagal — sementara UI tetap berkata "Sesi hidup".
//  2. `debugAktif` hanya dibersihkan tombol Stop. Mengetik `.exit` sendiri,
//     menutup panel terminal, atau program yang berhenti sendiri meninggalkan
//     tab DEBUG menyala, dan tombolnya mengetik kata debugger ke shell biasa.
//
// Deteksi akhir sesi diuji terhadap keluaran PTY SUNGGUHAN:
//   prompt debugger terlihat : true
//   sesudah `.exit` manual   : selesai=1
//   sesudah perintah biasa   : tambahan=0   (tak memicu ulang)
describe("keadaan debug jujur terhadap kenyataan", () => {
  const bersihSC = tanpaKomentar(SCR);

  test("ketersediaan debugger diperiksa, bukan ditebak dari ekstensi", () => {
    expect(SRV).toMatch(/req\.url\.startsWith\("\/debug\/tersedia"\)/);
    expect(SRV).toMatch(/const _BINER_DEBUG = \{/);
    expect(BERSIH).toMatch(/ambilDebugTersedia\(\)/);
    expect(BERSIH).toMatch(/debugAda\[jenisDbg!?\] !== false/);
  });

  test("pemeriksaannya TIDAK melahirkan proses", () => {
    // Menjalankan "<debugger> --version" empat kali di thread utama Electron
    // adalah persis kesalahan yang dulu membekukan jendela 2 detik.
    const i = SRV.indexOf('req.url.startsWith("/debug/tersedia")');
    const rute = SRV.slice(i, SRV.indexOf("\n  }", i));
    expect(rute).toMatch(/_adaDiPath\(biner\)/);
    expect(rute).not.toMatch(/exec|spawn/);
  });

  test("PATHEXT ikut dicoba, kalau tidak 'python' selalu terbaca tak ada", () => {
    // Yang duduk di PATH adalah python.exe / dlv.exe, bukan nama telanjangnya.
    const i = SRV.indexOf("function _adaDiPath(");
    const blok = SRV.slice(i, SRV.indexOf("\n}", i));
    expect(blok).toMatch(/process\.env\.PATHEXT/);
    // Nama telanjang tetap dicoba DULU, supaya pemanggil yang sudah menulis
    // akhirannya sendiri ("powershell.exe") tak ikut rusak.
    expect(blok).toMatch(/\["", \.\.\.String\(process\.env\.PATHEXT/);
  });

  test("gagal bertanya = 'belum tahu', bukan 'tidak ada'", () => {
    // Mematikan tombol Debug untuk semua bahasa hanya karena satu permintaan
    // gagal lebih membingungkan daripada perintah yang gagal di terminal.
    expect(BERSIH).toMatch(
      /debugAda === null \|\| debugAda\[jenisDbg!?\] !== false/,
    );
  });

  test("alasan tombol mati DIKATAKAN, bukan cuma diredupkan", () => {
    expect(BERSIH).toMatch(/is not installed on this machine/);
    expect(BERSIH).toMatch(/No known debugger for this file type/);
    expect(bersihSC).toMatch(/pemicuDebug\.alasan/);
  });

  test("akhir sesi dikenali dari prompt, bukan hanya dari tombol Stop", () => {
    expect(bersihSC).toMatch(/const POLA_PROMPT_DEBUG = \{/);
    expect(bersihSC).toMatch(/const POLA_PROMPT_SHELL =/);
    expect(bersihSC).toMatch(/periksaAkhirDebug\(data\.output\)/);
    expect(BERSIH).toMatch(/onDebugSelesai=\{\(\) => setDebugAktif\(null\)\}/);
  });

  test("prompt debugger harus terlihat DULU sebelum akhir bisa disimpulkan", () => {
    // Tanpa itu, prompt shell yang muncul sesaat sebelum debugger sempat mulai
    // langsung dibaca sebagai "sudah selesai".
    expect(bersihSC).toMatch(/sudahLihatRef\.current = true/);
    expect(bersihSC).toMatch(
      /if \(sudahLihatRef\.current && POLA_PROMPT_SHELL\.test/,
    );
  });

  test("ANSI dibuang sebelum prompt dicocokkan di UJUNG", () => {
    // Warna dan pengatur judul menyisipkan escape TEPAT sebelum prompt, jadi
    // pencocokan pada teks mentah selalu meleset.
    const i = bersihSC.indexOf("const periksaAkhirDebug");
    const blok = bersihSC.slice(i, i + 1200);
    // Dicocokkan sebagai TEKS BIASA, bukan regex: pola yang dicari sendiri
    // penuh garis miring terbalik, dan menuliskannya sebagai regex berarti
    // meng-escape escape — bentuk yang gampang salah tanpa ketahuan.
    // Dicocokkan lewat potongan yang TIDAK memuat garis miring terbalik: pola
    // yang dicari sendiri penuh escape, dan menuliskannya di sini berarti
    // meng-escape escape — bentuk yang sudah sekali salah tanpa ketahuan.
    expect(blok.includes("[0-9;?]*[a-zA-Z]")).toBe(true);
    expect(blok.includes("u001b")).toBe(true);
    expect((blok.match(/\.replace\(/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(blok).toMatch(/slice\(-400\)/);
  });

  test("penanda direset tiap perintah baru", () => {
    // Sisa ekor dari sesi sebelumnya bisa membuat sesi yang baru saja mulai
    // langsung dibaca sebagai sudah selesai.
    const i = bersihSC.indexOf("nonceRef.current = perintah.n");
    const blok = bersihSC.slice(i, i + 300);
    expect(blok).toMatch(/ekorRef\.current = ""/);
    expect(blok).toMatch(/sudahLihatRef\.current = false/);
  });

  test("menutup terminal ikut mematikan keadaan debug", () => {
    // Jalur yang PASTI: PTY-nya dibunuh saat panelnya dilepas, jadi tak ada
    // lagi yang bisa menerima perintah debug.
    expect(BERSIH).toMatch(/if \(!terminalOpen\) setDebugAktif\(null\)/);
  });
});
