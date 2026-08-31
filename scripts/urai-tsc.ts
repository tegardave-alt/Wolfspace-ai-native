// Parsing tsc output for the INFO panel.
//
// This lives OUTSIDE server.ts on purpose. server.ts cannot be required from a
// test: requiring it executes the whole backend -- watchers, workers, the lot --
// and the process never exits. Every existing test that needs something from it
// reads the file as TEXT for that reason. A parser that can only be checked by
// pattern-matching its own source is not really checked, so it is a module.

const fs = require("fs");
const path = require("path");

/** The tsc entry point to run: the project's own copy first, WOLFSPACE's second. */
function cariTsc(akar: string): string | null {
  const milikProyek = path.join(
    akar,
    "node_modules",
    "typescript",
    "bin",
    "tsc",
  );
  if (fs.existsSync(milikProyek)) return milikProyek;
  try {
    return require.resolve("typescript/bin/tsc");
  } catch (_) {
    return null;
  }
}

// `file(line,col): error TS1234: message`, which is what --pretty false emits.
// The severity word is captured rather than assumed: tsc emits warnings as well
// as errors, and INFO files them on separate rows.
//
// The code is TWO LETTERS then digits, not literally TS: scripts/pindai-python.py
// deliberately prints the same shape with PY codes so one parser reads both
// compilers instead of each language growing its own.
const POLA_TSC =
  /^(.+?)\((\d+),(\d+)\):\s+(error|warning|info)\s+([A-Z]{2}\d+):\s+(.*)$/;

/**
 * Turns raw tsc output into diagnostic rows.
 *
 * Paths come back RELATIVE to the workspace root. tsc prints them relative to
 * its own cwd, which is the root here, but a tsconfig with `rootDir` elsewhere
 * can still yield an absolute path -- resolving then re-relativising covers both
 * without the panel having to care which it got.
 */
function uraiTsc(keluaran: string, akar: string) {
  const keluar: any[] = [];
  for (const baris of String(keluaran || "").split(/\r?\n/)) {
    const m = POLA_TSC.exec(baris.trim());
    if (!m) continue;
    let berkas = m[1];
    try {
      const rel = path.relative(akar, path.resolve(akar, berkas));
      if (rel && !rel.startsWith("..")) berkas = rel;
    } catch (_) {}
    keluar.push({
      file: berkas.split("\\").join("/"),
      line: Number(m[2]),
      col: Number(m[3]),
      severity: m[4],
      code: m[5],
      message: m[6],
    });
  }
  return keluar;
}

module.exports = { cariTsc, uraiTsc, POLA_TSC };
