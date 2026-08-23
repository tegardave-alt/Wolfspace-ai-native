// ── WOLFSPACE Code-Quality Gate (HARDCODED) ──
//
// WHY IN CODE RATHER THAN IN THE PROMPT.
// config/prompts.json tells the agent to "Write clean, correct code". That is an
// aspiration with no unit: unmeasurable, unfailable, therefore never enforced.
// The real result is measurable in this repo — Components.jsx reached 48 spaces
// of indentation (24 levels), function App() ran to 2,310 lines, and 62% of CSS
// classes were dead. Most of it was written by an agent that WAS READING that
// "write clean code" prompt.
//
// The same pattern has been used twice in this repo and proven:
//   - SYSTEM_RULES in agent/self_agent.ts ("moved from the prompt into the
//     system for 100% compliance")
//   - _HOST_PATH_RE in agent/tools/index.ts (the host-path guard for bash)
// Both enforce on the execution path rather than asking nicely.
//
// edit would be refused, including the edit that fixes it. So the rule is not
// "must be clean" but "MUST NOT BE WORSE than before". A dirty file can still be
// edited, an improvement always passes, a worsening always fails. Technical debt
// stops growing without blocking work.
//
// A NEW file has no baseline, so it gets the hard limit — that is where the
// clean standard is enforced in full.

"use strict";

import * as path from "path";

// The limit for NEW files. Generous on purpose: JSX nests naturally (component >
// div > div > button > span). 24 spaces is 12 levels, enough for reasonable UI
// while still blocking the 48-space monsters that exist today.
const NEW_FILE_MAX_INDENT = 24;
const NEW_FILE_MAX_LINES = 800;

// The extensions guarded. Not .md/.json/.css — an indentation rule is meaningless
// there, and CSS has its own legitimate nesting pattern.
const GUARDED_EXT = new Set([".js", ".jsx", ".cjs", ".mjs", ".ts", ".tsx"]);

/**
 * Measure structural properties that are objective and comparable.
 * Indentation is deliberately used as a proxy for depth rather than an AST: this
 * proxy survives any syntax (JSX, TS, template literals) and cannot fail to
 * parse — a guard that crashes on its own is worse than no guard.
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
 * The quality gate. Called by safe-edit.ts BEFORE anything is written to disk.
 *
 * @param {string} filePath   the destination path
 * @param {string} newContent the contents to be written
 * @param {string|null} oldContent the old contents (null = a new file)
 * @returns {{ok: boolean, error?: string, metrics?: object}}
 */
function check(filePath, newContent, oldContent) {
  if (!isGuarded(filePath)) return { ok: true };

  const after = measure(newContent);

  // ── A NEW file: the hard limit, with no baseline to tolerate ──
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

  // ── An EXISTING file: a ratchet. May stay dirty, must not get dirtier ──
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
