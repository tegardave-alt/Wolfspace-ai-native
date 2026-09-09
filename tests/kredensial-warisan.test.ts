// Kredensial warisan tak boleh selamat dari migrasi profil.
//
// APA YANG TERJADI. Pemakai memasang rilis, membukanya, dan aplikasinya sudah
// terkonfigurasi penuh: provider terisi, nama model, dan empat digit terakhir
// sebuah kunci API di sebelahnya. Ia tak pernah mengaturnya.
//
// Kuncinya TIDAK berasal dari installer. Dipindai per NILAI atas 12.210 berkas
// dan 504,6 MB: nol temuan. Jalurnya lewat migrasi profil:
//
//   1. electron/main.ts migrateOldUserDataOnce() menyalin Local Storage dari
//      %APPDATA%\Electron -- nama profil BAWAAN setiap aplikasi Electron yang
//      dijalankan tanpa dikemas -- ke setiap profil baru, dengan fs.cpSync
//      mentah-mentah.
//   2. Blok rebrand di index.html menamai quantum_* menjadi wolfspace_*,
//      membawa quantum_cloud beserta kuncinya.
//
// Dan penambalan pertama saya tak cukup: blok rebrand dijaga penanda
// wolfspace_key_migrated, yang IKUT TERSALIN, jadi ia keluar lebih awal dan
// kuncinya tetap duduk di localStorage. Terukur di profil yang benar-benar
// kosong -- pemilih model sudah bersih, kuncinya masih ada.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const baca = (rel) => fs.readFileSync(path.join(AKAR, rel), "utf8");

describe("kredensial warisan tidak diwariskan", () => {
  const HTML = baca("public/index.html");
  const MAIN = baca("electron/main.ts");

  // ── JANGKARNYA KODE, BUKAN PROSA ──
  //
  // Kedua uji ini semula mencari kalimat komentar ("KREDENSIAL WARISAN
  // DIBUANG", "Rebrand: rename kunci localStorage"). Sebuah penyisiran komentar
  // menerjemahkan kalimat itu, indexOf mengembalikan -1, potongannya jadi
  // kosong, dan keduanya gagal karena PROSA-nya — bukan karena kode yang
  // dijaganya berubah sedikit pun. Sekarang keduanya berjangkar pada baris kode
  // yang memang jadi pokok persoalannya, dan komentar boleh ditulis ulang dalam
  // bahasa apa pun tanpa memutus apa-apa.

  /** Awal blok rebrand: satu-satunya tempat penanda itu DIBACA. */
  const iRebrand = HTML.indexOf(
    'localStorage.getItem("wolfspace_key_migrated")',
  );

  test("entri *_cloud dibuang TANPA SYARAT, bukan di dalam blok berpenanda", () => {
    // Kalau pembersihnya duduk di dalam blok yang dijaga wolfspace_key_migrated,
    // ia tak pernah jalan pada profil hasil migrasi -- yaitu satu-satunya kasus
    // yang membuatnya perlu ada.
    expect(iRebrand).toBeGreaterThan(-1);
    // Pembersih tanpa syarat itu: menghapus quantum_*_cloud, dan TIDAK menyebut
    // penanda sama sekali.
    const iBersih = HTML.indexOf('k.indexOf("quantum_") === 0 && /_cloud$/');
    expect(iBersih).toBeGreaterThan(-1);
    expect(iBersih).toBeLessThan(iRebrand);
    const blok = HTML.slice(iBersih, iRebrand)
      .split(String.fromCharCode(10))
      .filter((b) => !b.trim().startsWith("//"))
      .join(" ");
    expect(blok).not.toMatch(/wolfspace_key_migrated/);
    expect(blok).toMatch(/_cloud\$/);
    expect(blok).toMatch(/removeItem/);
  });

  test("rebrand pun menolak membawa *_cloud", () => {
    // Blok rebrand membentang dari penjaga penanda (yang MEMBACA-nya, di atas)
    // sampai baris yang MENULIS-nya (di bawah). Pembuangan *_cloud harus ada di
    // antara keduanya.
    const akhir = HTML.indexOf(
      'localStorage.setItem("wolfspace_key_migrated"',
      iRebrand,
    );
    expect(akhir).toBeGreaterThan(iRebrand);
    const blok = HTML.slice(iRebrand, akhir)
      .split(String.fromCharCode(10))
      .filter((b) => !b.trim().startsWith("//"))
      .join(" ");
    expect(blok).toMatch(/quantum_cloud/);
    expect(blok).toMatch(/removeItem/);
  });

  test("profil 'Electron' tidak lagi diimpor tanpa syarat", () => {
    // Nama itu milik SETIAP aplikasi Electron yang berjalan tanpa dikemas.
    // Mengimpornya begitu saja berarti menyalin Local Storage aplikasi lain.
    const i = MAIN.indexOf("const names = [");
    expect(i).toBeGreaterThan(-1);
    const baris = MAIN.slice(i, MAIN.indexOf("\n", i));
    expect(baris).not.toMatch(/"Electron"/);
    const blok = MAIN.slice(i, i + 260);
    expect(blok).toMatch(/claimLegacyUi/);
    expect(blok).toMatch(/"Electron"/); // hanya di jalur berpenanda
  });
});
