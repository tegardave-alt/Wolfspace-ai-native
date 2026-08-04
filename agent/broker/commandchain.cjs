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

// Kosakata bawaan — kapabilitas yang dideklarasikan genesis.
//
// proc.raw (bash mentah) ADA di sini sejak Fase 2, ON-BY-DEFAULT. Idealnya
// off-by-default (prinsip smart contract: escape harus diminta), TAPI mematikannya
// secara default akan mematahkan agent — seluruh pemakaian bash-nya gagal. Jadi
// kompromi yang jujur: on secara default UNTUK KOMPATIBILITAS, tapi bisa DICABUT
// dari ruleset sesi (buatRuleset({ tanpa: ["proc.raw"] })) dan begitu genesis
// dibekukan tanpa proc.raw, bash BENAR-BENAR mati — tak terbypass di tengah sesi.
// Itulah properti smart contract yang sesungguhnya: bukan "off", tapi "dapat
// dikunci off secara deklaratif dan permanen untuk sesi itu".
const KOSAKATA_DEFAULT = [
  "readFile",
  "writeFile",
  "fetch",
  "network:http",
  "network:https",
  "network:net",
  "network:tls",
  "network:dgram",
  "proc.raw",
  // Membaca berkas yang DISERAHKAN user lewat jembatan lampiran.
  //
  // Terpisah dari readFile, dan bukan sekadar demi kerapian: readFile menerima
  // PATH dan karena itu tunduk pada roots policy. attachment.read menerima
  // HANDLE — tak ada path untuk diperiksa, karena alamat berkasnya tak pernah
  // masuk ke sistem (lihat agent/attachment-bridge.cjs). Memisahkannya membuat
  // sesi bisa dikunci tanpa lampiran (buatRuleset({ tanpa:["attachment.read"] }))
  // tanpa ikut mematikan pembacaan berkas di dalam worktree.
  "attachment.read",
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
//   opts.kapabilitas : daftar eksplisit (mengganti default)
//   opts.tanpa       : cabut kapabilitas tertentu dari default (mis. lockdown
//                      dengan tanpa:["proc.raw"] → bash mati untuk sesi itu)
function buatRuleset(opts = {}) {
  let kapabilitas = opts.kapabilitas || KOSAKATA_DEFAULT.slice();
  if (Array.isArray(opts.tanpa) && opts.tanpa.length) {
    kapabilitas = kapabilitas.filter((k) => !opts.tanpa.includes(k));
  }
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

// Ruleset sesi yang berlaku, dengan genesis dipastikan ada. Dipakai pemanggil
// di luar broker (mis. tool bash) yang perlu memeriksa admission terhadap ruleset
// yang SAMA. Disimpan di memori modul supaya seluruh proses berbagi satu ruleset
// sesi — bukan membuat yang baru tiap panggilan.
let _ruleset = null;
function sesiRuleset() {
  if (!_ruleset) {
    // Lockdown deklaratif tanpa ubah kode: WOLFSPACE_CC_TANPA=proc.raw mengunci
    // eksekusi shell mentah untuk sesi ini. Dibaca SEKALI saat genesis dibekukan
    // — setelah itu tak bisa dilonggarkan, persis prinsipnya.
    const tanpa = (process.env.WOLFSPACE_CC_TANPA || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    _ruleset = mulaiSesi({ tanpa });
  }
  return _ruleset;
}

// Catat satu transaksi ke rantai. Passthrough tipis ke audit-log (yang merantai),
// supaya pemanggil punya SATU dependensi CommandChain, bukan dua.
function catat(entry) {
  return audit.catat(entry);
}

module.exports = {
  KOSAKATA_DEFAULT,
  bekukanDalam,
  buatRuleset,
  periksa,
  mulaiSesi,
  sesiRuleset,
  catat,
  verifikasiRantai: audit.verifikasiRantai,
};
