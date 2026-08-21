"use strict";
/**
 * ── Pra-kompres aset statis ──
 *
 * Dijalankan SEKALI (saat build / sesudah aset berubah), bukan per permintaan.
 * Itu bedanya dengan kompresi biasa, dan itu yang membuat pilihan levelnya
 * terbalik dari yang lazim:
 *
 *   per permintaan  -> level rendah, karena tiap milidetik dibayar berulang
 *                      dan di proses utama Electron itu berarti jendela beku
 *   sekali di sini  -> level MAKSIMAL, karena ongkosnya dibayar sekali dan
 *                      tak pernah menyentuh thread yang menggambar apa pun
 *
 * Terukur di sesi ini: brotli kualitas 11 mengunci thread 913 ms untuk berkas
 * 213 KB. Angka itu mustahil diterima saat melayani permintaan — dan sama
 * sekali tak berarti saat dijalankan dari baris perintah.
 *
 *     node scripts/kompres-aset.cjs
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const PUB = path.join(__dirname, "..", "public");
// Hanya yang memang mampat. Gambar dan font modern sudah terkompresi di
// dalamnya; memampatkannya lagi menambah berkas tanpa mengecilkan apa pun.
const BISA = /\.(js|jsx|mjs|cjs|css|html|json|svg|map|txt)$/i;
// Di bawah ini, ongkos header dan perjalanan ekstra lebih besar dari hematnya.
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

    // Dilewati kalau hasilnya sudah lebih baru dari sumbernya. Tanpa ini,
    // menjalankan ulang skrip berarti memampatkan ulang 3,5 MB Monaco setiap
    // kali — pekerjaan yang hasilnya sudah ada.
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
