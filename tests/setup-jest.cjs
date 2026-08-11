// Penyiapan lingkungan untuk seluruh berkas uji.
//
// KENAPA PENCABUTAN HIBAH DIMATIKAN DI SINI. Jalur AppContainer menjaga satu
// aturan: hanya SATU direktori yang terbuka, yaitu yang sedang dipilih. Jadi
// begitu ada workspace baru dipakai, hibah workspace lain dicabut.
//
// Jest menjalankan berkas uji secara PARALEL, dan tiap berkas memakai worktree
// sementaranya sendiri. Aturan itu lalu bekerja persis sebagaimana mestinya:
// tiap worker mencabut hibah worker lain, dan uji yang tadinya lulus gagal
// dengan "Access is denied" di tempat yang sama sekali tak berhubungan.
// Terukur — tiga berkas uji gagal saat paralel, lulus semua dengan --runInBand.
//
// Yang dimatikan hanya PENCABUTANNYA, bukan pengurungannya: setiap perintah
// tetap berjalan di dalam container, dan setiap uji pelarian tetap menguji
// batas yang sebenarnya. Perilaku pencabutan itu sendiri diuji tersendiri di
// tests/appcontainer-jail.test.js, yang memanggil cabutSemuaKecuali() langsung.
//
// Ini TIDAK berlaku di produksi. Aplikasi menjalankan satu workspace pada satu
// waktu, yang memang asumsi aturan tersebut.
process.env.WOLFSPACE_AC_CABUT = "0";
