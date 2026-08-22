// ── Kotak ketik harus MENGEMBANG mengikuti isinya ──
//
// Dua kotak ketik di aplikasi ini punya cacat yang sama, dan dua-duanya
// diperbaiki: .composer (tampilan chat) dan .picker-textarea (layar pemilih
// proyek).
//
// TIGA SEBAB kenapa terasa statis:
//   1. Batasnya 160px — hanya memuat ~7 baris.
//   2. Ada DUA angka yang tak pernah sepakat: CSS menahan di 160px sementara
//      JS menghitung sampai 180. Yang lebih kecil selalu menang, jadi selisih
//      20px itu tak pernah ada artinya — sementara keduanya terlihat
//      sama-sama berlaku, dan mengubah salah satunya terasa seperti tak
//      berpengaruh.
//   3. Tingginya hanya dihitung ulang di onChange. Teks yang ditempel atau
//      disetel dari luar tak melewatinya, dan jendela yang berubah lebar
//      mengubah pembungkusan baris tanpa satu pun ketikan.
//
// SEBAB KEEMPAT, dan ini yang sebenarnya menahan composer chat. Tiga di atas
// membuatnya bisa MENAMPUNG banyak teks; ia tetap tak mau MENGEMBANG karena
// `.composer textarea` memakai `flex: 1` di dalam induk yang flex KOLOM. Di
// kolom, sumbu utamanya TINGGI — dan `flex: 1` berarti `flex-basis: 0%`, yang
// MENGGANTIKAN `height` sebagai penentu ukuran. Tinggi hasil grow() memang
// tertulis di elemennya, lalu diabaikan tata letak.
//
// Dua gejala yang terlihat sama dari luar, sebabnya beda: yang satu di batas
// tinggi, yang ini di siapa yang menentukan tingginya.
//
// Terukur di peramban sungguhan (viewport 1280x800, batas 50vh = 400px),
// pada composer CHAT yang sebenarnya — layar pemilih dilewati dulu supaya ia
// benar-benar ter-mount — dan diketik lewat papan ketik asli:
//   kosong      ->  28 px   (composer 110 px)
//   1 baris     ->  28 px
//   2 paragraf  ->  68 px   (composer 150 px)
//   6 paragraf  -> 248 px   (composer 330 px)
//   30 paragraf -> 400 px   (mentok, lalu digulir di dalam kotak)
//   pendek lagi ->  28 px   (menyusut kembali)
//   galat konsol: 0

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const baca = (p) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");
const CSS = baca("public/styles.css");
const KOMP = baca("public/app/Components.tsx");
const SCR = baca("public/app/Screens.tsx");
const tanpaKomentar = (t) =>
  t
    .split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*)/.test(b))
    .join("\n");

const aturan = (sel) => {
  const i = CSS.indexOf(sel + " {");
  return i < 0 ? "" : CSS.slice(i, CSS.indexOf("\n}", i) + 3);
};

describe("batas tinggi: satu angka, bukan dua", () => {
  for (const sel of [".composer textarea", ".picker-textarea"]) {
    test(sel + " memakai batas relatif layar", () => {
      const b = aturan(sel);
      expect(b).toBeTruthy();
      expect(b).toMatch(/--composer-maks: min\(50vh, 460px\)/);
      expect(b).toMatch(/max-height: var\(--composer-maks\)/);
      // 160px adalah batas lama yang membuatnya terasa statis.
      expect(b).not.toMatch(/max-height:\s*160px/);
    });

    test(sel + " menggulir sesudah mentok, bukan memotong", () => {
      // Tanpa ini, baris yang melewati batas tak bisa dijangkau sama sekali.
      expect(aturan(sel)).toMatch(/overflow-y: auto/);
    });
  }

  test("JS MEMBACA batasnya dari CSS, tidak menulis angkanya sendiri", () => {
    for (const src of [KOMP, SCR]) {
      const b = tanpaKomentar(src);
      expect(b).toMatch(/getComputedStyle\(el\)\.maxHeight/);
      // Angka tetap di dalam Math.min itulah bentuk yang dulu menyimpang.
      expect(b).not.toMatch(/Math\.min\(el\.scrollHeight, 1\d\d\)/);
    }
  });
});

describe("siapa yang menentukan tinggi", () => {
  test("textarea composer TIDAK memakai flex: 1", () => {
    // Induknya .composer-input-col adalah flex KOLOM. `flex: 1` di sana berarti
    // flex-basis: 0%, yang menggantikan `height` — jadi tinggi hasil grow()
    // tertulis tapi diabaikan. Terukur sesudah diperbaiki: flex "0 0 auto",
    // dan style.height mengikuti isi (68px pada 2 paragraf, 248px pada 6).
    const b = aturan(".composer textarea");
    expect(b).toMatch(/flex: 0 0 auto/);
    expect(b).not.toMatch(/flex: 1;/);
  });

  test("induknya memang flex kolom — itu yang membuat flex:1 berbahaya", () => {
    // Kalau suatu saat induknya jadi baris, catatan di atas tak lagi berlaku
    // dan uji ini yang akan mengingatkan.
    const induk = aturan(".composer-input-col");
    expect(induk).toMatch(/display: flex/);
    expect(induk).toMatch(/flex-direction: column/);
  });
});

describe("kapan tinggi dihitung ulang", () => {
  test("disetel ke auto dulu supaya bisa MENYUSUT", () => {
    // Tanpa itu scrollHeight tak pernah mengecil saat teks dihapus: kotaknya
    // tumbuh sekali lalu tak mau kembali.
    for (const src of [KOMP, SCR]) {
      const i = src.indexOf("const grow = React.useCallback");
      expect(i).toBeGreaterThan(-1);
      const blok = src.slice(i, i + 700);
      expect(blok.indexOf('el.style.height = "auto"')).toBeGreaterThan(-1);
      expect(blok.indexOf('el.style.height = "auto"')).toBeLessThan(
        blok.indexOf("getComputedStyle"),
      );
    }
  });

  test("ikut nilai teksnya, bukan hanya onChange", () => {
    // Teks yang ditempel atau disetel dari luar tak melewati onChange.
    expect(tanpaKomentar(KOMP)).toMatch(/\}, \[val, grow\]\)/);
    expect(tanpaKomentar(SCR)).toMatch(/\}, \[text, grow\]\)/);
  });

  test("perubahan LEBAR memicu hitung ulang", () => {
    // Composer ikut menyempit saat panel lain dibuka atau pembaginya digeser,
    // dan itu tak menghasilkan event resize jendela sama sekali.
    for (const src of [KOMP, SCR]) {
      const b = tanpaKomentar(src);
      expect(b).toMatch(/new ResizeObserver\(/);
      expect(b).toMatch(/ro\.disconnect\(\)/);
    }
  });

  test("HANYA lebar — tinggi diabaikan supaya tidak memutar sendiri", () => {
    // grow() mengubah TINGGI elemen yang sedang diamati. Bereaksi pada tinggi
    // berarti mengamati akibat dari diri sendiri: itu persis bentuk yang
    // menghasilkan "ResizeObserver loop completed with undelivered
    // notifications", dan pada kasus terburuk memutar sampai jendela tersendat.
    for (const src of [KOMP, SCR]) {
      const b = tanpaKomentar(src);
      expect(b).toMatch(/lebarTerakhir/);
      expect(b).toMatch(
        /el\.clientWidth === lebarTerakhir\) return|lebar === lebarTerakhir\) return/,
      );
    }
  });
});
