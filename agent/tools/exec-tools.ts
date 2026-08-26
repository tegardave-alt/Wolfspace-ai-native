// Execution tools (bash, terminal, workspace)
import * as fs from "fs";
import * as path from "path";
import { exec, spawn } from "child_process";
const { resolveDiskPath } = require("./disk-tools.ts");
const { QROOT } = require("./file-tools.ts");

// The PTY module behind the terminal_open/write/read/close tools.
//
// BEFORE: require('../server.cjs') — pulling in the entire server just to get a
// few terminal functions. server.cjs STARTS AN HTTP SERVER as a side effect of
// being required, so that call never returned; try/catch caught nothing because
// it was not an exception but a hang/circular load. The result was term = null
// PERMANENTLY, and all three terminal tools ALWAYS replied "terminal
// unavailable (node-pty is not installed)" — a misleading message, since
// node-pty was installed perfectly well.
//
// NOW: straight to core/terminal.ts, which exports exactly the API used here
// (create/write/readBuffer/destroy) and loads with no side effects.
let term: any;
try {
  term = require("../../core/terminal.ts");
} catch (_) {
  term = null;
}

// ── Workspace helpers ──
const WORKSPACE = path.join(QROOT, "workspace");
try {
  fs.mkdirSync(WORKSPACE, { recursive: true });
} catch {}
function wsResolve(p) {
  const dest = path.resolve(WORKSPACE, (p || "").replace(/^[\\/]+/, ""));
  if (dest !== WORKSPACE && !dest.startsWith(WORKSPACE + path.sep))
    throw new Error("path di luar workspace");
  return dest;
}
function wsList(sub: any) {
  const root = wsResolve(sub || "");
  const out: any[] = [];
  (function walk(dir: any, depth: number = 0) {
    if (out.length > 300 || depth > 8) return;
    let ents: any;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (/^(node_modules)$/.test(e.name)) continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp, depth + 1);
      else {
        let sz = 0;
        try {
          sz = fs.statSync(fp).size;
        } catch {}
        out.push(
          path.relative(WORKSPACE, fp).replace(/\\/g, "/") + " (" + sz + "b)",
        );
      }
    }
  })(root);
  return out.length ? out.join("\n") : "(workspace kosong)";
}
/**
 * Runs one command in the workspace and resolves with its stdout.
 *
 * OVERFLOW IS TRUNCATION, NOT FAILURE. Both branches below used to pass
 * maxBuffer: 200 * 1024 and reject on overflow, so a command whose only sin was
 * being talkative returned nothing at all — the output had already been
 * produced, and it was thrown away for being long. The ceiling now comes from
 * agent/anggaran.ts, and what still exceeds it comes back cut, with a line
 * saying so.
 *
 * Only the overflow case is softened. Every other failure — non-zero exit, the
 * 120 s timeout, a missing interpreter — still rejects and is reported, because
 * those mean the command did not do what was asked.
 *
 * NOTE, deliberately not changed here: the javascript branch slices its result
 * to 4000 chars and the python branch does not. That difference predates this
 * change and altering it would silently shorten python output that callers may
 * rely on, so it is named rather than "fixed" in passing.
 */
function _jalankan(cmd) {
  const batas = require("../anggaran.ts").EXEC_MAKS_BUFFER;
  return new Promise<string>((resolve, reject) => {
    exec(
      cmd,
      { cwd: WORKSPACE, timeout: 120000, encoding: "utf8", maxBuffer: batas },
      (error: any, stdout: any) => {
        if (error && /maxBuffer/i.test(String(error.message)))
          // The notice goes FIRST, not last. The javascript branch slices its
          // result to the first 4000 chars, so a marker appended to the end of
          // a multi-megabyte string would be cut off by the very truncation it
          // was there to announce.
          return resolve(
            "[output truncated: over " +
              Math.round(batas / 1048576) +
              " MB]\n" +
              String(stdout || ""),
          );
        if (error) return reject(error);
        resolve(stdout);
      },
    );
  });
}

let activeExecs = 0;
async function runInWorkspace(lang, code) {
  if (activeExecs >= 2)
    return {
      ok: false,
      error: "RATE_LIMIT: Terlalu banyak eksekusi bersamaan (max 2)",
    };
  activeExecs++;
  const l = (lang || "").toLowerCase();
  try {
    if (l === "javascript" || l === "js") {
      fs.writeFileSync(path.join(WORKSPACE, "_run.cjs"), code, "utf8");
      const out = await _jalankan(`"${process.execPath}" _run.cjs`);
      return { ok: true, output: (out || "").slice(0, 4000) };
    }
    if (l === "python" || l === "py") {
      fs.writeFileSync(path.join(WORKSPACE, "_run.py"), code, "utf8");
      const out = await _jalankan("python _run.py");
      return { ok: true, output: out };
    }
    return {
      ok: false,
      error: 'RUN supports python or javascript (got "' + lang + '")',
    };
  } catch (e) {
    return {
      ok: false,
      output: (e.stdout || "").toString(),
      error: ((e.stderr || "") + "").trim() || e.message,
    };
  } finally {
    activeExecs--;
  }
}

module.exports = {
  WORKSPACE,
  wsResolve,
  wsList,
  runInWorkspace,
  term,
};
