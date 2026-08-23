// ── WOLFSPACE Code-Quality Gate (HARDCODED) ──
//
// KENAPA DI KODE, BUKAN DI PROMPT.
// config/prompts.json menyuruh agent "Write clean, correct code". Itu aspirasi
// tanpa satuan: tak terukur, tak bisa gagal, jadi tak pernah ditegakkan. Hasil
// nyatanya terukur di repo ini — Components.jsx mencapai indentasi 48 spasi
// (24 level), function App() 2.310 baris, dan 62% kelas CSS mati. Sebagian
// besar ditulis oleh agent yang SEDANG membaca prompt "write clean code" itu.
//
// Pola yang sama sudah dipakai dua kali di repo ini dan terbukti:
//   - SYSTEM_RULES di agent/self_agent.cjs ("dipindahkan dari prompt ke sistem
//     untuk kepatuhan 100%")
//   - _HOST_PATH_RE di agent/tools/index.ts (penjaga path host untuk bash)
// Keduanya menegakkan di jalur eksekusi, bukan meminta baik-baik.
//
// PRINSIP RATCHET — ini inti rancangannya.
// Ambang tetap akan melumpuhkan agent: berkas yang SUDAH 48 spasi berarti tiap
// edit ditolak, termasuk edit yang memperbaikinya. Jadi aturannya bukan "harus
// bersih", tapi "TIDAK BOLEH LEBIH BURUK dari sebelumnya". Berkas kotor tetap
// bisa disunting, perbaikan selalu lolos, pemburukan selalu ditolak. Utang
// teknis berhenti bertambah tanpa memblokir pekerjaan.
//
// Berkas BARU tak punya baseline, jadi kena batas keras — di situlah standar
// bersih ditegakkan penuh.

"use strict";

const path = require("path");

// Batas untuk berkas BARU. Longgar dengan sengaja: JSX memang bersarang secara
// alami (komponen > div > div > button > span). 24 spasi = 12 level, cukup untuk
// UI wajar tapi memblokir monster 48 spasi yang ada sekarang.
const NEW_FILE_MAX_INDENT = 24;
const NEW_FILE_MAX_LINES = 800;

// Ekstensi yang dijaga. Bukan .md/.json/.css — aturan indentasi tak bermakna
// di sana, dan CSS punya pola nesting sendiri yang sah.
const GUARDED_EXT = new Set([".js", ".jsx", ".cjs", ".mjs", ".ts", ".tsx"]);

/**
 * Ukur properti struktural yang objektif dan bisa dibandingkan.
 * Sengaja memakai indentasi sebagai proksi kedalaman, bukan AST: proksi ini
 * tahan terhadap sintaks apa pun (JSX, TS, template literal) dan tak bisa
 * gagal-parse — penjaga yang crash sendiri lebih buruk daripada tak ada penjaga.
 */
function measure(content) {
  const lines = String(content || "").split("\n");
  let maxIndent = 0;
  let deepLines = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const m = line.match(/^ +/);
    if (!m) continue;
    const n = m[0].length;
    if (n > maxIndent) maxIndent = n;
    if (n >= 28) deepLines++;
  }
  return { maxIndent, deepLines, lineCount: lines.length };
}

function isGuarded(filePath) {
  return GUARDED_EXT.has(path.extname(String(filePath || "")).toLowerCase());
}

/**
 * Gerbang kualitas. Dipanggil safe-edit.cjs SEBELUM menulis ke disk.
 *
 * @param {string} filePath   path tujuan
 * @param {string} newContent isi yang akan ditulis
 * @param {string|null} oldContent isi lama (null = berkas baru)
 * @returns {{ok: boolean, error?: string, metrics?: object}}
 */
function check(filePath, newContent, oldContent) {
  if (!isGuarded(filePath)) return { ok: true };

  const after = measure(newContent);

  // ── Berkas BARU: batas keras, tak ada baseline untuk ditoleransi ──
  if (oldContent == null) {
    if (after.maxIndent > NEW_FILE_MAX_INDENT) {
      return {
        ok: false,
        metrics: after,
        error:
          `DITOLAK — berkas baru terlalu dalam bersarang: indentasi ${after.maxIndent} spasi ` +
          `(batas ${NEW_FILE_MAX_INDENT} = ${NEW_FILE_MAX_INDENT / 2} level).\n` +
          `PERBAIKI DENGAN: ekstrak bagian terdalam jadi komponen/fungsi terpisah, ` +
          `lalu panggil dari sini. Jangan menulis ulang dengan indentasi dipadatkan — ` +
          `yang diukur adalah struktur, bukan spasi.`,
      };
    }
    if (after.lineCount > NEW_FILE_MAX_LINES) {
      return {
        ok: false,
        metrics: after,
        error:
          `DITOLAK — berkas baru terlalu panjang: ${after.lineCount} baris ` +
          `(batas ${NEW_FILE_MAX_LINES}).\n` +
          `PERBAIKI DENGAN: pecah jadi beberapa modul menurut tanggung jawabnya.`,
      };
    }
    return { ok: true, metrics: after };
  }

  // ── Berkas LAMA: ratchet. Boleh tetap kotor, tak boleh bertambah kotor ──
  const before = measure(oldContent);

  if (after.maxIndent > before.maxIndent) {
    return {
      ok: false,
      metrics: { before, after },
      error:
        `DITOLAK — edit ini MEMPERDALAM sarang: ${before.maxIndent} → ${after.maxIndent} spasi.\n` +
        `Berkas ini memang sudah dalam, dan itu boleh dipertahankan — yang dilarang ` +
        `adalah menambahnya.\n` +
        `PERBAIKI DENGAN: ekstrak blok yang kamu tambahkan jadi komponen/fungsi ` +
        `sendiri di level atas, lalu sisipkan pemanggilnya (satu baris) di posisi ini.`,
    };
  }

  if (after.deepLines > before.deepLines) {
    return {
      ok: false,
      metrics: { before, after },
      error:
        `DITOLAK — edit ini menambah baris sangat dalam (≥28 spasi): ` +
        `${before.deepLines} → ${after.deepLines}.\n` +
        `PERBAIKI DENGAN: pindahkan blok baru ke fungsi/komponen terpisah ` +
        `alih-alih menyisipkannya ke dalam pohon yang sudah dalam.`,
    };
  }

  return { ok: true, metrics: { before, after } };
}

module.exports = {
  check,
  measure,
  isGuarded,
  NEW_FILE_MAX_INDENT,
  NEW_FILE_MAX_LINES,
};
