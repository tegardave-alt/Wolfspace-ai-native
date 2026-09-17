#!/usr/bin/env node
// app.cjs — the Electron launcher behind `npm run app`.
//
// ROLE IN THE SYSTEM. It clears ELECTRON_RUN_AS_NODE before starting Electron.
// With that variable set, Electron runs as plain Node, require("electron")
// returns no API, and the app dies with "Cannot read properties of undefined
// (reading 'registerSchemesAsPrivileged')". The variable exists for spawning
// certain subprocesses, not for running Electron itself — deleting it here is
// what lets `npm run app` work from PowerShell, cmd and bash without anyone
// having to unset it by hand.
"use strict";
const { spawn } = require("child_process");
const path = require("path");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electronExe = require("electron"); // di konteks node, ini = path ke electron.exe
const mainJs = path.join(__dirname, "..", "electron", "main.js");

// Flag optimisasi memori:
// --js-flags="--max-old-space-size=512 --expose-gc" : batasi V8 heap Node.js di
//   cap the main process's V8 heap at 512 MB and expose global.gc() so GC can
//   be forced periodically.
// --disable-http-cache : matikan disk cache HTTP Chromium (hemat 100-300 MB disk I/O)
const ELECTRON_FLAGS = [
  "--js-flags=--max-old-space-size=512 --expose-gc",
  "--disable-http-cache",
];

// The debug port is opened ONLY on request: WOLFSPACE_PROFILE=1 npm run app
//
// WHY BEHIND AN ENV VAR RATHER THAN ALWAYS ON. An inspector port is a
// full code-execution door into the main process; left permanently open it
// walks past every containment this repo builds. So it is off by default and
// on only while you are
// memburu sesuatu.
//
// TWO ports, because these are different processes and either can be the cause:
//   9333 the MAIN process — the backend lives here (main.js -> core.js ->
//                          server.cjs) and this process also owns the window
//   9444 proses RENDERER — parse 9 MB skrip vendor + kompilasi Babel di browser
//
// Do NOT use --inspect-brk here: the app would hang waiting for a debugger,
// which is not what you want while simply using it.
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
