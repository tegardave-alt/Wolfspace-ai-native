// Keluaran tiap perintah bisa dilipat SENDIRI-SENDIRI, dan bawaannya tertutup.
//
// KENAPA ADA. Sebelumnya hanya GRUP yang punya lipatan: satu toggle untuk
// "N perintah dieksekusi", lalu semua isinya ikut terbuka. Satu grup bisa
// berisi belasan perintah dengan keluaran panjang, jadi menggulung untuk
// mencari satu hasil berarti melewati semuanya — dan satu-satunya cara
// menyembunyikan yang tak dicari adalah melipat grupnya, yang juga
// menyembunyikan yang sedang dicari.
//
// Grup pun bawaannya TERBUKA (`expanded[group.id] !== false`), jadi begitu
// perintah selesai berjalan keluarannya langsung memenuhi layar tanpa diminta.
//
// DUA HAL YANG DIJAGA DI SINI, dan keduanya mudah hilang tanpa terasa:
//   1. tiap perintah punya kunci lipatannya sendiri, disematkan pada id grup —
//      indeks telanjang membuat perintah ke-0 milik dua grup berbeda
//      membuka-menutup bersamaan
//   2. isi bawaannya TERTUTUP — kalau suatu saat ditulis `!== false`, ia
//      kembali membuka sendiri dan keluhan aslinya kembali
//
// Diuji di tingkat SUMBER, sama seperti tests/monaco-dekat-layar.test.js:
// komponen ini butuh React + Monaco + streaming untuk hidup, dan yang perlu
// dijamin di sini sifat strukturalnya, bukan pikselnya.

const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(
  path.join(__dirname, "..", "public", "app", "AgentSteps.jsx"),
  "utf8",
);

// Blok GroupedActionRow saja, supaya asersi tak tak sengaja cocok dengan
// komponen lain yang kebetulan punya pola serupa.
const BLOK = (() => {
  const i = SRC.indexOf("function GroupedActionRow(");
  const j = SRC.indexOf("function ConsolidatedThoughtCard(");
  expect(i).toBeGreaterThan(0);
  expect(j).toBeGreaterThan(i);
  return SRC.slice(i, j);
})();

describe("lipatan per perintah di dalam grup", () => {
  test("tiap perintah punya kunci lipatan sendiri", () => {
    expect(BLOK).toMatch(/const kunci = group\.id \+ ":" \+ j;/);
  });

  test("kunci disematkan pada id grup, bukan indeks telanjang", () => {
    // `expanded[j]` akan membuat perintah ke-0 di SEMUA grup terikat satu sama
    // lain — bug yang hanya muncul kalau kebetulan ada dua grup terbuka.
    expect(BLOK).not.toMatch(/expanded\[j\]/);
    expect(BLOK).toMatch(/expanded\[kunci\]/);
  });

  test("isi bawaannya TERTUTUP, bukan terbuka", () => {
    // Inti keluhannya: keluaran membuka sendiri begitu perintah selesai.
    // `!!expanded[kunci]` -> tertutup sampai diklik.
    // `expanded[kunci] !== false` -> terbuka sampai diklik. JANGAN.
    expect(BLOK).toMatch(/const isiTerbuka = !!expanded\[kunci\];/);
    expect(BLOK).not.toMatch(/expanded\[kunci\] !== false/);
  });

  test("keluaran hanya dirender saat terbuka", () => {
    // Kalau ToolOutput tetap dirender lalu disembunyikan lewat CSS, editor
    // Monaco-nya tetap dibuat — dan justru jumlah editor hidup itu yang dulu
    // meledak di observer ke-200 (lihat tests/monaco-dekat-layar.test.js).
    expect(BLOK).toMatch(/\{isiTerbuka && \(?\s*<ToolOutput/);
  });

  test("header perintah bisa diklik untuk melipat", () => {
    expect(BLOK).toMatch(/onClick=\{\(\) =>[\s\S]{0,120}setExpanded/);
  });

  test("baris tanpa keluaran tidak berlagak bisa dibuka", () => {
    // Penunjuk tangan pada baris yang tak menyembunyikan apa pun membuat orang
    // mengklik lalu tak terjadi apa-apa — kecil, tapi persis jenis hal yang
    // membuat UI terasa rusak.
    expect(BLOK).toMatch(/const adaIsi = /);
    expect(BLOK).toMatch(/cursor: adaIsi \? "pointer" : "default"/);
  });

  test("status gagal tetap terbaca TANPA membuka isinya", () => {
    // Kalau kegagalan hanya terlihat setelah dibuka, menutup semuanya berarti
    // menyembunyikan justru yang paling perlu dilihat.
    expect(BLOK).toMatch(/!a\.ok && \(/);
  });

  test("grup tetap punya lipatannya sendiri", () => {
    // Perubahan ini menambah tingkat, bukan menggantikannya.
    expect(BLOK).toMatch(/expanded\[group\.id\] !== false/);
  });
});
