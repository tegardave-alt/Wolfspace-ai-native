// File operations for WOLFSPACE source code
import * as fs from "fs";
import * as path from "path";
import * as util from "util";
import { exec } from "child_process";
const execP = util.promisify(exec);

// ── WOLFSPACE source root + guardrails ──
const QROOT = path.resolve(__dirname, "..", "..");
// What the agent is allowed to WRITE. Reading is governed separately.
//
// `ts` and `tsx` were MISSING here until this line was fixed, and the effect was
// not small: after the TypeScript migration moved nearly the whole codebase to
// .ts/.tsx, every one of those paths was refused as "path is not writable" —
// agent/anggaran.ts, public/app.tsx, public/app/Config.tsx, all of it. The agent
// could still edit .cjs and .jsx, which by then was almost nothing. So it had
// quietly lost the ability to edit its own source.
//
// It came from commit 1ff40be, the phase that moved this file to TypeScript and
// carried the regex across unchanged. The extension list was the one thing in it
// that the migration invalidated.
//
// tests/qresolve.test.ts asserts exactly this and WOULD have caught it — but it
// was named .test.cjs, and jest's testMatch only covers [tj]s, so it had never
// run. A test that stops running is worse than no test: it still looks like
// protection.
//
// The shape of the boundary is unchanged — same directories, same depth. Only
// the extension lists gained the migrated forms.
const Q_ALLOWED =
  /^(server\.cjs|[\w-]+(?:\.[\w-]+)*\.(cjs|ts)|[\w-]+(?:\.[\w-]+)*[\\/][\w-]+(?:\.[\w-]+)*\.(cjs|ts)|agent[\\/][\w-]+(?:\.[\w-]+)*[\\/][\w-]+(?:\.[\w-]+)*\.(cjs|ts)|config\.json|config[\\/][\w-]+(?:\.[\w-]+)*\.json|public[\\/].+\.(jsx|tsx|css|html|js|ts|json))$/;
const Q_FORBID =
  /(^|[\\/])(cloud-keys\.json|node_modules|_agent_backups|dist-app|build|\.dart_tool|workspace)([\\/]|$)/;
function qResolve(p, mustBeEditable) {
  const rel = (p || "")
    .trim()
    .replace(/^[`"']+|[`"']+$/g, "")
    .replace(/^\//, "");
  const dest = path.resolve(QROOT, rel);
  if (dest !== QROOT && !dest.startsWith(QROOT + path.sep))
    throw new Error("path di luar root WOLFSPACE");
  const relNorm = path.relative(QROOT, dest).replace(/\\/g, "/");
  if (Q_FORBID.test(relNorm)) throw new Error("path terlarang: " + relNorm);
  if (
    mustBeEditable &&
    !Q_ALLOWED.test(relNorm) &&
    !Q_ALLOWED.test(relNorm.replace(/\//g, "\\\\"))
  )
    throw new Error("path is not writable: " + relNorm);
  return dest;
}
function qWalk(filterRe) {
  const skip =
    /^(node_modules|_agent_backups|dist-app|workspace|build|\.dart_tool|vendor|\.wolfspace|\.asar-pack|\.git)$/;
  const secret =
    /(cloud-keys\.json|\.env|\.pem$|\.key$|secret|credential|token)/i;
  // Noise files: backups, copies, temp files that are NOT real source code
  const noiseFile =
    /^(git_version|old_app|_old_app|vscode_backup_app|sedBrucB6|sedgrJyrL|test_.*|t\.cjs$)/;
  const out: any[] = [];
  (function walk(dir, depth) {
    if (out.length > 600 || depth > 5) return;
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (skip.test(e.name)) continue;
      if (e.isFile() && secret.test(e.name)) continue;
      if (e.isFile() && noiseFile.test(e.name)) continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp, depth + 1);
      else {
        const r = path.relative(QROOT, fp).replace(/\\/g, "/");
        if (!filterRe || filterRe.test(r)) out.push({ rel: r, fp });
      }
    }
  })(QROOT, 0);
  return out;
}
function qList() {
  return qWalk(null)
    .slice(0, 400)
    .map((f) => {
      let sz = 0;
      try {
        sz = fs.statSync(f.fp).size;
      } catch {}
      return f.rel + " (" + sz + "b)";
    })
    .join("\n");
}

// ── utils ──
function qGlob(pattern) {
  if (!pattern) return "empty pattern";
  const re = globToRe(pattern);
  const res: any[] = [];
  const files = qWalk(null);
  for (const f of files) {
    if (re.test(f.rel))
      res.push(
        f.rel +
          " (" +
          (() => {
            try {
              return fs.statSync(f.fp).size;
            } catch {
              return 0;
            }
          })() +
          "b)",
      );
  }
  return res.length ? res.join("\n") : "(no matching file)";
}
// Glob -> RegExp. Two long-standing bugs are fixed here; both were found through
// a CPU profile of the Electron MAIN process during a real agent run, where this
// one line contributed 3271ms of self time:
//
//     RegExp: ^.*.*/agent/.*.*/.*\.\{cjs,js,jsx,json\}$
//
//  1. BRACES WERE ESCAPED LITERALLY. `{}` was on the escape list, so an
//     everyday pattern like `**/*.{cjs,js,jsx,json}` turned into a search for
//     filenames genuinely containing the characters "{cjs,js,jsx,json}". No such
//     file exists, so the result was ALWAYS zero — a silent failure, not an
//     error. The agent then assumed the folder was empty and tried other
//     patterns repeatedly, each attempt paying the full scan cost again.
//  2. `**` BECAME `.*.*`. Two adjacent unbounded wildcards make the regex engine
//     backtrack catastrophically on long paths — and diskWalk tests it TWICE per
//     file (fp and rel).
//
// Written as a single-pass scanner so `{...}` can be handled before escaping
// rather than after. `*` still crosses `/` as it always did — only what was
// actually broken changed.
function globToRe(pat: any) {
  const src = String(pat == null ? "" : pat);
  const META = /[.+^${}()|[\]\\]/;
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "*") {
      let bintang = 1;
      while (src[i + 1] === "*") {
        i++;
        bintang++;
      }
      // `**/` means ZERO OR MORE directories. Translated as `.*/` it would force
      // at least one segment, so `**/agent/**` would fail on a path that STARTS
      // with `agent/` — precisely the agent's most common usage.
      if (bintang >= 2 && src[i + 1] === "/") {
        out += "(?:.*/)?";
        i++;
        continue;
      }
      out += ".*";
      continue;
    }
    if (c === "?") {
      out += ".";
      continue;
    }
    if (c === "{") {
      const tutup = src.indexOf("}", i);
      if (tutup > i) {
        const alt = src
          .slice(i + 1, tutup)
          .split(",")
          .map((s) => s.trim().replace(/[.+^${}()|[\]\\*?]/g, "\\$&"));
        out += "(?:" + alt.join("|") + ")";
        i = tutup;
        continue;
      }
      // An unmatched `{`: treat it literally, as before.
    }
    out += META.test(c) ? "\\" + c : c;
  }
  return new RegExp("^" + out + "$", "i");
}
function qRead(absPath, near) {
  if (!absPath) return "(empty path)";
  let txt;
  try {
    txt = fs.readFileSync(absPath, "utf8");
  } catch (e) {
    return "(read failed: " + e.message + ")";
  }
  const lines = txt.split("\n");
  const N = lines.length;
  near = parseInt(near);
  let a = 0,
    b = Math.min(N, 200);
  if (Number.isFinite(near) && near > 0) {
    a = Math.max(0, near - 40);
    b = Math.min(N, near + 40);
  }
  const shown = lines
    .slice(a, b)
    .map((l, i) => a + i + 1 + "\t" + l)
    .join("\n");
  const rest = N - b;
  const head =
    a > 0 || b < N
      ? `(baris ${a + 1}-${b} dari ${N}${rest > 0 ? ", " + rest + " baris tersisa" : ""})\n`
      : "";
  return head + shown;
}

function qGrep(pattern: any, options: any = {}) {
  if (!pattern) return "empty pattern";

  let patternsToSearch: any[] = [];

  // ── Semantic mode: expand query into multiple intent-based patterns ──
  if (options.intent || options.semantic) {
    const sv = getSemanticValidator();
    if (sv && sv.qSemanticSearch) {
      const semantic = sv.qSemanticSearch(options.intent || pattern, {
        intent: options.intent,
      });
      if (semantic.intent && semantic.patterns.length > 0) {
        patternsToSearch = semantic.patterns;
      }
    }
  }

  // ── Fallback/fast-path: pure lexical mode ──
  if (patternsToSearch.length === 0) {
    let re;
    try {
      re = new RegExp(pattern, "i");
    } catch {
      return "invalid regex: " + pattern;
    }
    patternsToSearch = [re];
  }

  const hits: any[] = [];
  const files = qWalk(/\.(cjs|js|jsx|css|html|json|dart|yaml|md)$/i);
  for (const f of files) {
    if (hits.length >= 150) break;
    let txt;
    try {
      txt = fs.readFileSync(f.fp, "utf8");
    } catch {
      continue;
    }
    txt.split("\n").forEach((l, i) => {
      if (hits.length >= 150) return;
      for (const re of patternsToSearch) {
        if (re.test(l)) {
          hits.push(f.rel + ":" + (i + 1) + ": " + l.trim().slice(0, 160));
          break; // avoid duplicate hits from multiple patterns on same line
        }
      }
    });
  }
  return hits.length ? hits.join("\n") : "(no matches)";
}

async function qSyntaxOk(absPath) {
  const _t0 = performance.now();
  const ext = path.extname(absPath).toLowerCase();
  try {
    if (ext === ".cjs" || ext === ".js") {
      await execP(`"${process.execPath}" --check "${absPath}"`, {
        timeout: 15000,
        stdio: "pipe",
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      } as any);
      return { ok: true };
    }
    if (ext === ".json") {
      JSON.parse(fs.readFileSync(absPath, "utf8"));
      return { ok: true };
    }
    if (ext === ".jsx") {
      const B = require(path.join(QROOT, "public", "vendor", "babel.min.js"));
      B.transform(fs.readFileSync(absPath, "utf8"), { presets: ["react"] });
      return { ok: true };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: (((e.stderr || "") + "").trim() || e.message).slice(0, 500),
    };
  } finally {
    const ms = performance.now() - _t0;
    if (ms >= 100 && global.__probe && global.__probe.say)
      global.__probe.say("qSyntaxOk " + ext + " " + ms.toFixed(0) + "ms");
  }
}

const { createSnapshot } = require("../snapshot.ts");

function qBackup() {
  const filesToBackup: any[] = [];
  let n = 0;
  for (const f of qWalk(/\.(cjs|js|jsx|css|html|json|dart|yaml|py|md|txt)$/i)) {
    if (n > 500) break;
    const relSeg = f.rel.replace(/\//g, path.sep);
    if (!(Q_ALLOWED.test(relSeg) || Q_ALLOWED.test(f.rel))) continue;
    filesToBackup.push(f.fp);
    n++;
  }
  if (filesToBackup.length === 0) return null;
  const snap = createSnapshot(filesToBackup, "session-backup");
  return snap.id;
}

// ── Semantic file intent helper ──
// Uses sandbox-validator's intent detection for semantic-aware file operations
let _semanticModule: any = null;
function getSemanticValidator() {
  if (!_semanticModule) {
    try {
      _semanticModule = require("./sandbox-validator.ts");
    } catch (e) {
      _semanticModule = null;
    }
  }
  return _semanticModule;
}

/**
 * Check file intent semantically (name + path + optional content analysis)
 * @param {string} filePath - file path to analyze
 * @param {string} [contentPreview] - optional content preview for deeper analysis
 * @returns {{ intents: Array, blocking: Array }}
 */
function qSemanticCheck(filePath, contentPreview) {
  const sv = getSemanticValidator();
  if (!sv || !sv.detectFileIntent) return { intents: [], blocking: [] };
  const normalized = (filePath || "").replace(/\\/g, "/");
  const intents = sv.detectFileIntent(normalized, contentPreview || "");
  const blocking = intents.filter((i) => i.block && i.confidence >= 0.6);
  return { intents, blocking };
}

/**
 * Get human-readable description of file intent
 * @param {string} filePath
 * @returns {string}
 */
function qIntentDescription(filePath) {
  const { intents } = qSemanticCheck(filePath, "");
  if (intents.length === 0) return "unknown / not classified";
  return intents
    .map((i) => `${i.intent} (${Math.round(i.confidence * 100)}%)`)
    .join(", ");
}

// ── The ASYNCHRONOUS version of the source-tree scanner ──
//
// WHY IT EXISTS, and why the synchronous version is kept.
//
// In Electron mode the WOLFSPACE backend has NO process of its own: main.js
// requires core.js in-process, and ipcMain.on("WOLFSPACE:stream") calls
// selfAgentStream() directly. That main process also owns the BrowserWindow and
// pumps the Windows message queue. So every second spent here synchronously is a
// second the window pumps no messages — and Windows marks it "Not Responding".
//
// Measured on a REAL agent run (task: grep + list over its own source), with an
// event-loop lag sampler installed in the main process:
//     [MAIN-FROZEN] 10845ms   [MAIN-FROZEN] 5415ms   [MAIN-FROZEN] 10670ms
// In those same seconds, PerformanceObserver('longtask') in the RENDERER recorded
// a maximum of 312ms — the renderer was healthy; what froze was the window's
// owner.
//
// The synchronous version is NOT removed: synchronous qBackup/qGrep are still
// used by other paths, and existing tests rely on them. What changed is only the
// agent tool path, which is the one path running inside the window's owner
// process.
const fsp = fs.promises;

// The parallelism limit for reading and copying files. Without one, 600
// concurrent readFile calls swamp the libuv threadpool (default 4) and make
// everything slower instead.
async function _petaBatas(items, batas, fn) {
  const hasil = new Array(items.length);
  let i = 0;
  const pekerja = Array.from(
    { length: Math.min(batas, items.length) },
    async () => {
      while (i < items.length) {
        const n = i++;
        hasil[n] = await fn(items[n], n);
      }
    },
  );
  await Promise.all(pekerja);
  return hasil;
}

// Mirrors qWalk, but with an asynchronous readdir so the event loop — and the
// window's message pump — keeps being served between directories. Its limits and
// filters are EXACTLY the same; if either drifts, the tool's result differs
// between the two paths.
async function qWalkAsync(filterRe) {
  const skip =
    /^(node_modules|_agent_backups|dist-app|workspace|build|\.dart_tool|vendor|\.wolfspace|\.asar-pack|\.git)$/;
  const secret =
    /(cloud-keys\.json|\.env|\.pem$|\.key$|secret|credential|token)/i;
  const noiseFile =
    /^(git_version|old_app|_old_app|vscode_backup_app|sedBrucB6|sedgrJyrL|test_.*|t\.cjs$)/;
  const out: any[] = [];
  async function walk(dir, depth) {
    if (out.length > 600 || depth > 5) return;
    let ents;
    try {
      ents = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (out.length > 600) return;
      if (skip.test(e.name)) continue;
      if (e.isFile() && secret.test(e.name)) continue;
      if (e.isFile() && noiseFile.test(e.name)) continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) await walk(fp, depth + 1);
      else {
        const r = path.relative(QROOT, fp).replace(/\\/g, "/");
        if (!filterRe || filterRe.test(r)) out.push({ rel: r, fp });
      }
    }
  }
  await walk(QROOT, 0);
  return out;
}

async function qListAsync() {
  const files = (await qWalkAsync(null)).slice(0, 400);
  const baris = await _petaBatas(files, 16, async (f) => {
    let sz = 0;
    try {
      sz = (await fsp.stat(f.fp)).size;
    } catch {}
    return f.rel + " (" + sz + "b)";
  });
  return baris.join("\n");
}

async function qGlobAsync(pattern) {
  if (!pattern) return "empty pattern";
  const re = globToRe(pattern);
  const files = (await qWalkAsync(null)).filter((f) => re.test(f.rel));
  const res = await _petaBatas(files, 16, async (f) => {
    let sz = 0;
    try {
      sz = (await fsp.stat(f.fp)).size;
    } catch {}
    return f.rel + " (" + sz + "b)";
  });
  return res.length ? res.join("\n") : "(no matching file)";
}

async function qGrepAsync(pattern: any, options: any = {}) {
  if (!pattern) return "empty pattern";
  let patternsToSearch: any[] = [];
  if (options.intent || options.semantic) {
    const sv = getSemanticValidator();
    if (sv && sv.qSemanticSearch) {
      const semantic = sv.qSemanticSearch(options.intent || pattern, {
        intent: options.intent,
      });
      if (semantic.intent && semantic.patterns.length > 0)
        patternsToSearch = semantic.patterns;
    }
  }
  if (patternsToSearch.length === 0) {
    let re;
    try {
      re = new RegExp(pattern, "i");
    } catch {
      return "invalid regex: " + pattern;
    }
    patternsToSearch = [re];
  }

  const files = await qWalkAsync(/\.(cjs|js|jsx|css|html|json|dart|yaml|md)$/i);
  // Read with bounded parallelism, then collected in FILE ORDER — not I/O
  // completion order. Otherwise grep output would vary between calls for the same
  // input, and the 30-second cache would mislead.
  const perFile = await _petaBatas(files, 12, async (f) => {
    let txt;
    try {
      txt = await fsp.readFile(f.fp, "utf8");
    } catch {
      return [];
    }
    const lokal: any[] = [];
    const lines = txt.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const re of patternsToSearch) {
        if (re.test(lines[i])) {
          lokal.push(
            f.rel + ":" + (i + 1) + ": " + lines[i].trim().slice(0, 160),
          );
          break;
        }
      }
    }
    return lokal;
  });

  const hits: any[] = [];
  for (const lokal of perFile) {
    for (const h of lokal) {
      if (hits.length >= 150) break;
      hits.push(h);
    }
    if (hits.length >= 150) break;
  }
  return hits.length ? hits.join("\n") : "(no matches)";
}

async function qBackupAsync() {
  const filesToBackup: any[] = [];
  let n = 0;
  for (const f of await qWalkAsync(
    /\.(cjs|js|jsx|css|html|json|dart|yaml|py|md|txt)$/i,
  )) {
    if (n > 500) break;
    const relSeg = f.rel.replace(/\//g, path.sep);
    if (!(Q_ALLOWED.test(relSeg) || Q_ALLOWED.test(f.rel))) continue;
    filesToBackup.push(f.fp);
    n++;
  }
  if (filesToBackup.length === 0) return null;
  const { createSnapshotAsync } = require("../snapshot.ts");
  const snap = await createSnapshotAsync(filesToBackup, "session-backup");
  return snap.id;
}

module.exports = {
  QROOT,
  Q_ALLOWED,
  Q_FORBID,
  qResolve,
  qWalk,
  qList,
  qGlob,
  qRead,
  qGrep,
  qBackup,
  qSyntaxOk,
  globToRe,
  qSemanticCheck,
  qIntentDescription,
  qWalkAsync,
  qListAsync,
  qGlobAsync,
  qGrepAsync,
  qBackupAsync,
};
