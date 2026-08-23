// Panel bisa dipindah sisi — dan geometrinya harus benar di SETIAP kombinasi.
//
// Sekarang ada TIGA panel (terminal, preview, Code), jadi 8 kombinasi sisi.
// Ketiganya diukur di harness geometri Playwright, bukan di sini: berkas ini
// mengunci rumus yang menghasilkan angkanya.
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
const APP = baca("public/app.tsx");
const CSS = baca("public/styles.css");
const KOMP = baca("public/app/Components.tsx");

// Dipakai setiap kali asersinya berbentuk "TIDAK boleh ada X". Berkas-berkas
// ini penuh catatan tentang KENAPA sebuah bentuk ditinggalkan, dan catatan itu
// mengutip bentuknya — jadi tanpa penyaring ini, komentar yang benar justru
// menggagalkan ujinya.
const tanpaKomentar = (t) =>
  t
    .split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join("\n");

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
    expect(t).toMatch(
      /height: "calc\(" \+ pct \* _skalaSisi\("bawah"\) \+ "% - 6px\)"/,
    );
    expect(t).toMatch(
      /"0 0 calc\(" \+ pct \* _skalaSisi\("kanan"\) \+ "% - 6px\)"/,
    );
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
    // Urutannya kini datang dari _orderPanel/_orderPembagi, bukan angka
    // sebaris — lihat tests/posisi-kiri.test.js untuk tabelnya.
    expect(t).toMatch(/order: _orderPanel\(sisi\)/);
  });
});

describe("ukuran dihitung per sumbu, tidak saling potong", () => {
  const T = APP.slice(
    APP.indexOf("const _panelTerbuka = ["),
    APP.indexOf("const gayaPanel ="),
  );

  test("lebar hanya dikurangi panel KANAN, tinggi hanya panel BAWAH", () => {
    // Memakai satu angka untuk dua sumbu membuat chat menyusut dua kali padahal
    // cuma satu panel yang terbuka.
    expect(T).toMatch(/const _jumlahBawah = _jumlahGrup\("bawah"\)/);
    expect(T).toMatch(/100 - _jumlahGrup\("mendatar"\)/);
    // Penjumlahannya menyaring per SUMBU: kiri dan kanan sama-sama memakan
    // lebar, jadi menghitungnya terpisah membuat panel kiri tak ikut
    // mengurangi lebar chat.
    expect(T).toMatch(/_grup\(p\.sisi\) === g \? p\.pct : 0/);
  });

  test("panel DIDAFTAR, tidak dihitung satu per satu", () => {
    // Bentuk lamanya menyebut tiap panel di empat rumus terpisah. Panel ketiga
    // (Code) berarti menyunting keempatnya dan berharap tak ada yang terlewat —
    // dan yang terlewat di sini tak gagal saat dikompilasi, cuma salah angkanya.
    expect(T).toMatch(
      /terminalOpen && \{ sisi: posisi\.terminal, pct: terminalPct \}/,
    );
    expect(T).toMatch(
      /panelOpen && \{ sisi: posisi\.preview, pct: panelPct \}/,
    );
    expect(T).toMatch(/logicOpen && \{ sisi: posisi\.logic, pct: logicPct \}/);
    expect(APP).not.toMatch(/const _terminalKanan =/);
    expect(APP).not.toMatch(/const _previewBawah =/);
  });

  test("jumlah per sisi dibatasi supaya tidak melebihi layar", () => {
    // Tiap pembagi dibatasi 12–75% SENDIRI-SENDIRI. Dengan tiga panel di sisi
    // yang sama, jumlahnya bisa 225% tanpa satu pun melanggar batasnya — dan di
    // wadah yang membungkus, kelebihan sekecil apa pun mendorong panel terakhir
    // turun ke baris berikutnya.
    expect(T).toMatch(/const _JATAH = chatVisible \? 80 : 100/);
    expect(T).toMatch(/if \(jml > _JATAH\) return _JATAH \/ jml/);
  });
});

describe("satu penggeser untuk dua sumbu", () => {
  test("sumbu mengikuti posisi panel, bukan dipatok clientX", () => {
    // Dulu ada dua salinan identik yang keduanya memakai clientX. Begitu panel
    // bisa pindah ke bawah, menggeser pembagi mendatar mengubah ukuran memakai
    // koordinat yang salah sumbu.
    expect(APP).toMatch(
      /const geserPembagi = \(sumbu(?:: \w+)?, set(?:: \w+)?\)/,
    );
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

  test("sisi KIRI ikut divalidasi", () => {
    // Nilai lama tanpa "kiri" tetap sah; yang tak dikenal jatuh ke bawaannya.
    const t = APP.slice(
      APP.indexOf("const [posisi, setPosisi]"),
      APP.indexOf("const sah =") + 200,
    );
    expect(t).toMatch(/v === "kanan" \|\| v === "bawah" \|\| v === "kiri"/);
    expect(APP).toMatch(/chat: sah\(t\.chat, bawaan\.chat\)/);
  });

  test("bawaannya mengikuti kebiasaan: preview kanan, terminal bawah", () => {
    // Terminal dulu di KANAN bersama preview. Untuk keluaran perintah yang
    // berbentuk baris panjang, kolom sempit memaksanya membungkus terus.
    expect(APP).toMatch(/preview: "kanan"/);
    expect(APP).toMatch(/terminal: "bawah"/);
  });
});

// Tombol pindah di TopBar DILEPAS SEMENTARA atas permintaan pemakai, dan
// karena itu ujinya ikut dilepas — bukan dibiarkan gagal. Mesin tata letaknya
// sendiri (state `posisi`, penyimpanan, gaya per-sisi, penggeser dua sumbu)
// TETAP UTUH dan tetap diuji di atas; yang hilang hanya kontrol yang terlihat.
//
// Untuk mengembalikannya: pasang lagi tombol di TopBar (Components.tsx) yang
// memanggil setPosisi, lalu oper prop `posisi`/`setPosisi` dari app.tsx.
// Sementara ini posisinya bisa diubah lewat:
//   localStorage.setItem("wolfspace_posisi",
//     JSON.stringify({ preview: "bawah", terminal: "bawah" }))

// ── Menu ⋮ di ujung kiri bilah atas ──
//
// Opsi tata letak sempat dipasang sebagai dua tombol TERPISAH di bilah atas dan
// dilepas lagi karena terlalu ramai: bilah itu tempat tindakan sehari-hari,
// sementara memindahkan panel dilakukan sekali lalu dilupakan. Menu
// menyembunyikannya tanpa menghilangkannya.
//
// Geometrinya diukur dengan CSS produksi (harness Playwright):
//   bilah   1000x47
//   tombol  22x28 @14,9   warna rgb(255,255,255)
//   menu    208x103 @14,52
// Sebelum `align-self: stretch`, menu muncul di y=43 — MENINDIH garis bawah
// bilah, karena `top: 100%` mengacu ke tinggi TOMBOL (28px), bukan tinggi bilah.
describe("menu tata letak di bilah atas", () => {
  const K = baca("public/app/Components.tsx");
  const C = baca("public/styles.css");

  test("tombolnya putih, tidak diredupkan seperti tetangganya", () => {
    // .panel-toggle-btn adalah SAKLAR yang keadaannya sudah terbaca dari panel
    // yang muncul, jadi ia boleh redup. Ini pintu ke sesuatu yang tersembunyi —
    // kalau ikut diredupkan, menunya tak akan pernah ditemukan.
    const i = C.indexOf(".tb-menu-btn {");
    expect(i).toBeGreaterThan(0);
    expect(C.slice(i, C.indexOf("}", i))).toMatch(/color:\s*#fff/);
  });

  test("ikonnya tiga GARIS mendatar, bukan tiga titik", () => {
    // ⋮ di bilah atas lebih lazim berarti "aksi untuk baris ini"; ☰ dibaca
    // sebagai menu utama, dan itu memang isinya. Digambar dengan <line>, bukan
    // teks "☰": karakter itu tebal dan jaraknya ikut font yang kebetulan
    // terpasang, jadi bentuknya berubah-ubah antar mesin.
    const i = K.indexOf('className={"tb-menu-btn"');
    expect(i).toBeGreaterThan(0);
    const blok = K.slice(i, i + 1400);
    expect((blok.match(/<line /g) || []).length).toBe(3);
    expect(blok).not.toMatch(/<circle /);
    // Tiga garis harus benar-benar SEJAJAR — x yang sama, y yang berbeda.
    const xs = [...blok.matchAll(/x1="([^"]+)" y1="([^"]+)" x2="([^"]+)"/g)];
    expect(xs.length).toBe(3);
    expect(new Set(xs.map((m) => m[1])).size).toBe(1); // x1 sama semua
    expect(new Set(xs.map((m) => m[2])).size).toBe(3); // y1 beda semua
  });

  test("pembungkusnya membentang setinggi bilah", () => {
    // Kalau tidak, `top: 100%` mengacu ke tinggi tombol dan menunya menindih
    // garis bawah bilah.
    const i = C.indexOf(".tb-menu-bungkus {");
    expect(C.slice(i, C.indexOf("}", i))).toMatch(/align-self:\s*stretch/);
  });

  test("menu ditutup oleh klik luar DAN Escape", () => {
    // Hanya salah satunya membuat menu terasa macet.
    expect(K).toMatch(/document\.addEventListener\("mousedown", klik\)/);
    expect(K).toMatch(/e\.key === "Escape" && setMenuOpen\(false\)/);
    expect(K).toMatch(/removeEventListener\("mousedown", klik\)/);
    expect(K).toMatch(/removeEventListener\("keydown", tombol\)/);
  });

  test("pilihan yang SEDANG berlaku ditandai", () => {
    // Tanpa itu menu hanya menawarkan tindakan, tak memberi tahu keadaan.
    expect(K).toMatch(/posisi && posisi\[apa\] === ke \? " aktif" : ""/);
    const i = C.indexOf(".tb-menu-opsi.aktif {");
    expect(i).toBeGreaterThan(0);
  });

  test("prop-nya dioper lagi dari app.tsx", () => {
    expect(APP).toMatch(/posisi=\{posisi\}/);
    expect(APP).toMatch(/setPosisi=\{setPosisi\}/);
  });
});

// ── Chat bisa disembunyikan ──
//
// Gunanya memberi panel preview seluruh layar tanpa menutup chat dan kehilangan
// tempatnya. Dua hal yang mudah salah, keduanya dikunci di sini.
//
// 1. LUBANG. Persentase panel selama ini berarti "bagian layar yang tidak
//    dipakai chat". Begitu chat hilang, angka itu tak berarti apa-apa lagi:
//    terminal 30% + preview 35% di bawah menyisakan 35% pita kosong yang tak
//    ditempati siapa pun. Terukur sesudah diperbaiki:
//      chat sembunyi, preview kanan saja : prev 994x600 @6,0
//      chat sembunyi, keduanya di bawah  : term 1000x271  prev 1000x317
//
// 2. LAYAR KOSONG. Menyembunyikan chat saat tak ada panel lain menghasilkan
//    layar hampa, dan pemakai tak punya petunjuk bahwa jalan kembalinya ada di
//    menu ⋮. Itu jebakan yang dibuat sendiri.
describe("menyembunyikan chat", () => {
  const K = baca("public/app/Components.tsx");
  const C = baca("public/styles.css");

  test("chat-col hanya dirender saat tampil", () => {
    expect(APP).toMatch(/\{chatVisible && \(/);
  });

  test("pilihannya bertahan antar sesi", () => {
    expect(APP).toMatch(
      /localStorage\.getItem\("wolfspace_chat_tampil"\) !== "0"/,
    );
    expect(APP).toMatch(/localStorage\.setItem\("wolfspace_chat_tampil"/);
  });

  test("tanpa chat, panel kanan MELEBAR mengisi baris — sebanding pct-nya", () => {
    // Dengan chat ia memegang jatah tetap supaya chat mengambil sisa; tanpa
    // chat, jatah tetap itu meninggalkan lubang di kanan.
    //
    // Grow-nya sebanding pct, BUKAN "1 1 0%" rata. Dengan satu panel keduanya
    // sama saja; dengan dua panel kanan, grow rata membuat keduanya selebar
    // sama persis dan hasil seretan pembagi hilang tanpa sebab yang terlihat.
    expect(APP).toMatch(/flex: _isiPenuh\s*\n?\s*\? pct \+ " 1 0%"/);
    expect(APP).not.toMatch(/flex: _isiPenuh \? "1 1 0%" :/);
  });

  test("tanpa chat dan semua panel di bawah, tingginya dinormalkan", () => {
    // Kalau tidak: 30% + 35% = 65%, menyisakan 35% pita kosong.
    const S = APP.slice(
      APP.indexOf("const _skalaSisi ="),
      APP.indexOf("const _jumlahBawah ="),
    );
    expect(S).toMatch(
      /g === "bawah" && !chatVisible && !_adaMendatar\) return 100 \/ jml/,
    );
    expect(APP).toMatch(/pct \* _skalaSisi\("bawah"\)/);
  });

  test("baris atas hilang sama sekali kalau tak ada panel kanan", () => {
    // Dicocokkan lewat irisan indeks, bukan satu regex yang memuat escape
    // baris-baru: escape itu sudah dua kali berubah jadi baris baru sungguhan
    // di dalam berkas ini saat dilewatkan alat penyunting, dan hasilnya regex
    // yang tak pernah ditutup.
    const iPenuh = APP.indexOf("const tinggiAtas = _isiPenuh");
    expect(iPenuh).toBeGreaterThan(0);
    expect(APP.slice(iPenuh, iPenuh + 120)).toMatch(/_adaMendatar/);
  });

  test("DUA lapis penjagaan terhadap layar kosong", () => {
    // Menu menolak pilihannya, DAN effect mengembalikan chat kalau panel
    // terakhir ditutup — jalur yang tak lewat menu sama sekali.
    // Code ikut dihitung sejak ia jadi panel sungguhan — kalau tidak,
    // menyembunyikan chat saat HANYA Code terbuka ditolak padahal layarnya
    // tidak akan kosong.
    // \s+ after "=": prettier splits this declaration across two lines. What is
    // guarded is all FOUR conditions, not whether they fit on one line.
    expect(K).toMatch(
      /const buntu =\s+!nilai && !panelOpen && !terminalOpen && !logicOpen/,
    );
    expect(K).toMatch(/disabled=\{buntu\}/);
    expect(APP).toMatch(
      /if \(!chatVisible && !_adaPanel\) setChatVisible\(true\)/,
    );
    expect(APP).toMatch(/const _adaPanel = _panelTerbuka\.length > 0/);
  });

  test("pilihan yang membuntu MENJELASKAN alasannya", () => {
    // Diredupkan tanpa keterangan membuat pemakai mengira menunya rusak.
    expect(K).toMatch(/Open the preview, terminal, or Code panel first/);
    expect(C.indexOf(".tb-menu-opsi.mati {")).toBeGreaterThan(0);
  });
});

// ── Panel kode bisa DISUNTING, bukan cuma dibaca ──
//
// Panel kode di tampilan Logic dibuat readOnly saat ia hanya perlu menampilkan
// berkas hasil agent. Melonggarkan editornya saja tak cukup: tanpa rute tulis,
// ketikan pemakai hidup di memori lalu hilang begitu berkas lain dibuka.
describe("panel kode bisa disunting dan disimpan", () => {
  const APP2 = baca("public/app.tsx");
  const SRV = baca("server.ts");
  const K = baca("public/app/Components.tsx");
  const PANE = APP2.slice(
    APP2.indexOf("function LogicCodePane("),
    APP2.indexOf("function bahasaMonaco("),
  );

  test("editornya tidak lagi readOnly", () => {
    expect(PANE).toMatch(/readOnly: false/);
    expect(PANE).toMatch(/domReadOnly: false/);
  });

  // Kurungannya hidup di _kurungDiAkar dan dipakai semua rute tulis, jadi yang
  // diperiksa fungsi itu — bukan badan tiap rute.
  const KURUNG = SRV.slice(
    SRV.indexOf("function _kurungDiAkar("),
    SRV.indexOf("function qWalk("),
  );

  test("ada rute tulis, dan kurungannya di SERVER bukan di UI", () => {
    // Path datang dari renderer, jadi ia tak boleh dipercaya.
    expect(SRV).toMatch(/req\.url === "\/ww\/tulis-berkas"/);
    expect(SRV).toMatch(/const kurung = _kurungDiAkar\(p\.root, p\.path\)/);
    expect(SRV).toMatch(/if \(kurung\.galat\) return tolak\(/);
    expect(KURUNG).toMatch(/path\.relative\(akar, berkas\)/);
    expect(KURUNG).toMatch(/Q_FORBID\.test\(berkas\)/);
  });

  test("berkas rahasia dipakai SATU pola untuk baca dan tulis", () => {
    // Q_FORBID tak menyebut .env/.pem/.key; pola rahasia dulu hidup di dalam
    // qWalk saja, yang cuma menyaring PEMBACAAN. Rute tulis tanpa pola itu
    // membuat berkas yang disembunyikan dari pohon tetap bisa ditimpa.
    expect(SRV).toMatch(/const Q_RAHASIA =/);
    expect(SRV).toMatch(/const secret = Q_RAHASIA;/);
    expect(KURUNG).toMatch(/Q_RAHASIA\.test\(path\.basename\(berkas\)\)/);
    // Polanya sendiri harus benar-benar menangkap yang dimaksud.
    const pola = eval(
      SRV.slice(SRV.indexOf("const Q_RAHASIA ="))
        .split("\n")
        .slice(0, 2)
        .join("\n")
        .replace("const Q_RAHASIA =", "")
        .replace(/;\s*$/, ""),
    );
    for (const n of [".env", "id.pem", "a.key", "cloud-keys.json"])
      expect(pola.test(n)).toBe(true);
    expect(pola.test("app.tsx")).toBe(false);
  });

  test("perbandingan pakai path.relative, bukan startsWith", () => {
    // "C:\a-lain" diawali "C:\a" secara tekstual tapi bukan di dalamnya.
    expect(KURUNG).toMatch(/dalam\.startsWith\("\.\."\)/);
    expect(KURUNG).not.toMatch(/berkas\.startsWith\(akar\)/);
    // Path yang SAMA dengan akarnya menghasilkan relative "" — itu foldernya
    // sendiri, dan menulisinya melempar EISDIR kalau tak ditolak lebih dulu.
    expect(KURUNG).toMatch(/!dalam \|\|/);
  });

  test("menyimpan memakai berkas yang ISINYA ada di editor", () => {
    // Prop `rel` sudah berubah ke berkas baru sebelum isinya tiba; menyimpan
    // memakai `rel` akan menulis isi berkas LAMA ke nama berkas BARU.
    expect(PANE).toMatch(/const relRef = React\.useRef\(rel\)/);
    expect(PANE).toMatch(/const target = relRef\.current/);
    expect(PANE).toMatch(/relRef\.current = rel/);
  });

  test("menyimpan lewat fetch path-relatif, BUKAN jalur IPC sendiri", () => {
    // app.tsx sudah memasang shim yang membelokkan tiap fetch("/…") ke
    // IPC.invoke("api") di desktop. Menulis jalur IPC lagi di sini membuat
    // salinan kedua dari transport yang sama — dan dua salinan itu sempat
    // tidak sepakat soal bentuk balasannya (r.body vs objek biasa).
    expect(APP2).toMatch(/window\.__wwFetchShimmed/);
    expect(PANE).toMatch(/fetch\("\/ww\/tulis-berkas"/);
    expect(PANE).not.toMatch(/WOLFSPACE\.invoke/);
  });

  test("perubahan yang belum tersimpan terlihat, dan gagal TIDAK dibersihkan", () => {
    expect(PANE).toMatch(/setKotor\(true\)/);
    // Penanda kotor pindah ke dalam TAB-nya, satu per berkas.
    expect(PANE).toMatch(
      /kotorPerBerkas\.current\.get\(t\) \|\| \(t === rel && kotor\)/,
    );
    // Pada kegagalan, penanda kotor harus tetap menyala.
    const gagal = PANE.slice(PANE.indexOf("} catch (e) {"));
    expect(gagal.slice(0, 400)).not.toMatch(/setKotor\(false\)/);
  });

  test("Ctrl+S ditangkap, kalau tidak browser mengambilnya", () => {
    expect(PANE).toMatch(/e\.ctrlKey \|\| e\.metaKey/);
    expect(PANE).toMatch(/e\.preventDefault\(\)/);
  });

  test("menu punya entri Code", () => {
    expect(K).toMatch(/className="tb-menu-judul">Code</);
    expect(K).toMatch(/setLogicOpen\(nilai\)/);
    expect(APP2).toMatch(/logicOpen=\{logicOpen\}/);
    expect(APP2).toMatch(/setLogicOpen=\{setLogicOpen\}/);
  });
});

// ── Tombol "berkas baru" di pohon berkas Logic ──
//
// Dua tombol yang dulu ada di header pohon (Search, Collapse all) tak satu pun
// punya onClick — mereka hiasan sejak awal.
describe("berkas baru di pohon Logic", () => {
  const APP3 = baca("public/app.tsx");
  const SRV3 = baca("server.ts");
  // Dipotong sampai fungsi BERIKUTNYA sesudahnya. Memakai penanda yang
  // letaknya lebih AWAL di berkas menghasilkan irisan kosong, dan uji yang
  // berbentuk "tidak boleh ada X" lalu lulus tanpa memeriksa apa pun.
  const iPohon = APP3.indexOf("function LogicFileTree(");
  const POHON = APP3.slice(iPohon, APP3.indexOf("\nfunction ", iPohon + 1));
  expect(POHON.length).toBeGreaterThan(2000);
  const bersih = tanpaKomentar(POHON);

  test("tombol hiasan Search dan Collapse all sudah tidak ada", () => {
    expect(bersih).not.toMatch(/title="Search"/);
    expect(bersih).not.toMatch(/title="Collapse all"/);
  });

  test("tombolnya benar-benar tersambung, bukan hiasan lagi", () => {
    expect(bersih).toMatch(/title=\{\s*akarAda/);
    // Sejak ada tombol New folder, mulaiBuat menerima JENIS-nya — jadi
    // pemanggilannya berbentuk panah, bukan referensi telanjang.
    expect(bersih).toMatch(/onClick=\{\(\) => mulaiBuat\("berkas"\)\}/);
    expect(bersih).toMatch(/onClick=\{\(\) => mulaiBuat\("folder"\)\}/);
    // Tanpa akar, path yang dikirim jadi omong kosong — tombolnya dimatikan.
    expect(bersih).toMatch(/disabled=\{!akarAda\}/);
  });

  test("rute buat menolak menimpa berkas yang sudah ada", () => {
    // Membuat yang menimpa akan mengosongkan berkas diam-diam kalau namanya
    // kebetulan sudah dipakai.
    const rute = SRV3.slice(
      SRV3.indexOf('req.url === "/ww/buat-berkas"'),
    ).slice(0, 2500);
    expect(rute).toMatch(/return tolak\(409, "file already exists"\)/);
    // flag "wx", bukan cuma existsSync — existsSync saja punya celah antara
    // pemeriksaan dan penulisan.
    expect(rute).toMatch(/flag: "wx"/);
  });

  test("nama bertingkat membuat foldernya sekalian", () => {
    const rute = SRV3.slice(
      SRV3.indexOf('req.url === "/ww/buat-berkas"'),
    ).slice(0, 2500);
    expect(rute).toMatch(/fs\.mkdirSync\(induk, \{ recursive: true \}\)/);
  });

  test("kurungan path dipakai bersama, bukan disalin per rute", () => {
    // Dua salinan aturan keamanan yang sama pasti akan menyimpang.
    expect(SRV3).toMatch(/function _kurungDiAkar\(root, p\)/);
    const jumlah = (SRV3.match(/_kurungDiAkar\(/g) || []).length;
    expect(jumlah).toBeGreaterThanOrEqual(2); // definisi + minimal satu pemakai
  });

  test("berkas baru masuk daftar DAN langsung dibuka", () => {
    expect(APP3).toMatch(/onBuat=\{\(rel(?:: \w+)?\) =>/);
    const sambung = APP3.slice(
      APP3.search(/onBuat=\{\(rel(?:: \w+)?\) =>/),
    ).slice(0, 600);
    expect(sambung).toMatch(/setDevFiles\(/);
    // Membuka berkas kini juga MEMBUKA TAB-nya, bukan sekadar memilihnya.
    expect(sambung).toMatch(/bukaTab\(rel\)/);
  });

  test("pohon tidak lagi disembunyikan hanya karena pratinjau mati", () => {
    // Berkas yang dibuat sendiri tak butuh pratinjau untuk ada; gerbang lama
    // (`!active` saja) akan membuatnya dibuat lalu tak terlihat.
    expect(bersih).toMatch(/\{!active && tree\.length === 0 \?/);
  });

  test("Enter membuat, Escape membatalkan", () => {
    expect(bersih).toMatch(/e\.key === "Enter"/);
    expect(bersih).toMatch(/e\.key === "Escape"/);
    expect(bersih).toMatch(/buatBerkas\(\)/);
    expect(bersih).toMatch(/batalBuat\(\)/);
  });

  test("gagal TIDAK menutup baris ketiknya", () => {
    // Menutupnya akan menelan nama yang salah ketik bersama pesan galatnya.
    const tangkap = bersih.slice(bersih.indexOf("setGalatBuat(String("));
    expect(tangkap.slice(0, 200)).not.toMatch(/setDraf\(null\)/);
  });
});

// ── Code adalah PANEL, bukan lapisan penutup ──
//
// Bentuk lamanya `position:absolute; inset:0; zIndex:60` — satu lapisan yang
// menutupi seluruh area split. Itulah satu-satunya alasan ia cuma bisa penuh
// layar dan tak pernah bisa berbagi tempat dengan terminal atau preview.
describe("Code bisa dibagi tempat dengan panel lain", () => {
  const A = baca("public/app.tsx");
  const K2 = baca("public/app/Components.tsx");
  const bersih2 = tanpaKomentar(A);

  test("bukan lagi lapisan absolut yang menutupi split", () => {
    const i = bersih2.indexOf("{logicOpen && (");
    expect(i).toBeGreaterThan(0);
    const blok = bersih2.slice(i, i + 1200);
    expect(blok).not.toMatch(/position: "absolute"/);
    expect(blok).not.toMatch(/inset: 0/);
    expect(blok).not.toMatch(/zIndex: 60/);
  });

  test("dipakaikan gaya panel dan pembagi yang SAMA dengan yang lain", () => {
    const i = bersih2.indexOf("{logicOpen && (");
    const blok = bersih2.slice(i, i + 1200);
    expect(blok).toMatch(/gayaPanel\(posisi\.logic, logicPct\)/);
    expect(blok).toMatch(/gayaPembagi\(posisi\.logic\)/);
    expect(blok).toMatch(/setLogicPct/);
    // Pembagi mendatar kalau ia di bawah — sama seperti terminal dan preview.
    expect(blok).toMatch(
      /posisi\.logic === "bawah" \? " split-divider-h" : ""/,
    );
    expect(blok).toMatch(/posisi\.logic === "bawah" \? "y" : "x"/);
  });

  test("posisinya ikut disimpan dan DIVALIDASI", () => {
    expect(A).toMatch(/logic: "kanan"/);
    // localStorage dari versi sebelum Code jadi panel tak punya nilai ini;
    // tanpa bawaan, posisinya undefined dan panelnya tak dirender di mana pun.
    expect(A).toMatch(/logic: sah\(t\.logic, bawaan\.logic\)/);
  });

  test("menu punya baris posisi untuk Code", () => {
    // Argumen ketiga menyusul saat tiap baris mendapat pilihan sisinya
    // sendiri; yang dikunci di sini keberadaan barisnya, bukan tanda tutupnya.
    expect(K2).toMatch(/barisPosisi\("logic", "Code",/);
  });

  test("panelnya tidak boleh diperas habis", () => {
    const i = bersih2.indexOf("{logicOpen && (");
    const blok = bersih2.slice(i, i + 1200);
    expect(blok).toMatch(/minWidth: 0/);
    expect(blok).toMatch(/minHeight: 0/);
  });
});

// ── Tombol Run: panel Code -> terminal ──
//
// Terbukti sampai ujung lewat PTY sungguhan: `node "…\halo skrip.js"` dikirim
// sebagai `cmd + "\r"` ke /api/terminal/write, dan keluarannya kembali lewat
// /api/terminal/read berisi teks yang dicetak skripnya.
describe("Run menjalankan berkas di terminal", () => {
  const A = baca("public/app.tsx");
  const SC = baca("public/app/Screens.tsx");
  const bersihA = tanpaKomentar(A);
  const bersihSC = tanpaKomentar(SC);

  // Fungsinya DIAMBIL dari sumber lalu dijalankan — bukan ditulis ulang di
  // sini, supaya yang diuji memang jalur produksi.
  const ambil = (n) => {
    const i = A.indexOf("function " + n + "(");
    if (i < 0) throw new Error("tak ketemu: " + n);
    return A.slice(i, A.indexOf("\n}", i) + 2);
  };
  const iPeta = A.search(/const _PERINTAH_JALAN(?:: [^=]+)? =/);
  const src =
    A.slice(iPeta, A.indexOf("};", iPeta) + 2) +
    "\n" +
    ambil("ekstensiDari") +
    "\n" +
    ambil("perintahJalankan") +
    "\nperintahJalankan";
  // Namanya dibedakan dari yang di dalam `src`: eval berbagi lingkup dengan
  // blok ini, jadi nama yang sama bertabrakan sebelum satu pun uji jalan.
  // TRANSPILED first, exactly as index.html loads a .tsx file. Since app.jsx
  // migrated, the extracted source carries type annotations and a raw eval()
  // stops at the first colon.
  globalThis.self = globalThis;
  const Babel = require(
    require("path").join(__dirname, "..", "public/vendor/babel.min.js"),
  );
  const jalankanCmd = eval(
    Babel.transform(src, { presets: ["typescript"], filename: "jalan.ts" })
      .code,
  );

  test("perintahnya cocok dengan ekstensinya", () => {
    expect(jalankanCmd("/a/b.js")).toBe('node "/a/b.js"');
    expect(jalankanCmd("/a/b.py")).toBe('python "/a/b.py"');
    expect(jalankanCmd("/a/b.ts")).toBe('npx tsx "/a/b.ts"');
    expect(jalankanCmd("/a/b.go")).toBe('go run "/a/b.go"');
  });

  test("path BERSPASI tetap satu argumen", () => {
    // Tanpa tanda kutip, shell memecah "My Project" jadi dua argumen dan
    // perintahnya gagal menunjuk berkas yang tak pernah ada.
    expect(jalankanCmd("C:/My Project/a b.js")).toBe(
      'node "C:/My Project/a b.js"',
    );
  });

  test("yang bukan program mengembalikan null, bukan tebakan", () => {
    // .html tempatnya di panel preview; .json/.md bukan program. Tombolnya
    // dimatikan dengan alasan yang jelas, bukan menjalankan sesuatu yang keliru.
    for (const n of ["/a/i.html", "/a/d.json", "/a/r.md", "/a/tanpaekstensi"])
      expect(jalankanCmd(n)).toBeNull();
  });

  test("Run MENYIMPAN dulu, dan berhenti kalau simpan gagal", () => {
    // Menjalankan tanpa menyimpan berarti menjalankan isi berkas yang LAMA:
    // keluarannya tak cocok dengan yang terlihat di editor, tanpa petunjuk.
    expect(bersihA).toMatch(/const ok = await simpan\(\)/);
    expect(bersihA).toMatch(/if \(!ok\) return/);
    // simpan() harus benar-benar melaporkan hasilnya, bukan void.
    expect(bersihA).toMatch(/setSaveState\("saved"\);\s*\n\s*return true/);
    expect(bersihA).toMatch(/return false/);
  });

  test("status kotor dibaca lewat ref, bukan state yang basi", () => {
    // useCallback memegang nilai dari render saat ia dibuat; membaca `kotor`
    // langsung membuat Run sesudah mengetik melihat "bersih" dan melewatkan
    // simpan tanpa satu pun tanda.
    expect(bersihA).toMatch(/if \(kotorRef\.current\)/);
    expect(bersihA).toMatch(/kotorRef\.current = true/);
    expect(bersihA).toMatch(/kotorRef\.current = false/);
  });

  test("terminal DIBUKA kalau tertutup", () => {
    // Kalau tidak, perintahnya terkirim ke komponen yang tak dirender.
    // Dipotong sampai penutup fungsinya, bukan sepanjang tebakan: sejak jalur
    // DAP ditambahkan di awal fungsi ini, irisan 500 karakter berhenti sebelum
    // sampai ke jalur PTY yang sedang diuji.
    const i = bersihA.indexOf("const jalankanDiTerminal =");
    const j = bersihA.slice(i, bersihA.indexOf("const aksiDebug =", i));
    expect(j).toMatch(/setTerminalOpen\(true\)/);
    expect(j).toMatch(/setPerintahTerminal\(\{ cmd, n: Date\.now\(\) \}\)/);
    // Python dibelokkan ke DAP; sisanya tetap lewat PTY.
    // Sejak js-debug menyusul, yang menentukan bukan lagi satu jenis debugger
    // melainkan peta ekstensi yang punya adapter DAP.
    expect(j).toMatch(/_ADAPTER_DAP\[ekstensiDari\(pathAbsolut\)!?\]/);
    expect(j).toMatch(/mulaiDap\(/);
  });

  test("perintah yang datang sebelum PTY siap DIANTRE, bukan dibuang", () => {
    // Run selagi terminal tertutup membuka terminal DAN mengirim perintah di
    // render yang sama; sesi PTY dibuka lewat fetch, jadi saat itu id-nya null.
    expect(bersihSC).toMatch(/tertundaRef\.current = cmd;/);
    expect(bersihSC).toMatch(/tertundaRef\.current = null;/);
    expect(bersihSC).toMatch(/kirimPerintah\(menunggu\)/);
    // Pelepasannya harus SESUDAH id sesi dipasang.
    const iId = bersihSC.indexOf("sessionIdRef.current = data.id");
    const iLepas = bersihSC.indexOf("kirimPerintah(menunggu)");
    expect(iLepas).toBeGreaterThan(iId);
  });

  test('dikirim dengan "\r", bukan "\n"', () => {
    // PTY membaca carriage return sebagai Enter; "\n" hanya menyisipkan baris
    // baru dan perintahnya menggantung tak dieksekusi.
    // Di dalam regex, "\r" adalah karakter CR yang sebenarnya — sementara yang
    // dicari di sumber justru DUA karakter, garis miring terbalik lalu "r".
    expect(bersihSC).toMatch(/data: cmd \+ "\\r"/);
    expect(bersihSC).not.toMatch(/data: cmd \+ "\\n"/);
  });

  test("berkas yang SAMA bisa dijalankan dua kali", () => {
    // Tanpa nonce, nilai propnya tak berubah dan effect-nya tak menyala lagi.
    expect(bersihSC).toMatch(/nonceRef\.current === perintah\.n/);
    expect(bersihSC).toMatch(/nonceRef\.current = perintah\.n/);
  });

  test("judul Logic tidak lagi membawa keterangan React Flow", () => {
    expect(A).not.toMatch(/React Flow canvas for driving a website/);
  });
});
