// ── CommandChain — Fase 1: genesis + admission ──
//
// Lapisan tipis di atas ledger berantai (audit-log.cjs). Ia menambahkan dua hal
// yang membuat rantai jadi "smart-contract"-like:
//
//   1. GENESIS — ruleset yang DIBEKUKAN saat sesi dimulai dan hash-nya
//      ditambatkan sebagai entri-0 rantai. Tak ada operasi selama sesi yang bisa
//      mengubahnya: bukan model, bukan konten yang disuntikkan lewat prompt-
//      injection, bukan aksi agent. Ini "pastikan terhardcode" sebagai jaminan
//      arsitektural, bukan instruksi yang bisa dibujuk.
//
//   2. ADMISSION — fungsi MURNI (ruleset, capability) -> izin|tolak, deny-by-
//      default. Deterministik: input sama, keputusan sama, selalu. Sebuah
//      operasi ditolak bila bukan kapabilitas yang dideklarasikan genesis.
//
// BATAS JUJUR (docs/COMMANDCHAIN.md §2):
//   - "deterministik" hanya berlaku pada KEPUTUSAN ini, bukan pada eksekusinya.
//   - allowlist, bukan denylist: yang tak ada di kosakata tak bisa dijalankan.
//   - hash-chain tamper-EVIDENT, bukan tamper-PROOF.
"use strict";

const audit = require("./audit-log.cjs");

// Kosakata bawaan Fase 1 — kapabilitas yang MEMANG sudah ditegakkan broker.
// proc.raw (bash mentah) SENGAJA tak ada di sini: ia escape yang diperkenalkan
// Fase 2, off-by-default. Menambahkannya sekarang berarti mengizinkan sesuatu
// yang belum punya penanda/pengurungannya.
const KOSAKATA_DEFAULT = [
  "readFile",
  "writeFile",
  "fetch",
  "network:http",
  "network:https",
  "network:net",
  "network:tls",
  "network:dgram",
];

// Bekukan objek SAMPAI KE DALAM. Object.freeze dangkal masih membiarkan nested
// object diubah — dan ruleset yang bisa diubah sebagian bukan ruleset immutable.
function bekukanDalam(obj) {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) bekukanDalam(obj[k]);
  }
  return obj;
}

// Bangun ruleset dari daftar kapabilitas (+ opsi). Dikembalikan dalam keadaan
// BEKU — pemanggil tak bisa melonggarkannya setelah ini.
function buatRuleset(opts = {}) {
  const kapabilitas = opts.kapabilitas || KOSAKATA_DEFAULT.slice();
  return bekukanDalam({
    versi: 1,
    sesi: opts.sesi || "sesi_" + Date.now().toString(36),
    kapabilitas: kapabilitas.slice().sort(), // urut → hash stabil
    gas: opts.gas || null, // Fase 3
    catatan: "genesis Fase 1 — admission + rantai, tanpa penegakan tambahan",
  });
}

// Admission: MURNI, deny-by-default. Tidak menyentuh I/O, tidak melempar.
function periksa(ruleset, capability) {
  if (!ruleset || !Array.isArray(ruleset.kapabilitas)) {
    return { allow: false, alasan: "tak ada ruleset — deny-by-default" };
  }
  if (ruleset.kapabilitas.includes(capability)) {
    return { allow: true, alasan: null };
  }
  return {
    allow: false,
    alasan: `"${capability}" di luar kosakata genesis [${ruleset.kapabilitas.join(", ")}]`,
  };
}

// Mulai sesi: tulis genesis (entri-0) bila ledger masih kosong, lalu kembalikan
// ruleset beku. Bila ledger SUDAH berisi, genesis tak bisa disisipkan lagi —
// mengembalikan ruleset apa adanya tanpa menulis (rantai yang berjalan tak boleh
// ditulis ulang kepalanya).
function mulaiSesi(opts = {}) {
  const ruleset = buatRuleset(opts);
  audit.catatGenesis(ruleset); // no-op bila ledger tak kosong
  return ruleset;
}

module.exports = {
  KOSAKATA_DEFAULT,
  bekukanDalam,
  buatRuleset,
  periksa,
  mulaiSesi,
  verifikasiRantai: audit.verifikasiRantai,
};
