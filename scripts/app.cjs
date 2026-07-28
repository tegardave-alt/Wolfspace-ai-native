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
const child = spawn(electronExe, [...ELECTRON_FLAGS, mainJs], {
  stdio: "inherit",
  env,
});
child.on("exit", (code) => process.exit(code == null ? 0 : code));
child.on("error", (e) => {
  console.error("Gagal meluncurkan Electron:", e.message);
  process.exit(1);
});
