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
  test("15px hanya untuk judul, bukan teks badan", () => {
    // Dua pemakai yang tersisa adalah nama merek dan judul dialog — keduanya
    // heading, dan memang boleh lebih besar.
    const semua = [
      ...CSS.matchAll(/([.#][\w-]+)[^{}]*\{[^}]*font-size: 15px/g),
    ].map((m) => m[1]);
    expect(semua.sort()).toEqual([".brand-name", ".hitl-title"]);
  });
});
