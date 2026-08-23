// ── WOLFSPACE Safe-Edit Middleware ──
// A safe replacement for fs.writeFile: snapshot -> sandbox test ->
// apply/rollback. If the code crashes in the sandbox it is rolled back
// automatically and quarantined.

"use strict";

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execSync } from "child_process";
const { createSnapshot, rollback } = require("./snapshot.ts");
const codeQuality = require("./code-quality.ts");

const QROOT = path.resolve(__dirname, "..");
const QUARANTINE = path.join(QROOT, ".wolfspace", "quarantine");
const EXEC_TIMEOUT = 10_000; // ms

function _ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ── Detect the language from a file extension ──
function _detectLang(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  // '.jsx' USED TO BE MISSING from this map, so every JSX write skipped the
  // syntax check entirely — broken JSX landed on disk and was only noticed when
  // Babel failed in the browser (caught by auto-rollback, but AFTER the fact).
  // `node --check` cannot parse JSX, so it takes a separate path.
  const map = {
    ".py": "python",
    ".js": "javascript",
    ".cjs": "javascript",
    ".mjs": "javascript",
    ".jsx": "jsx",
  };
  return map[ext] || null;
}

// ── Find an available Python interpreter ──
function _pythonBin() {
  const bundled =
    process.env.APPDATA &&
    path.join(
      process.env.APPDATA,
      "uv",
      "python",
      "cpython-3.12.10-windows-x86_64-none",
      "python.exe",
    );
  if (bundled && fs.existsSync(bundled)) return `"${bundled}"`;
  return "python";
}

// ── Validasi sintaks tanpa menjalankan kode penuh ──
function _syntaxCheck(content, lang) {
  const tmp = path.join(os.tmpdir(), `_wf_check_${Date.now()}`);
  try {
    if (lang === "python") {
      const src = tmp + ".py";
      fs.writeFileSync(src, content, "utf8");
      execSync(`${_pythonBin()} -m py_compile "${src}"`, {
        timeout: 8000,
        stdio: "pipe",
      });
      fs.rmSync(src, { force: true });
      return { ok: true };
    }
    if (lang === "javascript") {
      const src = tmp + ".js";
      fs.writeFileSync(src, content, "utf8");
      execSync(`node --check "${src}"`, { timeout: 5000, stdio: "pipe" });
      fs.rmSync(src, { force: true });
      return { ok: true };
    }
    if (lang === "jsx") {
      // Use the Babel standalone ALREADY vendored for the UI runtime — the same
      // source of truth that will parse this file in the browser, so passing
      // here means genuinely passing later.
      const B = require(path.join(QROOT, "public", "vendor", "babel.min.js"));
      B.transform(content, { presets: ["react"], filename: "check.jsx" });
      return { ok: true };
    }
    // Other languages get no syntax check and pass straight through.
    return { ok: true };
  } catch (e) {
    const errMsg =
      ((e.stderr || "") + "").trim() || e.message || "Syntax error";
    try {
      fs.rmSync(tmp + (lang === "python" ? ".py" : ".js"), { force: true });
    } catch (_) {}
    return { ok: false, error: errMsg };
  }
}

/**
 * Quarantine code that misbehaved.
 * @param {string} content - the code that crashed
 * @param {string} filePath - the file it was meant to be written to
 * @param {string} reason   - the error message
 */
function quarantine(content, filePath, reason) {
  _ensureDir(QUARANTINE);
  const ts = Date.now();
  const name = `${ts}_${path.basename(filePath)}.json`;
  const data = {
    ts,
    isoTime: new Date(ts).toISOString(),
    targetFile: filePath,
    reason,
    content,
  };
  const dest = path.join(QUARANTINE, name);
  fs.writeFileSync(dest, JSON.stringify(data, null, 2), "utf8");
  console.warn(`[safe-edit] ⚠ Quarantined: ${name} — ${reason}`);
  return dest;
}

/**
 * Write a file safely:
 *   1. Snapshot the old file
 *   2. Check the new code's syntax in a sandbox
 *   3a. Passed -> write to the real file
 *   3b. Failed -> roll back and quarantine the new code
 *
 * @param {string} filePath   - absolute path of the file to write
 * @param {string} newContent - the new contents
 * @returns {{ ok: boolean, snapshotId?: string, quarantineFile?: string, error?: string }}
 */
function safeWriteFile(filePath, newContent) {
  const abs = path.resolve(filePath);
  const lang = _detectLang(abs);

  // 0. The structural quality gate (HARDCODED — see agent/code-quality.ts).
  //    Run BEFORE the snapshot: a refusal here changes nothing on disk, so
  //    there is nothing to roll back. The principle is a ratchet — a dirty file
  //    may be edited but must not get deeper. This enforces on the execution
  //    path what the prompt "write clean code" failed to enforce.
  let oldForGate: any = null;
  try {
    if (fs.existsSync(abs)) oldForGate = fs.readFileSync(abs, "utf8");
  } catch (_) {}
  const gate = codeQuality.check(abs, newContent, oldForGate);
  if (!gate.ok) {
    console.error(
      `[safe-edit] ✘ Edit DITOLAK (kualitas): ${path.basename(abs)}`,
    );
    return { ok: false, error: gate.error, metrics: gate.metrics };
  }

  // 1. Snapshot the existing file (when there is one)
  const snap = createSnapshot([abs], `before-edit:${path.basename(abs)}`);

  // 2. Syntax check in the sandbox (JS/Python only)
  if (lang) {
    const check = _syntaxCheck(newContent, lang);
    if (!check.ok) {
      // Failed -> roll back (the original file is untouched) and quarantine the
      // new code.
      rollback(snap.id); // the original file is unchanged; this is only for log consistency
      const qFile = quarantine(newContent, abs, check.error);
      console.error(
        `[safe-edit] ✘ Edit DITOLAK: ${path.basename(abs)} — ${check.error}`,
      );
      return {
        ok: false,
        snapshotId: snap.id,
        quarantineFile: qFile,
        error: `Syntax error pada kode baru:\n${check.error}`,
      };
    }
  }

  // 3. Passed -> write to the real file
  _ensureDir(path.dirname(abs));
  fs.writeFileSync(abs, newContent, "utf8");
  console.log(
    `[safe-edit] ✔ Edit diterapkan: ${path.basename(abs)} (snapshot: ${snap.id})`,
  );
  return { ok: true, snapshotId: snap.id };
}

module.exports = { safeWriteFile, quarantine };
