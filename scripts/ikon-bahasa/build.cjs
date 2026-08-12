// Mengambil ikon bahasa dari material-icon-theme lalu menuliskannya sebagai
// SATU modul JS yang ikut di-vendor.
//
// KENAPA DI-VENDOR, BUKAN DIPAKAI LANGSUNG. Aplikasi ini memuat asetnya sendiri
// tanpa CDN dan tanpa bundler saat jalan; paket aslinya berisi 1250 SVG (1,6 MB)
// sementara yang benar-benar muncul di pohon berkas cuma puluhan. Menjadikannya
// dependensi runtime berarti menanggung seluruhnya demi sebagian kecil.
//
// KENAPA SATU MODUL, BUKAN 30 BERKAS SVG. Tiap berkas terpisah berarti satu
// permintaan HTTP per ikon saat pohon dirender pertama kali. Di-inline, ia ikut
// bundel modul yang memang sudah dimuat.
//
// Sumber: material-icon-theme (MIT) — tema ikon yang sama dengan yang dipakai
// VS Code, jadi ikonnya memang yang dikenali orang, bukan tiruan.
//
// Jalankan: npm install --no-save material-icon-theme && node scripts/ikon-bahasa/build.cjs
"use strict";

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..", "..");
const SUMBER = path.join(AKAR, "node_modules", "material-icon-theme", "icons");
const TUJUAN = path.join(AKAR, "public", "app", "IkonBahasa.jsx");

// Ekstensi -> nama berkas ikon. Beberapa ekstensi berbagi satu ikon (mjs/cjs
// sama-sama javascript), dan itu memang benar: yang dibedakan bahasanya, bukan
// akhiran berkasnya.
const PETA = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "react",
  ts: "typescript",
  tsx: "react_ts",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cs: "csharp",
  php: "php",
  dart: "dart",
  html: "html",
  htm: "html",
  css: "css",
  scss: "sass",
  sass: "sass",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  sh: "console",
  bash: "console",
  ps1: "powershell",
  sql: "database",
  xml: "xml",
  vue: "vue",
  svelte: "svelte",
  md: "markdown",
  markdown: "markdown",
  svg: "svg",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
};

function ambil(nama) {
  const f = path.join(SUMBER, nama + ".svg");
  if (!fs.existsSync(f)) return null;
  let svg = fs.readFileSync(f, "utf8").trim();
  // Ukuran dibuang dari sumbernya supaya pemakai yang menentukan; viewBox
  // dipertahankan karena itu yang menjaga proporsinya.
  svg = svg
    .replace(/\s(width|height)="[^"]*"/g, "")
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return svg;
}

const isi = {};
const hilang = [];
for (const [ext, nama] of Object.entries(PETA)) {
  const svg = ambil(nama);
  if (!svg) {
    hilang.push(ext + " -> " + nama);
    continue;
  }
  isi[ext] = svg;
}

if (hilang.length) {
  console.error("Ikon tak ditemukan:\n  " + hilang.join("\n  "));
  process.exit(1);
}

const keluaran =
  `// DIHASILKAN OLEH scripts/ikon-bahasa/build.cjs — JANGAN disunting tangan.\n` +
  `//\n` +
  `// Ikon berkas per bahasa, diambil dari material-icon-theme (MIT) — tema yang\n` +
  `// sama dengan yang dipakai VS Code, jadi ikonnya memang yang dikenali orang.\n` +
  `// Hanya ekstensi yang benar-benar muncul di pohon berkas yang ikut; paket\n` +
  `// aslinya berisi 1250 SVG dan sebagian besar tak pernah terpakai di sini.\n` +
  `//\n` +
  `// Regenerasi: npm install --no-save material-icon-theme && node scripts/ikon-bahasa/build.cjs\n` +
  `const IKON_BAHASA = ${JSON.stringify(isi, null, 2)};\n`;

fs.writeFileSync(TUJUAN, keluaran, "utf8");
console.log(
  "  " +
    Object.keys(isi).length +
    " ekstensi -> " +
    path.relative(AKAR, TUJUAN) +
    " (" +
    Math.round(keluaran.length / 1024) +
    " KB)",
);
