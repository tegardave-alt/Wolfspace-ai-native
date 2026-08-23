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

// Let tests require .ts modules directly.
//
// Production installs this hook in server.cjs, but many test files require
// agent/ modules DIRECTLY without ever going through server.cjs. Without this
// line, any module already migrated to TypeScript fails to load under test with
// "Cannot find module" while being perfectly fine in the app.
//
// Note this is separate from tests/transformer-ts.cjs: that one handles the .ts
// files Jest itself loads, this one handles plain require() inside them.
require("../scripts/ts-register.cjs");

// NOTE for anyone tempted to add NODE_OPTIONS=--require here:
// IT WAS TRIED, AND IT DOES NOT WORK. The value is visible in the Jest worker's
// own process.env, but subprocesses spawned by tests receive it EMPTY —
// measured directly. The working approach is the one in scripts/ts-register.cjs:
// every entry point that can reach a .ts module requires the hook itself, so
// `node -e` probes reach it through the module they load first.
