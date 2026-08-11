// Loader kotak 3x3 pada baris "sedang berjalan".
//
// Diadaptasi dari uiverse.io (MIT). Yang dijaga di sini bukan tampilannya —
// itu urusan mata — melainkan tiga sifat yang gampang hilang saat seseorang
// menyalin ulang versi aslinya, dan yang ketiganya tak terlihat sampai
// keadaannya kebetulan pas.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const CSS = fs.readFileSync(path.join(AKAR, "public", "styles.css"), "utf8");
const JSX = fs.readFileSync(
  path.join(AKAR, "public", "app", "AgentSteps.jsx"),
  "utf8",
);
const BLOK = CSS.slice(
  CSS.indexOf(".wl-muat {"),
  CSS.indexOf(".aal-thought-header {"),
);

describe("loader baris berjalan", () => {
  test("TANPA id — versi aslinya memakai #sq1..#sq9", () => {
    // ID harus unik dalam satu dokumen. Komponen React bisa dirender lebih
    // dari sekali; begitu itu terjadi, HTML-nya tak sah DAN animasinya
    // menempel ke elemen yang salah. Gejalanya cuma muncul kalau kebetulan
    // ada dua baris berjalan sekaligus, jadi sangat mudah lolos.
    expect(BLOK).not.toMatch(/#sq\d/);
    expect(JSX).not.toMatch(/id="sq\d"/);
    expect(BLOK).toMatch(/:nth-child\(/);
  });

  test("sembilan kotak, sembilan jeda berbeda", () => {
    const jeda = BLOK.match(/animation-delay:\s*\d+ms/g) || [];
    expect(jeda.length).toBe(9);
    expect(new Set(jeda).size).toBe(9);
    expect((JSX.match(/<i \/>/g) || []).length).toBeGreaterThanOrEqual(9);
  });

  test("grid 3x3 lengkap: dua baris dan dua kolom digeser, sisanya dasar", () => {
    // 1,2,3 atas — 7,8,9 bawah — 3n+1 kiri — 3n kanan. Kalau salah satu
    // hilang, kotaknya menumpuk di tengah dan bentuk gridnya lenyap.
    expect(BLOK).toMatch(/:nth-child\(-n \+ 3\)/);
    expect(BLOK).toMatch(/:nth-child\(n \+ 7\)/);
    expect(BLOK).toMatch(/:nth-child\(3n \+ 1\)/);
    expect(BLOK).toMatch(/:nth-child\(3n\)/);
  });

  test("warna mengikuti teksnya, bukan dipatok", () => {
    // Aslinya #ddd. Dipatok begitu, ia jadi tak terbaca di tema terang dan
    // tak ikut berubah saat baris di-hover.
    expect(BLOK).toMatch(/background:\s*currentColor/);
    expect(BLOK).not.toMatch(/background:\s*#ddd/);
  });

  test("hiasan disembunyikan dari pembaca layar", () => {
    // Keadaan sebenarnya sudah dibawa teks di sebelahnya; sembilan kotak
    // kosong yang ikut dibacakan justru mengaburkannya.
    expect(JSX).toMatch(/className="wl-muat" aria-hidden="true"/);
  });

  test("prefers-reduced-motion menghentikan gerakan TANPA menghilangkan tandanya", () => {
    // Yang mematikan animasi melakukannya karena gerakan menyakitinya, bukan
    // karena tak butuh tahu bahwa sesuatu sedang berjalan.
    const i = BLOK.indexOf("prefers-reduced-motion");
    expect(i).toBeGreaterThan(0);
    const sisa = BLOK.slice(i);
    expect(sisa).toMatch(/animation:\s*none/);
    expect(sisa).toMatch(/opacity:\s*0?\.\d+/);
    expect(sisa).not.toMatch(/display:\s*none/);
  });

  test("hanya muncul saat run.busy, bukan permanen", () => {
    const i = JSX.indexOf("{run.busy && (");
    expect(i).toBeGreaterThan(0);
    expect(JSX.slice(i, i + 900)).toMatch(/wl-muat/);
  });
});
