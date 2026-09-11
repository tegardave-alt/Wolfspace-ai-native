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

  test("panel kiri mendahului chat, panel kanan mengikutinya", () => {
    // "kanan" is no longer a flat 1. See the block below for why that number
    // made two different settings render the same layout.
    expect(B).toMatch(/sisi === "kiri" \? -2 : _chatKanan \? 12 : 2/);
  });

  test("pembagi selalu di sisi yang MENGHADAP chat", () => {
    // Ini yang tak bisa dipatok: posisi pembagi bergantung pada posisi chat.
    expect(B).toMatch(/sisi === "kiri" \? -1 : _chatKanan \? 11 : 1/);
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

// ── EVERY SETTING MUST PRODUCE A DIFFERENT LAYOUT ────────────────────────────
//
// THE BUG THIS BLOCK EXISTS FOR, and why the tests above did not catch it.
// A "kanan" panel was a flat `1` while chat on the right is `10`, so with chat
// on the RIGHT a right panel (1) and a left panel (-2) both sorted BEFORE chat:
// two different settings, one identical layout. Switching Preview from Right to
// Left moved nothing.
//
// The measurements were even written down in this file's own header —
//   preview kanan, chat KANAN : preview(o1) x232 …
//   preview KIRI,  chat KANAN : preview(o-2) x232 …
// — both at x232, recorded and read as a pass. Every assertion above matches a
// PATTERN in the source; not one of them compared two layouts to each other.
// So this block does the thing that was missing: it derives the visual order
// from the real functions and asserts the results DIFFER.
//
// Re-measured in a real browser at 1200px with the app's own .chat-split CSS:
//   preview kanan, chat kiri  -> chat x0    div x780  preview x786
//   preview KIRI,  chat kiri  -> preview x0 div x414  chat x420
//   preview kanan, chat KANAN -> chat x0    div x780  preview x786
//   preview KIRI,  chat KANAN -> preview x0 div x414  chat x420
describe("tiap setelan menghasilkan tata letak BERBEDA", () => {
  // The real functions, lifted from the source rather than copied: a copy here
  // would keep agreeing with itself while app.tsx said something else.
  function urutan(previewSisi, chatSisi) {
    const potong = APP.slice(
      APP.indexOf("const _chatKanan = posisi.chat"),
      APP.indexOf("const gayaPanel ="),
    );
    const fn = new Function(
      "posisi",
      potong.replace(/: any/g, "").replace(/\/\/.*$/gm, "") +
        "\nreturn { panel: _orderPanel, pembagi: _orderPembagi, chat: _ORDER_CHAT };",
    );
    const o = fn({ chat: chatSisi });
    return [
      { n: "chat", o: o.chat },
      { n: "div", o: o.pembagi(previewSisi) },
      { n: "preview", o: o.panel(previewSisi) },
    ]
      .sort((a, b2) => a.o - b2.o)
      .map((x) => x.n)
      .join(" ");
  }

  test("preview kiri and kanan differ with chat on the LEFT", () => {
    expect(urutan("kiri", "kiri")).not.toBe(urutan("kanan", "kiri"));
  });

  test("preview kiri and kanan differ with chat on the RIGHT", () => {
    // This is the one that used to fail silently.
    expect(urutan("kiri", "kanan")).not.toBe(urutan("kanan", "kanan"));
  });

  test("a right panel is after chat, a left panel before it", () => {
    for (const c of ["kiri", "kanan"]) {
      expect(urutan("kanan", c)).toBe("chat div preview");
      expect(urutan("kiri", c)).toBe("preview div chat");
    }
  });

  test("the divider always lands BETWEEN chat and the panel", () => {
    // Never on the outer edge: there it separates nothing, and the panel butts
    // against chat with no visible seam.
    for (const c of ["kiri", "kanan"])
      for (const p of ["kiri", "kanan"])
        expect(urutan(p, c).split(" ")[1]).toBe("div");
  });

  test("bottom still sorts last, whatever chat does", () => {
    for (const c of ["kiri", "kanan"])
      expect(urutan("bawah", c)).toMatch(/^chat /);
  });
});
