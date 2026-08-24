// Install the .ts hook FIRST: modules below require TypeScript files, and
// this file can itself be an entry point — tests require it directly, and
// `node -e` subprocesses load it without ever going through server.cjs.
require("../../scripts/ts-register.cjs");
// Tool aggregator - imports all sub-modules and provides runSelfTool dispatcher
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

// Atomic write: write to temp then rename (prevents partial/corrupt files)
function atomicWrite(dest, content) {
  const tmp = dest + "." + process.pid + ".atomic";
  fs.writeFileSync(tmp, content, "utf8");
  try {
    fs.renameSync(tmp, dest);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {}
    throw e;
  }
}
import { spawn } from "child_process";
const { getPlatformAdapter } = require("../platform/index.cjs");
const { dlog } = require("../debug.ts");
// The structural quality gate. REQUIRED in THIS module, not only in
// safe-edit.ts: self_agent.ts uses ./tools.cjs -> tools/index.ts, while
// safeWriteFile is only called by server.cjs, whose agent path is no longer in
// use. A gate there never touches the agent at all.
const codeQuality = require("../code-quality.ts");
const { createSnapshot } = require("../snapshot.ts");

// ── Hybrid module loading (eager core + lazy peripheral) ──
// Core modules (file-tools, exec-tools) are loaded eagerly — needed on
// almost every agent step. Peripheral modules load only on first tool call,
// reducing startup time and memory when tools are not used.
const _modLoadErrors: Record<string, any> = {};
const _modCache: Record<string, any> = {};

function _ensureMod(name, path) {
  if (_modCache[name]) return _modCache[name];
  try {
    const mod = require(path);
    _modCache[name] = mod;
    return mod;
  } catch (e) {
    _modLoadErrors[name] = e.message;
    return null;
  }
}

// ── Eager (core) ──
let fileTools, execTools;
try {
  fileTools = require("./file-tools.ts");
} catch (e) {
  _modLoadErrors["file-tools"] = e.message;
  fileTools = {};
}
try {
  execTools = require("./exec-tools.ts");
} catch (e) {
  _modLoadErrors["exec-tools"] = e.message;
  execTools = {};
}

// ── Lazy (peripheral) — loaded on first tool call ──
let _diskTools = null,
  _webTools = null,
  _skillTools = null,
  _broker = null;
function lazyDisk() {
  return (
    _diskTools ||
    (_diskTools = _ensureMod("disk-tools", "./disk-tools.ts")) ||
    {}
  );
}
function lazyWeb() {
  return (
    _webTools || (_webTools = _ensureMod("web-tools", "./web-tools.ts")) || {}
  );
}
let _archTools: any = null;
function lazyArch() {
  return (
    _archTools ||
    (_archTools = _ensureMod("arch-tools", "./arch-tools.ts")) ||
    {}
  );
}
function lazySkill() {
  return (
    _skillTools ||
    (_skillTools = _ensureMod("skill-tools", "./skill-tools.ts")) ||
    {}
  );
}
function lazyBroker() {
  return (
    _broker || (_broker = _ensureMod("broker", "../broker/index.cjs")) || {}
  );
}

// CommandChain (Phase 2): bash is the proc.raw capability. Lazily loaded and
// fail-safe —
// if the module cannot load, bash still runs (the old behaviour) rather than
// being crippled.
let _cc: any;
function lazyCC() {
  if (_cc !== undefined) return _cc;
  try {
    _cc = require("../broker/commandchain.ts");
  } catch (_) {
    _cc = null;
  }
  return _cc;
}

// Static definitions (pure JSON, never fails)
const { SELF_TOOLS } = require("./tool-definitions.ts");

// Sandbox validator — non-critical, isolated
let validateOperation: (
  toolName?: any,
  args?: any,
) => Promise<any> = async () => ({
  safe: false,
  reason: "sandbox-validator not available",
});
try {
  const v = require("./sandbox-validator.ts");
  if (v.validateOperation) validateOperation = v.validateOperation;
} catch (e) {
  _modLoadErrors["sandbox-validator"] = e.message;
}

// Re-export everything (eager for core, lazy getters for peripheral)
const QROOT = fileTools.QROOT || path.resolve(__dirname, "..");
const Q_ALLOWED = fileTools.Q_ALLOWED || /^(?!$)/;
const Q_FORBID = fileTools.Q_FORBID || /$^/;
const qResolve =
  fileTools.qResolve ||
  (() => {
    throw new Error("file-tools not loaded");
  });
const qWalk = fileTools.qWalk || (() => []);
const qList = fileTools.qList || (() => "(file-tools not loaded)");
const qGlob =
  fileTools.qGlob || ((p) => "(file-tools not loaded: glob unavailable)");
const qRead =
  fileTools.qRead || ((p) => "(file-tools not loaded: read unavailable)");
const qGrep =
  fileTools.qGrep || ((p) => "(file-tools not loaded: grep unavailable)");
// The agent tool path uses the ASYNCHRONOUS variant. In Electron mode this code
// runs in the main process — the window's owner — so a synchronous scan here
// freezes the UI. It falls back to the synchronous version if the module is an
// older copy (one in _agent_backups required by another path, say), so nothing
// dies outright.
const qListA = fileTools.qListAsync || (async () => qList());
const qGlobA = fileTools.qGlobAsync || (async (p, o) => qGlob(p, o));
const qGrepA = fileTools.qGrepAsync || (async (p, o) => qGrep(p, o));
const qBackup =
  fileTools.qBackup ||
  (() => {
    throw new Error("file-tools not loaded");
  });
const qSyntaxOk =
  fileTools.qSyntaxOk ||
  (async () => ({ ok: false, error: "file-tools not loaded" }));
const qSemanticCheck =
  fileTools.qSemanticCheck || ((fp, c) => ({ blocking: [], warnings: [] }));
const WORKSPACE = execTools.WORKSPACE || null;
const wsResolve = execTools.wsResolve || ((p) => p);
const wsList = execTools.wsList || (() => "(exec-tools not loaded)");
const runInWorkspace =
  execTools.runInWorkspace ||
  (() => {
    throw new Error("exec-tools not loaded");
  });
const term = execTools.term || null;
const { createSession: createSandboxSession } = require("../sandbox.ts");
// Peripheral exports — lazy, loaded only when their modules are first used
const resolveDiskPath = (p) => {
  const m = lazyDisk();
  return m.resolveDiskPath ? m.resolveDiskPath(p) : p;
};
const diskList = (...a) => {
  const m = lazyDisk();
  return m.diskList ? m.diskList(...a) : "(disk-tools not loaded)";
};
const diskGlob = (...a) => {
  const m = lazyDisk();
  return m.diskGlob ? m.diskGlob(...a) : "(disk-tools not loaded)";
};
const diskGrep = (...a) => {
  const m = lazyDisk();
  return m.diskGrep ? m.diskGrep(...a) : "(disk-tools not loaded)";
};
// The ASYNCHRONOUS variant for the agent tool path. In Electron mode this code
// runs in the main process (the window's owner), and CPU profiling showed a
// synchronous diskWalk holding it for 8-13 seconds in one burst. Falls back to
// synchronous if the module is an older copy, so no tool dies outright.
const diskListA = async (...a) => {
  const m = lazyDisk();
  return m.diskListAsync ? m.diskListAsync(...a) : diskList(...a);
};
const diskGlobA = async (...a) => {
  const m = lazyDisk();
  return m.diskGlobAsync ? m.diskGlobAsync(...a) : diskGlob(...a);
};
const diskGrepA = async (...a) => {
  const m = lazyDisk();
  return m.diskGrepAsync ? m.diskGrepAsync(...a) : diskGrep(...a);
};
const webSearch = async (...a) => {
  const m = lazyWeb();
  return m.webSearch ? m.webSearch(...a) : "(web-tools not loaded)";
};
const webFetch = async (...a) => {
  const m = lazyWeb();
  return m.webFetch ? m.webFetch(...a) : "(web-tools not loaded)";
};
const webExtract = async (...a) => {
  const m = lazyWeb();
  // Thrown rather than returned as a string. A web module that failed to load
  // means there is no browser — and "(web-tools not loaded)" as a RESULT would
  // be read by the model as page content and then reported as a finding.
  if (!m.webExtract)
    throw new Error("web-tools tidak dapat dimuat (playwright?)");
  return m.webExtract(...a);
};
const skills = {
  listSkills: () => {
    const m = lazySkill();
    return m.skills ? m.skills.listSkills() : [];
  },
  runSkill: async (n, a, sr) => {
    const m = lazySkill();
    return m.skills
      ? m.skills.runSkill(n, a, sr)
      : { ok: false, output: "skill-tools not loaded" };
  },
  installFromFile: (s) => {
    const m = lazySkill();
    return m.skills
      ? m.skills.installFromFile(s)
      : { output: "skill-tools not loaded" };
  },
  installFromNpm: async (s) => {
    const m = lazySkill();
    return m.skills
      ? m.skills.installFromNpm(s)
      : { ok: false, output: "skill-tools not loaded" };
  },
};
const sandbox = {
  sandboxRun: async (cmd, opts) => {
    const m = lazySkill();
    return m.sandbox
      ? m.sandbox.sandboxRun(cmd, opts)
      : { ok: false, output: "skill-tools not loaded" };
  },
  defaultSandboxOpts: () => {
    const m = lazySkill();
    return m.sandbox ? m.sandbox.defaultSandboxOpts() : {};
  },
  // null means "unknown", and penegakan.js translates that into "advisory" —
  // not silently into "kernel". That default direction is deliberate:
  adapterCapabilities: () => {
    const m = lazySkill();
    return m.sandbox && m.sandbox.adapterCapabilities
      ? m.sandbox.adapterCapabilities()
      : null;
  },
};

// ── Tool result cache (L1 in-memory with TTL) ──
// Caches idempotent (read-only) tool results to avoid redundant I/O.
// Evicts entries older than CACHE_TTL_MS. Cache key = toolName|arg1|arg2|...
const CACHE_TTL_MS = 30000;
const _resultCache = new Map();
function _cachedResult(key, fn) {
  const now = Date.now();
  const entry = _resultCache.get(key);
  if (entry && now - entry.ts < CACHE_TTL_MS) return entry.value;
  const value = fn();
  if (value && typeof value.then === "function") {
    return value.then((r) => {
      if (r && r.ok) _resultCache.set(key, { ts: now, value: r });
      return r;
    });
  }
  if (value && value.ok) _resultCache.set(key, { ts: now, value });
  return value;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of _resultCache) {
    if (now - e.ts >= CACHE_TTL_MS) _resultCache.delete(k);
  }
}, 30000).unref();

// ── Circuit breaker ──
// Trips after TRIP_THRESHOLD consecutive throws per tool.
// Auto-resets after RESET_TIMEOUT ms of open state.
const TRIP_THRESHOLD = 5;
const RESET_TIMEOUT = 60000;
const _circuitBreakers = new Map();
function _circuitAllowed(name) {
  const state = _circuitBreakers.get(name);
  if (!state) return true;
  if (state.tripped) {
    if (Date.now() - state.trippedAt >= RESET_TIMEOUT) {
      _circuitBreakers.delete(name);
      return true;
    }
    return false;
  }
  return true;
}
function _circuitFail(name) {
  let state = _circuitBreakers.get(name);
  if (!state) state = { failures: 0, tripped: false, trippedAt: 0 };
  state.failures++;
  if (state.failures >= TRIP_THRESHOLD) {
    state.tripped = true;
    state.trippedAt = Date.now();
  }
  _circuitBreakers.set(name, state);
}

// ── Session resource tracker ──
// Tracks child processes per session for cleanup.
const _sessionResources = new Map();
let _nextSessionId = 1;
function createSession() {
  const id = "sess_" + _nextSessionId++;
  _sessionResources.set(id, { procs: [], created: Date.now() });
  return id;
}
function trackProcess(sessionId, child) {
  const sess = _sessionResources.get(sessionId);
  if (sess) {
    sess.procs.push(child);
    child.on("exit", () => {
      const i = sess.procs.indexOf(child);
      if (i >= 0) sess.procs.splice(i, 1);
    });
  }
}
function cleanupSession(sessionId) {
  abortSessionBash(sessionId);
  const sess = _sessionResources.get(sessionId);
  if (!sess) return;
  for (const child of sess.procs) {
    try {
      child.kill();
    } catch {}
  }
  _sessionResources.delete(sessionId);
}

// ── Bash process abort registry (per-session) ──
// Enables external cancellation of running bash via AbortController.
const _bashProcesses = new Map(); // sessionId -> Set<{controller, child, cmd, started}>
function _registerBashProcess(sessionId, controller, child, cmd) {
  if (!_bashProcesses.has(sessionId)) _bashProcesses.set(sessionId, new Set());
  const entry = { controller, child, cmd, started: Date.now() };
  _bashProcesses.get(sessionId).add(entry);
  return entry;
}
function _unregisterBashProcess(sessionId, entry) {
  const set = _bashProcesses.get(sessionId);
  if (set) {
    set.delete(entry);
    if (set.size === 0) _bashProcesses.delete(sessionId);
  }
}
function abortSessionBash(sessionId) {
  const set = _bashProcesses.get(sessionId);
  if (!set) return 0;
  let count = 0;
  for (const entry of set) {
    try {
      entry.controller.abort("cancelled");
      entry.child.kill();
    } catch {}
    count++;
  }
  _bashProcesses.delete(sessionId);
  return count;
}

// ── bash confinement to one workspace folder (opt-in via context.workspaceRoot) ──
// Confine every bash command to one folder: cwd must be inside it, and no path
// token may reach outside (.. or an absolute sibling path).
function _wwInside(root, p) {
  const r = path.resolve(root);
  const t = path.resolve(p);
  return t === r || t.startsWith(r + path.sep);
}
function _confineBash(cmd, argCwd, confineRoot) {
  const root = path.resolve(confineRoot);
  // 1) cwd must be inside root (defaults to root when not given)
  let cwd = root;
  if (argCwd) {
    const resolved = path.isAbsolute(argCwd)
      ? path.resolve(argCwd)
      : path.resolve(root, argCwd);
    if (!_wwInside(root, resolved))
      return { ok: false, reason: `cwd '${argCwd}' di luar workspace ${root}` };
    try {
      if (!fs.statSync(resolved).isDirectory())
        return { ok: false, reason: `cwd bukan direktori: ${argCwd}` };
    } catch {
      return { ok: false, reason: `cwd does not exist: ${argCwd}` };
    }
    cwd = resolved;
  }
  // 2) reject path-style '..' traversal (conservative, but lets the text
  //    "wait.." through)
  if (
    /\.\.[\\/]|[\\/]\.\.(?=[\s"')\\/:]|$)|(^|[\s"'=(:])\.\.(?=[\s"')]|$)/.test(
      cmd,
    )
  )
    return { ok: false, reason: `dilarang '..' (traversal keluar workspace)` };
  // 3) every path-shaped token must resolve inside root
  const norm = cmd.replace(/>>|>|<|\|/g, " "); // pisahkan operator redirect/pipe
  for (let tok of norm.split(/\s+/)) {
    tok = tok.replace(/^["']|["']$/g, "").trim();
    if (!tok || /:\/\//.test(tok)) continue; // empty / a URL (http://…) — not a local path
    const looksPath =
      /[\\/]/.test(tok) ||
      tok.includes("..") ||
      /^[A-Za-z]:([\\/]|$)/.test(tok);
    if (!looksPath) continue; // token biasa (echo, flag, teks)
    const abs = path.isAbsolute(tok)
      ? path.resolve(tok)
      : path.resolve(cwd, tok);
    if (!_wwInside(root, abs))
      return {
        ok: false,
        reason: `path '${tok}' menembus keluar workspace ${root}`,
      };
  }
  return { ok: true, cwd };
}

const _bashJail = require("./bash-jail.ts");

// Turn the host cwd into a path INSIDE the jail. The same calculation as `-w`
// for Docker: only a cwd genuinely under the workspace root is honoured,
function _workdirDalamJail(root, cwd) {
  if (!cwd) return "/work";
  try {
    const abs = path.isAbsolute(cwd)
      ? path.resolve(cwd)
      : path.resolve(root, cwd);
    if (!_wwInside(root, abs)) return "/work";
    const rel = path.relative(root, abs).replace(/\\/g, "/");
    return rel ? "/work/" + rel : "/work";
  } catch (_) {
    return "/work";
  }
}

// ── Real OS containment for bash ──
// ONLY the ww folder is visible (/work, rw); sibling and host folders are not
// visible at all. Read-only system dirs + empty network + /tmp tmpfs + a pid
// limit. This closes the shell gap that neither a regex nor the broker can.
//
// This used to be done by a single-use Docker container; now it is
// agent/tools/bash-jail.ts with Linux namespaces. The guarantee is the same,
// but with no daemon to install and start — and that dependency was exactly
// what made the strongest containment the least often active: when the daemon
// was down, what actually ran was the regex guard below.
const _sandboxPolicy = require("../sandbox-policy.ts");
const _penegakanLabel = require("../penegakan.ts");

// ENFORCEMENT IN CODE (not a prompt suggestion): refuse a bash command naming a
// HOST path outside the workspace, BEFORE it reaches the container.
//
// Why hardcode it: the Docker bash path only mounts the workspace folder, so a
// path like C:\Users\... or /c/Users/... NEVER exists inside the container.
// Without this guard, `sh` merely replies "can't cd to /c/Users/..." — a
// message explaining NOTHING about the cause, so the agent repeats the same
// command over and over (observed 6 times in a row until the stall guard
// stopped it). A prompt instruction is not enough: the model can ignore it.
// Here the failure becomes GUIDANCE — name the boundary and the tool to use
// instead.
// bash's environment is NO LONGER inherited whole.
//
// WHY. The path guard (_HOST_PATH_RE below) inspects the command STRING before
// it runs. But %VAR% is only expanded INSIDE cmd.exe — after that check has
// finished. The guard sees "%TEMP%", the shell sees
// "C:\Users\dave\AppData\Local\Temp". Two different strings, and the one that
// actually touches the disk is the second.
//
// Measured on a worktree OUTSIDE TEMP (so it cannot be dismissed as "just one
// level up"):
//     type C:\...\secret.txt    -> HELD
//     type %TEMP%\secret.txt    -> LEAKED
//     type %TMP%\secret.txt     -> LEAKED
//     type %USERPROFILE%\...     -> LEAKED
//
// Patching the regex does not solve it: the number of variables is unbounded,
// and cmd.exe has %CD%, substring expansion (%TEMP:~0,3% yields "C:\" without
// ever writing it out), and concatenation through `set`. A race a string
// checker cannot win.
//
// What is closed here is the SOURCE: if %TEMP% is not in the environment, it
// cannot expand into anything — checker and shell see the same string again.
// The pattern and list follow _envVerifikasi() in server.cjs, which already
// does this for the verification path.
//
// NOT real containment. This closes one family of escapes; it does not make
// the shell unable to reach outside — an absolute path written plainly still
// relies on the regex guard. Real containment needs the OS level
// (bash-jail.ts on Linux; on Windows the equivalent is WSL).
const _ENV_BASH_IZIN = [
  "PATH",
  "Path",
  "PATHEXT",
  "SystemRoot",
  "SystemDrive",
  "windir",
  "ComSpec",
  "NUMBER_OF_PROCESSORS",
  "PROCESSOR_ARCHITECTURE",
  "PROCESSOR_IDENTIFIER",
  "OS",
  "LANG",
  "LC_ALL",
  "PYTHONIOENCODING",
];
function _envBash(cwd) {
  // An emergency escape hatch, and deliberately settable only by whoever
  // LAUNCHES the application — not by the agent, which cannot touch the backend
  // process's environment.
  if (process.env.WOLFSPACE_BASH_ENV === "full")
    return { ...process.env, ELECTRON_RUN_AS_NODE: "1" };

  const e = process.env;
  const out: Record<string, any> = {};
  for (const k of _ENV_BASH_IZIN) if (e[k] != null) out[k] = e[k];
  // TEMP/TMP are pointed INTO the working directory rather than deleted: many
  // tools (npm, python, compilers) write temporary files and FAIL when both are
  // missing. Redirecting them makes those files land inside the scope, and
  // %TEMP% no longer points into the host tree.
  out.TEMP = cwd;
  out.TMP = cwd;
  out.PYTHONIOENCODING = out.PYTHONIOENCODING || "utf-8";
  out.ELECTRON_RUN_AS_NODE = "1";

  // FILTERING ALONE IS NOT ENOUGH ON WINDOWS.
  //
  // cmd.exe supplies user-identity variables itself from the process token,
  // regardless of the environment block it is given. Measured: after the
  // allowlist was installed, `set` inside the shell still showed HOMEDRIVE,
  // HOMEPATH, LOGONSERVER, USERDOMAIN, USERNAME and USERPROFILE — and
  // %USERPROFILE% still got through the path guard, the only one of four test
  // cases still leaking.
  //
  // So all six are OVERWRITTEN rather than deleted: an explicit value beats
  // cmd.exe's injection. Those naming a location are pointed at the working
  // directory; those that are merely identity are neutralised so no account
  // name leaks.
  out.USERPROFILE = cwd;
  out.HOMEDRIVE = String(cwd).slice(0, 2); // "C:"
  out.HOMEPATH = String(cwd).slice(2) || "\\";
  out.HOME = cwd; // used by git/ssh on the POSIX path
  out.USERNAME = "wolfspace";
  out.USERDOMAIN = "wolfspace";
  out.LOGONSERVER = "";
  return out;
}

// Where the command script file lives when the AppContainer path is active.
//
// It has to be INSIDE the container's scope, because that is the only place it
// can read. Inside the workspace, not at its root: this script is deliberately
// not deleted inline (deleting it on the same line overwrites cmd.exe's exit
// code), so at the root it would pile up in the middle of someone's repo.
const _DIR_SKRIP_AC = ".wolfspace-cmd";
const _UMUR_SKRIP_MS = 60 * 60 * 1000;

/** @param {string} cwd */
function _dirSkripAc(cwd) {
  const dir = path.join(cwd, _DIR_SKRIP_AC);
  try {
    fs.mkdirSync(dir, { recursive: true });
    // Trimmed here rather than through an inline delete. Without this the
    const batas = Date.now() - _UMUR_SKRIP_MS;
    for (const n of fs.readdirSync(dir)) {
      const f = path.join(dir, n);
      try {
        if (fs.statSync(f).mtimeMs < batas) fs.unlinkSync(f);
      } catch (_) {}
    }
  } catch (_) {}
  return dir;
}

const _HOST_PATH_RE = [
  /\b[A-Za-z]:[\\/]/, //  C:\... or D:/...
  /(^|\s|['"=(])\/[a-z]\/(Users|Program|Windows)/i, // /c/Users/... (gaya MSYS)
  /(^|\s|['"=(])\/mnt\/[a-z]\//i, //  /mnt/c/... (gaya WSL)
];

// Writing a CODE file through the shell bypasses both the quality gate AND the
// syntax check. The command-name guard (sed/Set-Content/node -e) does not catch
// it; tested empirically, `echo ... > x.jsx`, `printf ... > x.jsx` and
// `tee x.jsx` all got through and the file landed on disk.
//
// Deliberately NARROW: only redirects targeting a code extension are refused. A
// redirect to a log or text file (`> build.log`, `> out.txt`) stays legitimate —
// blocking every redirect would cripple reasonable use of bash.
const _CODE_EXT = String.raw`(?:js|jsx|cjs|mjs|ts|tsx|py|json|css|html)`;
const _BASH_CODE_WRITE_RE = new RegExp(
  [
    String.raw`>>?\s*['"]?[^\s'"|;&]+\.${_CODE_EXT}\b`, // > x.jsx / >> x.jsx
    String.raw`\btee\s+(?:-a\s+)?['"]?[^\s'"|;&]+\.${_CODE_EXT}\b`, // tee x.jsx
    String.raw`\b(?:cp|mv|copy|move)\b[^|;&]*\.${_CODE_EXT}\b`, // cp/mv to .jsx
    String.raw`\bopen\s*\(\s*['"][^'"]+\.${_CODE_EXT}['"]\s*,\s*['"][wa]`, // python open(...,'w')
  ].join("|"),
  "i",
);
function _hostPathEscape(cmd) {
  const s = String(cmd || "");
  for (const re of _HOST_PATH_RE) {
    const m = s.match(re);
    if (m) return m[0].trim();
  }
  return null;
}

// ── Opsi 1: akses file per-workspace lewat BROKER (object-capability) ──
// When the agent is confined to a single ww folder, read/write/edit
// authorisation is done by the broker Policy (deny-by-default, roots:[folder])
// rather than hand-written QROOT logic. The broker executes the fs call and
// returns the result plus an audit trail.
async function _brokeredFileOp(name, args, wsRoot) {
  const b = lazyBroker();
  if (!b.Policy)
    return {
      ok: false,
      output: "broker unavailable: " + (_modLoadErrors["broker"] || "unknown"),
    };
  const { Policy, Broker } = b;
  const root = path.resolve(wsRoot);
  const policy = new Policy({
    readFile: { roots: [root] },
    writeFile: { roots: [root] },
  });
  const broker = new Broker(policy);
  const abs = path.isAbsolute(args.path || "")
    ? path.resolve(args.path)
    : path.resolve(root, args.path || "");
  const rel = path.relative(root, abs) || path.basename(abs);
  try {
    if (name === "read") {
      const content = await broker.request("readFile", { path: abs });
      // Record findings HERE too, not only in the qRead branch.
      //
      // WHY TWO PLACES. There are TWO `name === "read"` branches in this file:
      // this one (through the broker, used when a workspace is selected) and
      // another through qRead(). The first version of finding-recording hooked
      // only the qRead branch — and in a real user run all 23 reads went
      // through the broker, so the journal stayed empty with no error at all.
      //
      // That is the same "two surfaces" pattern that has bitten this repo
      // repeatedly. wsRoot is used as is: it is already a validated confined
      // root, and it is the same key the prompt side reads.
      try {
        const _t = require("../temuan.ts");
        _t.catat(_t.kunciWs(wsRoot), args.path, content, { alat: "read" });
      } catch (_) {}
      return { ok: true, output: content, auditTrail: broker.auditTrail() };
    }
    if (name === "write") {
      await broker.request("writeFile", {
        path: abs,
        content: args.content || "",
      });
      return {
        ok: true,
        edited: true,
        path: abs, // the final path after confinement resolution — used by the UI (preview panel)
        output: "brokered write " + rel,
        auditTrail: broker.auditTrail(),
      };
    }
    if (name === "edit") {
      const old = await broker.request("readFile", { path: abs });
      let target = args.old_string;
      if (!old.includes(target)) {
        // Parity with the regular (non-broker) edit: a whitespace-tolerant
        // fallback. Without it, a confined edit that misses the indentation only
        // replies "not found" with no new information -> the model repeats the
        // identical call until the "repeated tool call without progress" guard
        // fires.
        const oldLines = old.split(/\r?\n/);
        const tLines = String(args.old_string || "").split(/\r?\n/);
        let matchIndex = -1,
          matchCount = 0;
        for (let i = 0; i <= oldLines.length - tLines.length; i++) {
          let matched = true;
          for (let j = 0; j < tLines.length; j++) {
            if (oldLines[i + j].trim() !== tLines[j].trim()) {
              matched = false;
              break;
            }
          }
          if (matched) {
            matchIndex = i;
            matchCount++;
          }
        }
        if (matchCount === 1 && matchIndex >= 0) {
          target = oldLines
            .slice(matchIndex, matchIndex + tLines.length)
            .join("\n");
        } else {
          // Give REAL CONTENT around the closest-matching area so the model's
          // next attempt carries new information rather than repeating blindly.
          const probe = (
            tLines.find((l) => l.trim().length > 8) ||
            tLines[0] ||
            ""
          )
            .trim()
            .slice(0, 30);
          let hint = "";
          if (probe) {
            const hit = oldLines.findIndex((l) =>
              l.includes(probe.slice(0, 15)),
            );
            if (hit >= 0)
              hint =
                "\nKonten SEBENARNYA di sekitar baris " +
                (hit + 1) +
                ":\n" +
                oldLines
                  .slice(Math.max(0, hit - 2), hit + tLines.length + 3)
                  .join("\n");
          }
          return {
            ok: false,
            output:
              "old_string was not found in " +
              rel +
              " (must match EXACTLY, including whitespace/indentation)." +
              (hint ||
                " Use the read tool first to inspect the file contents."),
          };
        }
      }
      if (target === args.new_string)
        return { ok: false, output: "NOOP: old_string sama dengan new_string" };
      const patched = old.replace(target, args.new_string);
      await broker.request("writeFile", { path: abs, content: patched });
      return {
        ok: true,
        edited: true,
        path: abs,
        output: "brokered edit " + rel,
        auditTrail: broker.auditTrail(),
      };
    }
  } catch (e) {
    const denied = e && e.code === "BROKER_DENIED";
    return {
      ok: false,
      output: (denied ? "BROKER DENY: " : "error: ") + e.message,
      auditTrail: broker.auditTrail(),
    };
  }
}

// ── Core tool dispatcher ──
async function _runSelfToolInner(name, args, emit, context: any = {}) {
  try {
    // Check if required module is available before dispatching
    const toolModMap = {
      list: "file-tools",
      glob: "file-tools",
      read: "file-tools",
      grep: "file-tools",
      edit: "file-tools",
      write: "file-tools",
      bash: "exec-tools",
      replace_file_content: "file-tools",
      write_artifact: "file-tools",
      web_search: "web-tools",
      web_fetch: "web-tools",
      dspy: "",
      disk_list: "disk-tools",
      disk_read: "disk-tools",
      disk_glob: "disk-tools",
      disk_grep: "disk-tools",
      skill_list: "skill-tools",
      skill_run: "skill-tools",
      skill_install: "skill-tools",
      sandbox_run: "skill-tools",
      terminal_open: "exec-tools",
      terminal_write: "exec-tools",
      terminal_read: "exec-tools",
      terminal_close: "exec-tools",
      todowrite: "",
      question: "",
      task: "",
      opencode_run: "exec-tools",
    };
    const reqMod = toolModMap[name];
    if (reqMod && _modLoadErrors[reqMod]) {
      return {
        ok: false,
        output:
          "Tool unavailable: module " +
          reqMod +
          " failed to load — " +
          _modLoadErrors[reqMod],
      };
    }

    // Circuit breaker — reject if tool is in OPEN state (>5 consecutive throws)
    if (!_circuitAllowed(name)) {
      const state = _circuitBreakers.get(name);
      const remaining = Math.ceil(
        (RESET_TIMEOUT - (Date.now() - state.trippedAt)) / 1000,
      );
      return {
        ok: false,
        output:
          "CIRCUIT TERBUKA: tool " +
          name +
          " diblokir sementara (" +
          TRIP_THRESHOLD +
          " consecutive failures). Try again in " +
          remaining +
          " detik.",
      };
    }

    // -- MCP Router --
    if (name.startsWith("mcp_")) {
      const mcpClient = require("../mcp-client.ts");
      return await mcpClient.callTool(name, args);
    }

    // -- Per-workspace broker routing (opt-in via context.workspaceRoot) --
    // When the agent is confined to a ww folder, read/write/edit go through the
    // broker (deny-by-default, roots:[folder]) — replacing the QROOT/regex guard
    // for structured file access.
    {
      const _wsRoot =
        (context && context.workspaceRoot) ||
        process.env.WW_WORKSPACE_ROOT ||
        null;
      if (_wsRoot) {
        // Mutasi file → broker (deny-by-default, roots:[folder]).
        if (name === "read" || name === "write" || name === "edit") {
          return await _brokeredFileOp(name, args, _wsRoot);
        }
        // Read-only exploration -> scoped to the ww folder, not QROOT.
        if (name === "list")
          return { ok: true, output: await diskListA(_wsRoot) };
        if (name === "glob")
          return {
            ok: true,
            output: await diskGlobA(_wsRoot, args.pattern, {
              intent: args.intent,
            }),
          };
        if (name === "grep")
          return {
            ok: true,
            output: await diskGrepA(_wsRoot, args.pattern, {
              intent: args.intent,
              semantic: args.semantic,
            }),
          };
        if (name === "architecture_map") {
          const m = lazyArch();
          if (!m.architectureMap)
            return { ok: false, output: "arch-tools failed to load" };
          try {
            return m.architectureMap({
              scope: args.scope || "all",
              root: _wsRoot,
            });
          } catch (e) {
            return {
              ok: false,
              output: "architecture_map error: " + e.message,
            };
          }
        }
      }
    }

    // Validate destructive operations before execution
    if (name === "edit" || name === "write" || name === "bash") {
      const validation = await validateOperation(name, args);
      if (!validation.safe) {
        return {
          ok: false,
          output: "VALIDATION REJECTED: " + validation.reason,
        };
      }
    }

    // _cachedResult already handles a Promise return value (it stores the result
    // after it resolves), so all three of these tools can be asynchronous without
    // changing their callers.
    if (name === "list")
      return _cachedResult("list", async () => ({
        ok: true,
        output: await qListA(),
      }));
    if (name === "glob")
      return _cachedResult(
        "glob|" + (args.pattern || "") + "|" + (args.intent || ""),
        async () => ({
          ok: true,
          output: await qGlobA(args.pattern, { intent: args.intent }),
        }),
      );
    if (name === "read") {
      // Block backup/copy files — agent must read from real source
      const NOISE_FILES =
        /^(git_version|old_app|_old_app|vscode_backup_app|sedBrucB6|sedgrJyrL|test_|t\.cjs$)/;
      if (NOISE_FILES.test(path.basename(args.path || "")))
        return {
          ok: false,
          output:
            "Backup/copy file — read from public/ or agent/ instead. For example: public/app.jsx",
        };
      return _cachedResult(
        "read|" + (args.path || "") + "|" + (args.near || ""),
        () => {
          const output = qRead(args.path, args.near);
          // Record that this path HAS been read.
          //
          // WHY HERE. The tool cache has a 30-second TTL; in a real run the
          // median gap between actions was 5.8 seconds but the longest was 395
          // seconds, so the cache does not help for reads separated by dozens of
          // steps — and that is exactly the repetition that was measured (the
          // same file read 13 times, only 4 of them consecutively).
          //
          // Cheap, and it must not fail the tool: catat() appends JSONL and
          // swallows its own errors.
          try {
            // The workspace key is computed by temuan.kunciWs() — ONE place. If
            // its fallback chain differed between the write side and the read
            // side, the "ALREADY READ" block would always be empty with no error.
            const _t = require("../temuan.ts");
            _t.catat(
              _t.kunciWs(context && context.workspaceRoot),
              args.path,
              output,
              { alat: "read" },
            );
          } catch (_) {}
          return { ok: true, output };
        },
      );
    }
    if (name === "grep") {
      // qGrep() scans the ENTIRE source tree (a readFileSync per matching file,
      // up to 600 files) — measured at 5.26s cold, 252ms warm, and the LOOP IS
      // BLOCKED for almost all of it (event-loop sampler: ~93% of the duration).
      //
      // Its cache used to be useless: qGrep() was called OUTSIDE _cachedResult,
      // so the expensive work always ran again — _cachedResult only stores a
      // result ALREADY computed, it does not prevent the computation. The most
      // common pattern in an agent run is grepping the same or a similar pattern
      // many times in one session; that was the case saved by nothing at all.
      // qGrep() now moves INSIDE the callback, matching the list/read/glob shape.
      const _grepKey =
        "grep|" +
        (args.pattern || "") +
        "|" +
        (args.intent || "") +
        "|" +
        !!args.semantic;
      return _cachedResult(_grepKey, async () => {
        let output = await qGrepA(args.pattern, {
          intent: args.intent,
          semantic: args.semantic,
        });
        // Warn if results contain sensitive files (credential/config_sensitive)
        if (
          output &&
          !output.startsWith("(") &&
          !args.intent &&
          !args.semantic
        ) {
          const sensitiveFiles = output.split("\n").filter((line) => {
            const filePath = line.split(":")[0];
            if (!filePath) return false;
            const { blocking } = qSemanticCheck(filePath, "");
            return blocking.length > 0;
          });
          if (sensitiveFiles.length > 0) {
            output =
              "⚠️  PERINGATAN: " +
              sensitiveFiles.length +
              " sensitive files detected (credentials/config). Use `semantic:true` or `intent` for a safe search.\n\n" +
              output;
          }
        }
        return { ok: true, output };
      });
    }
    if (name === "edit") {
      const dest = qResolve(args.path, true);
      const old = fs.readFileSync(dest, "utf8");
      let targetToReplace = args.old_string;
      if (!old.includes(targetToReplace)) {
        // Smart fallback: match by line with indentation normalised
        // (whitespace-tolerant).
        const oldLines = old.split(/\r?\n/);
        const targetLines = args.old_string.split(/\r?\n/);
        let matchIndex = -1;
        let matchCount = 0;
        for (let i = 0; i <= oldLines.length - targetLines.length; i++) {
          let matched = true;
          for (let j = 0; j < targetLines.length; j++) {
            if (oldLines[i + j].trim() !== targetLines[j].trim()) {
              matched = false;
              break;
            }
          }
          if (matched) {
            matchIndex = i;
            matchCount++;
          }
        }
        if (matchCount === 1 && matchIndex >= 0) {
          targetToReplace = oldLines
            .slice(matchIndex, matchIndex + targetLines.length)
            .join("\n");
        } else {
          return {
            ok: false,
            output:
              "old_string was not found in the file. Use the read tool first to see the exact lines, or use replace_file_content with start_line and end_line.",
          };
        }
      }
      if (targetToReplace === args.new_string)
        return {
          ok: false,
          output:
            "NOOP: old_string is identical to new_string — edit cancelled.",
        };
      const patched = old.replace(targetToReplace, args.new_string);
      if (old === patched)
        return {
          ok: false,
          output:
            "NOOP: replace changed nothing (old_string did not match, or is already identical).",
        };

      // Sandbox Verify-Then-Commit
      const sbx = createSandboxSession();
      const sbxDest = sbx.writeTemp(path.basename(dest), patched);
      const chk = await qSyntaxOk(sbxDest);
      if (!chk.ok) {
        sbx.destroy();
        return {
          ok: false,
          output:
            "REJECTED BY SANDBOX (broken syntax, original file untouched):\n" +
            chk.error,
        };
      }
      // The structural quality gate (agent/code-quality.ts) — a ratchet: a dirty
      // file may be edited, but must not get deeper.
      const _qEdit = codeQuality.check(dest, patched, old);
      if (!_qEdit.ok) {
        sbx.destroy();
        return { ok: false, output: _qEdit.error };
      }

      // Commit
      createSnapshot([dest], "agent-edit: " + path.basename(dest));
      sbx.mirrorOut(path.basename(dest), dest);
      sbx.destroy();

      const absDest = path.resolve(dest);
      for (const k of Object.keys(require.cache)) {
        if (path.resolve(k) === absDest) {
          delete require.cache[k];
          break;
        }
      }
      return {
        ok: true,
        edited: true,
        path: absDest,
        output:
          "edited (Verify-Then-Commit) " +
          args.path +
          " (" +
          old.length +
          "->" +
          patched.length +
          " b, sintaks OK)",
      };
    }
    if (name === "replace_file_content") {
      const dest = qResolve(args.path, true);
      const oldStr = fs.readFileSync(dest, "utf8");
      const lines = oldStr.split("\n");
      const s = Math.max(1, args.start_line) - 1;
      const e = Math.min(
        lines.length,
        Math.max(args.start_line, args.end_line),
      );
      const targetBlock = lines.slice(s, e).join("\n");

      let newBlock: any;
      if (targetBlock.includes(args.target_content)) {
        newBlock = targetBlock.replace(
          args.target_content,
          args.replacement_content,
        );
      } else {
        const normalize = (t) =>
          t
            .replace(/^[ \t]+/gm, "")
            .replace(/\r\n/g, "\n")
            .trim();
        if (normalize(targetBlock) === normalize(args.target_content)) {
          newBlock = args.replacement_content;
        } else {
          return {
            ok: false,
            output: `GAGAL: target_content not found persis di baris ${args.start_line}-${args.end_line}.\n\nTeks asli di baris tersebut:\n${targetBlock}`,
          };
        }
      }

      const before = lines.slice(0, s).join("\n");
      const after = lines.slice(e).join("\n");
      const patched =
        (before ? before + "\n" : "") + newBlock + (after ? "\n" + after : "");

      // Sandbox Verify-Then-Commit
      const sbx = createSandboxSession();
      const sbxDest = sbx.writeTemp(path.basename(dest), patched);
      const chk = await qSyntaxOk(sbxDest);
      if (!chk.ok) {
        sbx.destroy();
        return {
          ok: false,
          output:
            "REJECTED BY SANDBOX (broken syntax, original file untouched):\n" +
            chk.error,
        };
      }
      // The structural quality gate. This path was MISSED by the first patch — it
      // has its own Verify-Then-Commit that checks SYNTAX only, so an edit
      // deepening nesting from 8 to 40 spaces passed and committed successfully.
      const _qAdv = codeQuality.check(dest, patched, oldStr);
      if (!_qAdv.ok) {
        sbx.destroy();
        return { ok: false, output: _qAdv.error };
      }

      // Commit
      createSnapshot([dest], "agent-edit-adv: " + path.basename(dest));
      sbx.mirrorOut(path.basename(dest), dest);
      sbx.destroy();

      const absDest = path.resolve(dest);
      for (const k of Object.keys(require.cache)) {
        if (path.resolve(k) === absDest) {
          delete require.cache[k];
          break;
        }
      }
      return {
        ok: true,
        edited: true,
        output:
          "replace_file_content (Verify-Then-Commit) " +
          args.path +
          " (" +
          oldStr.length +
          "->" +
          patched.length +
          " b, sintaks OK)",
      };
    }
    if (name === "write_artifact") {
      // Validation: never write "# undefined\n\nundefined" and then report
      // success. Empty args usually mean the argument JSON failed to parse (a
      // large content field was truncated).
      const title = (args.title || "").trim();
      const content = (args.content || "").trim();
      if (!title || !content) {
        return {
          ok: false,
          output:
            "FAILED to write artifact: title/content empty (arguments likely incomplete or the JSON was truncated). DO NOT assume success — call write_artifact again with both title AND content filled in.",
        };
      }
      const artifactDir = path.join(QROOT, "artifacts");
      if (!fs.existsSync(artifactDir))
        fs.mkdirSync(artifactDir, { recursive: true });
      // Derive the filename from the title when none is given, so different
      // artifacts do not overwrite each other at the same default "artifact.md".
      let fname = (args.filename || "").replace(/[\\/]/g, "").trim();
      if (!fname) {
        const slug =
          title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "")
            .slice(0, 40) || "artifact";
        fname = slug + ".md";
      }
      if (!/\.md$/i.test(fname)) fname += ".md";
      const dest = path.join(artifactDir, fname);
      fs.writeFileSync(dest, `# ${title}\n\n${content}`, "utf8");
      return {
        ok: true,
        edited: true,
        output: `Artifact created successfully at ${dest}`,
      };
    }
    if (name === "write") {
      const dest = qResolve(args.path, true);
      const existed = fs.existsSync(dest);

      // Sandbox Verify-Then-Commit
      const sbx = createSandboxSession();
      const sbxDest = sbx.writeTemp(path.basename(dest), args.content || "");
      const chk = await qSyntaxOk(sbxDest);
      if (!chk.ok) {
        sbx.destroy();
        return {
          ok: false,
          output: "REJECTED BY SANDBOX (broken syntax):\n" + chk.error,
        };
      }
      // The structural quality gate. A NEW file (existed=false) gets the hard
      // limit; an existing one gets a ratchet against its previous contents.
      let _oldForGate: any = null;
      if (existed) {
        try {
          _oldForGate = fs.readFileSync(dest, "utf8");
        } catch (_) {}
      }
      const _qWrite = codeQuality.check(dest, args.content || "", _oldForGate);
      if (!_qWrite.ok) {
        sbx.destroy();
        return { ok: false, output: _qWrite.error };
      }

      // Commit
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      createSnapshot([dest], "agent-write: " + path.basename(dest));
      sbx.mirrorOut(path.basename(dest), dest);
      sbx.destroy();

      // Invalidate require cache
      const absDest = path.resolve(dest);
      for (const k of Object.keys(require.cache)) {
        if (path.resolve(k) === absDest) {
          delete require.cache[k];
          break;
        }
      }
      return {
        ok: true,
        edited: true,
        path: absDest,
        output:
          (existed ? "overwrote" : "created") +
          " (Verify-Then-Commit) " +
          args.path +
          " (sintaks OK)",
      };
    }
    if (name === "bash") {
      const cmd = (args.command || "").trim();
      if (
        /\brm\s+-rf\b|\bdel\s+\/|\bformat\b|\bmkfs\b|shutdown|\breboot\b|:\(\)\s*\{|>\s*\/dev\/sd|\bcurl\b[^|]*\|\s*(sh|bash)|\bgit\s+push\b/i.test(
          cmd,
        )
      )
        return { ok: false, output: "dangerous command rejected" };
      // Reject bash commands that try to edit files — must use the 'edit' tool.
      //
      // NARROW, not merely a command-name match. The old regex flagged `findstr`
      // (Windows grep, which never writes), `sed` without -i (also no write), and
      // `node -e`/`node --eval` WHATEVER it contained — including the most
      // reasonable verification command there is, `node -e "console.log(1)"`.
      // Tested directly: that command was refused with an unrelated "use the edit
      // tool" message (no file was being edited at all).
      //
      // ok USED TO BE true for this refusal — a bug in itself. `ok:true` let the
      // refusal message through as "evidence" to the hallucination guard
      // (localAccessed, self_agent.ts) and it was never counted as a failure by
      // the stuck-item gate (which only looks at `!r.ok`). Now `ok:false`, so a
      // refusal looks like a refusal.
      if (
        /\b(sed\s+(?:-[a-z]*i\S*|--in-place)|Set-Content|Out-File|Add-Content|fs\.writeFile)\b/i.test(
          cmd,
        )
      )
        return {
          ok: false,
          output:
            'Editing files via bash is FORBIDDEN. Use the "edit" tool now with parameters: path=file, old_string=the removed code, new_string="" (empty to delete). Do NOT try bash again.',
        };

      // ── Close the shell bypass around the quality gate ──
      // The guard above only catches COMMAND NAMES (sed/Set-Content/node -e).
      // Tested empirically: `echo ... > x.jsx`, `printf ... > x.jsx` and
      // `tee x.jsx` all GOT THROUGH and the file landed on disk — meaning the
      // whole quality gate (and the syntax check) could be bypassed with a shell
      // redirect. What is guarded here is NOT any redirect (`> build.log` stays
      // legitimate) but a redirect or copy TARGETING a code file.
      if (_BASH_CODE_WRITE_RE.test(cmd))
        return {
          ok: false,
          output:
            "DITOLAK: menulis berkas kode lewat bash melewati gerbang kualitas & syntax check. " +
            'Gunakan tool "write" (berkas baru) atau "edit" (ubah yang ada) — keduanya memverifikasi ' +
            "sintaks dan struktur sebelum menyentuh disk.",
        };

      // ── CommandChain: bash is the proc.raw capability ──
      //
      // Until Phase 2, bash bypassed the broker entirely: absent from the audit,
      // silent about its scope, impossible to lock down. Here it becomes a
      // CommandChain transaction:
      //   - ADMISSION: proc.raw must be in the session's genesis vocabulary. If a
      //     session is frozen WITHOUT proc.raw, bash dies — and cannot be
      //     bypassed mid-run (that is its smart-contract property).
      //   - RECORD: every bash execution is chained into the ledger, with an
      //     HONEST scope marker (advisory on Windows — there is no namespace).
      // Fail-safe: if CommandChain cannot be loaded, bash still runs.
      {
        const cc = lazyCC();
        if (cc) {
          const rs = cc.sesiRuleset();
          const adm = cc.periksa(rs, "proc.raw");
          // An honest scope: only on Linux with bash-jail ready is it genuinely
          // enforced; otherwise (including ALL of Windows) it is advisory.
          const enforced = process.platform === "linux" && _bashJail.tersedia();
          const kurungan = {
            enforced,
            mekanisme: enforced
              ? "linux-namespace (bash-jail)"
              : process.platform === "win32"
                ? "advisory — Windows tanpa namespace"
                : "tanpa jail",
          };
          if (!adm.allow) {
            cc.catat({
              capability: "proc.raw",
              decision: "DENY",
              reason: adm.alasan,
              params: { command: cmd },
              kurungan,
            });
            return {
              ok: false,
              output:
                "Sesi ini dikunci tanpa eksekusi shell mentah (WOLFSPACE_CC_TANPA=proc.raw). Pakai capability_exec: ia terkurung ke workspace dan tetap bisa membaca/menulis berkasnya lewat request()." +
                "\nAlasan teknis: " +
                adm.alasan,
            };
          }
          cc.catat({
            capability: "proc.raw",
            decision: "ALLOW",
            params: { command: cmd },
            kurungan,
          });
        }
      }

      // The containment enforcement level for THIS execution. Reported back to
      // the caller so "contained" is no longer one word for two things of very
      // different strength.
      let _label = _penegakanLabel.label("kernel", "namespace");
      // Why AppContainer was not used, when it was not. Attached to the fallback
      // path's result too, so a downgraded guarantee does not pass unread.
      let _catatan_ac = "";
      // The AppContainer wrapper module, if that path is active. Null means the
      // shell is spawned directly, as before.
      let _bungkusAc: any = null;

      let cwd = QROOT;
      if (args.cwd) {
        try {
          const resolved = resolveDiskPath(args.cwd);
          const st = fs.statSync(resolved);
          if (st.isDirectory()) cwd = resolved;
        } catch {}
      }
      // ── bash confinement: there is ALWAYS a root, never null ──
      //
      // It used to be opt-in: with no active project, _confineRoot was null and
      // the whole block below — including _confineBash — NEVER ran. bash was then
      // entirely free. Measured, and this is what made the %VAR% fix look like it
      // "had not happened" when tested without selecting a project:
      //
      //   without workspaceRoot: `type C:\...\secret.txt` -> LEAKED
      //   with workspaceRoot   : `type C:\...\secret.txt` -> CONTAINED
      //
      // All 13 escape cases tested earlier used workspaceRoot, so the
      // "no project selected yet" condition was never touched — even though that
      // is the default state when the app is freshly opened.
      //
      // QROOT is now the fallback root: the agent can still edit its own source
      // (that is what a self-agent is for) but cannot leave the WOLFSPACE tree.
      // Containment becomes a property that is always present rather than one
      // that switches on only when a project happens to be selected.
      const _confineRoot =
        (context && context.workspaceRoot) ||
        process.env.WW_WORKSPACE_ROOT ||
        QROOT;
      if (_confineRoot) {
        // Primary: OS containment through Linux namespaces — a real boundary, not
        // a regex. It is gated by the central policy (agent/sandbox-policy.ts)
        // with an "auto" fallback; an explicit sandbox:false /
        // WOLFSPACE_SANDBOX=off is still honoured.
        //
        // Tested 13/13 on WSL, including 7 escape attempts: host file contents,
        // /root, /etc/passwd, walking up directories, writing /bin, the network
        // (tested at TCP level so it could not pass merely because DNS was down),
        // and heredoc injection.
        if (
          process.env.WW_BASH_NATIVE !== "1" &&
          _sandboxPolicy.shouldSandbox(
            _sandboxPolicy.configSandbox(),
            _bashJail.tersedia(),
            "auto",
          )
        ) {
          // The host-path guard is still used: the jail mounts only the workspace
          // folder, so a command naming an absolute host path will certainly not
          // find it — refused early with a clear reason rather than failing with
          // a confusing "No such file".
          const bocor = _hostPathEscape(cmd);
          if (bocor)
            return {
              ok: false,
              output:
                `TERKURUNG WORKSPACE: perintah menyebut path host "${bocor}", ` +
                "yang tidak ada di dalam pengurungan (hanya folder workspace yang " +
                "terlihat, sebagai /work).\n" +
                "Pakai path RELATIF (mis. ./src), atau tool lain: disk_read / " +
                "disk_list untuk membaca di luar workspace, capability_exec untuk " +
                "akses berpolicy + audit.",
            };
          const wd = _workdirDalamJail(_confineRoot, args.cwd);
          const hasilJail = await _bashJail.jalankan(cmd, _confineRoot, {
            timeout: args.timeout || 60000,
            workdir: wd,
          });
          return {
            ...hasilJail,
            ..._penegakanLabel.label("kernel", "namespace"),
          };
        }
        // ── The DEFAULT on Windows: AppContainer ──
        //
        // This is tried BEFORE every other path, and needs no switching on.
        // The reason: the bottom fallback path only SCANS COMMAND TEXT, and that
        // is demonstrably defeatable — a command that assembles a path at run
        // time passes the scan and genuinely creates a folder on the Desktop.
        // While the text path is the default, the boundary in force is "none".
        //
        // AppContainer gives a token carrying a container SID. File access checks
        // then REQUIRE that SID in the object's DACL, so the whole filesystem is
        // closed except what is explicitly opened. Deny-by-default, in the kernel,
        // and WITHOUT elevation.
        //
        // Measured through this path, on the very same escapes:
        //   write Desktop / read cloud-keys / read Documents\oi  -> refused
        //   a path ASSEMBLED at run time to the Desktop           -> refused
        //   read + write + delete in the workspace, node          -> allowed
        //
        // Chosen over the two paths below it: commands stay PowerShell (WSL
        // replaces them with POSIX sh), and it does not require WOLFSPACE to run
        // as Administrator (the separate-account path did, which enlarges the
        // attack surface instead).
        //
        // WOLFSPACE_BASH_AC=0 turns it off. That EXISTS so the escape hatch is
        // visible and recorded, not so it gets used: turning it off returns bash
        // to the text scanning that has already been shown to leak.
        //
        // WRAPPED, NOT BRANCHED. The first version of this path called
        // execFileSync in its own branch and returned immediately. That appeared
        // to work while breaking two things invisible from the result:
        // execFileSync BLOCKS the event loop for as long as the command runs (in
        // an Electron app that means the UI freezes every time the agent runs
        // bash), and it bypassed the whole machinery below — AbortController, the
        // TIMEOUT vs CANCELLED distinction, output streaming, session process
        // tracking. So all that is swapped is the EXE being spawned: AcLaunch.exe
        // runs exactly the same shell with exactly the same arguments, inside the
        // container. Command semantics do not change at all.
        if (
          process.platform === "win32" &&
          process.env.WOLFSPACE_BASH_AC !== "0" &&
          process.env.WOLFSPACE_BASH_AC !== "false" &&
          // An explicit request wins. Without this condition, this path would
          // hijack a WOLFSPACE_BASH_WSL that someone deliberately turned on.
          !process.env.WOLFSPACE_BASH_WSL
        ) {
          const _ac = require("./appcontainer-jail.ts");
          const siapAc = await _ac.siapUntuk(_confineRoot);
          if (siapAc.siap) {
            _bungkusAc = _ac;
            _label = _penegakanLabel.label("kernel", "appcontainer");
          } else {
            // Not being ready is no reason to stay quiet. If the container is
            // gone the boundary drops sharply, and that has to be readable —
            // not merely run more slowly.
            _catatan_ac =
              "\n[AppContainer tak aktif: " +
              siapAc.alasan +
              " — jalankan scripts/appcontainer/pasang.ps1]";
          }
        }
        // The separate-account path (WOLFSPACE_BASH_ACL) was REMOVED.
        //
        // It contained through NTFS ACLs by running the shell as another
        // account. The boundary was real, but Start-Process -Credential requires
        // WOLFSPACE itself to run as Administrator — raising the whole
        // application's privileges in order to lower one command's, which
        // enlarges the attack surface instead. AppContainer gives an equivalent
        // kernel boundary with NO elevation at all, so that path lost its only
        // reason to exist, taking an account, DPAPI credentials and a share to
        // maintain with it.
        // ── The WSL path: kernel containment on Windows, OPT-IN ──
        //
        // Windows has no namespace equivalent, so the path below can only scan
        // text — and that is demonstrably defeatable. This path gives a real
        // boundary: the folder stays on Windows, is shared over SMB, mounted
        // into the distro as /work, then run inside a bwrap binding only /work.
        //
        // OPT-IN, and the reason is not caution: commands are run by `sh` on
        // Linux, NOT PowerShell. `dir`, `Get-ChildItem` and `%VAR%` do not apply
        // there. Making it the default would break every PowerShell command the
        // model has already written — a semantic change that has to be chosen
        // deliberately, not inherited.
        //
        // Measured once installed: the escape that used to create a folder on
        // the Desktop now returns ENOENT; /etc is not writable; the network is
        // cut; 200 small files take 3 seconds (CIFS) vs 1 second (local).
        if (
          process.env.WOLFSPACE_BASH_WSL === "1" ||
          process.env.WOLFSPACE_BASH_WSL === "true"
        ) {
          const _wj = require("./wsl-jail.ts");
          const siap = _wj.tersedia();
          if (siap.siap) {
            return await _wj.jalankan(cmd, {
              timeout: args.timeout || 120000,
              jaringan: args.network === true,
            });
          }
          return {
            ok: false,
            ..._penegakanLabel.label("penasihat", "wsl-tak-siap"),
            output:
              "WOLFSPACE_BASH_WSL=1 diminta, tapi jalur WSL tak siap: " +
              siap.alasan +
              "\nSiapkan share + kredensial lebih dulu, atau lepas variabel itu " +
              "untuk kembali ke jalur Windows (yang batasnya hanya pemeriksaan teks).",
          };
        }
        // Fallback: the regex guard (leaky, defence-in-depth) when namespaces are
        // unavailable — on Windows, for instance, whose kernel has no equivalent.
        //
        // "Leaky" is MEASURED, not rhetorical caution. The guard scans the
        // command TEXT: reject '..', then every path-shaped token must resolve
        // inside root. A command that ASSEMBLES a path at run time has no token
        // to scan, so it walks straight through:
        //
        //   ls "C:/Users/dave/Desktop"                      -> held
        //   ls ../Desktop                                   -> held
        //   node -e "...String.fromCharCode(67,58,47,...)"  -> GOT THROUGH, read
        //
        // The third attempt read a directory outside the workspace and succeeded.
        // That is not a defect a cleverer regex can patch — scanning text can
        // never know what will be assembled at run time. The correct boundary is
        // in the kernel, and on Windows the kernel has no equivalent.
        //
        // So the result is LABELLED. Without a label, "WORKSPACE CONTAINED"
        // reads like a kernel guarantee when it is not — exactly the kind of
        // report that is more dangerous than reporting nothing.
        //
        // SKIPPED when AppContainer is active, and that is not a simplification.
        // Running a text scanner on top of a kernel boundary adds no security at
        // all — what it refuses the kernel already refuses — but it ADDS false
        // refusals: a legitimate command that happens to name an absolute path
        // outside the workspace (reading documentation, comparing files) would be
        // held even though the kernel would handle it correctly. And the label
        // would lie in the other direction: "advisory" on a command that is in
        // fact kernel-contained.
        if (_bungkusAc) {
          cwd = _confineRoot;
        } else {
          _label = _penegakanLabel.label("penasihat", "heuristik-teks");
          const guard = _confineBash(cmd, args.cwd, _confineRoot);
          if (!guard.ok)
            return {
              ok: false,
              ..._penegakanLabel.label("penasihat", "heuristik-teks"),
              // The wording deliberately does NOT say "contained".
              //
              // It used to read "WORKSPACE CONTAINED (regex fallback)", and the
              // consequence was measured: the agent passed it on to the user as
              // "the attempt to move to C:\Users\dave\Desktop was blocked by the
              // security system". That sentence was true of THAT command, but
              // read as a guarantee holding generally — while the next command,
              // with a path assembled at run time, successfully CREATED a folder
              // on the Desktop.
              //
              // Holding some while sounding like holding everything is worse
              // than holding nothing: people stop being careful. So what was
              // removed is the claim, not the check — this check is still useful
              // for catching typos, and only for that.
              output:
                "DITOLAK oleh pemeriksaan teks (BUKAN batas keamanan): " +
                guard.reason +
                "\nPemeriksaan ini hanya memindai teks perintah, jadi ia MELEWATKAN " +
                "path yang dirakit saat jalan. Jangan perlakukan sebagai jaminan.\n" +
                "Pengurungan sungguhan: jalankan dengan `npm run app:wsl` (batas " +
                "kernel), atau pakai capability_exec (akses berpolicy + audit)." +
                _catatan_ac,
            };
          cwd = guard.cwd;
        }
      }
      // Resolve session from context (passed by self_agent) or fallback to default
      const sessId = (context && context.sessionId) || "_default";
      if (!_sessionResources.has(sessId)) createSession();
      // Use spawn with AbortController for external cancellation
      return new Promise((resolve) => {
        const controller = new AbortController();
        const signal = controller.signal;
        // The shell is chosen through the platform adapter, NOT hardcoded to
        // "cmd.exe".
        //
        // This line used to call cmd.exe unconditionally. On Windows that is
        // correct, but once the backend runs on Linux/WSL, WSL interop dutifully
        // launches the REAL Windows cmd.exe — and then it fails:
        //     exit 2: '\\wsl.localhost\WolfspaceTest\root\wolfspace'
        //     CMD.EXE was started with the above path as the current directory.
        //     UNC paths are not supported.
        // Misleadingly, a command as simple as `echo hello` still SUCCEEDS
        // (cmd.exe has echo too), so the damage only surfaces on Unix-flavoured
        // commands like `ls`. The platform adapter already exists precisely for
        // this: posix returns ['/bin/sh', ['-c', cmd]].
        // The command script file has to land somewhere the container can READ.
        // The default is the system temp, which is closed — and since commands
        // are run through that file, everything failed before it started.
        let [shBin, shArgs] = getPlatformAdapter().shellFor(
          cmd,
          _bungkusAc ? { scriptDir: _dirSkripAc(cwd) } : {},
        );
        // The shell and its arguments are UNCHANGED — only run inside an
        // AppContainer token. That is why `dir`, `type`, `%VAR%` and all of
        // cmd.exe's semantics still apply exactly as before.
        if (_bungkusAc)
          [shBin, shArgs] = _bungkusAc.bungkus(cwd, shBin, shArgs);
        const child = spawn(shBin, shArgs, {
          cwd,
          windowsHide: true,
          // The AppContainer additions reach AcLaunch only; they are not
          // inherited by the command — see envTambahan(). The env hardening
          // stays intact.
          env: _bungkusAc
            ? { ..._envBash(cwd), ..._bungkusAc.envTambahan(cwd) }
            : _envBash(cwd),
          signal,
        });
        trackProcess(sessId, child);
        const entry = _registerBashProcess(sessId, controller, child, cmd);
        let stdout = "",
          stderr = "",
          timedOut = false,
          aborted = false;
        const timeoutMs = args.timeout || 60000;
        const timer = setTimeout(() => {
          timedOut = true;
          controller.abort("timeout");
          child.kill();
        }, timeoutMs);
        // Poll isCancelled (if provided) every second to honour user cancellation
        const isCancelled = (context && context.isCancelled) || (() => false);
        const cancelCheck = setInterval(() => {
          if (isCancelled() && !timedOut && !aborted) {
            aborted = true;
            timedOut = true;
            clearTimeout(timer);
            controller.abort("cancelled");
            child.kill();
            _unregisterBashProcess(sessId, entry);
            resolve({
              ok: false,
              output:
                "DIBATALKAN: perintah dihentikan oleh user.\n" +
                cmd.slice(0, 200),
            });
          }
        }, 1000);
        child.stdout.on("data", (chunk) => {
          const text = chunk.toString();
          stdout += text;
          if (emit)
            emit({
              t: "act",
              kind: "bash",
              arg: cmd.slice(0, 60),
              ok: true,
              output: text.slice(0, 1000),
            });
        });
        child.stderr.on("data", (chunk) => {
          const text = chunk.toString();
          stderr += text;
          if (emit)
            emit({
              t: "act",
              kind: "bash",
              arg: cmd.slice(0, 60),
              ok: true,
              output: text.slice(0, 1000),
            });
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          clearInterval(cancelCheck);
          _unregisterBashProcess(sessId, entry);
          if (timedOut && !aborted)
            return resolve({
              ok: false,
              output:
                "TIMEOUT (" + timeoutMs / 1000 + "s): " + cmd.slice(0, 100),
            });
          if (aborted) return; // already resolved above
          // Containment-specific failures are explained before they reach the
          // model. git's own message ("Permission denied" while opening
          // /dev/null) points people at the repo's file rights, which is not the
          // cause at all — and the model would spend turn after turn chasing
          // that wrong theory.
          const _terangkan = (t) =>
            _bungkusAc ? _bungkusAc.jelaskan(t, cmd) : t;
          // A SILENT failure inside the container: a non-zero exit code with not
          // a word of output. Handled before anything else, because its "success
          // with no result" shape is the misleading one.
          const _senyap = _bungkusAc ? _bungkusAc.jelaskanKode(code) : null;
          if (_senyap) {
            _unregisterBashProcess(sessId, entry);
            return resolve({
              ok: false,
              ..._label,
              output: _senyap,
            });
          }
          const full = _terangkan((stdout || stderr || "").trim());
          if (code !== 0 && stderr) {
            resolve({
              ok: false,
              // The label goes on FAILED results too. Without it, the result
              // most easily read as "blocked by the security system" would be
              // the only one not naming which boundary applied — and the
              // kernel's "Access is denied" would be indistinguishable from any
              // ordinary error.
              ..._label,
              output:
                "exit " +
                code +
                ":\n" +
                _terangkan(
                  (stderr.trim() || stdout.trim() || "(no output)").slice(
                    0,
                    4000,
                  ),
                ),
            });
          } else {
            resolve({
              ok: true,
              // On SUCCESSFUL results too, not only refusals. It is precisely
              // when a command succeeds that knowing which boundary applied
              // matters: a refusal obviously held something, a success does not.
              ..._label,
              output: full.slice(0, 4000) || "(exit " + code + ")",
            });
          }
        });
        child.on("error", (err) => {
          clearTimeout(timer);
          clearInterval(cancelCheck);
          _unregisterBashProcess(sessId, entry);
          // An AbortError can come from TWO sources (the timeout timer OR the
          // user's cancelCheck), and `error` always fires before `close` — spawn
          // with `signal` throws immediately after abort(), while close waits for
          // the OS to actually reap the process. So the "TIMEOUT" branch in close
          // below is NEVER reached for a timeout: error wins first. Measured
          // directly: a 3s timeout was reported as "CANCELLED: command stopped by
          // user" — the model read that as "the user stopped me" rather than "my
          // command took too long", and never learned to shorten its work.
          // `aborted` is only set true by cancelCheck (a genuine user
          // cancellation), so that is what separates the two.
          if (err.name === "AbortError") {
            if (aborted)
              return resolve({
                ok: false,
                output:
                  "DIBATALKAN: perintah dihentikan oleh user.\n" +
                  cmd.slice(0, 200),
              });
            return resolve({
              ok: false,
              output:
                "TIMEOUT (" + timeoutMs / 1000 + "s): " + cmd.slice(0, 100),
            });
          }
          resolve({ ok: false, output: "spawn error: " + err.message });
        });
      });
    }
    if (name === "opencode_run") {
      const instruction = args.instruction || "";
      let cwd = QROOT;
      if (args.cwd) {
        try {
          const resolved = resolveDiskPath(args.cwd);
          const st = fs.statSync(resolved);
          if (st.isDirectory()) cwd = resolved;
        } catch {}
      }
      return new Promise((resolve) => {
        let opencodeCmd = `opencode run "${instruction.replace(/"/g, '\\"')}" --dangerously-skip-permissions`;
        if (args.model) {
          const mArg = args.provider
            ? `${args.provider}/${args.model}`
            : args.model;
          opencodeCmd += ` -m ${mArg}`;
        }
        const customEnv = { ...process.env };
        try {
          const fs = require("fs");
          // Read from the correct key location (~/.wolfspace via keys-path.ts).
          // The old path <project>/cloud-keys.json was moved out for session
          // security, so the old read ALWAYS failed (swallowed by catch) and
          // opencode_run lost its keys.
          const { resolveKeysPath } = require("../keys-path.ts");
          const keysStr = fs.readFileSync(resolveKeysPath(), "utf8");
          const keys = JSON.parse(keysStr);
          if (keys.opencode?.key)
            customEnv["OPENCODE_API_KEY"] = keys.opencode.key;
          if (keys.anthropic?.key)
            customEnv["ANTHROPIC_API_KEY"] = keys.anthropic.key;
          if (keys.openai?.key) customEnv["OPENAI_API_KEY"] = keys.openai.key;
          if (keys.gemini?.key) customEnv["GEMINI_API_KEY"] = keys.gemini.key;
          if (keys.openrouter?.key)
            customEnv["OPENROUTER_API_KEY"] = keys.openrouter.key;
          // Set default model if agent didn't specify one
          if (!args.model && keys.opencode?.model) {
            opencodeCmd += ` -m ${keys.opencode.model}`;
          }
        } catch (e) {
          // silently ignore if cloud-keys.json is missing or invalid
        }

        // Override with explicit args if provided by the LangGraph agent
        if (args.api_key) {
          if (args.provider === "anthropic")
            customEnv["ANTHROPIC_API_KEY"] = args.api_key;
          else if (args.provider === "openai")
            customEnv["OPENAI_API_KEY"] = args.api_key;
          else customEnv["OPENCODE_API_KEY"] = args.api_key;
        }

        const cmdArgs = ["/d", "/c", opencodeCmd];
        const child = spawn("cmd.exe", cmdArgs, {
          cwd,
          windowsHide: true,
          env: customEnv,
        });
        let stdout = "",
          stderr = "";
        child.stdout.on("data", (chunk) => {
          const text = chunk.toString();
          stdout += text;
          if (emit)
            emit({
              t: "act",
              kind: "opencode",
              arg: instruction.slice(0, 60),
              ok: true,
              output: text.slice(-500),
            });
        });
        child.stderr.on("data", (chunk) => {
          const text = chunk.toString();
          stderr += text;
          if (emit)
            emit({
              t: "act",
              kind: "opencode",
              arg: instruction.slice(0, 60),
              ok: true,
              output: text.slice(-500),
            });
        });
        child.on("close", (code) => {
          let full = (stdout || stderr || "")
            .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "")
            .trim();
          if (code !== 0 && stderr) {
            resolve({
              ok: false,
              output:
                "opencode failed (exit " + code + "):\n" + full.slice(-4000),
            });
          } else {
            resolve({
              ok: true,
              output: "opencode success:\n" + full.slice(-4000),
            });
          }
        });
        child.on("error", (err) => {
          resolve({ ok: false, output: "spawn error: " + err.message });
        });
      });
    }
    // ── Attachments: the thing crossed over, its address never did ──
    //
    // There is no path check here, and that is NOT an oversight: the bridge
    // (agent/attachment-bridge.ts) never receives a path, so there is no address
    // to check or to break through. What the agent holds is a random handle;
    // holding it grants exactly one thing — the contents of that one file. It
    // says nothing about where the file is, cannot be used to read its siblings,
    // and cannot list any directory.
    //
    // It still goes through CommandChain so it is audited and can be LOCKED per
    // session (buatRuleset({ tanpa:["attachment.read"] })), following the
    // proc.raw pattern.
    if (name === "attachment_list" || name === "attachment_read") {
      let bridge: any;
      try {
        bridge = require("../attachment-bridge.ts");
      } catch (e) {
        return {
          ok: false,
          output: "jembatan lampiran tak tersedia: " + e.message,
        };
      }

      if (name === "attachment_list") {
        const d = bridge.daftar();
        if (!d.length)
          return {
            ok: true,
            output:
              "(belum ada lampiran) — hanya user yang bisa melampirkan berkas; " +
              "tak ada tool untuk membuka berkas dari direktori.",
          };
        return {
          ok: true,
          output: d
            .map(
              (a) =>
                a.id +
                "  " +
                a.nama +
                "  (" +
                a.bytes +
                " b" +
                (a.tipe ? ", " + a.tipe : "") +
                ")",
            )
            .join("\n"),
        };
      }

      const cc = lazyCC();
      if (cc) {
        const rs = cc.sesiRuleset();
        const adm = cc.periksa(rs, "attachment.read");
        // enforced=true, and this is the ONLY file capability allowed to claim
        // it on Windows: the guarantee is not directory containment (which is
        // advisory here) but the complete absence of a path.
        const kurungan = {
          enforced: true,
          mekanisme: "handle-only — alamat berkas tak pernah masuk ke sistem",
        };
        if (!adm.allow) {
          cc.catat({
            capability: "attachment.read",
            decision: "DENY",
            reason: adm.alasan,
            params: { id: args.id },
            kurungan,
          });
          return {
            ok: false,
            output:
              "CommandChain menolak attachment.read: " +
              adm.alasan +
              ". Sesi ini dikunci tanpa pembacaan lampiran.",
          };
        }
        cc.catat({
          capability: "attachment.read",
          decision: "ALLOW",
          params: { id: args.id },
          kurungan,
        });
      }

      const r = bridge.ambil(args.id);
      if (!r.ok) return { ok: false, output: r.error };
      return {
        ok: true,
        output: "[" + r.nama + ", " + r.bytes + " byte]\n" + r.isi,
      };
    }

    if (name === "todowrite") {
      const todos = args.todos || [];
      if (emit) emit({ t: "todos", todos });
      const summary = todos
        .map((t) => {
          const icon =
            t.status === "completed"
              ? "✓"
              : t.status === "in_progress"
                ? "→"
                : t.status === "cancelled"
                  ? "✗"
                  : "○";
          return `${icon} [${t.priority || "medium"}] ${t.content}`;
        })
        .join("\n");
      return {
        ok: true,
        output: `Task list updated (${todos.length} items):\n${summary}`,
      };
    }
    if (name === "question") {
      const q = args.question || "";
      const choices = args.choices || [];
      const choicesText = choices.length
        ? "\n\nSuggested answers:\n" +
          choices.map((c, i) => `${i + 1}. ${c}`).join("\n")
        : "";
      return {
        ok: true,
        output: `Question: ${q}${choicesText}`,
        needsAnswer: true,
        question: q,
        choices,
      };
    }
    if (name === "terminal_open") {
      if (!term)
        return {
          ok: false,
          output: "terminal unavailable (node-pty is not installed)",
        };
      const r = term.create(args.cwd || undefined, args.shell || undefined);
      return {
        ok: true,
        output: "terminal opened: " + r.id + " (pid " + r.pid + ")",
      };
    }
    if (name === "terminal_write") {
      if (!term) return { ok: false, output: "terminal unavailable" };
      if (!args.id) return { ok: false, output: "parameter id wajib" };

      // A PTY is a FULL shell — anything typed into it executes without passing
      // the bash guard or the quality gate. While this tool was broken
      // (term=null) that gap was invisible; the moment it was fixed it was
      // immediately demonstrated: `echo "<40 spaces>" > x.jsx` through
      // terminal_write landed intact on disk. The same guard as bash and
      // sandbox_run is used here.
      if (_BASH_CODE_WRITE_RE.test(String(args.data || "")))
        return {
          ok: false,
          output:
            "DITOLAK: menulis berkas kode lewat terminal melewati gerbang kualitas & " +
            'syntax check. Gunakan tool "write" (berkas baru) atau "edit" (ubah yang ada).',
        };

      const ok = term.write(args.id, args.data);
      return { ok, output: ok ? "written" : "session not found: " + args.id };
    }
    // ACTIVE: terminal_read is registered in tool-definitions.ts and invoked by the agent
    // to poll accumulated PTY output. The polling loop (up to 2s) prevents empty reads
    // right after a terminal_write before the shell has produced output.
    if (name === "terminal_read") {
      if (!term) return { ok: false, output: "terminal unavailable" };
      if (!args.id) return { ok: false, output: "parameter id wajib" };
      // Wait briefly for output (up to 2s) so agent doesn't read empty buffer immediately after write
      return new Promise((resolve) => {
        let waited = 0;
        const poll = () => {
          const buf = term.readBuffer(args.id, false);
          if (buf && buf.trim()) {
            const out = term.readBuffer(args.id, args.clear) || buf;
            return resolve({ ok: true, output: out || "(no output yet)" });
          }
          waited += 100;
          if (waited >= 2000)
            return resolve({ ok: true, output: buf || "(no output yet)" });
          setTimeout(poll, 100);
        };
        poll();
      });
    }
    if (name === "terminal_close") {
      if (!term) return { ok: false, output: "terminal unavailable" };
      if (!args.id) return { ok: false, output: "parameter id wajib" };
      const ok = term.destroy(args.id);
      return {
        ok,
        output: ok
          ? "session closed: " + args.id
          : "session not found: " + args.id,
      };
    }
    if (name === "architecture_map") {
      const m = lazyArch();
      if (!m.architectureMap)
        return { ok: false, output: "arch-tools failed to load" };
      try {
        return m.architectureMap(args);
      } catch (e) {
        return { ok: false, output: "architecture_map error: " + e.message };
      }
    }
    if (name === "web_search")
      return webSearch(args.query).then(
        (r) => ({ ok: true, output: r }),
        (e) => ({ ok: false, output: e.message }),
      );
    if (name === "web_fetch")
      return webFetch(args.url).then(
        (r) => ({ ok: true, output: r }),
        (e) => ({ ok: false, output: e.message }),
      );
    if (name === "web_extract") {
      // Admission-gated, unlike web_fetch.
      //
      // The difference is real: web_extract runs a full browser and executes the
      // page's JavaScript. That is a far wider network capability than merely
      // fetching text, so it is treated like any other capability — revocable
      // through buatRuleset({ tanpa: ["network:https"] }), with its refusals
      // recorded in the ledger.
      //
      // web_fetch is deliberately NOT gated here: changing it would break flows
      // already in use, and that is a separate decision.
      const cc = require("../broker/commandchain.ts");
      const adm = cc.periksa(cc.sesiRuleset(), "network:https");
      if (!adm.allow) {
        cc.catat({
          capability: "network:https",
          decision: "DENY",
          reason: adm.alasan,
          params: { tool: "web_extract", url: args.url },
          kurungan: {
            enforced: true,
            mekanisme:
              "admission genesis + penjaga tujuan (loopback/privat ditolak)",
          },
        });
        return { ok: false, output: "web_extract ditolak: " + adm.alasan };
      }
      return webExtract(args).then(
        (r) => ({ ok: true, output: r }),
        (e) => ({ ok: false, output: e.message }),
      );
    }
    if (name === "retrieve") {
      // RAG: recall KNOWLEDGE (project memory plus docs). P1 is a single
      // "global" store so ingest (frontend) and retrieve (here) always share a
      // key. Per-ww isolation (scope via workspaceRoot) is P3 — at which point
      // ingest is keyed to the same ref.
      const rag = require("../rag.ts");
      const out = rag.retrieveFormatted("global", args.query, {
        k: args.k,
        kind: args.kind || undefined,
      });
      return { ok: true, output: out };
    }
    if (name === "dspy") {
      // Real DSpy optimization via native JS (WOLFSPACE's cloud LLM, no Python)
      // ../, not ./ — dspy_tool lives in agent/, not agent/tools/. With the
      // wrong path this tool threw "Cannot find module" on every call, and
      // nothing noticed because no test calls it and the throw is caught and
      // returned to the model as a tool failure.
      const dspyTool = require("../dspy_tool.ts");
      return dspyTool.run(args);
    }
    if (name === "generate_3d") {
      // Text/image-to-3D through Replicate (TRELLIS + flux). Confining its output
      // to workspaceRoot is handled inside the module.
      const g3 = require("./gen3d-tools.ts");
      return await g3.generate3d(args, context);
    }
    // The disk_* tools were REMOVED — this used to hold disk_list/disk_read/
    // disk_glob/disk_grep, which accepted ANY path and never passed through the
    // `if (_wsRoot)` block above, so they ignored worktree containment entirely.
    //
    // They were withdrawn from SELF_TOOLS long ago (see the note in
    // tool-definitions.ts), so the model CANNOT call them — this implementation
    // is dead code. But dead code that pierces containment is a landmine: one
    // line returning them to the tool list is enough to undo the whole
    // containment, without a single test going red.
    //
    // The disk-tools.ts functions themselves are STILL used: diskListA/diskGlobA/
    // diskGrepA serve the list/glob/grep that ARE confined to _wsRoot, and
    // resolveDiskPath is used by bash for cwd. What was removed is the tool path,
    // not the module.

    if (name === "skill_list") {
      const list = skills.listSkills();
      const text = list.length
        ? list
            .map((s) => "- " + s.name + " v" + s.version + ": " + s.description)
            .join("\n")
        : "(no skills installed yet. Use skill_install to add one.)";
      return { ok: true, output: text };
    }
    if (name === "skill_run") {
      const sandboxRunner = (cmd, opts) =>
        sandbox.sandboxRun(cmd, { ...opts, ...sandbox.defaultSandboxOpts() });
      return skills.runSkill(args.name, args.args || {}, sandboxRunner).then(
        (r) => r,
        (e) => ({ ok: false, output: e.message }),
      );
    }
    if (name === "skill_install") {
      const src = (args.source || "").trim();
      if (!src)
        return {
          ok: false,
          output:
            "source is required (npm package name or path to a .cjs file)",
        };
      if (src.endsWith(".cjs") && fs.existsSync(src)) {
        return { ok: true, output: skills.installFromFile(src).output };
      }
      // Try npm install
      return skills.installFromNpm(src).then(
        (r) => r,
        (e) => ({ ok: false, output: e.message }),
      );
    }
    if (name === "git") {
      // git CANNOT run inside an AppContainer — it opens /dev/null with O_RDWR
      // at startup, and the NUL device cannot be read there. So once bash became
      // kernel-contained, this is the only remaining route for git, and its shape
      // is deliberately not "run a git command" but named operations with argv
      // built by the tool itself.
      //
      // Its admission lives INSIDE the tool: only WRITE operations are gated,
      // because only write operations can run repo hooks outside the containment.
      // Gating `status` and `log` too would only make lockdown feel arbitrary
      // without closing anything.
      return require("./git-tool.ts").jalankan(
        args || {},
        (context && context.workspaceRoot) ||
          process.env.WW_WORKSPACE_ROOT ||
          QROOT,
      );
    }
    if (name === "net_diag") {
      // No proc.raw admission: this tool does NOT spawn a shell and accepts no
      // command. It calls wsl.exe with argv it builds itself from a fixed list,
      // so its authority is already as narrow as its definition — not something
      // needing separate revocation.
      return require("./net-diag.ts").jalankan(args || {});
    }
    if (name === "sandbox_run") {
      // ── proc.raw admission, the same as bash ──
      //
      // WHY IT EXISTS. sandbox_run spawns an OS process exactly as bash does, but
      // used to bypass CommandChain entirely. The consequence was measured: with
      // WOLFSPACE_CC_TANPA=proc.raw, bash died completely — including the proven
      // escape path — while sandbox_run kept running AND still succeeded in
      // creating a folder outside the workspace.
      //
      // A lockdown that closes one door while leaving the one beside it open is
      // not a lockdown; it just moves the route. And that is worse than no
      // lockdown, because people believe the session is locked.
      try {
        const cc = require("../broker/commandchain.ts");
        const rs = cc.sesiRuleset();
        const adm = cc.periksa(rs, "proc.raw");
        if (!adm.allow) {
          cc.catat({
            capability: "proc.raw",
            decision: "DENY",
            reason: adm.alasan,
            params: { command: String(args.command || "") },
          });
          return {
            ok: false,
            ..._penegakanLabel.label("penasihat", "admission"),
            output:
              "Sesi ini dikunci tanpa eksekusi proses mentah (WOLFSPACE_CC_TANPA=proc.raw). Pakai capability_exec (terkurung ke workspace + diaudit) atau tool write/edit." +
              "\nAlasan teknis: " +
              adm.alasan,
          };
        }
      } catch (_) {
        // CommandChain did not load: do not silently become permission. This tool
        // spawns an OS process, so a missing checker must close rather than open.
        // The same principle as flagPermission refusing to run under Node 20
        // instead of running with no containment.
        return {
          ok: false,
          ..._penegakanLabel.label("penasihat", "admission"),
          output:
            "sandbox_run ditolak: CommandChain tak tersedia untuk memeriksa " +
            "admission proc.raw, dan tool ini men-spawn proses OS.",
        };
      }
      // This tool's own description states that the spawned process has "normal
      // OS-level filesystem access" — so it can write code files anywhere,
      // bypassing both the quality gate AND the syntax check. Proven
      // empirically: `echo "<40 spaces>" > public/x.jsx` landed intact on disk.
      // The same guard as bash is used here; its scope is equally narrow (only
      // targets with a code extension).
      if (_BASH_CODE_WRITE_RE.test(String(args.command || "")))
        return {
          ok: false,
          output:
            "DITOLAK: menulis berkas kode lewat sandbox_run melewati gerbang kualitas & " +
            'syntax check. Gunakan tool "write" (berkas baru) atau "edit" (ubah yang ada).',
        };
      const opts = { ...sandbox.defaultSandboxOpts() };
      if (args.timeout) opts.timeout = args.timeout;
      if (args.cwd) opts.cwd = args.cwd;
      if (args.network !== undefined) opts.networkAllowed = args.network;
      if (args.readRoots) opts.readRoots = args.readRoots;
      if (args.writeRoots) opts.writeRoots = args.writeRoots;
      // sandbox_run used to be the only execution tool that did not report its
      // enforcement level, even though its own description admits: "the spawned
      // process itself has normal OS-level filesystem and network access, so this
      // is NOT a security boundary". That admission was in text for the model —
      // not in the RESULT, where a machine could check it.
      //
      // The source is not a guess: the platform adapter already answers it
      // through capabilities().fsIsolation ('none' | 'advisory' | 'enforced').
      // All that was missing was a way for that answer to reach the caller.
      const _labelSandbox = _penegakanLabel.dariAdapter(
        sandbox.adapterCapabilities(),
        "bwrap",
      );
      return sandbox.sandboxRun(args.command, opts).then(
        (r) => ({
          ok: r.ok,
          output: r.output + (r.error ? "\nError: " + r.error : ""),
          sandboxId: r.sessionId,
          // If AppContainer is genuinely installed for this execution, THAT is
          // what applies — not the platform adapter's general answer, which
          // speaks for the JS helper path and knows nothing about the container.
          ...(r.terkurungAc
            ? _penegakanLabel.label("kernel", "appcontainer")
            : _labelSandbox),
        }),
        (e) => ({ ok: false, output: e.message, ..._labelSandbox }),
      );
    }
    if (name === "capability_exec") {
      const b = lazyBroker();
      if (!b.Policy)
        return {
          ok: false,
          output:
            "broker module not available: " +
            (_modLoadErrors["broker"] || "unknown error"),
        };
      const { Policy, Broker, runInCapabilityZone } = b;
      // The scope follows the ACTIVE workspace, not the global WORKSPACE.
      //
      // WORKSPACE is one fixed folder inside WOLFSPACE's own tree
      // (QROOT/workspace). Using it while the agent is confined to another folder
      // is wrong in TWO directions at once:
      //   1. leaky   — an agent confined to project X is still granted read and
      //      write inside the WOLFSPACE tree. That pierces the very containment
      //      read/write/edit/bash install just above.
      //   2. crippled — request() for its OWN project's files is always refused,
      //      so capability_exec is practically unusable in ww mode.
      // The scope source is unified with the other tools in this file
      // (context.workspaceRoot -> WW_WORKSPACE_ROOT -> global).
      const workDir =
        (context && context.workspaceRoot) ||
        process.env.WW_WORKSPACE_ROOT ||
        WORKSPACE ||
        path.join(QROOT, "workspace");
      try {
        fs.mkdirSync(workDir, { recursive: true });
      } catch (_) {}
      let cloudHosts: any[] = [];
      try {
        cloudHosts = Object.values<any>(require("../cloud.ts").CLOUD || {})
          .map((c) => c.host)
          .filter(Boolean);
      } catch (_) {}
      const policy = new Policy({
        readFile: { roots: [workDir] },
        writeFile: { roots: [workDir] },
        fetch: { hosts: [...new Set(cloudHosts)] },
      });
      const broker = new Broker(policy);
      // The zone's printed output is reported too, not discarded. For a sandbox,
      // console.log is the main way people see what happened — and previously
      // stdout was never read at all, so it was lost AND it hung the process once
      // it passed the pipe buffer's capacity.
      const _withIo = (teks, z) => {
        const bagian: any[] = [];
        if (z && z.stdout) bagian.push(z.stdout.trimEnd());
        if (z && z.stderr) bagian.push("[stderr]\n" + z.stderr.trimEnd());
        if (teks) bagian.push(teks);
        if (z && z.truncated) bagian.push("[keluaran dipotong]");
        // A marker of the downgraded guarantee, inside output the MODEL READS.
        // In a separate field alone the model would not see it and would still
        // conclude "this code ran contained" — a wrong conclusion, and precisely
        // the expensive one.
        if (z && z.kurungan && !z.kurungan.jaringanTerkurung) {
          bagian.push(
            "[TANPA PENGURUNGAN JARINGAN] " +
              z.kurungan.alasan +
              " — berkas tetap ditahan --permission, jaringan TIDAK.",
          );
        }
        return bagian.join("\n");
      };
      return runInCapabilityZone(args.code, broker, {
        timeout: args.timeout || 10000,
      }).then(
        (z) => ({
          ok: true,
          output: _withIo(
            typeof z.result === "string" ? z.result : JSON.stringify(z.result),
            z,
          ),
          kurungan: z.kurungan,
          auditTrail: broker.auditTrail(),
        }),
        (e) => ({
          ok: false,
          output: _withIo(e.message, e),
          kurungan: e.kurungan,
          auditTrail: broker.auditTrail(),
        }),
      );
    }
    return { ok: false, output: "unknown tool: " + name };
  } catch (e) {
    _circuitFail(name);
    return { ok: false, output: "error: " + e.message };
  }
}

async function runSelfTool(name, args, emit, context: any = {}) {
  const _t0 = performance.now();
  try {
    return await _runSelfToolInner(name, args, emit, context);
  } finally {
    const ms = performance.now() - _t0;
    if (ms >= 300 && global.__probe && global.__probe.say)
      global.__probe.say("TOOL " + name + " " + ms.toFixed(0) + "ms");
  }
}

module.exports = {
  QROOT,
  Q_ALLOWED,
  Q_FORBID,
  SELF_TOOLS,
  runSelfTool,
  qWalk,
  qList,
  qGlob,
  qRead,
  qGrep,
  qBackup,
  qBackupAsync: fileTools.qBackupAsync,
  qSyntaxOk,
  qResolve,
  diskList,
  diskGlob,
  diskGrep,
  resolveDiskPath,
  wsResolve,
  wsList,
  runInWorkspace,
  createSession,
  cleanupSession,
  trackProcess,
};
