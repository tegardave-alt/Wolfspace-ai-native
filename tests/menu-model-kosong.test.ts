// Layar tanpa model tak boleh berlagak punya model.
//
// APA YANG DILIHAT PEMAKAI. Menu pemilih model merender SETIAP entri di
// `models`, dan loadModels menaruh satu placeholder di sana saat tak ada apa
// pun: { value: "", label: "No models yet", disabled: true }. Components.tsx
// tak menyaringnya, jadi placeholder itu tampil sebagai sebuah model — lengkap
// dengan deskripsi tetap "Efficient for routine tasks" di bawahnya. Keterangan
// tentang model, pada layar yang justru tak punya model.
//
// Dan baris ringkasnya memakai `|| "Sonnet"`: sebuah nama model yang DIPATOK,
// muncul walau tak satu pun model terpasang. Itu bagian dari keluhan yang sama
// — aplikasi terbaca seperti sudah terkonfigurasi padahal belum.
//
// Screens.tsx sudah menyaring placeholder-nya sejak awal. Dua berkas yang
// menampilkan menu yang sama berbeda perilaku, dan yang satu tak pernah
// diperbaiki bersama yang lain.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const baca = (rel) => fs.readFileSync(path.join(AKAR, rel), "utf8");

const BERKAS = ["public/app/Components.tsx", "public/app/Screens.tsx"];

describe("menu model tanpa model", () => {
  test.each(BERKAS)("%s menyaring placeholder sebelum merender", (rel) => {
    // Tanpa ini, "No models yet" ikut jadi baris model beserta deskripsinya.
    expect(baca(rel)).toMatch(/filter\(\(m: any\) => !m\.disabled\)/);
  });

  test.each(BERKAS)("%s tak memakai nama model yang dipatok", (rel) => {
    // Sebuah literal nama model di jalur fallback tampil sebagai model aktif
    // pada pemasangan yang belum dikonfigurasi sama sekali.
    const src = baca(rel);
    const i = src.indexOf("m.value === modelVal)?.label ||");
    expect(i).toBeGreaterThan(-1);
    const baris = src.slice(i, src.indexOf("}", i));
    expect(baris).not.toMatch(/"Sonnet"|"Opus"|"gpt-|"claude-/i);
    expect(baris).toMatch(/"No model"/);
  });

  test.each(BERKAS)("%s mengatakan keadaan kosong, bukan diam", (rel) => {
    // Menu yang kosong sama sekali tak memberi tahu apa yang harus dilakukan.
    expect(baca(rel)).toMatch(/No model configured yet/);
  });

  test("deskripsi tetap itu hanya menempel pada model NYATA", () => {
    // Teksnya sendiri dibiarkan — yang salah bukan kalimatnya, melainkan
    // munculnya pada baris yang bukan model.
    for (const rel of BERKAS) {
      const src = baca(rel);
      const iFilter = src.indexOf("filter((m: any) => !m.disabled)");
      const iDesc = src.indexOf("Efficient for routine tasks");
      expect(iFilter).toBeGreaterThan(-1);
      expect(iDesc).toBeGreaterThan(iFilter);
    }
  });
});
