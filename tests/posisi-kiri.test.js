// ── Sisi KIRI, dan posisi CHAT ──
//
// Panel preview dan Code kini menawarkan kiri/kanan alih-alih kanan/bawah:
// keduanya HALAMAN dan EDITOR, dan yang mereka butuhkan lebar. Terminal tetap
// kanan/bawah — keluaran perintah berbentuk baris panjang, dan kolom sempit
// memaksanya membungkus terus.
//
// Chat ikut bisa dipindah, dan itu yang membuat urutannya tak lagi bisa dipatok
// satu angka: kalau chat di kanan, PEMBAGI milik panel kanan harus pindah ke
// sisi yang menghadap chat. Kalau tidak, garis pemisahnya nyasar ke tepi luar
// dan panelnya menempel ke chat tanpa pemisah sama sekali.
//
// Terukur di peramban sungguhan (1440x900, sidebar 232px), keempat kombinasi:
//   preview kanan, chat kiri  : chat(o0) x232 | div(o0) x1017 | preview(o1) x1023
//   preview KIRI,  chat kiri  : preview(o-2) x232 | div(o-1) x649 | chat(o0) x655
//   preview kanan, chat KANAN : preview(o1) x232 | div(o2) x649 | chat(o10) x655
//   preview KIRI,  chat KANAN : preview(o-2) x232 | div(o-1) x649 | chat(o10) x655
// Pembagi selalu DI ANTARA keduanya; tak ada yang meluber keluar layar.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const baca = (p) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");
const APP = baca("public/app.tsx");
const KOMP = baca("public/app/Components.tsx");
const tanpaKomentar = (t) =>
  t
    .split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join("\n");
const B = tanpaKomentar(APP);

describe("sisi dikelompokkan per SUMBU", () => {
  test("kiri dan kanan dihitung bersama sebagai 'mendatar'", () => {
    // Menghitungnya terpisah berarti panel kiri tak ikut mengurangi lebar chat
    // — chat lalu diminta selebar sisa yang sudah dipakai orang lain, dan panel
    // terakhir terdorong turun ke baris berikutnya.
    expect(B).toMatch(
      /const _grup = \(sisi(?:: \w+)?\) =>\s*\(?sisi === "bawah" \? "bawah" : "mendatar"\)?/,
    );
    expect(B).toMatch(/_jumlahGrup\("mendatar"\)/);
    expect(B).toMatch(/_adaMendatar/);
    // Bentuk lama yang hanya mengenal "kanan" tak boleh tersisa.
    expect(B).not.toMatch(/_jumlahSisi\("kanan"\)/);
    expect(B).not.toMatch(/_adaKanan/);
  });
});

describe("urutan visual", () => {
  test("ditentukan SATU tabel, bukan angka yang tersebar", () => {
    expect(B).toMatch(/const _orderPanel = \(sisi(?:: \w+)?\)/);
    expect(B).toMatch(/const _orderPembagi = \(sisi(?:: \w+)?\)/);
    expect(B).toMatch(/order: _orderPanel\(sisi\)/);
    expect(B).toMatch(/order: _orderPembagi\(sisi\)/);
  });

  test("panel kiri mendahului chat", () => {
    expect(B).toMatch(/sisi === "kiri" \? -2 : 1/);
  });

  test("pembagi selalu di sisi yang MENGHADAP chat", () => {
    // Ini yang tak bisa dipatok: posisi pembagi bergantung pada posisi chat.
    expect(B).toMatch(/sisi === "kiri" \? -1 : _chatKanan \? 2 : 0/);
  });

  test("chat memakai order yang dihitung, bukan 0 tetap", () => {
    expect(B).toMatch(/const _ORDER_CHAT = _chatKanan \? 10 : 0/);
    expect(B).toMatch(/order: _ORDER_CHAT/);
  });

  test("bawah tetap paling akhir, dengan jarak angka", () => {
    // Nilainya sengaja jauh (20) supaya nilai baris pertama bisa disisipkan
    // tanpa bertabrakan — dan 2 sudah dipakai pembagi kanan saat chat di kanan.
    expect(B).toMatch(/sisi === "bawah" \? 20/);
  });
});

describe("pilihan di menu sesuai sifat panelnya", () => {
  test("preview dan Code menawarkan kiri/kanan", () => {
    expect(KOMP).toMatch(
      /barisPosisi\("preview", "Preview panel", \["kanan", "kiri"\]\)/,
    );
    expect(KOMP).toMatch(/barisPosisi\("logic", "Code", \["kanan", "kiri"\]\)/);
  });

  test("terminal tetap kanan/bawah", () => {
    // Keluaran perintah berbentuk baris panjang; kolom sempit memaksanya
    // membungkus terus.
    expect(KOMP).toMatch(
      /barisPosisi\("terminal", "Terminal", \["kanan", "bawah"\]\)/,
    );
  });

  test("chat punya barisnya sendiri, di bawah Code", () => {
    const iCode = KOMP.indexOf('barisPosisi("logic"');
    const iChat = KOMP.indexOf('barisPosisi("chat"');
    expect(iChat).toBeGreaterThan(iCode);
    expect(KOMP).toMatch(/barisPosisi\("chat", "Chat", \["kanan", "kiri"\]\)/);
  });

  test("label sisi diambil dari satu peta", () => {
    // Bentuk lamanya `ke === "kanan" ? "Kanan" : "Bawah"` — dengan tiga sisi ia
    // akan menamai "kiri" sebagai "Bawah".
    expect(KOMP).toMatch(
      /const _NAMA_SISI(: [\w<>, ]+)? = \{\s*kanan: "Right",\s*bawah: "Bottom",\s*kiri: "Left",?\s*\}/,
    );
    expect(tanpaKomentar(KOMP)).not.toMatch(
      /ke === "kanan" \? "Kanan" : "Bawah"/,
    );
  });
});
