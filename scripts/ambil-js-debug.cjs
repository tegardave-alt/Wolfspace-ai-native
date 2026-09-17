"use strict";
/**
 * ambil-js-debug.cjs — downloads js-debug, the official DAP adapter for
 * Node/JavaScript, from microsoft/vscode-js-debug (MIT). It is the SAME adapter
 * VS Code uses to debug JavaScript.
 *
 * ROLE IN THE SYSTEM. It supplies the adapter that core/dap.ts talks to. Run it
 * once, by hand:
 *
 *     node scripts/ambil-js-debug.cjs
 *
 * WHY A DOWNLOAD AND NOT AN npm DEPENDENCY. There is no npm package —
 * @vscode/js-debug and js-debug-adapter are both 404 in the registry. Microsoft
 * ships it as a GitHub release asset (js-debug-dap-*.tar.gz, ~1.2 MB), which is
 * what every DAP client outside VS Code uses.
 *
 * WHY BY HAND AND NOT ON STARTUP. Downloading something quietly because the
 * user pressed Debug is not a thing an application should do unasked.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

const VERSI = process.env.JS_DEBUG_VERSI || "1.117.0";
const URL =
  "https://github.com/microsoft/vscode-js-debug/releases/download/v" +
  VERSI +
  "/js-debug-dap-v" +
  VERSI +
  ".tar.gz";
const TUJUAN = path.join(__dirname, "..", "vendor", "js-debug");

function unduh(url, keBerkas, sisaRedirect = 5) {
  return new Promise((selesai, gagal) => {
    if (sisaRedirect < 0) return gagal(new Error("terlalu banyak redirect"));
    https
      .get(url, { headers: { "user-agent": "wolfspace" } }, (r) => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          r.destroy();
          return unduh(r.headers.location, keBerkas, sisaRedirect - 1).then(
            selesai,
            gagal,
          );
        }
        if (r.statusCode !== 200)
          return gagal(new Error("HTTP " + r.statusCode + " dari " + url));
        const keluar = fs.createWriteStream(keBerkas);
        r.pipe(keluar);
        keluar.on("finish", () => keluar.close(() => selesai()));
        keluar.on("error", gagal);
      })
      .on("error", gagal);
  });
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jsdbg-"));
  const arsip = path.join(tmp, "js-debug.tar.gz");
  console.log("Mengunduh " + URL);
  await unduh(URL, arsip);
  console.log("  " + fs.statSync(arsip).size + " byte");

  // The `tar` built into Windows 10 1803+ and into Unix, used instead of adding
  // an npm dependency for a single extraction.
  //
  // NO Windows path is passed to tar. Two reasons, both reproduced on this
  // machine:
  //   -f "C:\..."  -> GNU tar membacanya sebagai <host>:<path> gaya rsh dan
  //                   menjawab "Cannot connect to C: resolve failed" — galat
  //                   which talks about the network for a file on local disk;
  //   -C "C:\..."  -> its backslashes are escaped, then "Cannot open".
  // So tar runs INSIDE the archive's own folder with relative names, and the
  // moving is left to fs, which does understand Windows paths.
  execFileSync("tar", ["-xzf", path.basename(arsip)], {
    cwd: path.dirname(arsip),
    stdio: "inherit",
  });
  const hasilEkstrak = path.join(path.dirname(arsip), "js-debug");
  if (!fs.existsSync(hasilEkstrak))
    throw new Error("isi arsip tak seperti yang diharapkan: " + hasilEkstrak);
  fs.rmSync(TUJUAN, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(TUJUAN), { recursive: true });
  fs.cpSync(hasilEkstrak, TUJUAN, { recursive: true });
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (_) {}

  const server = path.join(TUJUAN, "src", "dapDebugServer.js");
  if (!fs.existsSync(server))
    throw new Error("dapDebugServer.js tak ada sesudah diekstrak: " + server);
  console.log("Siap: " + server);
})().catch((e) => {
  console.error("GAGAL: " + e.message);
  process.exit(1);
});
