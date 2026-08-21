"use strict";
/**
 * Mengambil js-debug — adapter DAP resmi untuk Node/JavaScript, dari
 * microsoft/vscode-js-debug (MIT). Ini adapter YANG SAMA dengan yang dipakai
 * VS Code untuk men-debug JavaScript.
 *
 * KENAPA DIUNDUH, BUKAN DIJADIKAN DEPENDENSI npm. Tak ada paket npm-nya:
 * @vscode/js-debug maupun js-debug-adapter dua-duanya 404 di registry.
 * Microsoft merilisnya sebagai berkas rilis GitHub (`js-debug-dap-*.tar.gz`,
 * ~1,2 MB) — dan itulah yang dipakai klien DAP lain di luar VS Code.
 *
 * Dijalankan sendiri, bukan otomatis saat aplikasi mulai: mengunduh sesuatu
 * diam-diam saat pemakai menekan tombol Debug adalah hal yang tak boleh
 * dilakukan aplikasi tanpa diminta.
 *
 *     node scripts/ambil-js-debug.cjs
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

  // `tar` bawaan Windows 10 1803+ dan bawaan Unix, dipakai alih-alih menambah
  // dependensi npm hanya untuk sekali ekstrak.
  //
  // TAK SATU PUN path Windows dioper ke tar. Dua alasan, dan dua-duanya sudah
  // terbukti di mesin ini:
  //   -f "C:\..."  -> GNU tar membacanya sebagai <host>:<path> gaya rsh dan
  //                   menjawab "Cannot connect to C: resolve failed" — galat
  //                   yang menyebut jaringan untuk berkas di disk lokal;
  //   -C "C:\..."  -> garis miring terbaliknya di-escape, lalu "Cannot open".
  // Jadi tar dijalankan DI DALAM folder arsipnya dengan nama relatif, dan
  // pemindahannya diserahkan ke fs yang memang paham path Windows.
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
