#!/usr/bin/env node
// Launcher Electron — membersihkan ELECTRON_RUN_AS_NODE sebelum meluncurkan app.
//
// Kalau env var itu ter-set (mis. '1'), Electron jalan sebagai Node biasa, jadi
// require('electron') tak memberi API → crash "Cannot read properties of undefined
// (reading 'registerSchemesAsPrivileged')". Var itu memang untuk spawn subprocess
// tertentu, bukan untuk menjalankan Electron. Menghapusnya di sini membuat
// `npm run app` jalan di PowerShell / cmd / bash tanpa perlu unset manual.
"use strict";
const { spawn } = require("child_process");
const path = require("path");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electronExe = require("electron"); // di konteks node, ini = path ke electron.exe
const mainJs = path.join(__dirname, "..", "electron", "main.js");

// Flag optimisasi memori:
// --js-flags="--max-old-space-size=512 --expose-gc" : batasi V8 heap Node.js di
//   main process ke 512 MB dan aktifkan global.gc() agar GC bisa dipaksa periodik.
// --disable-http-cache : matikan disk cache HTTP Chromium (hemat 100-300 MB disk I/O)
const ELECTRON_FLAGS = [
  "--js-flags=--max-old-space-size=512 --expose-gc",
  "--disable-http-cache",
];

// Port debug DIBUKA HANYA bila diminta: WOLFSPACE_PROFILE=1 npm run app
//
// KENAPA env, bukan selalu. Port inspector adalah pintu eksekusi kode penuh ke
// proses main — dibiarkan terbuka permanen, ia melewati seluruh pengurungan yang
// dibangun repo ini. Jadi ia mati secara bawaan dan hanya hidup saat Anda sedang
// memburu sesuatu.
//
// DUA port, karena keduanya proses berbeda dan keduanya bisa jadi penyebab:
//   9333 proses MAIN     — backend hidup di sini (main.js -> core.js -> server.cjs)
//                          dan proses ini juga yang memiliki jendela
//   9444 proses RENDERER — parse 9 MB skrip vendor + kompilasi Babel di browser
//
// JANGAN pakai --inspect-brk di sini: app akan menggantung menunggu debugger,
// dan itu bukan yang Anda inginkan saat sekadar memakai aplikasinya.
if (process.env.WOLFSPACE_PROFILE === "1") {
  ELECTRON_FLAGS.push(
    `--inspect=${process.env.WOLFSPACE_PROFILE_PORT_MAIN || 9333}`,
    `--remote-debugging-port=${process.env.WOLFSPACE_PROFILE_PORT_RENDERER || 9444}`,
  );
  console.error(
    "[profil] port debug terbuka (main 9333, renderer 9444).\n" +
      "[profil] jalankan di terminal lain:  npm run profil",
  );
}
const child = spawn(electronExe, [...ELECTRON_FLAGS, mainJs], {
  stdio: "inherit",
  env,
});
child.on("exit", (code) => process.exit(code == null ? 0 : code));
child.on("error", (e) => {
  console.error("Gagal meluncurkan Electron:", e.message);
  process.exit(1);
});
