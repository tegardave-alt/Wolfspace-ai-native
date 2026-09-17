// ── Ukuran dan kerapatan teks dasar ──
//
// DIUKUR DULU, bukan ditebak dari kesan. Yang dilaporkan "terasa besar dan
// kaku" ternyata bukan soal ukuran teksnya: teks pesan memang sudah 13px, dan
// tak ada satu pun elemen berteks yang dirender >= 15px.
//
// Tiga hal lain yang menyebabkannya, dan ketiganya diperbaiki:
//
//   1. Kotak ketik 15px sementara pesannya 13px. Pemakai mengetik pada satu
//      ukuran lalu melihat hasilnya muncul 2px lebih kecil — beda yang terasa
//      tiap kali mengirim pesan, tapi sulit ditunjuk sebabnya.
//   2. `body` tak punya font-size sama sekali, jadi mewarisi bawaan peramban
//      16px — ukuran HALAMAN WEB. Bilah atas termasuk yang mewarisinya.
//   3. `line-height: normal`, yang untuk Plus Jakarta Sans TERUKUR 1.26.
//      Itulah yang terbaca sebagai "kaku": baris saling menempel. Rentang
//      nyaman untuk teks paragraf 1.5–1.65.
//
// Terukur sesudah diperbaiki (viewport 1440x900):
//   body 13px / 1.55      bilah atas 13px / 1.55
//   kotak ketik 13px / 1.55 (chat MAUPUN layar pemilih)
//   pesan pemakai 13px / 1.45
//   sebaran: 13px x6, 11px x5, 12px x2, 14px x1 — tak ada >= 15px
//   galat konsol: 0

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const CSS = fs
  .readFileSync(path.join(AKAR, "public", "styles.css"), "utf8")
  .replace(/\r\n/g, "\n");
const KOMP = fs
  .readFileSync(path.join(AKAR, "public", "app", "Components.tsx"), "utf8")
  .replace(/\r\n/g, "\n");
const aturan = (sel) => {
  const i = CSS.indexOf(sel + " {");
  return i < 0 ? "" : CSS.slice(i, CSS.indexOf("\n}", i) + 3);
};

describe("ukuran dasar", () => {
  test("body punya font-size eksplisit, bukan warisan 16px peramban", () => {
    const b = aturan("body");
    expect(b).toMatch(/font-size: 13px/);
  });

  test("<html> TIDAK disetel — supaya rem tak ikut bergeser", () => {
    // `rem` mengacu ke <html>, bukan <body>. Menyetel <html> akan menggeser
    // setiap nilai rem sekaligus, dan itu perubahan yang jauh lebih luas dari
    // yang dimaksud.
    expect(aturan("html")).not.toMatch(/font-size:/);
    expect(aturan(":root")).not.toMatch(/font-size:/);
  });

  test("kotak ketik seukuran pesan yang dihasilkannya", () => {
    for (const sel of [".composer textarea", ".picker-textarea"]) {
      const b = aturan(sel);
      expect(b).toMatch(/font-size: 13px/);
      expect(b).not.toMatch(/font-size: 15px/);
    }
    // Dan itu memang ukuran gelembung pesannya.
    expect(aturan(".bubble-user")).toMatch(/font-size: 13px/);
    expect(aturan(".bubble-model")).toMatch(/font-size: 13px/);
  });
});

describe("kerapatan baris", () => {
  test("body punya line-height eksplisit, bukan 'normal'", () => {
    // `normal` untuk Plus Jakarta Sans terukur 1.26 — leading rapat, dan itulah
    // sumber kesan "kaku".
    const b = aturan("body");
    expect(b).toMatch(/line-height: 1\.55/);
  });

  test("nilainya di rentang yang nyaman untuk paragraf", () => {
    const m = aturan("body").match(/line-height:\s*([\d.]+)/);
    expect(m).toBeTruthy();
    const lh = parseFloat(m[1]);
    expect(lh).toBeGreaterThanOrEqual(1.45);
    expect(lh).toBeLessThanOrEqual(1.7);
  });

  test("elemen padat tetap punya kerapatannya sendiri", () => {
    // Diwariskan, bukan dipaksakan: label dan baris pohon berkas memang butuh
    // rapat, dan mereka menyetelnya sendiri.
    expect(aturan(".bubble-user")).toMatch(/line-height: 1\.45/);
  });
});

describe("tak ada teks badan yang kembali membesar", () => {
  test("15px hanya untuk judul dan satu angka tampilan, bukan teks badan", () => {
    // Pemakainya adalah nama merek dan JUDUL DIALOG — keduanya heading, dan
    // memang boleh lebih besar. .gh-judul menyusul kemudian: ia judul dialog
    // GitHub, kategori yang sama persis dengan .hitl-title.
    //
    // .info-rail-jml is the fourth, and it is NOT prose: it is the COUNT in the
    // INFO severity rail, whose whole design is that the number is the largest
    // thing in its row while the label beside it stays at body size. A figure
    // read at a glance is the one case where 15px is doing typographic work
    // rather than quietly enlarging body text.
    //
    // Daftarnya sengaja tetap eksplisit, bukan diganti pola seperti /-title$/:
    // yang dijaga bukan penamaannya, melainkan bahwa setiap 15px yang baru
    // ditimbang sekali oleh manusia sebelum masuk.
    const semua = [
      ...CSS.matchAll(/([.#][\w-]+)[^{}]*\{[^}]*font-size: 15px/g),
    ].map((m) => m[1]);
    expect(semua.sort()).toEqual([
      ".brand-name",
      ".gh-judul",
      ".hitl-title",
      ".info-rail-jml",
    ]);
  });
});

// ── TANDA GITHUB SEJAJAR DENGAN HURUF JUDULNYA ──────────────────────────────
//
// APA YANG TERJADI: .gh-head memakai align-items: flex-start, jadi tepi atas
// tanda bertemu tepi atas BLOK judul. Hurufnya tidak mulai di situ — line-height
// 23,25px pada font 15px menyisakan 6,25px leading, separuhnya di atas. Terukur
// di Chromium dengan stylesheet ini:
//
//     tanda  atas 270,69   pusat 280,69
//     baris judul  atas 273,69   pusat 282,19
//     selisih pusat  -1,50px      selisih atas  -3,00px
//
// Sesudah tanda diberi tinggi kotak baris, preserveAspectRatio memusatkannya:
// selisih pusat tanda yang benar-benar digambar tinggal -0,12px.

describe("tanda GitHub sejajar dengan judulnya", () => {
  const kepala = aturan(".gh-head");
  const judul = aturan(".gh-judul");

  test("judul menyatakan sendiri ukuran dan kerapatan barisnya", () => {
    // Kotak baris dihitung dari kedua angka ini. Kalau salah satunya kembali
    // menjadi warisan, ia bisa berubah tanpa siapa pun tahu dan kesejajaran
    // putus tanpa suara.
    expect(judul).toMatch(/font-size: 15px/);
    expect(judul).toMatch(/line-height: 1\.55/);
  });

  test("kotak baris judul dinamai sekali, bukan disalin", () => {
    expect(kepala).toMatch(/--gh-judul-baris: calc\(15px \* 1\.55\)/);
  });

  test("tanda mengambil tinggi kotak baris itu, bukan tinggi dirinya", () => {
    // Inilah yang memindahkan tanda dari tepi kotak ke barisnya. Tanpa ini
    // tanda 20px menggantung 3px terlalu tinggi.
    const svg = aturan(".gh-head > svg");
    expect(svg).toMatch(/height: var\(--gh-judul-baris\)/);
    // flex: none — tanpa ini flexbox boleh mengecilkannya saat ruang sempit,
    // dan tandanya menjadi lonjong.
    expect(svg).toMatch(/flex: none/);
  });

  test("lebarnya tetap datang dari atribut, jadi tanda tidak melar", () => {
    // Hanya height yang diatur CSS. Dengan viewBox dan preserveAspectRatio
    // bawaan, tanda 16x16 diskalakan ke 20x20 lalu dipusatkan di kotak
    // 20x23,25 — terukur: lebar tergambar tetap 20px.
    expect(aturan(".gh-head > svg")).not.toMatch(/width:/);
    expect(KOMP).toMatch(/<Icon\.githubMark width=\{20\} height=\{20\} \/>/);
  });
});
