// code-quality.ts — the gate that stops the codebase getting structurally
// worse, enforced on the write path rather than asked for in a prompt.
//
// WHY IN CODE, NOT IN THE PROMPT. config/prompts.json already says "write
// clean, correct code" — an aspiration with no unit, so it can never fail and
// was never enforced. The result is measurable here: Components.jsx reached 48
// spaces of indentation, function App() ran to 2,310 lines, and 62% of CSS
// classes were dead, all written by an agent that WAS reading that prompt. The
// two rules in this repo that do hold (SYSTEM_RULES in self_agent.ts,
// _HOST_PATH_RE in tools/index.ts) both moved onto the execution path.
//
// THE RULE IS RELATIVE, NOT ABSOLUTE. An absolute "must be clean" would refuse
// every edit to an already-dirty file, including the edit that cleans it. So
// the rule is MUST NOT BE WORSE than before: a dirty file stays editable, an
// improvement always passes, a worsening always fails, and the debt stops
// growing without blocking work. A NEW file has no baseline, so it gets the
// hard limit — that is where the clean standard applies in full.
//
// CONNECTS TO
//   imports  path only
//   used by  agent/safe-edit.ts and agent/tools/index.ts, on every write

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
          `REFUSED — the new file is nested too deeply: indentation of ${after.maxIndent} spaces ` +
          `(limit ${NEW_FILE_MAX_INDENT} = ${NEW_FILE_MAX_INDENT / 2} levels).\n` +
          `FIX BY: extracting the deepest part into a separate component/function, ` +
          `then call it from here. Do not rewrite it with flattened indentation — ` +
          `what is measured is structure, not whitespace.`,
      };
    }
    if (after.lineCount > NEW_FILE_MAX_LINES) {
      return {
        ok: false,
        metrics: after,
        error:
          `REFUSED — the new file is too long: ${after.lineCount} lines ` +
          `(limit ${NEW_FILE_MAX_LINES}).\n` +
          `FIX BY: splitting it into several modules by responsibility.`,
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
        `REFUSED — this edit DEEPENS the nesting: ${before.maxIndent} -> ${after.maxIndent} spaces.\n` +
        `This file is already deep, and that is fine to leave as is — what is forbidden ` +
        `is making it deeper.\n` +
        `FIX BY: extracting the block you added into its own component/function ` +
        `at the top level, then insert a one-line call to it in this spot.`,
    };
  }

  if (after.deepLines > before.deepLines) {
    return {
      ok: false,
      metrics: { before, after },
      error:
        `REFUSED — this edit adds very deep lines (>=28 spaces): ` +
        `${before.deepLines} → ${after.deepLines}.\n` +
        `FIX BY: moving the new block into a separate function/component ` +
        `instead of inserting it into a tree that is already deep.`,
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
