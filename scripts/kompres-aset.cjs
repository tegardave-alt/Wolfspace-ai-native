"use strict";
/**
 * kompres-aset.cjs — pre-compresses the static assets, once.
 *
 * ROLE IN THE SYSTEM. server.ts serves the .br/.gz files this produces, and
 * SKIPS any that are older than their source — so a stale pair is harmless, it
 * simply is not used. Run it after changing anything under public/:
 *
 *     node scripts/kompres-aset.cjs
 *
 * WHY THE COMPRESSION LEVEL IS THE OPPOSITE OF THE USUAL CHOICE. Compressing
 * per request must stay cheap, because every millisecond is paid again and, in
 * Electron's main process, is paid by the window. Compressing once here can
 * afford the MAXIMUM level, because the cost is paid a single time and never
 * touches a thread that draws anything.
 *
 * Measured: brotli quality 11 held the thread for 913 ms on one 213 KB file —
 * impossible while serving a request, and completely irrelevant from a command
 * line.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PUB = path.join(__dirname, "..", "public");
// Only what actually compresses. Images and modern fonts are already
// compressed internally; compressing them again adds files without shrinking
// anything.
const BISA = /\.(js|jsx|mjs|cjs|css|html|json|svg|map|txt)$/i;
// Below this size, the header cost and the extra round trip outweigh the saving.
const MIN_BYTE = 1024;

let jumlah = 0,
  mentahTotal = 0,
  brTotal = 0,
  gzTotal = 0,
  dilewati = 0;

function jalan(dir) {
  let isi = [];
  try {
    isi = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const e of isi) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      jalan(p);
      continue;
    }
    if (!e.isFile() || !BISA.test(e.name)) continue;
    if (/\.(br|gz)$/i.test(e.name)) continue;
    const st = fs.statSync(p);
    if (st.size < MIN_BYTE) continue;

    // Skipped when the output is already newer than its source. Without this,
    // re-running the script recompresses 3.5 MB of Monaco every time — work
    // whose result already exists.
    const br = p + ".br";
    const gz = p + ".gz";
    const segar =
      fs.existsSync(br) &&
      fs.existsSync(gz) &&
      fs.statSync(br).mtimeMs >= st.mtimeMs &&
      fs.statSync(gz).mtimeMs >= st.mtimeMs;
    if (segar) {
      dilewati++;
      continue;
    }

    const buf = fs.readFileSync(p);
    const hasilBr = zlib.brotliCompressSync(buf, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length,
      },
    });
    const hasilGz = zlib.gzipSync(buf, { level: 9 });
    fs.writeFileSync(br, hasilBr);
    fs.writeFileSync(gz, hasilGz);

    jumlah++;
    mentahTotal += buf.length;
    brTotal += hasilBr.length;
    gzTotal += hasilGz.length;
    const kb = (n) => (n / 1024).toFixed(0).padStart(6);
    console.log(
      kb(buf.length) +
        " KB -> br" +
        kb(hasilBr.length) +
        " KB  gz" +
        kb(hasilGz.length) +
        " KB   " +
        path.relative(PUB, p),
    );
  }
}

jalan(PUB);
const mb = (n) => (n / 1024 / 1024).toFixed(2);
console.log(
  "\n" + jumlah + " berkas dikompres, " + dilewati + " dilewati (sudah segar)",
);
if (jumlah)
  console.log(
    "  mentah " +
      mb(mentahTotal) +
      " MB" +
      "   brotli " +
      mb(brTotal) +
      " MB (" +
      Math.round(100 - (brTotal / mentahTotal) * 100) +
      "% lebih kecil)" +
      "   gzip " +
      mb(gzTotal) +
      " MB (" +
      Math.round(100 - (gzTotal / mentahTotal) * 100) +
      "% lebih kecil)",
  );
