"use strict";
// DEBUG: capture full stack for Maximum call stack errors
process.on("uncaughtException", (err) => {
  try {
    require("fs").appendFileSync(
      require("path").join(__dirname, "_crash.log"),
      "\n" +
        new Date().toISOString() +
        " " +
        err.message +
        "\n" +
        (err.stack || "").slice(0, 8000) +
        "\n",
    );
  } catch (_) {}
  throw err;
});

// ── A trace on EXIT, not only a trace on CRASH ──
//
// THE INCIDENT THAT PROMPTED THIS. The backend died at 10:42 and left NOTHING
// behind: the last _crash.log was written five days earlier, there was no
// Crashpad dump, and no Windows Error Reporting entry. All that remained were
// symptoms — the Electron shell still standing with its "Wolfspace UI" window,
// nothing listening on port 8090, and a last log line showing an ordinary HITL
// stop. The cause could not be determined, and not for lack of looking.
//
// The reason is structural: the handler above only catches uncaughtException.
// Leaving for any OTHER reason — an unhandled promise rejection, a signal, or a
// process.exit from anywhere — left not one line. And those are exactly the
// hardest to diagnose after the fact, because there is no artefact to read.
//
// What is logged here deliberately includes ORDINARY departures. "Exited
// normally with code 0" is a very different answer from "killed" or "promise
// rejected", and without this record all three look identical: silence.
(function jejakKeluar() {
  // ONCE PER PROCESS, not once per module load.
  //
  // electron/main.ts drops the ENTIRE project require.cache on every file change
  // under agent/, public/, electron/, scripts/ — and the agent edits its own
  // files, so it triggers that many times in one session. Without this guard,
  // each reload installs six new handlers without releasing the old ones.
  // Measured on a simulated reload cycle: the process listener count climbed
  // steadily (2, 3, 4, 5, ...) until Node warned about a leak.
  //
  // The cost is not only waste: a single departure would then write ONE LINE PER
  // LOAD, and the trace meant to explain things becomes noise instead.
  if (globalThis.__wolfspaceJejakKeluar) return;
  globalThis.__wolfspaceJejakKeluar = true;

  const _fs = require("fs");
  const _path = require("path");
  const BERKAS = _path.join(__dirname, "_crash.log");
  const MULAI = Date.now();
  let sudah = false;

  const tulis = (sebab, rinci) => {
    if (sudah) return; // one line per departure, not one per handler
    sudah = true;
    try {
      _fs.appendFileSync(
        BERKAS,
        "\n" +
          new Date().toISOString() +
          " KELUAR sebab=" +
          sebab +
          " pid=" +
          process.pid +
          " hidup=" +
          Math.round((Date.now() - MULAI) / 1000) +
          "s" +
          (rinci
            ? " " + String(rinci).replace(/\s+/g, " ").slice(0, 400)
            : "") +
          "\n",
      );
    } catch (_) {}
  };

  // Synchronous: by 'exit' the event loop has stopped, so only synchronous calls
  // still finish. appendFileSync is exactly for this case.
  process.on("exit", (kode) => tulis("exit", "kode=" + kode));

  // An unhandled promise rejection was logged by NO handler before this one. The
  // process is not stopped here — the behaviour is left exactly as it was, only
  // the record is added.
  process.on("unhandledRejection", (alasan: any) =>
    tulis(
      "unhandledRejection",
      (alasan && (alasan.stack || alasan.message)) || alasan,
    ),
  );

  // Signals: recorded, then passed on by exiting. With no handler a signal kills
  // the process without a word; with one, it has to exit itself so the behaviour
  // does not silently become "ignore the signal".
  for (const [sinyal, kode] of [
    ["SIGTERM", 143],
    ["SIGINT", 130],
    ["SIGBREAK", 149],
    ["SIGHUP", 129],
  ] as [NodeJS.Signals, number][]) {
    try {
      process.on(sinyal, () => {
        tulis("sinyal", sinyal);
        process.exit(kode);
      });
    } catch (_) {
      // Some signals do not exist on every platform; their absence is not an error.
    }
  }
})();
/**
/**
 * WOLFSPACE server Ã¢â‚¬â€ serves the chat UI, runs code blocks, and orchestrates the
 * generate -> execute -> fix loop against cloud models (BYOK).
 *
 *   GET  /             -> chat UI (public/index.html)
 *   GET  /cloud-providers -> configured providers {provider, name, model}
 *   POST /run          -> execute one code block, return real stdout/stderr
 *   POST /chat (SSE)   -> stream tokens; auto-run generated code; if it fails,
 *                         feed the error back to the model and retry (<=3x)
 *
 * The differentiator: the model only GUESSES code; the CPU is the judge.
 */
// MUST COME FIRST, before any .ts require.
//
// Modules that have migrated to TypeScript (agent/mcp-client.ts,
// server/routes/*.ts) can only load once this hook is installed. Node 24 happens
// to strip types on its own, so the wrong order still runs on a developer
// machine — but CI and users are on Node 20, and there the ENTIRE backend fails
// to load with "Unexpected identifier". Demonstrated by running this file with
// --no-experimental-strip-types.
require("./scripts/ts-register.cjs");

const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
// execSync is imported here on purpose. It used to be missing while detectShell()
// relied on it without requiring it itself, throwing a ReferenceError that the
// surrounding empty catch swallowed — so there was no error message at all, and
// detectShell ALWAYS fell back to cmd.exe even where PowerShell was installed.
//
// (_pidPemegangPort is unaffected: it has its own require("child_process") inside.)
const { exec, spawn, execSync } = require("child_process");
const util = require("util");
const execP = util.promisify(exec);
// node-pty is a NATIVE module, so it may simply be unavailable on a platform
// where its binary is not installed and cannot be built. This require used to be
// bare and at the top level, so a missing module did not merely disable the
// terminal — it KILLED THE WHOLE SERVER before it could listen on a port. Proven
// when the backend was run on WSL/Alpine (musl, no linux prebuild and no
// python3/make/g++ to build one): the server failed to start at all, even though
// the terminal is one feature among many.
//
// The terminal is now OPTIONAL: if the module is missing the rest of the server
// stays alive and only the terminal endpoints refuse, with a clear message.
let pty: any = null;
let ptyLoadError: any = null;
try {
  pty = require("node-pty");
} catch (e) {
  ptyLoadError = e.message;
  console.warn(
    "[WOLFSPACE] node-pty tak tersedia — fitur terminal dimatikan. " +
      String(e.message).split("\n")[0],
  );
}

const CONFIG_PATH = path.join(__dirname, "config.json");
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
// HOST used to come from config alone, so `ENV HOST=` in the Dockerfile had no
// effect at all — misleading for anyone deploying to a container host, since
// platforms like Railway/Render/Fly control the bind through the environment.
// The order now matches PORT: env wins over config.
const HOST =
  process.env.HOST || (CONFIG.server && CONFIG.server.host) || "0.0.0.0";
const PORT = process.env.PORT || (CONFIG.server && CONFIG.server.port) || 8090;
const HTML = path.join(__dirname, "public", "index.html");
const TMP_PY = path.join(os.tmpdir(), "_wolfspace_run.py");
// Shared execution timeout for full-access runtimes (ms). Generous so that
// browser automation / network calls (e.g. Playwright) have time to finish.
const EXEC_TIMEOUT = CONFIG.execTimeout || 120000;
// The JS runtime that launched this server (bun.exe here, node elsewhere).
// We reuse it to execute generated JS so there is no hard dependency on `node`.
const JS_RUNTIME = process.execPath;

// Preload MCP Server to avoid RAM spikes on first request
const mcpClient = require("./agent/mcp-client.ts");
mcpClient
  .init()
  .catch((e) => console.error("Failed to preload MCP:", e.message));

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Debug bus Ã¢â‚¬â€ a single event log wired through ALL of WOLFSPACE's logic.
// Every meaningful step (model call, execution, retry, cloud request, error)
// emits a structured event. Events live in a ring buffer, stream live to any
// /debug viewer, and append to a log file. Toggle with config.debug = false.
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
const DEBUG_ON = CONFIG.debug !== false;
const VERBOSE = CONFIG.verbose === true;
const LOG_FILE = path.join(os.tmpdir(), "WOLFSPACE-debug.log");
const LOG_RING: any[] = []; // recent events, in memory
const LOG_MAX = 800;
const debugSubs = new Set<any>(); // live SSE writers

// Precision debugging via trace system
const trace = require("./agent/trace.cjs");
// sandbox-policy is NO LONGER required here: its only user was the Docker sandbox
// gate for code execution, which has been removed. The module itself is still
// alive and used by agent/tools/index.ts to gate namespace-based bash
// confinement.
let _evSeq = 0;
function dlog(cat, level, msg, data?) {
  const e = {
    seq: ++_evSeq,
    t: Date.now(),
    cat,
    level,
    msg,
    data: data === undefined ? null : data,
  };
  LOG_RING.push(e);
  if (LOG_RING.length > LOG_MAX) LOG_RING.shift();
  const line = "data: " + JSON.stringify(e) + "\n\n";
  for (const w of debugSubs) {
    try {
      w(line);
    } catch (_) {}
  }
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(e) + "\n");
  } catch (_) {}
  if (VERBOSE) {
    const prefix = `[WOLFSPACE:${cat}]`;
    if (level === "error")
      _writeSafe(_origError, prefix, msg, data && data.error ? data.error : "");
    else
      _writeSafe(
        _origLog,
        prefix,
        msg,
        data ? JSON.stringify(data, null, 0) : "",
      );
  } else if (DEBUG_ON && level === "error") {
    _writeSafe(
      _origError,
      `[WOLFSPACE:${cat}] ${msg}`,
      data && data.error ? data.error : "",
    );
  }
  return e;
}

// Ã¢â€â€š Intercept all console output to feed into the debug bus Ã¢â€â€š
// This ensures EVERY console.log/error/warn from the backend is visible
// in the /debug viewer and the Debug panel.
const _origLog = console.log;
const _origError = console.error;
const _origWarn = console.warn;
// The second argument is the CONTEXT (`this`), not data to be printed.
//
// All three callers below write `_writeSafe(_origLog, console, ...args)` — plainly
// meaning `_origLog.call(console, ...args)`. But the old version swept everything
// into `...args` and then called `fn(...args)`, so `console` was PRINTED as the
// first argument. Every backend log line therefore dragged a 25-property dump of
// the console object along with it:
//
//   Object [console] { log: [Function], warn: [Function], ... } [renderer:warning] …
//
// Visible in `npm run app` stdout on every message, and in Electron mode the
// backend runs in the MAIN process — so the owner of the window pays that
// serialisation cost, once per log line.
const _writeSafe = (fn, ctx, ...args) => {
  try {
    fn.apply(ctx, args);
  } catch (_) {}
};
let _qLogReentrant = false;
console.log = function (...args) {
  _writeSafe(_origLog, console, ...args);
  if (_qLogReentrant) return;
  _qLogReentrant = true;
  try {
    dlog(
      "console",
      "info",
      args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" "),
    );
  } finally {
    _qLogReentrant = false;
  }
};
console.error = function (...args) {
  _writeSafe(_origError, console, ...args);
  if (_qLogReentrant) return;
  _qLogReentrant = true;
  try {
    dlog(
      "console",
      "error",
      args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" "),
    );
  } finally {
    _qLogReentrant = false;
  }
};
console.warn = function (...args) {
  _writeSafe(_origWarn, console, ...args);
  if (_qLogReentrant) return;
  _qLogReentrant = true;
  try {
    dlog(
      "console",
      "warn",
      args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
        .join(" "),
    );
  } finally {
    _qLogReentrant = false;
  }
};

// Unambiguous per-language signatures. Checked BEFORE the loose python/js
// heuristics Ã¢â‚¬â€ Kotlin/Go/Rust/Java code full of `var`/`//` otherwise gets
// mistaken for JavaScript (and `import x.y.*` for Python).
const STRONG_LANG: [string, RegExp][] = [
  [
    "kotlin",
    /\bfun\s+main\s*\(|^\s*import\s+kotlin\.|(^|\n)\s*fun\s+\w+\s*\(/m,
  ],
  ["go", /(^|\n)\s*package\s+main\b|\bfunc\s+main\s*\(/],
  ["rust", /\bfn\s+main\s*\(/],
  ["java", /\bpublic\s+static\s+void\s+main\b/],
  ["cpp", /#include\s*<(iostream|vector|string|algorithm)/],
  ["c", /#include\s*<(stdio|stdlib|math)\.h>/],
];
function strongLang(code) {
  for (const [l, re] of STRONG_LANG) if (re.test(code || "")) return l;
  return null;
}

// Models sometimes mislabel a fenced block (e.g. tag JS as "python"). When the
// body unambiguously contradicts the tag, correct the runtime so it still runs.
// Conservative: only override when one language's signals are present and the
// other's are absent.
function reconcileLang(lang, code) {
  const src = code || "";
  const sl = strongLang(src);
  if (sl && sl !== lang) return sl; // unmistakable signature wins over the fence tag
  const js =
    /(^|\n)\s*(\/\/|const\s|let\s|var\s|function\s|=>|console\.|document\.|require\(|export\s|import\s.+\sfrom\s)/.test(
      src,
    );
  const py =
    /(^|\n)\s*(def\s|class\s+\w+\s*[:(]|print\(|elif\s|#|from\s+\w+\s+import|import\s+\w+\s*$)/m.test(
      src,
    );
  if (lang === "python" && js && !py) return "javascript";
  if (lang === "javascript" && py && !js) return "python";
  return lang;
}

// Error text helpers. Tracebacks put the ACTUAL error on the LAST line, so naive
// head-truncation hides it. These keep the meaningful tail (and a bit of head).
function errTail(e) {
  const s = (e || "").trim();
  if (!s) return "";
  const lines = s.split("\n").filter(Boolean);
  return lines.slice(-2).join(" | ").slice(-240);
}
function errForModel(e) {
  const s = (e || "").trim();
  if (!s) return "";
  return s.length <= 700 ? s : s.slice(0, 160) + "\nÃ¢â‚¬Â¦\n" + s.slice(-520);
}
// Detect code that launches an external process / interactive shell / REPL.
// Such code can pop up a SEPARATE window (e.g. an interactive Python `>>>`),
// so we don't auto-run it in the verify loop.
function launchesShell(code) {
  const s = code || "";
  // Only block code that literally opens an interactive shell/REPL or spawns a
  // visible terminal. subprocess.run/call/check_output are fine (non-interactive).
  return (
    /\bos\.system\s*\(/.test(s) || // os.system("python") etc
    /\bos\.popen\s*\(/.test(s) || // interactive popen
    /\bcode\.interact\s*\(/.test(s) || // Python REPL
    /\bpty\.\w/.test(s) || // pseudo-terminal
    /\bsubprocess\.(Popen|run|call)\s*\([^)]*shell\s*=\s*True/.test(s) || // shell=True
    /\bsubprocess\.Popen\s*\(\s*['"]python/.test(s) || // Popen("python")
    // Node: child_process.spawn/exec only if opening a shell command
    /require\(\s*['"]child_process['"]\s*\)\s*[\s\S]{0,200}\.spawn\s*\(\s*['"](?:cmd|powershell|bash|sh|python)['"]/.test(
      s,
    )
  );
}
// Detect code that reads stdin. The sandbox runs without stdin, so interactive
// programs (REPL calculators, menu loops) spin on null/EOF until the timeout
// kills them Ã¢â‚¬â€ detect up front and ask the model for a non-interactive version.
function readsStdin(lang, code) {
  const s = code || "";
  switch (lang) {
    case "kotlin":
      return /\breadLine\s*\(|\breadln\s*\(|Scanner\s*\(\s*System\.`?in`?\s*\)/.test(
        s,
      );
    case "java":
      return /Scanner\s*\(\s*System\.in\s*\)|System\.console\s*\(\)|InputStreamReader\s*\(\s*System\.in/.test(
        s,
      );
    case "go":
      return /os\.Stdin/.test(s);
    case "c":
    case "cpp":
      return /\bscanf\s*\(|\bgets\s*\(|\bgetchar\s*\(|std::cin|\bcin\s*>>/.test(
        s,
      );
    case "javascript":
      return /process\.stdin|require\(\s*['"]readline['"]\s*\)/.test(s);
    case "python":
      return /\binput\s*\(/.test(s);
    case "php":
      return /\bfgets\s*\(\s*STDIN|\breadline\s*\(/.test(s);
    case "rust":
      return /io::stdin|std::io::stdin/.test(s);
    default:
      return false;
  }
}

// The Docker-based execution sandbox is REMOVED.
//
// Its gate defaulted to "off" (agent/sandbox-policy.ts) so it never turned itself
// on, and the Docker engine is no longer present on this machine — so this path
// was never executed. Keeping it left only dead code that gave the impression of
// confinement where there was none.
//
// The OS confinement that is ACTIVE, with no daemon:
//   workspace-confined bash -> agent/tools/bash-jail.ts (Linux namespaces)
//   capability zones        -> agent/broker/ (--permission + unshare -n)

// Ã¢â€ â‚¬Ã¢â€ â‚¬ Resolve real Python executable (skips Windows Store alias that errors) Ã¢â€ â‚¬Ã¢â€ â‚¬
let _pyBinCache: any = null;
async function findPythonAsync() {
  if (_pyBinCache) return _pyBinCache;
  const candidates = [
    process.env.WOLFSPACE_PYTHON || process.env.QUANTUM_PYTHON,
    process.env.APPDATA &&
      path.join(
        process.env.APPDATA,
        "uv",
        "python",
        "cpython-3.12.10-windows-x86_64-none",
        "python.exe",
      ),
    process.platform === "win32" ? "python" : "python3",
    "python3",
    "python",
    "py",
    process.env.LOCALAPPDATA &&
      path.join(
        process.env.LOCALAPPDATA,
        "Programs",
        "Python",
        "Python314",
        "python.exe",
      ),
    process.env.LOCALAPPDATA &&
      path.join(
        process.env.LOCALAPPDATA,
        "Programs",
        "Python",
        "Python313",
        "python.exe",
      ),
    process.env.LOCALAPPDATA &&
      path.join(
        process.env.LOCALAPPDATA,
        "Programs",
        "Python",
        "Python312",
        "python.exe",
      ),
    process.env.LOCALAPPDATA &&
      path.join(
        process.env.LOCALAPPDATA,
        "Programs",
        "Python",
        "Python311",
        "python.exe",
      ),
    "C:\\Python314\\python.exe",
    "C:\\Python313\\python.exe",
    "C:\\Python312\\python.exe",
    "C:\\Python311\\python.exe",
  ].filter(Boolean);

  for (const cmd of candidates) {
    try {
      const out = await execP(`"${cmd}" --version`, {
        timeout: 3000,
        windowsHide: true,
      });
      if (/Python 3/i.test(out.stdout || out.stderr)) {
        _pyBinCache = cmd;
        return cmd;
      }
    } catch (_) {}
  }
  _pyBinCache = "python";
  return "python";
}

// Ã¢â€ â‚¬Ã¢â€ â‚¬ Shared patch machinery for visual edits + compile auto-fix Ã¢â€ â‚¬Ã¢â€ â‚¬
// Apply <<<<ORIGINAL/====/>>>> hunks by literal string replacement; null on any miss.
const { fillCloudKey } = require("./agent/cloud.ts");
const { resolveKeysPath } = require("./agent/keys-path.ts");
function applyHunks(src, reply) {
  const re = new RegExp(
    "<<<<ORIGINAL\\r?\\n([\\s\\S]*?)\\r?\\n====\\r?\\n([\\s\\S]*?)\\r?\\n>>>>",
    "g",
  );
  const hunks: any[] = [];
  let m;
  while ((m = re.exec(reply))) hunks.push({ orig: m[1], repl: m[2] });
  if (!hunks.length) return null;
  let out = src;
  for (const h of hunks) {
    const idx = out.indexOf(h.orig);
    if (idx < 0) return null;
    out = out.slice(0, idx) + h.repl + out.slice(idx + h.orig.length);
  }
  return out;
}
// String/comment-aware brace+paren balance Ã¢â‚¬â€  catches patches that bisect a class/method.
function braceProfile(s) {
  let c = 0,
    p = 0,
    q = null,
    esc = false,
    line = false,
    block = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i],
      nx = s[i + 1];
    if (line) {
      if (ch === "\n") line = false;
      continue;
    }
    if (block) {
      if (ch === "*" && nx === "/") {
        block = false;
        i++;
      }
      continue;
    }
    if (q) {
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === "\\") {
        esc = true;
        continue;
      }
      if (ch === q) q = null;
      continue;
    }
    if (ch === "/" && nx === "/") {
      line = true;
      i++;
      continue;
    }
    if (ch === "/" && nx === "*") {
      block = true;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      q = ch;
      continue;
    }
    if (ch === "{") c++;
    else if (ch === "}") c--;
    else if (ch === "(") p++;
    else if (ch === ")") p--;
  }
  return c * 10000 + p;
}

// RUN (= CONFIG.runners) is REMOVED along with compileRun and the nine language
// runners. It was the only reader of `runners` in config.json, so the gcc/g++/
// go/javac/php/rustc/kotlinc keys there are now read by nobody. The execution
// that is still alive lives in runInWorkspace(), and that is python + javascript
// only.

// Ã¢â€â‚¬Ã¢â€â‚¬ Persistent Jedi worker: real Python autocomplete (static analysis, no model) Ã¢â€â‚¬Ã¢â€â‚¬
let jediProc: any = null,
  jediBuf = "",
  jediQueue: any[] = [];
async function startJedi() {
  try {
    const pyBin = await findPythonAsync();
    jediProc = spawn(pyBin, [path.join(__dirname, "jedi_worker.py")], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    jediProc.stdout.on("data", (d) => {
      jediBuf += d.toString();
      let i;
      while ((i = jediBuf.indexOf("\n")) >= 0) {
        const line = jediBuf.slice(0, i);
        jediBuf = jediBuf.slice(i + 1);
        const cb = jediQueue.shift();
        if (cb) cb(line);
      }
    });
    jediProc.on("exit", () => {
      jediProc = null;
    });
    jediProc.on("error", () => {
      jediProc = null;
    });
  } catch {
    jediProc = null;
  }
}
function jediComplete(reqObj) {
  return new Promise((resolve) => {
    if (!jediProc) return resolve([]);
    jediQueue.push((line) => {
      try {
        resolve(JSON.parse(line));
      } catch {
        resolve([]);
      }
    });
    try {
      jediProc.stdin.write(JSON.stringify(reqObj) + "\n");
    } catch {
      resolve([]);
    }
  });
}
startJedi();

const RUNNABLE = new Set([
  "python",
  "javascript",
  "c",
  "cpp",
  "go",
  "java",
  "php",
  "rust",
  "kotlin",
]);
const ALIAS = {
  py: "python",
  js: "javascript",
  node: "javascript",
  ts: "typescript",
  "c++": "cpp",
  cxx: "cpp",
  cc: "cpp",
  golang: "go",
  kt: "kotlin",
  kts: "kotlin",
  rs: "rust",
  rb: "ruby",
  yml: "yaml",
  sh: "shell",
  bash: "shell",
  md: "markdown",
};

// Ã¢â€â‚¬Ã¢â€â‚¬ Model client + orchestration Ã¢â€â‚¬Ã¢â€â‚¬
const SYS = [
  "You are WOLFSPACE, a friendly assistant. Chat naturally and answer in plain text.",
  'Do NOT write code unless the user explicitly asks for code or gives a programming task. A greeting like "hi" gets a short friendly reply Ã¢â‚¬â€ never code.',
  "If you do write code, use one fenced block tagged with the language; it runs in a sandbox with no stdin, so avoid input().",
].join(" ");
// Quality-focused system prompt, used when the request is a programming task.
const CODE_SYS = [
  "You are WOLFSPACE, an expert programming assistant whose code is JUDGED BY EXECUTION.",
  "Write CLEAN, CORRECT code: descriptive names, handle edge cases and errors, prefer the standard library.",
  "Output EXACTLY ONE fenced code block tagged with its language Ã¢â‚¬â€ no alternative versions.",
  "The sandbox has NO stdin: never use input()/prompt()/sys.stdin (they crash with EOF); use hardcoded values.",
  "INCLUDE a short self-test using assertions that prints a clear success line, so the CPU can prove it works.",
  "Keep prose outside the code block to one or two sentences.",
].join(" ");
const CODE_HINT =
  /\b(code|coding|program|script|function|fungsi|kelas|class|algorithm|algoritma|buat(?:kan)?|tulis(?:kan)?|implement|debug|fix|refactor|optimi[sz]e|sort|parse|regex|api|loop|array|string|hitung|kalkulator)\b/i;
function isCodingTask(work) {
  // Guard: if work is not an array there is nothing to check
  if (!Array.isArray(work) || work.length === 0) return false;
  for (let i = work.length - 1; i >= 0; i--)
    if (work[i].role === "user") return CODE_HINT.test(work[i].content || "");
  return false;
}
function pickSystem(work) {
  return isCodingTask(work) ? CODE_SYS : SYS;
}
// Web Dev (Canvas) mode: every reply MUST be ONE A2UI JSON spec inside a
// ```json fenced block. The Studio iframe renders it instantly — no Dart, no compile.
const WEBDEV_SYS = [
  "CRITICAL RULE: Your ENTIRE response MUST be a single ```json code block containing an A2UI JSON spec. DO NOT generate ```dart code blocks. DO NOT generate ```python, ```html, or any other language. Dart code will NOT be compiled or rendered — ONLY ```json works. If you write Dart, the user sees nothing.",
  "You are WOLFSPACE UI Builder using A2UI (server-driven UI). The user is in visual app mode: your ENTIRE answer must be ONE A2UI spec inside a single ```json fenced block. It renders instantly as a Flutter app — NO Dart, NO compile, NO HTML.",
  'The spec is a JSON object. The root has "type" (usually "scaffold") and optionally "state" (an object of initial values).',
  'Node shape: { "type": <kind>, ...props, "children": [...] | "child": {...} }. A bare string is shorthand for a text node.',
  "Available types & props:",
  "- scaffold: background(hex), gradient([hex,hex] or {colors,begin,end}), title(string) or appBar, appBarColor, appBarTextColor, body(node), fab(node)",
  '- column / row: align ("start"|"center"|"end"|"between"|"around"), cross ("start"|"center"|"end"|"stretch"), gap(px spacing between children), children[]',
  "- center{child}, expanded{flex,child}, spacer, padding{all,child}, sizedbox{width,height,child}",
  '- container{width,height,padding,margin,color(hex),gradient,radius,borderColor,borderWidth,shadow(true or {color,blur,spread,dx,dy}),alignment("center"|"topLeft"|...),child or children+gap}',
  "- card{child,color,elevation,radius,padding,margin}, divider",
  "- grid/gridview{columns(int),gap,ratio,children[]}, wrap{gap,children[]}",
  '- text{text,fontSize,color(hex),bold(bool) or weight("100".."900"|"bold"),italic(bool),letterSpacing,lineHeight,align("left"|"center"|"right")} Ã¢â‚¬â€ interpolate state with ${fieldName} inside text',
  "- icon{icon(name),size,color}, image{url,width,height} Ã¢â‚¬â€ icon names: add,close,check,star,home,settings,search,delete,edit,menu,favorite,person,share,notifications,mail,phone,camera,shopping_cart,lock,calendar,location,wifi,cloud,download,refresh,thumb_up,info,warning,chevron_right,more",
  "- button (or elevatedbutton/textbutton){label,color(hex),textColor(hex),radius,elevation,fontSize,padding,onTap:<action>}, iconbutton{icon,color,onTap}",
  '- textfield{label,hint,bind:<stateField>,obscure(bool),keyboard("number"|"email"),icon,radius,fill(hex)}, listview{children[]}',
  "- switch / checkbox{label,bind:<boolField>,color} â€” toggle a boolean in state",
  "- slider{bind:<numField>,min,max,step,color} â€” pick a number; bind it and show with ${field}",
  '- dropdown/select{label,hint,bind:<field>,options:["a","b","c"]}, radio{bind:<field>,options:[...],color} â€” choose one of options',
  "- progress/progressbar{value(0..1) or bind:<numField>,color,trackColor,height,radius}, chip{label,color,textColor,icon}",
  "ENHANCED WIDGETS (for polished designs):",
  "- google_text / gtext{text,font(poppins/roboto/inter/montserrat/lato/...),fontSize,color,bold,italic,weight,letterSpacing,lineHeight,align} -- beautiful Google Fonts typography",
  "- auto_text / autotext{text,maxLines,minFontSize,fontSize,color,bold,align} -- text that auto-sizes to fit container",
  "- animated{child,fadeIn(bool),slideUp(bool),slideDown(bool),scale(bool),shake(bool),blur(bool),duration(ms),delay(ms)} -- smooth entrance animations. Use delay to stagger effects on siblings",
  "- animated_list / staggered_list{children[]} -- children animate in sequence with slide+fade",
  "- shimmer{child,baseColor,highlightColor} -- shimmer loading effect, wrap around placeholder content",
  "- glass / glassmorphism{width,height,padding,radius,color(hex),child} -- frosted glass container with gradient",
  "- circular_progress / circular{value(0..1) or bind,color,strokeWidth,trackColor} -- circular spinner/progress",
  "- linear_percent{value(0..1) or bind,color,trackColor,height,radius,padding,label} -- linear progress with optional label",
  "- circular_percent{value(0..1) or bind,color,trackColor,radius,strokeWidth,label,textColor} -- circular progress with percentage",
  "- chart / bar_chart{data:[values],color,height} -- simple bar chart from numeric array",
  "- pie_chart{data:[values],colors:[hex,...],height,radius,innerRadius} -- donut/pie chart",
  "- staggered_grid / masonry{columns,gap,padding,children[]} -- Pinterest-style masonry grid",
  "- spinkit{spinner(wave|pulse|ring|circle|chasing_dots|fading_four|fading_circle),color,size,strokeWidth} -- loading spinners",
  "- svg{url,width,height,color} -- SVG image from URL",
  "- cached_image{url,width,height} -- image with caching and loading placeholder",
  'Actions (the value of onTap) Ã¢â‚¬â€ a JSON object, one or more of: {"set":"field","to":value}, {"inc":"field","by":n}, {"dec":"field","by":n}, {"append":"field","text":"x"}, {"backspace":"field"}, {"clear":"field"}, {"eval":"field"}. "eval" computes the field as an arithmetic expression (+ - * / and parentheses; also accepts Ãƒâ€” ÃƒÂ· Ã¢Ë†â€™).',
  'Make it polished: real layout, spacing, hex colors, rounded corners; use state + actions so it is interactive (e.g. a calculator uses append for digits/operators and eval for "=").',
  'LAYOUT MUST FIT a phone screen Ã¢â‚¬â€ never overflow horizontally. For grids (e.g. calculator keys) use a column of rows; each row\'s buttons fill the width evenly (do NOT set fixed widths on buttons). Avoid fixed pixel "width" values; let content adapt to the screen. Keep the whole UI within one phone screen height.',
  'METHOD (follow in order, do not skip): 1) Map each requirement to a SUPPORTED action above (e.g. "clear last digit"->backspace, "reset"->clear, "="->eval) so the UI actually works, not just looks right. 2) Choose a state model first (e.g. one field "expr"); bind the display via ${field}. 3) Lay out with column-of-rows + expanded(flex) so it fills the phone; never fixed widths. 4) Apply the DESIGN SYSTEM below. 5) Mentally trace every onTap to its action before finalizing.',
  "DESIGN SYSTEM (make it look professional): pick ONE coherent palette and a clear background (e.g. dark #1C1C1E). Use COLOR TO ENCODE FUNCTION, not decoration â€” group by role: primary/confirm actions one accent (e.g. #FF9500), neutral/content another (e.g. #333333 with #FFFFFF text), secondary/utility a third (e.g. #A5A5A5 with #000000 text). Always set readable textColor for contrast (light text on dark, dark on light). Consistent spacing/padding (e.g. 16-24), rounded corners (radius 8-16), large touch targets, and a prominent display (big fontSize, right/bottom aligned for calculators). Establish visual hierarchy: the most important element is biggest/highest-contrast. Use DEPTH for polish: subtle shadow on cards/buttons, gradient backgrounds for hero areas, rounded corners everywhere, and gap for even spacing instead of manual sizedboxes.",
  "Whatever the user asks Ã¢â‚¬â€ calculator, form, counter, dashboard, even a non-UI question Ã¢â‚¬â€ express it as a working A2UI spec. Use ONLY the types listed above.",
  "Outside the JSON block: at most one short sentence. Never output Dart or HTML, never split into multiple blocks. Output valid JSON (double quotes, no trailing commas, no comments).",
  "FINAL REMINDER: Your response MUST start with ```json and end with ```. Do NOT write Dart code. Do NOT write Python code. ONLY JSON.",
].join(" ");
function buildPrompt(hist) {
  let p = `<|im_start|>system\n${SYS}<|im_end|>\n`;
  for (const t of hist) p += `<|im_start|>${t.role}\n${t.content}<|im_end|>\n`;
  return p + `<|im_start|>assistant\n`;
}
// Models often split ONE program across several fenced blocks (a function per
// block, or snippet-then-full-program). Compiling just the first block then
// fails with "unresolved reference". Merge same-language blocks instead:
//  - snippets that literally re-appear inside a bigger block are dropped
//  - if several blocks each contain their own entry point, take the longest
//    (that's the "full program" variant), otherwise concatenate in order
const MAIN_RE =
  /\bfun\s+main\s*\(|\bif\s+__name__\s*==|\bpublic\s+static\s+void\s+main\b|\bfunc\s+main\s*\(|\bint\s+main\s*\(/;
function extractCode(text) {
  const blocks: any[] = [];
  const re = /```(\w*)[^\n]*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)))
    blocks.push({ lang: (m[1] || "").toLowerCase(), code: m[2].trim() });
  if (!blocks.length) return null;
  const first =
    blocks.find((b) => RUNNABLE.has(ALIAS[b.lang] || b.lang)) || blocks[0];
  const lang = ALIAS[first.lang] || first.lang;
  const same = blocks.filter(
    (b) => (ALIAS[b.lang] || b.lang) === lang && b.code,
  );
  if (same.length <= 1) return { lang: first.lang, code: first.code };
  // drop snippet blocks fully contained in a bigger block, and exact duplicates
  const kept = same.filter(
    (b, i) =>
      !same.some(
        (o, j) =>
          j !== i && o.code.length > b.code.length && o.code.includes(b.code),
      ),
  );
  const seen = new Set<any>(),
    uniq: any[] = [];
  for (const b of kept) {
    if (!seen.has(b.code)) {
      seen.add(b.code);
      uniq.push(b);
    }
  }
  if (uniq.length === 1) return { lang: first.lang, code: uniq[0].code };
  const withMain = uniq.filter((b) => MAIN_RE.test(b.code));
  if (withMain.length > 1) {
    const longest = uniq.reduce((a, b) =>
      b.code.length > a.code.length ? b : a,
    );
    dlog(
      "chat",
      "info",
      "multiple full programs in reply Ã¢â‚¬â€ using longest block",
      { blocks: uniq.length },
    );
    return { lang: first.lang, code: longest.code };
  }
  dlog("chat", "info", "merged split code blocks", {
    blocks: uniq.length,
    lang,
  });
  return { lang: first.lang, code: uniq.map((b) => b.code).join("\n\n") };
}
// Ã¢â€â‚¬Ã¢â€â‚¬ Cloud models (bring-your-own API key) Ã¢â€â‚¬Ã¢â€â‚¬
// The provider is auto-detected from the key's prefix; the user pastes any key.
const CLOUD = {
  anthropic: {
    host: "api.anthropic.com",
    path: "/v1/messages",
    model: "claude-opus-4-8",
  },
  openai: {
    host: "api.openai.com",
    path: "/v1/chat/completions",
    model: "gpt-4o",
  },
  openrouter: {
    host: "openrouter.ai",
    path: "/api/v1/chat/completions",
    model: "anthropic/claude-opus-4-8",
  },
  groq: {
    host: "api.groq.com",
    path: "/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
  },
  qwen: {
    host: "dashscope-intl.aliyuncs.com",
    path: "/compatible-mode/v1/chat/completions",
    model: "qwen-plus",
  },
  deepseek: {
    host: "api.deepseek.com",
    path: "/chat/completions",
    model: "deepseek-chat",
  },
  github: {
    host: "models.inference.ai.azure.com",
    path: "/chat/completions",
    model: "gpt-4o",
  },
  gemini: {
    host: "generativelanguage.googleapis.com",
    path: "/v1beta/openai/chat/completions",
    model: "gemini-2.5-flash",
  },
  nvidia: {
    host: "integrate.api.nvidia.com",
    path: "/v1/chat/completions",
    model: "nvidia/nemotron-3-super-120b-a12b",
  },
  opencode: {
    host: "opencode.ai",
    path: "/zen/go/v1/chat/completions",
    model: "deepseek-v4-flash",
  },
  puter: {
    host: "api.puter.com",
    path: "/puterai/openai/v1/chat/completions",
    model: "claude-sonnet-4",
  },
};
// Short, friendly model names Ã¢â€ â€™ full provider model IDs. Type "llama", get the real ID.
const MODEL_ALIASES = {
  anthropic: {
    claude: "claude-opus-4-8",
    opus: "claude-opus-4-8",
    sonnet: "claude-sonnet-4-6",
    haiku: "claude-haiku-4-5",
  },
  openai: { gpt: "gpt-4o", "4o": "gpt-4o", mini: "gpt-4o-mini" },
  groq: {
    llama: "llama-3.3-70b-versatile",
    "llama-fast": "llama-3.1-8b-instant",
    "llama-8b": "llama-3.1-8b-instant",
    gemma: "gemma2-9b-it",
  },
  qwen: {
    qwen: "qwen-plus",
    plus: "qwen-plus",
    max: "qwen-max",
    turbo: "qwen-turbo",
    coder: "qwen2.5-coder-32b-instruct",
  },
  deepseek: {
    chat: "deepseek-chat",
    deepseek: "deepseek-chat",
    coder: "deepseek-chat",
    reasoner: "deepseek-reasoner",
    r1: "deepseek-reasoner",
  },
  github: {
    "4o": "gpt-4o",
    "gpt-4o": "gpt-4o",
    deepseek: "DeepSeek-V3-0324",
    "deepseek-r1": "DeepSeek-R1",
    r1: "DeepSeek-R1",
    llama: "Llama-3.3-70B-Instruct",
  },
  gemini: {
    gemini: "gemini-2.0-flash",
    flash: "gemini-2.0-flash",
    pro: "gemini-1.5-pro",
  },
  openrouter: {},
  nvidia: {
    llama: "meta/llama-3.3-70b-instruct",
    "70b": "meta/llama-3.3-70b-instruct",
    nemotron: "nvidia/llama-3.1-nemotron-70b-instruct",
    deepseek: "deepseek-ai/deepseek-r1",
    qwen: "qwen/qwen2.5-coder-32b-instruct",
  },
};
const PROVIDER_NAMES = {
  anthropic: "Claude",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  groq: "Groq",
  qwen: "Qwen",
  deepseek: "DeepSeek",
  github: "GitHub Models",
  gemini: "Gemini",
  nvidia: "NVIDIA",
  puter: "Puter",
  opencode: "OpenCode",
};
// Server-side keys: cloud-keys.json (gitignored) and/or <PROVIDER>_API_KEY env vars.
// Never sent to the browser Ã¢â‚¬â€ the UI only learns which providers are configured.
let CLOUD_KEYS: any = {};
function loadCloudKeys() {
  CLOUD_KEYS = {};
  try {
    const raw = JSON.parse(fs.readFileSync(resolveKeysPath(), "utf8"));
    for (const [p, v] of Object.entries(raw))
      CLOUD_KEYS[p] = typeof v === "string" ? { key: v } : v;
  } catch {}
  for (const p of Object.keys(PROVIDER_NAMES)) {
    const ev = process.env[p.toUpperCase() + "_API_KEY"];
    if (ev) CLOUD_KEYS[p] = { ...(CLOUD_KEYS[p] || {}), key: ev };
  }
}
loadCloudKeys();
function detectProvider(key) {
  key = (key || "").trim();
  if (key.startsWith("nvapi-")) return "nvidia";
  if (key.startsWith("github_pat_") || key.startsWith("ghp_")) return "github";
  if (key.startsWith("sk-ant-")) return "anthropic";
  if (key.startsWith("sk-or-")) return "openrouter";
  if (key.startsWith("gsk_")) return "groq";
  if (key.startsWith("AIza")) return "gemini";
  if (key.startsWith("sk-UUa")) return "opencode";
  if (key.startsWith("sk-")) return "openai"; // covers sk-proj-Ã¢â‚¬Â¦ too
  return "openai"; // sensible default for unknown keys
}
// Ã¢â€â‚¬Ã¢â€â‚¬ Real provider detection: probe the key against each candidate's /models Ã¢â€â‚¬Ã¢â€â‚¬
// Prefix narrows the candidates; an actual authenticated request confirms the owner.
const PROBE = {
  openai: { host: "api.openai.com", path: "/v1/models", auth: "bearer" },
  deepseek: { host: "api.deepseek.com", path: "/models", auth: "bearer" },
  qwen: {
    host: "dashscope-intl.aliyuncs.com",
    path: "/compatible-mode/v1/models",
    auth: "bearer",
  },
  groq: { host: "api.groq.com", path: "/openai/v1/models", auth: "bearer" },
  openrouter: { host: "openrouter.ai", path: "/api/v1/key", auth: "bearer" },
  anthropic: {
    host: "api.anthropic.com",
    path: "/v1/models",
    auth: "anthropic",
  },
  github: {
    host: "models.inference.ai.azure.com",
    path: "/models",
    auth: "bearer",
  },
  gemini: {
    host: "generativelanguage.googleapis.com",
    path: "/v1beta/models?key=KEY",
    auth: "query",
  },
  opencode: { host: "opencode.ai", path: "/zen/go/v1/models", auth: "bearer" },
  nvidia: {
    host: "integrate.api.nvidia.com",
    path: "/v1/models",
    auth: "bearer",
  },
};
function candidatesFor(key) {
  key = (key || "").trim();
  if (key.startsWith("github_pat_") || key.startsWith("ghp_"))
    return ["github"];
  if (key.startsWith("sk-ant-")) return ["anthropic"];
  if (key.startsWith("sk-or-")) return ["openrouter"];
  if (key.startsWith("gsk_")) return ["groq"];
  if (key.startsWith("AIza")) return ["gemini"];
  if (key.startsWith("sk-UUa")) return ["opencode"];
  if (key.startsWith("sk-")) return ["openai", "deepseek", "qwen", "opencode"]; // ambiguous Ã¢â€ â€™ probe to disambiguate
  return [
    "openai",
    "deepseek",
    "qwen",
    "groq",
    "openrouter",
    "anthropic",
    "github",
    "gemini",
  ];
}
function httpsStatus(opts) {
  return new Promise((resolve) => {
    const r = https.request({ ...opts, method: "GET", timeout: 8000 }, (s) => {
      s.resume();
      resolve(s.statusCode || 0);
    });
    r.on("error", () => resolve(0));
    r.on("timeout", () => {
      r.destroy();
      resolve(0);
    });
    r.end();
  });
}
async function probeProvider(provider, key): Promise<any> {
  const t = PROBE[provider];
  if (!t) return 0;
  let path = t.path;
  const headers: any = {};
  if (t.auth === "bearer") headers["authorization"] = "Bearer " + key;
  else if (t.auth === "anthropic") {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
  } else if (t.auth === "query")
    path = path.replace("KEY", encodeURIComponent(key));
  return httpsStatus({ hostname: t.host, path, headers });
}
async function detectKey(key) {
  const cands = candidatesFor(key);
  for (const p of cands) {
    const st = await probeProvider(p, key);
    if (st >= 200 && st < 300)
      return { provider: p, name: PROVIDER_NAMES[p] || p, verified: true };
  }
  return {
    provider: cands[0],
    name: PROVIDER_NAMES[cands[0]] || cands[0],
    verified: false,
  };
}

// Streams a cloud model's reply, forwarding tokens via onToken.
function _askCloudStreamOnce(cloud, work, onToken, reg) {
  return new Promise((resolve, reject) => {
    const provider = cloud.provider || detectProvider(cloud.key);
    const cfg = CLOUD[provider] || CLOUD.openai;
    // Guard: never let an API key leak into the model field; resolve short aliases.
    let model = (cloud.model || "").trim();
    if (!model || /^(sk-|gsk_|AIza)/.test(model)) model = cfg.model; // empty or a key Ã¢â€ â€™ default
    const aliases = MODEL_ALIASES[provider];
    if (aliases && aliases[model.toLowerCase()])
      model = aliases[model.toLowerCase()];
    const sys = cloud.system || SYS; // agent mode passes its own system prompt
    let host = cfg.host,
      path = cfg.path,
      port: any = null,
      headers = { "content-type": "application/json" },
      body,
      extract;
    const openaiCompatible = () => {
      headers["authorization"] = "Bearer " + cloud.key;
      const mt = /deepseek|reason/i.test(model) ? 16384 : 8192;
      body = JSON.stringify({
        model,
        stream: true,
        max_tokens: mt,
        messages: [{ role: "system", content: sys }, ...work],
      });
      extract = (j) => {
        try {
          const d = j.choices[0].delta;
          return d.content || d.reasoning_content || "";
        } catch {
          return "";
        }
      };
    };

    if (cloud.baseUrl) {
      // custom OpenAI-compatible endpoint (any sk- provider)
      try {
        const u = new URL(
          cloud.baseUrl.replace(/\/+$/, "") + "/chat/completions",
        );
        host = u.hostname;
        path = u.pathname + (u.search || "");
        if (u.port) port = parseInt(u.port);
      } catch {}
      openaiCompatible();
    } else if (provider === "anthropic") {
      headers["x-api-key"] = cloud.key;
      headers["anthropic-version"] = "2023-06-01";
      body = JSON.stringify({
        model,
        max_tokens: 4096,
        system: sys,
        stream: true,
        thinking: { type: "adaptive" },
        messages: work.map((m) => ({ role: m.role, content: m.content })),
      });
      extract = (j) =>
        j.type === "content_block_delta" &&
        j.delta &&
        j.delta.type === "text_delta"
          ? j.delta.text
          : "";
    } else if (provider === "gemini") {
      path = `/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cloud.key)}`;
      body = JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: work.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
      });
      extract = (j) => {
        try {
          return j.candidates[0].content.parts
            .map((p) => p.text || "")
            .join("");
        } catch {
          return "";
        }
      };
    } else {
      // openai-compatible: openai / openrouter / groq / qwen
      openaiCompatible();
    }
    headers["content-length"] = Buffer.byteLength(body);
    const t0 = Date.now();
    dlog("cloud", "info", "cloud model start", { provider, model, host });
    if (VERBOSE)
      dlog("cloud", "info", "cloud model request", {
        provider,
        model,
        messages: work,
      });

    const isLocal = host === "127.0.0.1" || host === "localhost";
    const reqFn = isLocal ? http.request : https.request;
    const reqOpts: any = {
      hostname: host,
      path,
      method: "POST",
      headers,
      timeout: 600000,
    };
    if (port) reqOpts.port = port;
    const r = reqFn(reqOpts, (s) => {
      let acc = "",
        buf = "",
        errBody = "";
      if (s.statusCode >= 400) {
        s.on("data", (c) => (errBody += c));
        s.on("end", () => {
          dlog("cloud", "error", "cloud model http error", {
            provider,
            model,
            status: s.statusCode,
            body: errBody.slice(0, 200),
          });
          reject(
            new Error(`${provider} ${s.statusCode}: ${errBody.slice(0, 300)}`),
          );
        });
        return;
      }
      s.on("data", (chunk) => {
        buf += chunk.toString();
        const lines = buf.split("\n");
        buf = lines.pop()!;
        for (const line of lines) {
          const m = line.match(/^data:\s*(.*)$/);
          if (!m) continue;
          if (m[1] === "[DONE]") continue;
          try {
            const j = JSON.parse(m[1]);
            const t = extract(j);
            if (t) {
              acc += t;
              onToken(t);
            }
          } catch {}
        }
      });
      s.on("end", () => {
        dlog("cloud", "info", "cloud model end", {
          provider,
          model,
          ms: Date.now() - t0,
          chars: acc.length,
        });
        if (VERBOSE)
          dlog("cloud", "info", "cloud model full response", {
            response: acc.slice(0, 5000),
          });
        resolve(acc);
      });
    });
    r.on("error", (e) => {
      dlog("cloud", "error", "cloud model error", {
        provider,
        error: e.message,
      });
      reject(e);
    });
    r.on("timeout", () => {
      dlog("cloud", "error", "cloud model timeout", { provider });
      r.destroy();
      reject(new Error("cloud timeout"));
    });
    if (reg) reg(r);
    r.write(body);
    r.end();
  });
}

// Retry transient network failures Ã¢â‚¬â€ but only before any token streamed (avoid dup output).
async function askCloudStream(cloud, work, onToken, reg) {
  let seen = 0,
    last;
  const wrapped = (t) => {
    seen++;
    onToken(t);
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await _askCloudStreamOnce(cloud, work, wrapped, reg);
    } catch (e) {
      last = e;
      if (seen > 0 || !_TRANSIENT.test(e.message || "") || attempt === 3)
        throw e;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw last;
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Agent mode: multi-step tool loop in a real workspace, model-agnostic Ã¢â€â‚¬Ã¢â€â‚¬
const WORKSPACE = path.join(__dirname, "workspace");
try {
  fs.mkdirSync(WORKSPACE, { recursive: true });
} catch {}

// Resolve a path inside the workspace; throws on traversal outside it.
function wsResolve(p) {
  const dest = path.resolve(WORKSPACE, p || "");
  if (dest !== WORKSPACE && !dest.startsWith(WORKSPACE + path.sep))
    throw new Error("path di luar workspace");
  return dest;
}
// Recursively list workspace files (skips node_modules/.git, caps count).
function wsList(sub) {
  const root = wsResolve(sub || "");
  const out: any[] = [];
  // `depth` arrives undefined from the single-argument call at the end of this
  // IIFE, so `depth + 1` is NaN and `depth > 8` is never true: THE DEPTH CAP IS
  // DEAD, and has been. Left as it stands rather than fixed in passing — the
  // count cap above still bounds the walk, and switching the depth cap on would
  // change what wsList returns for deep trees. Flagged so it is a decision.
  (function walk(dir, depth?: any) {
    if (out.length > 300 || depth > 8) return;
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (/^(node_modules|\.git)$/.test(e.name)) continue;
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
  return out.length ? out.join("\n") : "(workspace is empty)";
}
// Read a file with 1-based line numbers (capped).
function wsRead(p) {
  const fp = wsResolve(p);
  const txt = fs.readFileSync(fp, "utf8");
  const lines = txt.split("\n");
  const shown = lines
    .slice(0, 400)
    .map((l, i) => i + 1 + "\t" + l)
    .join("\n");
  return (
    shown +
    (lines.length > 400 ? `\nÃ¢â‚¬Â¦ (${lines.length - 400} baris lagi)` : "")
  );
}
// Grep a regex across workspace files; returns file:line: match (capped).
function wsGrep(pattern) {
  let re;
  try {
    re = new RegExp(pattern, "i");
  } catch (e) {
    return "regex tidak valid: " + e.message;
  }
  const hits: any[] = [];
  const files = wsList("")
    .split("\n")
    .map((l) => l.replace(/ \(\d+b\)$/, ""))
    .filter((f) => f && f !== "(workspace is empty)");
  for (const rel of files) {
    if (hits.length > 80) break;
    let txt;
    try {
      txt = fs.readFileSync(path.join(WORKSPACE, rel), "utf8");
    } catch {
      continue;
    }
    txt.split("\n").forEach((l, i) => {
      if (hits.length <= 80 && re.test(l))
        hits.push(`${rel}:${i + 1}: ${l.trim().slice(0, 160)}`);
    });
  }
  return hits.length ? hits.join("\n") : "(no matches)";
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Self-edit agent: operate on WOLFSPACE'S OWN source (dev copy), with guardrails Ã¢â€â‚¬Ã¢â€â‚¬
const QROOT = __dirname; // the WOLFSPACE app source root (dev copy)
// Editable: source files under safe dirs. NEVER node_modules/builds/backups/keys.
const Q_ALLOWED =
  /^(server\.cjs|[\w.-]+\.cjs|[\w.-]+([\\/][\w.-]+)+\.cjs|config\.json|public[\\/].+\.(jsx|css|html|js|json))$/;
// Never touch these even if they match above (secrets / generated / heavy).
const Q_FORBID =
  /(^|[\\/])(cloud-keys\.json|node_modules|\.git|_agent_backups|dist-app|build|\.dart_tool|workspace)([\\/]|$)/;
// Secret files. This pattern used to live inside qWalk alone, which filtered only
// READS — Q_FORBID did not mention .env/.pem/.key at all. The moment a WRITE route
// existed (/ww/tulis-berkas) that gap became a hole: a file hidden from the file
// tree could still be overwritten. One pattern serves both sides so the two can
// never diverge again.
const Q_RAHASIA =
  /(cloud-keys\.json|\.env|\.pem$|\.key$|secret|credential|token)/i;
// Confinement for routes that WRITE to the workspace on the renderer's orders. One
// function serves every write route: two copies of the same rule will certainly
// diverge, and what diverges here is a security boundary.
function _kurungDiAkar(root, p) {
  if (!root || !p) return { kode: 400, galat: "root and path are required" };
  const akar = path.resolve(String(root));
  const berkas = path.resolve(String(p));
  // path.relative is more trustworthy than startsWith: "C:\a-lain" begins with
  // "C:\a" textually, but is not inside it.
  const dalam = path.relative(akar, berkas);
  if (!dalam || dalam.startsWith("..") || path.isAbsolute(dalam))
    return { kode: 403, galat: "outside the workspace root" };
  if (Q_FORBID.test(berkas) || Q_RAHASIA.test(path.basename(berkas)))
    return { kode: 403, galat: "protected file" };
  return { akar, berkas, dalam };
}
function qWalk(filterRe) {
  const skip =
    /^(node_modules|\.git|_agent_backups|dist-app|workspace|build|\.dart_tool|vendor)$/;
  // NEVER expose secrets via LIST/GREP/GLOB Ã¢â‚¬â€ these read file *contents*.
  const secret = Q_RAHASIA;
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
      if (e.isFile() && secret.test(e.name)) continue; // hide secret files entirely
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp, depth + 1);
      else {
        const rel = path.relative(QROOT, fp).replace(/\\/g, "/");
        if (!filterRe || filterRe.test(rel)) out.push({ rel, fp });
      }
    }
  })(QROOT, 0);
  return out;
}
// Weak models wrap args in quotes/backticks (GREP "foo", READ `bar`). Strip them,
// else the quotes become literal regex/path chars and the tool answers with the
// no-match string below, forever.
//
//   "tidak ada kecocokan"   (verbatim: the string returned)
function unq(s) {
  return (s || "")
    .trim()
    .replace(/^[`"']+|[`"']+$/g, "")
    .trim();
}
function qResolve(p, mustBeEditable) {
  const rel = unq(p).replace(/^[\\/]+/, "");
  const dest = path.resolve(QROOT, rel);
  if (dest !== QROOT && !dest.startsWith(QROOT + path.sep))
    throw new Error("path di luar root WOLFSPACE");
  const relNorm = path.relative(QROOT, dest).replace(/\\/g, "/");
  if (Q_FORBID.test(relNorm))
    throw new Error("path terlarang (secret/generated): " + relNorm);
  if (
    mustBeEditable &&
    !Q_ALLOWED.test(relNorm.replace(/\//g, path.sep)) &&
    !Q_ALLOWED.test(relNorm)
  )
    throw new Error(
      "path tidak boleh ditulis (sumber kode di public/ atau *.cjs): " +
        relNorm,
    );
  return dest;
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
// GLOB: find files by wildcard over the relative path. Proper ** handling:
//   **/ Ã¢â€ â€™ zero-or-more directories (so public/**/*.jsx matches public/app.jsx)
//   **  Ã¢â€ â€™ any chars incl. /     *  Ã¢â€ â€™ any chars except /     ? Ã¢â€ â€™ one non-/
function globToRe(p) {
  const esc = (c) => c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  let rx = "",
    i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === "*") {
      if (p[i + 1] === "*") {
        if (p[i + 2] === "/") {
          rx += "(?:.*/)?";
          i += 3;
        } else {
          rx += ".*";
          i += 2;
        }
      } else {
        rx += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      rx += "[^/]";
      i++;
    } else {
      rx += esc(c);
      i++;
    }
  }
  return new RegExp("^" + rx + "$", "i");
}
function qGlob(pattern) {
  let re;
  try {
    re = globToRe(unq(pattern) || "*");
  } catch (e) {
    return "pola tidak valid";
  }
  const hits = qWalk(null)
    .filter((f) => re.test(f.rel) || re.test(f.rel.split("/").pop()))
    .map((f) => f.rel);
  return hits.length ? hits.slice(0, 200).join("\n") : "(no matching files)";
}
function qRead(p, near) {
  const fp = qResolve(p, false);
  let st;
  try {
    st = fs.statSync(fp);
  } catch (e) {
    throw new Error("file does not exist: " + unq(p));
  }
  if (st.isDirectory()) {
    // EISDIR guard â€” show contents instead of failing
    const items = fs.readdirSync(fp).slice(0, 100).join("\n");
    return "(this is a directory, not a file) contents:\n" + items;
  }
  const lines = fs.readFileSync(fp, "utf8").split("\n");
  const N = lines.length;
  near = parseInt(near);
  let a = 0,
    b = Math.min(N, 800);
  if (Number.isFinite(near) && near > 0) {
    // window around a specific line (e.g. from grep)
    a = Math.max(0, near - 40);
    b = Math.min(N, near + 40);
  }
  const shown = lines
    .slice(a, b)
    .map((l, i) => a + i + 1 + "\t" + l)
    .join("\n");
  const head = a > 0 || b < N ? `(baris ${a + 1}-${b} dari ${N} total)\n` : "";
  const tail =
    !Number.isFinite(near) && N > 800
      ? `\nâ€¦ (${N - 800} baris lagi â€” pakai read dengan near:<nomor baris> untuk bagian lain)`
      : "";
  return head + shown + tail;
}
// Strip grep-style flags the model adds out of habit (-A 2, -B 2, -C 2, -i, -n, Ã¢â‚¬Â¦)
function cleanGrep(arg) {
  const toks = (arg || "").trim().split(/\s+/);
  const out: any[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (/^-[ABC]$/i.test(t)) {
      if (/^\d+$/.test(toks[i + 1] || "")) i++;
      continue;
    } // -A 2
    if (/^-{1,2}[A-Za-z]+$/.test(t)) continue; // -i, -n, --color
    out.push(t);
  }
  return unq(out.join(" "));
}
// GREP across the whole project's source files (read-only).
function qGrep(pattern) {
  pattern = cleanGrep(pattern);
  if (!pattern) return "pola kosong";
  let re;
  try {
    re = new RegExp(pattern, "i");
  } catch (e) {
    return "regex tidak valid: " + e.message;
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
      if (hits.length < 150 && re.test(l))
        hits.push(`${f.rel}:${i + 1}: ${l.trim().slice(0, 160)}`);
    });
  }
  return hits.length ? hits.join("\n") : "(no matches)";
}
// Syntax-gate: validate a file after an edit. .cjs/.js via `node --check`,
// .jsx via the bundled Babel. Returns {ok, error}.
async function qSyntaxOk(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  try {
    if (ext === ".cjs" || ext === ".js") {
      await execP(`"${process.execPath}" --check "${absPath}"`, {
        timeout: 15000,
        stdio: "pipe",
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      });
      return { ok: true };
    }
    if (ext === ".jsx") {
      const B = require(path.join(QROOT, "public", "vendor", "babel.min.js"));
      B.transform(fs.readFileSync(absPath, "utf8"), { presets: ["react"] });
      return { ok: true };
    }
    return { ok: true }; // css/html/dart: no fast local check
  } catch (e) {
    return {
      ok: false,
      error: ((e.stderr || "") + "" || e.message).slice(0, 500),
    };
  }
}
// Backup ALL editable source files before a self-edit session (covers the broad scope).
function qBackup() {
  const dir = path.join(
    QROOT,
    "_agent_backups",
    "bak-" + new Date().toISOString().replace(/[:.]/g, "-"),
  );
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const f of qWalk(/\.(cjs|js|jsx|css|html|json|dart|yaml)$/i)) {
    if (n > 200) break;
    const relSeg = f.rel.replace(/\//g, path.sep);
    if (!(Q_ALLOWED.test(relSeg) || Q_ALLOWED.test(f.rel))) continue; // only files the agent may edit
    try {
      const d = path.join(dir, f.rel);
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(f.fp, d);
      n++;
    } catch {}
  }
  return dir;
}

// â”€â”€ Local disk exploration (read-only, outside QROOT) â”€â”€
const DISK_HOME = os.homedir();
const DISK_BLOCKED =
  /^[A-Za-z]:[\\\/](Windows|Program Files|Program Files \(x86\)|ProgramData|System Volume Information|\$Recycle\.Bin)/i;
function resolveDiskPath(p) {
  const raw = (p || "").trim().replace(/^[`"']+|[`"']+$/g, "");
  if (/^[A-Za-z]:[\\\/]/.test(raw)) {
    const dest = path.resolve(raw);
    if (DISK_BLOCKED.test(dest)) throw new Error("path sistem ditolak: " + raw);
    return dest;
  }
  if (/^[\/]/.test(raw)) {
    const dest = path.resolve(raw);
    if (DISK_BLOCKED.test(dest)) throw new Error("path sistem ditolak: " + raw);
    return dest;
  }
  const dest = path.resolve(DISK_HOME, raw);
  if (DISK_BLOCKED.test(dest)) throw new Error("path sistem ditolak: " + raw);
  return dest;
}
function diskWalk(dir, filterRe, maxDepth?) {
  const skip =
    /^(node_modules|\.git|_agent_backups|dist-app|build|\.dart_tool|vendor|__pycache__|\.cache|\.vs|\.nuget|packages|Debug|Release|obj|bin|\.next|\.nuxt|target|bower_components|\.terraform|cache)$/i;
  const secret =
    /(\.env|\.pem$|\.key$|\.secret|credentials?|token|cloud-keys|\.lock$)/i;
  const out: any[] = [];
  (function walk(d, depth) {
    if (out.length > 800 || depth > (maxDepth || 7)) return;
    let ents;
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (skip.test(e.name)) continue;
      if (e.isFile() && secret.test(e.name)) continue;
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp, depth + 1);
      else {
        const r = path.relative(dir, fp).replace(/\\/g, "/");
        if (
          !filterRe ||
          filterRe.test(fp.replace(/\\/g, "/")) ||
          filterRe.test(r)
        )
          out.push({ rel: r, fp });
      }
    }
  })(dir, 0);
  return out;
}
function diskList(p) {
  const dir = resolveDiskPath(p || DISK_HOME);
  let st;
  try {
    st = fs.statSync(dir);
  } catch {
    throw new Error("path tidak ada: " + p);
  }
  if (!st.isDirectory()) throw new Error("bukan direktori: " + p);
  const out: any[] = [];
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    throw new Error("tidak bisa akses: " + p);
  }
  const skipEntry =
    /^(node_modules|\.git|__pycache__|\.cache|\.vs|\.nuget|packages|Debug|Release|obj|bin|\.next|target|bower_components|\.terraform|cache)$/i;
  for (const e of ents) {
    if (skipEntry.test(e.name)) continue;
    const fp = path.join(dir, e.name);
    let sz = 0;
    try {
      if (e.isFile()) sz = fs.statSync(fp).size;
    } catch {}
    const icon = e.isDirectory() ? "ðŸ“ " : "ðŸ“„ ";
    out.push(icon + e.name + (e.isDirectory() ? "/" : " (" + sz + "b)"));
  }
  return out.join("\n");
}
function diskGlob(p, pattern) {
  const dir = resolveDiskPath(p || DISK_HOME);
  let st;
  try {
    st = fs.statSync(dir);
  } catch {
    throw new Error("path tidak ada: " + p);
  }
  if (!st.isDirectory()) throw new Error("bukan direktori: " + p);
  let re;
  try {
    re = globToRe((pattern || "*").trim());
  } catch {
    return "pola tidak valid";
  }
  const hits = diskWalk(dir, re).map((f) => f.fp.replace(/\\/g, "/"));
  return hits.length ? hits.slice(0, 200).join("\n") : "(no matching files)";
}
function diskRead(p, near) {
  const fp = resolveDiskPath(p);
  let st;
  try {
    st = fs.statSync(fp);
  } catch {
    throw new Error("file does not exist: " + p);
  }
  if (st.isDirectory())
    return (
      "(this is a directory) contents:\n" +
      fs.readdirSync(fp).slice(0, 100).join("\n")
    );
  const lines = fs.readFileSync(fp, "utf8").split("\n");
  const N = lines.length;
  near = parseInt(near);
  let a = 0,
    b = Math.min(N, 800);
  if (Number.isFinite(near) && near > 0) {
    a = Math.max(0, near - 40);
    b = Math.min(N, near + 40);
  }
  const shown = lines
    .slice(a, b)
    .map((l, i) => a + i + 1 + "\t" + l)
    .join("\n");
  const head = a > 0 || b < N ? `(baris ${a + 1}-${b} dari ${N})\n` : "";
  return head + shown;
}
function diskGrep(p, pattern) {
  if (!pattern) return "pola kosong";
  let re;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    return "regex tidak valid: " + pattern;
  }
  const dir = resolveDiskPath(p || DISK_HOME);
  let st;
  try {
    st = fs.statSync(dir);
  } catch {
    throw new Error("path tidak ada: " + p);
  }
  if (!st.isDirectory()) throw new Error("bukan direktori: " + p);
  const hits: any[] = [];
  const files = diskWalk(
    dir,
    /\.(cjs|js|jsx|css|html|json|dart|yaml|yml|md|py|ts|tsx|txt|xml|sql|sh|bat|ps1|log|cfg|ini|toml|go|rs|java|c|cpp|h|hpp|rb|php|swift|kt|scala|r|m|tex|vue|svelte)$/i,
  );
  for (const f of files) {
    if (hits.length >= 150) break;
    let txt;
    try {
      txt = fs.readFileSync(f.fp, "utf8");
    } catch {
      continue;
    }
    txt.split("\n").forEach((l, i) => {
      if (hits.length < 150 && re.test(l))
        hits.push(
          f.fp.replace(/\\/g, "/") +
            ":" +
            (i + 1) +
            ": " +
            l.trim().slice(0, 160),
        );
    });
  }
  return hits.length ? hits.join("\n") : "(no matches)";
}

const SELF_SYS = [
  "You are WOLFSPACE's assistant Ã¢â‚¬â€ like Claude Code, but for the WOLFSPACE app itself. You can either ANSWER the user normally, OR, when they ask you to change/add/fix/improve something in WOLFSPACE, edit WOLFSPACE's OWN SOURCE (a dev copy) using tools.",
  "DECIDE each turn: if the user just asks a question or chats, reply with a DONE block containing your answer Ã¢â‚¬â€ do NOT use tools. If they ask to modify WOLFSPACE, work in small steps; each reply is EXACTLY ONE action as a single fenced block:",
  "  LIST           Ã¢â‚¬â€ list project files. Body empty.",
  "  GLOB <pattern> Ã¢â‚¬â€ find files by wildcard, e.g. GLOB public/*.css or GLOB *agent*. Body empty.",
  "  READ <path>    Ã¢â‚¬â€ read a file (with line numbers) BEFORE editing it. Body empty.",
  "  GREP <regex>   Ã¢â‚¬â€ search ALL project source files for a pattern. Body empty.",
  "  EDIT <path>    Ã¢â‚¬â€ change an existing file with hunks (ORIGINAL must match verbatim):",
  "                   <<<<ORIGINAL",
  "                   (exact lines from the file)",
  "                   ====",
  "                   (replacement)",
  "                   >>>>",
  "  WRITE <path>   Ã¢â‚¬â€ create a NEW file; body is the full file content. Use for new modules/components, not for changing existing files (use EDIT for those).",
  '  RUN <cmd>      Ã¢â‚¬â€ run a shell command in the project root and see its output, like a terminal. Use it to VERIFY: RUN node -c server.cjs (check syntax), RUN node -e "console.log(1+1)" (test JS), RUN dir. Catastrophic commands (rm -rf, format, git push, curl|sh) are blocked.',
  '  DONE           Ã¢â‚¬â€ finish. The body is your INFORMATIVE final reply: for a question, the answer; after edits, clearly state WHAT you changed (which file, what beforeÃ¢â€ â€™after), so the user is never left guessing. Never end on a plain action line like "READ x" Ã¢â‚¬â€ that means keep going, not finish.',
  "ALWAYS wrap each action in a fenced ```block``` (```READ public/app.jsx```). Do not write actions as loose prose. Keep prose minimal.",
  "For a plain question, just answer in DONE Ã¢â‚¬â€ no tools needed.",
  "You may READ/GREP/GLOB anything in the project. You may EDIT/WRITE source files under: server.cjs, any *.cjs at root, config.json, public/** (.jsx/.js/.css/.html/.json). Forbidden: cloud-keys.json, node_modules, build outputs, backups.",
  "Every EDIT/WRITE is syntax-checked (node --check for .js/.cjs, Babel for .jsx); a broken change is REVERTED and you must fix it. Always READ a file right before editing so ORIGINAL matches exactly.",
  "Architecture: server.cjs = Node backend (HTTP endpoints) + server/routes/* (modular route handlers). public/app.jsx = React UI (Babel-in-browser). public/styles.css = CSS. Keep changes minimal and surgical; prefer small EDIT hunks over rewrites.",
  'FINDING A UI ELEMENT: the user often pastes a Visual-Picker result like `div.empty > p Ã¢â‚¬â€ teks: "Minta kode Ã¢â‚¬Â¦"`. The QUICKEST way to locate it is to GREP a distinctive phrase from that quoted TEXT (e.g. GREP Minta kode) Ã¢â‚¬â€ the text appears verbatim in public/app.jsx. If only a selector is given (no text), React uses className= (not class=) and "div.empty > p" is NOT literal text Ã¢â‚¬â€ GREP the CLASS name only (GREP className="empty") then READ around that line. Never grep the whole selector string; it will never match.',
  "Be efficient: do NOT repeat the same or similar searches. One good GREP + one READ is usually enough to locate something. If a search returns nothing, try a DIFFERENT, simpler term Ã¢â‚¬â€ never re-run near-identical greps. Once you have located the code, EDIT it; then DONE.",
  "After your change validates, emit DONE Ã¢â‚¬â€ the user reviews the dev copy and runs sync-app.ps1 to apply.",
].join("\n");

// Ã¢â€â‚¬Ã¢â€â‚¬ Function-calling agent (JSON tool calls, like Claude Code) Ã¢â€â‚¬Ã¢â€â‚¬
// Replaces the text-verb protocol: the model emits validated tool_calls; args are
// always clean (no quote/flag/fence parsing). Requires an OpenAI-compatible provider
// that supports `tools` (qwen/DashScope, openai, deepseek, groq, openrouter).

const SELF_TOOLS = [
  {
    type: "function",
    function: {
      name: "task",
      description:
        "Spawn a focused SUB-AGENT to handle ONE self-contained sub-task (it has the same tools and returns a short result). Use for big/multi-part work: split it into independent sub-tasks and delegate each. Keeps each piece in clean focused context.",
      parameters: {
        type: "object",
        properties: {
          goal: {
            type: "string",
            description: "one clear, self-contained sub-task",
          },
        },
        required: ["goal"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list",
      description: "List project source files.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "glob",
      description: "Find files by wildcard (e.g. public/**/*.jsx, *agent*).",
      parameters: {
        type: "object",
        properties: { pattern: { type: "string" } },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read",
      description:
        "Read a file with line numbers. Pass near=<line> for Â±40 lines context.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, near: { type: "number" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description: "Search all project source files for a regex pattern.",
      parameters: {
        type: "object",
        properties: { pattern: { type: "string" } },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit",
      description:
        "Replace an exact substring. old_string must match verbatim.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write",
      description: "Create or overwrite a file.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" }, content: { type: "string" } },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bash",
      description:
        "Run a PowerShell command. Supports cwd parameter to set working directory. NOT for editing files.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          cwd: {
            type: "string",
            description: "working directory (absolute path)",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web. Returns top results with title/URL/snippet.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "search query" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_fetch",
      description: "Fetch text from a URL. Returns clean text up to 8KB.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "full URL to fetch" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "todowrite",
      description: "Maintain a structured task list to track multi-step work.",
      parameters: {
        type: "object",
        properties: {
          todos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                content: { type: "string" },
                status: {
                  type: "string",
                  enum: ["pending", "in_progress", "completed", "cancelled"],
                },
                priority: { type: "string", enum: ["high", "medium", "low"] },
              },
              required: ["content", "status"],
            },
            description: "list of tasks",
          },
        },
        required: ["todos"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "question",
      description: "Ask the user a clarifying question.",
      parameters: {
        type: "object",
        properties: {
          question: { type: "string", description: "the question" },
          choices: {
            type: "array",
            items: { type: "string" },
            description: "optional suggested answers",
          },
        },
        required: ["question"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "disk_list",
      description:
        'List contents of ANY directory on the local disk. Use absolute paths like "C:\\Users\\dave\\project".',
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "absolute directory path" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "disk_read",
      description:
        "Read ANY file on the local disk by absolute path. Supports near=<line> for context.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "absolute file path" },
          near: {
            type: "number",
            description: "line number to center on (Â±40 lines)",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "disk_glob",
      description:
        "Find files by wildcard pattern in ANY directory on the local disk.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "directory to search in" },
          pattern: { type: "string", description: "glob pattern" },
        },
        required: ["path", "pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "disk_grep",
      description:
        "Search file contents by regex in ANY directory on the local disk.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "directory to search in" },
          pattern: { type: "string", description: "regex pattern" },
        },
        required: ["path", "pattern"],
      },
    },
  },
];

// Chat with tools Ã¢â€ â€™ assistant message {content, tool_calls}. Uses stream:true because
// several providers (e.g. NVIDIA NIM) HANG on stream:false + tools; we accumulate the
// streamed deltas (content + tool_calls by index) and return the assembled message.

// Retry transient network failures (read ECONNRESET / timeout / socket hang up).
const _TRANSIENT =
  /ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|timeout|EAI_AGAIN|network|ECONNREFUSED|ENOTFOUND|503|404|429|too busy|Service Unavailable|service_unavailable|Rate limit|FreeUsageLimit/i;

// Execute one validated tool call. Returns { ok, output, edited }.
// NOTE: _askCloudToolsOnce / askCloudTools / runSelfTool are REMOVED from here.
//
// All three were COMPLETE copies of the agent path that has since moved into
// modules (agent/cloud.ts and agent/tools/index.ts), and had not one caller: not
// in server.ts, not in electron/main.ts, not in the preload, not in the renderer.
// Exported, but never consumed.
//
// WHY REMOVED rather than left. The runSelfTool copy here ran bash WITHOUT env
// trimming, WITHOUT _confineBash, and WITHOUT CommandChain. Everything just closed
// off on the module path was still wide open here. Dead code that pierces the
// confinement is a landmine: one line calling it undoes the whole confinement
// without a single test going red. The same pattern was already removed for the
// disk_* tools (cdc00bb).
//
// _TRANSIENT is deliberately KEPT below — it is still used around line 1999.

const AGENT_SYS = [
  "You are an autonomous coding agent working inside a project workspace.",
  "Work in small steps. Each reply MUST contain EXACTLY ONE action as a single fenced code block.",
  "The text after the opening ``` (the info string) selects the action:",
  "  LIST [subdir]  Ã¢â‚¬â€ list files in the workspace so you know what exists. Body empty.",
  "  READ <path>    Ã¢â‚¬â€ read a file before editing it. Body empty. You get the content with line numbers.",
  "  GREP <pattern> Ã¢â‚¬â€ search all workspace files for a regex; returns file:line matches. Body empty.",
  "  WRITE <path>   Ã¢â‚¬â€ create/overwrite a file; the block body is the FULL file content.",
  "  EDIT <path>    Ã¢â‚¬â€ surgically change an existing file. The body is one or more hunks in EXACTLY this form:",
  "                   <<<<ORIGINAL",
  "                   (lines copied verbatim from the file)",
  "                   ====",
  "                   (replacement lines)",
  "                   >>>>",
  "                   ORIGINAL must match the file character-for-character. Prefer EDIT over WRITE for existing files Ã¢â‚¬â€ never rewrite a whole file to change a few lines.",
  "  RUN <lang>     Ã¢â‚¬â€ execute code now (lang = python or javascript); body is the code. Files you wrote are importable (same dir).",
  "  DONE           Ã¢â‚¬â€ finish; the body is a short summary for the user.",
  "Typical flow on existing code: LIST Ã¢â€ â€™ READ the target Ã¢â€ â€™ EDIT it Ã¢â€ â€™ RUN a test Ã¢â€ â€™ DONE. On a fresh task: WRITE Ã¢â€ â€™ RUN test Ã¢â€ â€™ DONE.",
  "Prove correctness: write a test with asserts and RUN it. Only emit DONE after a test actually passes.",
  "The sandbox is NON-INTERACTIVE with NO stdin: never use input()/prompt()/sys.stdin (they crash with EOF). Drive code with hardcoded values and asserts instead.",
  "After each action you will see its result, then take the next step. Keep prose outside the block minimal.",
].join("\n");

function buildPromptWith(sys, hist) {
  let p = `<|im_start|>system\n${sys}<|im_end|>\n`;
  for (const t of hist) p += `<|im_start|>${t.role}\n${t.content}<|im_end|>\n`;
  return p + `<|im_start|>assistant\n`;
}

// Parse the first fenced block as an agent action. Tolerant: the verb may be in
// the fence info string OR on the first body line (weak models do the latter).
const VERBS = ["LIST", "GLOB", "READ", "GREP", "WRITE", "EDIT", "RUN", "DONE"];
function parseAction(text): any {
  // closed fence preferred; fall back to an UNCLOSED trailing fence (```GLOB ... <eof>)
  let m = text.match(/```([^\n]*)\n([\s\S]*?)```/);
  if (!m) m = text.match(/```([^\n]*)\n([\s\S]*)$/);
  if (!m) return parseBareAction(text); // no fence Ã¢â€ â€™ tolerant bare-line parse (IDE-style)
  const info = m[1].trim();
  let body = m[2].replace(/\n$/, "");
  let sp = info.split(/\s+/),
    verb = (sp[0] || "").toUpperCase();
  if (!VERBS.includes(verb)) {
    const nl = body.indexOf("\n");
    const firstLine = (nl >= 0 ? body.slice(0, nl) : body).trim();
    const fsp = firstLine.split(/\s+/),
      fverb = (fsp[0] || "").toUpperCase();
    if (VERBS.includes(fverb)) {
      verb = fverb;
      sp = fsp;
      body = (nl >= 0 ? body.slice(nl + 1) : "").replace(/^\n/, "");
      // RUN with no lang on its line but a language fence (```python) Ã¢â€ â€™ use the fence lang
      if (
        fverb === "RUN" &&
        !fsp[1] &&
        /^(python|py|javascript|js|node)$/i.test(info)
      )
        sp = ["RUN", info];
    }
  }
  if (verb === "LIST") return { kind: "list", arg: sp.slice(1).join(" ") };
  if (verb === "GLOB") return { kind: "glob", arg: sp.slice(1).join(" ") };
  if (verb === "READ") return { kind: "read", arg: sp.slice(1).join(" ") };
  if (verb === "GREP") return { kind: "grep", arg: sp.slice(1).join(" ") };
  if (verb === "WRITE")
    return {
      kind: "write",
      arg: sp.slice(1).join(" ") || "untitled.txt",
      body,
    };
  if (verb === "EDIT")
    return { kind: "edit", arg: sp.slice(1).join(" "), body };
  if (verb === "RUN")
    return {
      kind: "run",
      arg: (sp[1] || "python").toLowerCase(),
      cmd: sp.slice(1).join(" "),
      body,
    };
  if (verb === "DONE") return { kind: "done", body };
  return parseBareAction(text);
}
// Tolerant fallback: weaker models write the action as plain text ("READ public/app.jsx")
// instead of a fenced block. Detect a bare no-body command in the last few lines so the
// agent keeps moving instead of stalling (treated as DONE) Ã¢â‚¬â€ like other IDE agents.
function parseBareAction(text) {
  const lines = (text || "")
    .split("\n")
    .map((s) =>
      s
        .trim()
        .replace(/^`+|`+$/g, "")
        .trim(),
    )
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0 && i >= lines.length - 5; i--) {
    const mm = lines[i].match(/^(LIST|GLOB|READ|GREP)\b[:\s]*(.*)$/i);
    if (mm) {
      const verb = mm[1].toLowerCase();
      const arg = mm[2].replace(/^[`"'\s]+|[`"'\s]+$/g, "");
      if (verb === "list" || arg) return { kind: verb, arg };
    }
  }
  return null;
}

// Run code in the workspace dir so files the agent WROTE are importable.
// The scope a verification execution runs in — CARRIED on every verdict.
//
// WHY. The anti-hallucination loop refuses DONE without one ok=true execution. But
// "ok=true" has only ever meant "the process exited 0" — not a word about WHERE it
// ran. `cwd: WORKSPACE` is NOT a boundary: code can open any absolute path, and
// `env: process.env` hands the entire host environment to the code being verified.
// So a green verdict could be an execution that touched things outside the scope,
// and still be reported as a success.
//
// v2: the verdict carries its own scope status. "ok=true" no longer appears bare —
// it is always followed by "confined to X" or "advisory scope". This is the same
// pattern as the [NO NETWORK CONFINEMENT] marker on zones: a boundary that cannot
// be enforced on Windows is at least stated rather than quietly assumed. HONESTLY:
// on Windows this is attestation, not enforcement — there are no namespaces, so
// enforced:false is the plain truth.
function _cakupanVerifikasi() {
  return {
    root: WORKSPACE,
    enforced: false, // Windows: cwd is not a boundary; the Linux jail is not wired into this path yet
    mekanisme: "cwd + env terbatas (advisory)",
  };
}

// A MINIMAL environment for a verification execution — not the whole process.env.
//
// Passing the entire host environment means the code being verified can read
// anything in it (a variable holding a secret, say) AND expand paths through
// %VAR% — the same vector that leaked past the bash guard. What is kept is only
// what an interpreter genuinely needs to run on Windows/Unix.
function _envVerifikasi() {
  const e = process.env;
  const sisa: any = {};
  for (const k of [
    "PATH",
    "Path",
    "PATHEXT",
    "SystemRoot",
    "SystemDrive",
    "windir",
    "ComSpec",
    "NUMBER_OF_PROCESSORS",
    "PROCESSOR_ARCHITECTURE",
    "LANG",
    "LC_ALL",
    "PYTHONIOENCODING",
    "PYTHONDONTWRITEBYTECODE",
  ]) {
    if (e[k] != null) sisa[k] = e[k];
  }
  // TEMP/TMP point INTO the workspace rather than the host Temp — so temporary
  // files from test code do not scatter outside the scope, and %TEMP% no longer
  // points into the host tree.
  sisa.TEMP = WORKSPACE;
  sisa.TMP = WORKSPACE;
  sisa.PYTHONIOENCODING = sisa.PYTHONIOENCODING || "utf-8";
  return sisa;
}

async function runInWorkspace(lang, code) {
  const l = (lang || "").toLowerCase();
  const kurungan = _cakupanVerifikasi();
  const env = _envVerifikasi();
  try {
    if (l === "javascript" || l === "js" || l === "node") {
      fs.writeFileSync(path.join(WORKSPACE, "_run.cjs"), code, "utf8");
      const out = await new Promise<any>((resolve, reject) => {
        exec(
          `"${JS_RUNTIME}" "_run.cjs"`,
          {
            cwd: WORKSPACE,
            timeout: EXEC_TIMEOUT,
            encoding: "utf8",
            maxBuffer: 200 * 1024,
            // JS_RUNTIME is process.execPath. Under `npm run app` the backend runs
            // IN-PROCESS inside Electron, so its value is electron.exe, not
            // node.exe. Without this flag, `electron.exe script.js` treats the
            // script as an APPLICATION entry point: it prints stdout correctly and
            // then NEVER EXITS, because Electron waits for app events that will not
            // come. exec therefore waits out EXEC_TIMEOUT and rejects with SIGTERM,
            // and the verification is reported as FAILED even though the code was
            // right. Measured: 120,046 ms, ok:false, while its stdout held the
            // line below — the right result with the wrong verdict. The same
            // pattern is already used by agent/tools/index.ts and
            // agent/tools/file-tools.ts.
            //
            //   "halo dari javascript"   (verbatim: the captured stdout)
            //
            // _envVerifikasi() uses an allowlist, so this variable is NOT inherited
            // from the parent process and has to be set here. Outside Electron it is
            // ignored, so the `npm start` path is unchanged.
            env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
          },
          (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve(stdout);
          },
        );
      });
      return { ok: true, output: (out || "").slice(0, 4000), kurungan };
    }
    if (l === "python" || l === "py") {
      fs.writeFileSync(path.join(WORKSPACE, "_run.py"), code, "utf8");
      const out = await new Promise<any>((resolve, reject) => {
        exec(
          `python "_run.py"`,
          {
            cwd: WORKSPACE,
            timeout: EXEC_TIMEOUT,
            encoding: "utf8",
            maxBuffer: 200 * 1024,
            // This used to use PY_ENV — a variable that was NEVER declared, so this
            // branch always threw a ReferenceError and every Python verification
            // failed silently (ok=false). It now uses the same restricted env as the
            // JS branch.
            env,
          },
          (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve(stdout);
          },
        );
      });
      return { ok: true, output: (out || "").slice(0, 4000), kurungan };
    }
    return {
      ok: false,
      error: `RUN supports python or javascript (got "${lang}")`,
      kurungan,
    };
  } catch (e) {
    return {
      ok: false,
      kurungan,
      output: (e.stdout || "").toString(),
      error: ((e.stderr || "") + "").trim() || e.message,
    };
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ HuggingFace model browser / downloader Ã¢â€â‚¬Ã¢â€â‚¬
function hfGetJson(p): Promise<any> {
  return new Promise((resolve, reject) => {
    const r = https.request(
      {
        hostname: "huggingface.co",
        path: p,
        headers: { "User-Agent": "WOLFSPACE" },
      },
      (s) => {
        let d = "";
        s.on("data", (c) => (d += c));
        s.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    r.on("error", reject);
    r.end();
  });
}
const AVATAR_CACHE = new Map(); // author -> avatarUrl|null
async function hfAvatar(name) {
  if (AVATAR_CACHE.has(name)) return AVATAR_CACHE.get(name);
  let url: any = null;
  for (const ep of [
    "/api/organizations/" + name + "/avatar",
    "/api/users/" + name + "/avatar",
  ]) {
    try {
      const j = await hfGetJson(ep);
      if (j && j.avatarUrl) {
        url = j.avatarUrl;
        break;
      }
    } catch (e) {}
  }
  AVATAR_CACHE.set(name, url);
  return url;
}
function hfDownload(urlStr, dest, onProgress, reg) {
  return new Promise<void>((resolve, reject) => {
    const get = (u) => {
      let o;
      try {
        o = new URL(u);
      } catch (e) {
        return reject(e);
      }
      const rq = https.get(
        {
          hostname: o.hostname,
          path: o.pathname + o.search,
          headers: { "User-Agent": "WOLFSPACE" },
        },
        (s) => {
          if (s.statusCode >= 300 && s.statusCode < 400 && s.headers.location) {
            s.resume();
            const loc = s.headers.location;
            return get(
              loc.startsWith("http") ? loc : "https://" + o.hostname + loc,
            );
          }
          if (s.statusCode !== 200) {
            s.resume();
            return reject(new Error("HTTP " + s.statusCode));
          }
          const total = parseInt(s.headers["content-length"] || "0", 10);
          let got = 0;
          const f = fs.createWriteStream(dest);
          s.on("data", (c) => {
            got += c.length;
            onProgress(got, total);
          });
          s.on("error", reject);
          f.on("error", reject);
          f.on("finish", () => f.close(() => resolve()));
          s.pipe(f);
        },
      );
      rq.on("error", reject);
      if (reg) reg(rq);
    };
    get(urlStr);
  });
}

// Minimal live debug viewer (no deps) Ã¢â‚¬â€ open http://127.0.0.1:PORT/debug
const DEBUG_VIEWER = `<!doctype html><html><head><meta charset="utf-8"><title>WOLFSPACE Ã‚Â· Debug</title>
<style>
 body{margin:0;background:#0b0d11;color:#cbd5e1;font:13px/1.5 ui-monospace,Consolas,monospace}
 header{position:sticky;top:0;background:#11151c;padding:10px 14px;border-bottom:1px solid #1f2733;display:flex;gap:10px;align-items:center}
 header b{color:#5eead4} input{background:#0b0d11;border:1px solid #2a3441;color:#cbd5e1;padding:4px 8px;border-radius:6px}
 button{background:#1f2733;border:1px solid #2a3441;color:#cbd5e1;padding:4px 10px;border-radius:6px;cursor:pointer}
 .row{padding:3px 14px;border-bottom:1px solid #131922;white-space:pre-wrap;word-break:break-word}
 .t{color:#64748b} .cat{display:inline-block;min-width:54px;color:#93c5fd}
 .info{} .warn{color:#fbbf24} .error{color:#f87171}
 .d{color:#7c8aa0}
</style></head><body>
<header><b>Ã¢Å¡â€º WOLFSPACE Debug</b><span id="n">0</span> event<input id="f" placeholder="filter (cat/msg)Ã¢â‚¬Â¦"><button onclick="document.getElementById('log').innerHTML='';">clear</button></header>
<div id="log"></div>
<script>
 var log=document.getElementById('log'),f=document.getElementById('f'),n=document.getElementById('n'),c=0;
 function fmt(t){return new Date(t).toLocaleTimeString();}
 function add(e){
   if(f.value && !((e.cat+' '+e.msg).toLowerCase().includes(f.value.toLowerCase()))) return;
   var d=e.data?(' '+JSON.stringify(e.data)):'';
   var div=document.createElement('div');div.className='row '+e.level;
   div.innerHTML='<span class="t">'+fmt(e.t)+'</span> <span class="cat">'+e.cat+'</span> '+e.msg+'<span class="d">'+d+'</span>';
   log.appendChild(div); c++; n.textContent=c;
   window.scrollTo(0,document.body.scrollHeight);
 }
 var es=new EventSource('/debug/stream');
 es.onmessage=function(m){try{add(JSON.parse(m.data));}catch(_){}};
</script></body></html>`;

// Pure chat / Web-Dev streaming logic (no req/res). Used by the /chat HTTP handler
// AND the Electron IPC layer. `emit(event)` replaces SSE writes; `ctl.isCancelled()`
// for cooperative cancel; `ctl.setCurReq(r)` exposes the in-flight model request.
const { chatStream } = require("./agent/chat.ts");
const {
  createSnapshot,
  rollback,
  listSnapshots,
} = require("./agent/snapshot.ts");
const { safeWriteFile, quarantine } = require("./agent/safe-edit.ts");

// ── Modular route handlers (server/routes/*) ──
// Each exports handle(req, res, deps) → truthy when the request was handled.
// State stays in server.cjs and is injected via deps; modules hold logic only.
// Routes ending in .ts are already migrated to TypeScript; the require() hook
// that transpiles them on the fly is installed at the very top of this file,
// because agent/mcp-client.ts is required long before this point.
const _debugRoutes = require("./server/routes/debug.ts");
const _terminalRoutes = require("./server/routes/terminal.ts");
const _snapshotRoutes = require("./server/routes/snapshots.ts");
const _cloudRoutes = require("./server/routes/cloud.ts");
const _dapRoutes = require("./server/routes/dap.ts");

// Recover tool calls that a model wrote as plain text instead of real tool_calls,
// e.g. `<function=read={"path":"x"}>` or `<function=list>` (groq/llama quirk).
function parsePseudoCalls(text) {
  if (!text || text.indexOf("<function") < 0) return [];
  const out: any[] = [];
  const re =
    /<function\s*=\s*([\w.-]+)\s*=?\s*(\{[\s\S]*?\})?\s*\/?>(?:\s*<\/function>)?/g;
  let m;
  while ((m = re.exec(text))) {
    let args: any = {};
    if (m[2]) {
      try {
        args = JSON.parse(m[2]);
      } catch (_) {}
    }
    out.push({ name: m[1], args });
  }
  return out;
}

// Pure self-edit agent loop (function-calling tools over WOLFSPACE's own source).
// The full implementation now lives in `agent/self_agent.ts`.
const { selfAgentStream } = require("./agent/self_agent.ts");

// â”€â”€ Persistent PTY Terminal Sessions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Each session is a background pseudo-terminal that keeps state (cd, env).
// Designed for AI agents to run interactive commands without losing context.
const terminalSessions = new Map(); // id â†’ { pty, shell, cwd, createdAt, listeners, outputBuffer }
const TERM_OUTPUT_MAX = 4096; // max chars kept per session for late joiners
// The session manager here differs from core/terminal.ts (which the agent tools
// use), but the way a PTY is KILLED is taken from there — one implementation only.
// The reasoning is long and lives in closeTerminalSession() below.
const coreTerminal = require("./core/terminal.ts");

function generateTerminalId() {
  return (
    "term_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 8)
  );
}

// ── Choosing a pre-compressed file that may be sent ──
//
// Returns null when nothing matches — the caller then sends the original.
//
// Freshness is CHECKED, not assumed. A .br file older than its source means the
// asset changed but was never recompressed: the user would receive the OLD
// version, with no sign at all that this is what happened — the most confusing
// failure this layer could possibly produce.
function _pilihKompresi(req, berkasAsli) {
  // ONLY for requests arriving over a real socket.
  //
  // In the desktop app, electron/main.ts builds SYNTHETIC req/res and reads the
  // reply as `Buffer.concat(chunks).toString("utf8")` — text. Brotli bytes forced
  // through UTF-8 produce garbage, and that garbage raises no error at all: the
  // asset simply loads corrupted, silently.
  //
  // Today that path never sends accept-encoding, so this branch never fires there.
  // But that is safety by accident — adding one header in future would be enough
  // to break it. The presence of a socket is a distinction that cannot be wrong.
  if (!req.socket) return null;
  const terima = String(
    (req.headers && (req.headers["accept-encoding"] || "")) || "",
  ).toLowerCase();
  if (!terima) return null;
  let stAsli;
  try {
    stAsli = fs.statSync(berkasAsli);
  } catch (_) {
    return null;
  }
  // Brotli first: on the assets here it averages 24% smaller than gzip (4.75 MB vs
  // 6.23 MB), and both are already built.
  const calon = [
    ["br", berkasAsli + ".br"],
    ["gzip", berkasAsli + ".gz"],
  ];
  for (const [encoding, berkas] of calon) {
    if (terima.indexOf(encoding) < 0) continue;
    try {
      const st = fs.statSync(berkas);
      if (st.mtimeMs < stAsli.mtimeMs) continue; // stale -> do not use it
      return { encoding, berkas };
    } catch (_) {}
  }
  return null;
}

// Determine which shell to use based on the platform.
// ── Finding a program on PATH WITHOUT spawning a process ──
//
// The previous version called `where "<name>"` through execSync. The moment
// execSync was actually bound (it used to throw a ReferenceError, so its cost was
// zero and its result always wrong), that cost appeared in full: a measured 2008 ms
// BLOCKING THE THREAD on a single /api/terminal/open — nearly all of it spent in
// `where "pwsh.exe"` waiting out its 2000 ms limit because pwsh is not installed.
// All of server.ts runs INSIDE Electron's main process, so those two seconds are
// two seconds of frozen window — and the Run button opens a terminal, so it is felt
// exactly when the user presses Run.
//
// What `where` actually does is walk PATH. fs.existsSync can do that: no process is
// spawned, and it measures under 1 ms.
function _adaDiPath(nama) {
  const dirs = String(process.env.PATH || "").split(path.delimiter);
  // The bare name is tried FIRST, then each PATHEXT suffix. Without that, checking
  // for "python" or "dlv" on Windows always answers "not present": what actually
  // sits on PATH is "python.exe" and "dlv.exe" — and a caller that writes its own
  // suffix (like "powershell.exe") still works, because the bare name is tried
  // first.
  const akhiran =
    process.platform === "win32"
      ? ["", ...String(process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";")]
      : [""];
  for (const d of dirs) {
    if (!d) continue;
    for (const a of akhiran) {
      try {
        if (fs.existsSync(path.join(d, nama + a))) return true;
      } catch (_) {}
    }
  }
  return false;
}
// The debuggers the Code panel knows, and the binary each needs to be useful.
// The keys MATCH jenisDebugger() in public/app.tsx — if they diverge the result is
// not an error but a button judging the wrong debugger.
const _BINER_DEBUG = { node: "node", pdb: "python", rdbg: "rdbg", dlv: "dlv" };
let _debugTersedia: any = null;

// The result is CACHED: the installed shells do not change mid-session, while
// without a cache the cost is paid again every time a terminal is opened.
let _shellTerpilih: any = null;
function detectShell() {
  if (_shellTerpilih) return _shellTerpilih;
  if (process.platform === "win32") {
    // Prefer PowerShell Core, then Windows PowerShell, then cmd
    const candidates = ["pwsh.exe", "powershell.exe", "cmd.exe"];
    for (const c of candidates) if (_adaDiPath(c)) return (_shellTerpilih = c);
    return (_shellTerpilih = "cmd.exe");
  }
  return (_shellTerpilih = process.env.SHELL || "/bin/bash");
}

// Open a new PTY session rooted at the workspace directory.
function openTerminalSession(customCwd, customShell) {
  const id = generateTerminalId();
  const shell = customShell || detectShell();
  const cwd = customCwd || WORKSPACE;
  try {
    fs.mkdirSync(cwd, { recursive: true });
  } catch {}

  if (!pty) {
    const e = new Error(
      "Terminal tidak tersedia: node-pty gagal dimuat di platform ini" +
        (ptyLoadError ? " — " + String(ptyLoadError).split("\n")[0] : ""),
    );
    (e as any).code = "PTY_UNAVAILABLE";
    throw e;
  }

  const useConpty = process.platform === "win32";
  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 100,
    rows: 30,
    cwd,
    env: { ...process.env, TERM: "xterm-256color", PROMPT_COMMAND: "" },
    useConpty,
  });

  const listeners = new Set<any>();
  let outputBuffer = "";
  const session = {
    pty: ptyProcess,
    shell,
    cwd,
    createdAt: Date.now(),
    listeners,
    outputBuffer,
  };
  terminalSessions.set(id, session);

  // Forward PTY output to all registered listeners + buffer
  ptyProcess.onData((data) => {
    session.outputBuffer += data;
    if (session.outputBuffer.length > TERM_OUTPUT_MAX)
      session.outputBuffer = session.outputBuffer.slice(-TERM_OUTPUT_MAX);
    for (const fn of listeners) {
      try {
        fn(data);
      } catch (_) {}
    }
  });

  // Auto-cleanup on exit
  ptyProcess.on("exit", () => {
    terminalSessions.delete(id);
    dlog("terminal", "info", `session ${id} closed (process exited)`);
  });

  dlog("terminal", "info", `session ${id} opened`, { shell, cwd });
  return { id, shell, cwd };
}

// Write data to an open PTY session (stdin).
function writeToTerminal(id, data) {
  const session = terminalSessions.get(id);
  if (!session) throw new Error("terminal session not found: " + id);
  session.pty.write(data);
}

// Resize the PTY dimensions.
function resizeTerminal(id, cols, rows) {
  const session = terminalSessions.get(id);
  if (!session) throw new Error("terminal session not found: " + id);
  session.pty.resize(cols || 100, rows || 30);
}

// Close (kill) a terminal session.
//
// Before: pty.kill("SIGTERM"), then pty.kill("SIGKILL") 200 ms later. NEITHER ever
// killed anything on Windows — node-pty THROWS the moment it is given a signal
// argument ("Signals not supported on windows", windowsTerminal.js:150), and the
// throw was swallowed by `catch {}`. The session was still deleted from the map, so
// the PTY stayed alive AND became unreachable for cleanup. Measured on a real
// server process: 3 children before, 9 after three open+close cycles — two orphan
// processes per cycle, surviving until the whole application closed, while
// /api/terminal/list already reported none.
//
// It now uses the one PTY-killing path in this codebase (core/terminal.ts killPty):
// taskkill /F /T for the whole tree, with no signal argument, plus disabling the
// node-pty console registrar that crashes. Deleting from the map no longer needs
// deferring — the kill is synchronous, so that 200 ms window only delayed things
// without guaranteeing anything.
// NOT blocking. This is the HTTP/UI path, and all of server.ts runs inside
// Electron's main process — `taskkill /F /T` through execSync measured 1076 ms of
// blocked thread (worst case 1507 ms) every time the terminal panel closed, and
// that is a genuinely frozen window.
//
// The session is removed from the map NOW, before the kill finishes. Not an
// oversight: once it is removed nothing can write to or read from that PTY, so
// /api/terminal/list is immediately honest — whereas waiting for taskkill only
// holds up the answer without changing anything visible.
function closeTerminalSession(id) {
  const session = terminalSessions.get(id);
  if (!session) return;
  terminalSessions.delete(id);
  coreTerminal.killPtyAsync(session.pty).catch((e) =>
    dlog("terminal", "warn", "gagal menutup PTY " + id, {
      galat: String((e && e.message) || e),
    }),
  );
}

const server = http.createServer(async (req, res) => {
  // Healthcheck — BEFORE everything else, deliberately.
  // A container host (Railway/Render/Fly) probes this endpoint continuously. With no
  // dedicated path the probe would hit "/" and serve ~16KB of index.html every few
  // seconds forever. This reply touches neither disk, config, nor agent state — so
  // it keeps answering while other parts are busy, which is exactly the point: a
  // healthcheck that jams too would trigger a restart loop.
  if (req.url === "/healthz") {
    // Includes the VERSION, not just "ok".
    //
    // The backend can run elsewhere (WSL) from a synchronised copy of the code, and
    // that copy can fall behind. It really happened: after a few commits the md5 of
    // the files in WSL differed from those on Windows, and the only way to answer
    // "which version am I running?" was to compare checksums one by one.
    //
    // The launcher can now compare for itself: if the live backend's version matches
    // the one about to be started, it is REUSED — no second process. If they differ,
    // it is stopped and restarted. That is what makes "one server" a guarantee
    // rather than a hope.
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(
      JSON.stringify({ ok: true, ...versiBackend(), pid: process.pid }),
    );
  }

  // Dynamic CORS: in bypass mode, allow only the frontend origin
  const CORS_ORIGIN = process.env.STATIC_PORT
    ? `http://localhost:${process.env.STATIC_PORT}`
    : "*";
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Request trace + debug endpoints Ã¢â€â‚¬Ã¢â€â‚¬
  const _path = (req.url || "/").split("?")[0];
  if (req.method === "POST" && _path !== "/complete" && _path !== "/pycomplete")
    dlog("http", "info", "POST " + _path);

  // ── Modular routes (server/routes/*) — first match wins, state injected ──
  if (
    _debugRoutes.handle(req, res, {
      trace,
      LOG_RING,
      debugSubs,
      DEBUG_VIEWER,
      dlog,
    })
  )
    return;
  // The confinement is DELEGATED, not copied: `program` comes from the renderer, and
  // two copies of the same security rule will certainly diverge.
  if (_dapRoutes.handle(req, res, { kurungDiAkar: _kurungDiAkar })) return;
  if (
    _terminalRoutes.handle(req, res, {
      terminalSessions,
      openTerminalSession,
      writeToTerminal,
      resizeTerminal,
      closeTerminalSession,
    })
  )
    return;
  if (_snapshotRoutes.handle(req, res, { listSnapshots, rollback })) return;
  if (
    _cloudRoutes.handle(req, res, {
      CLOUD_KEYS,
      CLOUD,
      PROVIDER_NAMES,
      loadCloudKeys,
      detectKey,
      dlog,
    })
  )
    return;

  // MCP Configuration Endpoints
  // RUNTIME status per MCP server. A SEPARATE endpoint from /mcp on purpose: /mcp
  // returns the configuration map DIRECTLY, and the frontend already reads it with
  // Object.entries(data) — changing its shape would repeat the old bug where the
  // MCP list never refreshed.
  if (_path === "/mcp/status" && req.method === "GET") {
    const mcpClient = require("./agent/mcp-client.ts");
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(mcpClient.status()));
  }

  // Start MCP servers when the user asks (the Connect button), not at application
  // start. Without `name`, every server that is not disabled is started.
  //
  // This is the backend half of the change in mcp-client: init() no longer spawns
  // anything, so the first step of an agent run does not carry the `npx` cold start
  // of every server (measured at 60.3 seconds of silence, with no event at all,
  // before this change).
  if (_path === "/mcp/connect" && req.method === "POST") {
    const mcpClient = require("./agent/mcp-client.ts");
    let body = "";
    req.on("data", (c) => (body += c.toString()));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        const hasil = payload.name
          ? await mcpClient.connectServer(payload.name)
          : { all: await mcpClient.connectAll() };
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, ...hasil }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (_path === "/mcp/toggle" && req.method === "POST") {
    const mcpClient = require("./agent/mcp-client.ts");
    let body = "";
    req.on("data", (c) => (body += c.toString()));
    req.on("end", async () => {
      try {
        const payload = JSON.parse(body || "{}");
        if (!payload.name) throw new Error("Missing name");
        const result = await mcpClient.toggleServer(
          payload.name,
          !!payload.enabled,
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  if (_path === "/mcp") {
    const mcpClient = require("./agent/mcp-client.ts");
    if (req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(mcpClient.getServers()));
    }
    if (req.method === "POST" || req.method === "DELETE") {
      let body = "";
      req.on("data", (c) => (body += c.toString()));
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body || "{}");
          let result;
          if (req.method === "POST") {
            if (!payload.name || !payload.conf)
              throw new Error("Missing name or conf");
            result = await mcpClient.addServer(payload.name, payload.conf);
          } else if (req.method === "DELETE") {
            if (!payload.name) throw new Error("Missing name");
            result = mcpClient.removeServer(payload.name);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: e.message }));
        }
      });
      return;
    }
  }

  // Handing over an attachment through the bridge: the thing crosses, its address
  // does not.
  //
  // Different from /upload below, which writes into <WOLFSPACE>/public/uploads/ and
  // then hands the agent its PATH. When the agent is confined to one worktree that
  // path is out of scope and the broker refuses it — so correct confinement was what
  // killed attachments. Here what comes back is a HANDLE rather than a location, so
  // the confinement does not need loosening in the slightest.
  //
  // Nothing touches disk: the content stays in the backend process's memory, and the
  // preview in the UI uses the local URL.createObjectURL that already exists.
  if (req.method === "POST" && req.url === "/attach") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { name, data, type } = JSON.parse(body || "{}");
        if (!name || !data) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({ ok: false, error: "name & data wajib" }),
          );
        }
        const bridge = require("./agent/attachment-bridge.ts");
        const hasil = bridge.serahkan({
          nama: name, // trimmed to a basename inside the bridge
          isi: Buffer.from(data, "base64"),
          tipe: type || null,
        });
        // Deliberately logs the SANITISED name rather than the raw `name`: if a
        // caller mistakenly sends an absolute path (File.path in the Electron
        // renderer), it must not land in the log file.
        dlog("http", "info", "lampiran diserahkan", {
          nama: hasil.nama,
          bytes: hasil.bytes,
          ok: hasil.ok,
        });
        res.writeHead(hasil.ok ? 200 : 400, {
          "Content-Type": "application/json",
        });
        res.end(JSON.stringify(hasil));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // Upload file attachment (base64 JSON â†’ saved to public/uploads/)
  if (req.method === "POST" && req.url === "/upload") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      try {
        const { name, data } = JSON.parse(body);
        if (!name || !data) {
          res.writeHead(400);
          return res.end(JSON.stringify({ error: "name & data required" }));
        }
        const uploadDir = path.join(__dirname, "public", "uploads");
        try {
          fs.mkdirSync(uploadDir, { recursive: true });
        } catch (e) {}
        // sanitize filename
        const safe = path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
        const fp = path.join(uploadDir, safe);
        const buf = Buffer.from(data, "base64");
        fs.writeFileSync(fp, buf);
        dlog("http", "info", "file uploaded", { name: safe, size: buf.length });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            url: "/uploads/" + safe,
            name: safe,
            size: buf.length,
          }),
        );
      } catch (e) {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Chat: stream tokens + auto run/fix loop (SSE)
  if (req.method === "POST" && req.url === "/chat") {
    let body = "";
    let cancelled = false,
      curReq: any = null;
    res.on("close", () => {
      if (!res.writableFinished) {
        cancelled = true;
        if (curReq) {
          try {
            curReq.destroy();
          } catch (_) {}
        }
      }
    });
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let history, port, cloud;
      try {
        ({ history, port, cloud } = JSON.parse(body));
      } catch (e) {
        res.writeHead(400);
        return res.end("bad json");
      }
      // Fill key/model/baseUrl from server-side storage (and route the groq slot
      // to the local Claude bridge) Ã¢â‚¬â€ same resolution as everywhere else.
      fillCloudKey(cloud);
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const ev = (o) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(o)}\n\n`);
      };
      // Logic lives in the pure chatStream() (shared with the IPC layer).
      await chatStream({ history, port, cloud }, ev, {
        isCancelled: () => cancelled,
        setCurReq: (r) => {
          curReq = r;
        },
      });
      if (!res.writableEnded) res.end();
    });
    return;
  }

  // Agent: autonomous WRITE/RUN/DONE loop in the workspace (SSE)
  if (req.method === "POST" && req.url === "/agent") {
    let body = "";
    let cancelled = false,
      curReq: any = null;
    res.on("close", () => {
      if (!res.writableFinished) {
        cancelled = true;
        if (curReq) {
          try {
            curReq.destroy();
          } catch (_) {}
        }
      }
    });
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let history, port, cloud;
      try {
        ({ history, port, cloud } = JSON.parse(body));
      } catch (e) {
        res.writeHead(400);
        return res.end("bad json");
      }
      if (cloud) {
        cloud.provider =
          cloud.provider || (cloud.key ? detectProvider(cloud.key) : null);
        if (!cloud.key && cloud.provider && CLOUD_KEYS[cloud.provider]) {
          cloud.key = CLOUD_KEYS[cloud.provider].key;
          cloud.model = cloud.model || CLOUD_KEYS[cloud.provider].model;
        }
      }
      // Autonomous: if no usable cloud was passed, fall back to a stored server-side
      // key (cloud-keys.json). The local 3B can't drive the tool loop reliably.
      if (!(cloud && cloud.key)) {
        const prov = Object.keys(CLOUD_KEYS).find(
          (p) => CLOUD_KEYS[p] && CLOUD_KEYS[p].key,
        );
        if (prov)
          cloud = {
            provider: prov,
            key: CLOUD_KEYS[prov].key,
            model: CLOUD_KEYS[prov].model,
            baseUrl: CLOUD_KEYS[prov].baseUrl,
          };
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const ev = (o) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(o)}\n\n`);
      };
      const convo = (history || []).slice();
      const MAX = 50;
      let hasRunOk = false; // Track verified executions across steps
      let verifiedKurungan: any = null; // the scope of the execution that gates DONE
      try {
        for (let step = 1; step <= MAX; step++) {
          if (cancelled) break;
          ev({ t: "step", n: step });
          let reply;
          if (cloud && cloud.key) {
            reply = await askCloudStream(
              { ...cloud, system: AGENT_SYS },
              convo,
              (tok) => ev({ t: "tok", c: tok }),
              (r) => {
                curReq = r;
              },
            );
          } else {
            // No local-model fallback exists any more: the llama.cpp/GGUF path
            // was removed together with the Model Hub. Say what is actually
            // wrong — a missing cloud key — instead of failing on a port that
            // no longer means anything. agent/chat.ts states the same rule.
            throw new Error(
              "No cloud API key is configured. WOLFSPACE is cloud-only: add a key in Settings, or write one to ~/.wolfspace/cloud-keys.json.",
            );
          }
          if (cancelled) break;
          convo.push({ role: "assistant", content: reply });
          let act = parseAction(reply),
            implicitRun = false;
          // Fallback (honors WOLFSPACE's thesis): if the model just dumped a code block
          // instead of using the protocol, run it and verify by execution.
          if (!act) {
            const cb = extractCode(reply);
            if (cb) {
              const raw = (cb.lang || "").toLowerCase();
              const lang = ALIAS[raw] || raw; // only when the fence is EXPLICITLY tagged runnable
              if (lang === "python" || lang === "javascript") {
                // untagged prose blocks are NOT executed
                const clean = cb.code
                  .split("\n")
                  .filter((l) => !/^\s*(WRITE\b|RUN\b|DONE\b)/i.test(l))
                  .join("\n");
                act = { kind: "run", arg: lang, body: clean };
                implicitRun = true;
              }
            }
          }
          // Anti-hallucination check: DONE is only allowed when some execution was
          // OK. If the model sends DONE with no evidence of a successful execution,
          // it is refused.
          if (!act || act.kind === "done") {
            if (!hasRunOk) {
              ev({
                t: "adone",
                steps: step,
                summary:
                  "DONE rejected: no successful execution verification yet (ok=false, or nothing was run). Continue the agent.",
              });
              convo.push({
                role: "user",
                content:
                  "DONE was rejected because nothing has been verified. Please continue and make sure the final result is validated by running an execution command so the CPU reports ok=true.",
              });
              continue;
            }
            // "ok=true" never appears bare: the final verdict states the SCOPE of
            // the execution that validated it. Genuinely confined, that is a
            // guarantee; advisory (Windows), it is a warning against reading more
            // into it. Consistent with the confinement marker on zones.
            const _k = verifiedKurungan;
            const _catatan = _k
              ? _k.enforced
                ? ` [terverifikasi, terkurung ke ${_k.root}]`
                : ` [terverifikasi ok=true, TAPI cakupan advisory (${_k.mekanisme}) — bukan batas yang ditegakkan]`
              : "";
            ev({
              t: "adone",
              steps: step,
              summary: (act ? act.body || "Selesai." : reply) + _catatan,
              ...(_k ? { kurungan: _k } : {}),
            });
            break;
          }

          let result: any = { ok: false };
          if (act.kind === "list") {
            try {
              result = { ok: true, output: wsList(act.arg) };
            } catch (e) {
              result = { ok: false, error: e.message };
            }
          } else if (act.kind === "read") {
            try {
              result = { ok: true, output: wsRead(act.arg) };
            } catch (e) {
              result = { ok: false, error: "read failed: " + e.message };
            }
          } else if (act.kind === "grep") {
            try {
              result = { ok: true, output: wsGrep(act.arg) };
            } catch (e) {
              result = { ok: false, error: e.message };
            }
          } else if (act.kind === "write") {
            try {
              const dest = wsResolve(act.arg || "untitled.txt");
              fs.mkdirSync(path.dirname(dest), { recursive: true });
              fs.writeFileSync(dest, act.body, "utf8");
              result = {
                ok: true,
                output: `wrote ${act.arg} (${Buffer.byteLength(act.body)} bytes)`,
              };
            } catch (e) {
              result = { ok: false, error: e.message };
            }
          } else if (act.kind === "edit") {
            try {
              const dest = wsResolve(act.arg);
              const src = fs.readFileSync(dest, "utf8");
              const patched = applyHunks(src, act.body); // reuse the precise-patch engine
              if (patched === null)
                throw new Error(
                  "hunk ORIGINAL tidak cocok dengan isi file Ã¢â‚¬â€ READ ulang lalu salin baris persis",
                );
              fs.writeFileSync(dest, patched, "utf8");
              result = {
                ok: true,
                output: `edited ${act.arg} (${src.length}Ã¢â€ â€™${patched.length} bytes)`,
              };
            } catch (e) {
              result = { ok: false, error: "edit failed: " + e.message };
            }
          } else {
            // run
            result = await runInWorkspace(act.arg, act.body);
            if (result.ok) {
              hasRunOk = true; // Mark as verified!
              // The scope of the execution that GATES DONE is kept, so the final
              // verdict can state it. Without this "ok=true" appears bare.
              verifiedKurungan = result.kurungan || null;
            }
          }
          ev({
            t: "act",
            kind: act.kind,
            arg: act.arg,
            ok: !!result.ok,
            output: result.output || result.error || "",
            ...(result.kurungan ? { kurungan: result.kurungan } : {}),
          });
          // A bare code block that ran clean = verified by the CPU Ã¢â€ â€™ finish.
          if (implicitRun && result.ok) {
            ev({
              t: "adone",
              steps: step,
              summary: "Ã¢Å“â€œ Terverifikasi dengan eksekusi (exit 0).",
            });
            break;
          }
          convo.push({
            role: "user",
            content:
              `Result of ${act.kind} ${act.arg || ""} Ã¢â‚¬â€ ${result.ok ? "OK" : "FAIL"}:\n${(result.output || result.error || "").slice(0, 1500)}\n` +
              `Continue with the next single action. If the task is complete and a test passed, reply with a DONE block.`,
          });
          if (step === MAX)
            ev({
              t: "adone",
              steps: step,
              summary: "Mencapai batas langkah (" + MAX + ").",
            });
        }
      } catch (e) {
        if (!cancelled) ev({ t: "err", m: e.message });
      }
      if (!res.writableEnded) res.end();
    });
    return;
  }

  // ww workspaces: the list of isolated folders from DISK (the truth, not the UI's
  // localStorage).
  if (req.method === "GET" && req.url === "/ww/list") {
    try {
      const ww = require("./scripts/ww.ts");
      const root = (CONFIG.ww && CONFIG.ww.root) || ww.DEFAULT_ROOT;
      const workspaces = ww.listWorkspaces(root);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ root, workspaces }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // GET /ww/tree?path=<absolute>&depth=<n> — the workspace file tree (for the Logic
  // sidebar during web-dev). Flattened into [{ name, dir, depth }], folders first
  // then files (A→Z), skipping heavy or irrelevant folders, and bounded so it does
  // not freeze on a large repo. Never 500s for a missing path -> { entries: [] }.
  // ── Saving a manual edit from the code panel ──
  //
  // The code panel in the Logic view used to be READ-ONLY: `readOnly: true` on its
  // editor, and no route at all that could write back. Loosening the editor alone
  // was not enough — without this route the user's typing lives in memory and is
  // lost the moment another file is opened.
  //
  // THE CONFINEMENT IS HERE, NOT IN THE UI. The panel sends the path as-is, and that
  // path comes from the renderer — so it cannot be trusted. Three layers:
  //   1. it must be INSIDE the root that was sent, compared after path.resolve
  //      (not after a textual check, which ".." can walk through)
  //   2. that root must itself be a legitimate working root
  //   3. Q_FORBID + Q_RAHASIA still apply — .git, node_modules, build, and secret
  //      files (.env/.pem/.key) are already hidden from the file tree, so they must
  //      not be writable from here either
  if (
    req.method === "POST" &&
    (req.url === "/ww/tulis-berkas" || req.url === "/ww/buat-berkas")
  ) {
    const membuat = req.url === "/ww/buat-berkas";
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const tolak = (kode, pesan) => {
        res.writeHead(kode, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: pesan }));
      };
      let p;
      try {
        p = JSON.parse(body);
      } catch (e) {
        return tolak(400, "invalid json");
      }
      const kurung = _kurungDiAkar(p.root, p.path);
      if (kurung.galat) return tolak(kurung.kode, kurung.galat);
      const { akar, berkas, dalam } = kurung;
      const isi = String(p.content == null ? "" : p.content);
      // Creating a FOLDER runs the same confinement and the same "must not
      // already exist" rule; only the last step differs. Splitting it into its
      // own route would mean a second copy of the guard, and a security rule
      // that exists twice is a security rule that will drift.
      if (membuat && p.folder === true) {
        if (fs.existsSync(berkas)) return tolak(409, "already exists");
        try {
          fs.mkdirSync(berkas, { recursive: true });
        } catch (e) {
          return tolak(500, e.message);
        }
        dlog("http", "info", "folder baru dibuat dari pohon", { path: dalam });
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            ok: true,
            folder: true,
            path: dalam.split(String.fromCharCode(92)).join("/"),
          }),
        );
      }
      try {
        if (membuat) {
          // Creating MUST NOT overwrite. Without this, typing the name of an
          // existing file into the "new file" box would silently empty it.
          if (fs.existsSync(berkas)) return tolak(409, "file already exists");
          // A nested name ("src/util/a.js") creates its folders too, the same way
          // VS Code does. Without this, writeFileSync fails with ENOENT.
          const induk = path.dirname(berkas);
          if (induk !== akar) fs.mkdirSync(induk, { recursive: true });
          // wx: fails if the file appears between the existsSync and the write.
          fs.writeFileSync(berkas, isi, { encoding: "utf8", flag: "wx" });
        } else {
          fs.writeFileSync(berkas, isi, "utf8");
        }
      } catch (e) {
        if (e && e.code === "EEXIST") return tolak(409, "file already exists");
        return tolak(500, e.message);
      }
      dlog(
        "http",
        "info",
        membuat
          ? "berkas baru dibuat dari pohon"
          : "berkas disimpan dari panel kode",
        { path: dalam, bytes: isi.length },
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: dalam.replace(/\\/g, "/") }));
    });
    return;
  }

  // ── POST /ww/hapus-berkas — deleting a file from the tree ──
  //
  // Same confinement as writing and creating: _kurungDiAkar, so there is ONE
  // rule and not three copies that can drift. That matters more here than
  // anywhere else — a path escape on write corrupts a file, a path escape on
  // delete removes one.
  //
  // FILES ONLY. A directory is refused outright rather than removed
  // recursively: one mis-click on a folder node would otherwise take the whole
  // subtree, and nothing in this app can put it back.
  if (req.method === "POST" && req.url === "/ww/hapus-berkas") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const tolak = (kode, pesan) => {
        res.writeHead(kode, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: pesan }));
      };
      let p;
      try {
        p = JSON.parse(body || "{}");
      } catch (e) {
        return tolak(400, "invalid json");
      }
      const kurung = _kurungDiAkar(p.root, p.path);
      if (kurung.galat) return tolak(kurung.kode, kurung.galat);
      const { berkas, dalam } = kurung;
      let st;
      try {
        st = fs.statSync(berkas);
      } catch (e) {
        return tolak(404, "file not found");
      }
      // ── Folders ──
      //
      // Deleting one takes everything inside it, so it demands an EXPLICIT
      // `folder: true`. Without that flag a directory is still refused: a
      // mis-click on a folder row must never be able to remove a subtree just
      // because the row happened to be a folder.
      if (st.isDirectory()) {
        if (p.folder !== true)
          return tolak(400, "folders need folder:true to be deleted");
        // Counting first, and it is not decoration. The file tree only shows
        // files the agent has touched, so its own count would UNDERSTATE the
        // damage — the number the user is asked to approve has to come from
        // the disk.
        let jumlah = 0;
        const hitung = (d) => {
          let isi: any[] = [];
          try {
            isi = fs.readdirSync(d, { withFileTypes: true });
          } catch (_) {
            return;
          }
          for (const e of isi) {
            jumlah++;
            if (e.isDirectory()) hitung(path.join(d, e.name));
          }
        };
        hitung(berkas);
        if (p.hitung === true) {
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ ok: true, folder: true, jumlah }));
        }
        try {
          fs.rmSync(berkas, { recursive: true, force: true });
        } catch (e) {
          return tolak(500, e.message);
        }
        dlog("http", "info", "folder dihapus dari pohon", {
          path: dalam,
          jumlah,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            ok: true,
            folder: true,
            jumlah,
            path: dalam.split(String.fromCharCode(92)).join("/"),
          }),
        );
      }
      if (p.hitung === true) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: true, folder: false, jumlah: 0 }));
      }
      try {
        fs.unlinkSync(berkas);
      } catch (e) {
        return tolak(500, e.message);
      }
      dlog("http", "info", "berkas dihapus dari pohon", { path: dalam });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, path: dalam.replace(/\\/g, "/") }));
    });
    return;
  }

  // ── GET /debug/tersedia — which debuggers are ACTUALLY installed ──
  //
  // Without this, the Debug button lit up based on the file EXTENSION alone. Open a
  // .rb on a machine with no rdbg and press Debug: the command is sent, it fails in
  // the terminal, and the UI still says "Session live · rdbg" — the state the
  // application reports is not the state that exists.
  //
  // Uses _adaDiPath (walking PATH through fs) rather than running "<debugger>
  // --version": spawning four processes on Electron's main thread is exactly the
  // mistake that froze the window for 2 seconds before.
  if (req.method === "GET" && req.url.startsWith("/debug/tersedia")) {
    if (!_debugTersedia) {
      _debugTersedia = {};
      for (const [nama, biner] of Object.entries(_BINER_DEBUG))
        _debugTersedia[nama] = _adaDiPath(biner);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(_debugTersedia));
    return;
  }

  // ── GET /ww/pustaka?path=<root> — the library list for typing suggestions ──
  //
  // What appears in the editor while typing `require("` or `import … from "`. The
  // source is the project MANIFEST (package.json / requirements.txt), not the
  // contents of node_modules: walking node_modules means thousands of folders on the
  // same thread that draws the window, and the result would be worse anyway —
  // transitive dependencies would be suggested even though they are not this
  // project's.
  if (req.method === "GET" && req.url.startsWith("/ww/pustaka")) {
    const kirim = (isi) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(isi));
    };
    let akar;
    try {
      akar = new URL(req.url, "http://x").searchParams.get("path") || "";
    } catch (_) {
      akar = "";
    }
    if (!akar) return kirim({ js: [], py: [], builtin: [] });
    const bacaAman = (p) => {
      try {
        return fs.readFileSync(path.join(akar, p), "utf8");
      } catch (_) {
        return null;
      }
    };
    let js: any[] = [];
    const pkg = bacaAman("package.json");
    if (pkg) {
      try {
        const j = JSON.parse(pkg);
        js = Object.keys({
          ...(j.dependencies || {}),
          ...(j.devDependencies || {}),
          ...(j.peerDependencies || {}),
        });
      } catch (_) {}
    }
    let py: any[] = [];
    const reqs = bacaAman("requirements.txt");
    if (reqs)
      py = reqs
        .split("\n")
        .map((b) => b.trim())
        .filter((b) => b && !b.startsWith("#"))
        // "paket==1.2.3", "paket[extra]>=2" -> "paket"
        .map((b) => b.split(/[=<>!~\[; ]/)[0].trim())
        .filter(Boolean);
    kirim({
      js: js.sort(),
      py: py.sort(),
      // Node's built-in modules, taken from the runtime — not a hand-written list
      // that goes quietly stale every time Node gains a version.
      builtin: require("module")
        .builtinModules.filter((m) => !m.startsWith("_"))
        .sort(),
    });
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/ww/tree")) {
    try {
      const qp = new URL(req.url, "http://x").searchParams;
      const rootPath = qp.get("path") || "";
      const maxDepth = Math.min(parseInt(qp.get("depth") || "3", 10) || 3, 6);
      const MAX_ENTRIES = 800;
      const SKIP = new Set([
        "node_modules",
        ".git",
        ".svn",
        ".hg",
        "dist",
        "build",
        ".next",
        ".cache",
        ".turbo",
        "coverage",
        ".vscode",
        ".idea",
        "__pycache__",
        ".venv",
        "venv",
        "vendor",
        ".DS_Store",
      ]);
      const entries: any[] = [];
      const walk = (dir, depth) => {
        if (depth > maxDepth || entries.length >= MAX_ENTRIES) return;
        let ents;
        try {
          ents = fs.readdirSync(dir, { withFileTypes: true });
        } catch (_) {
          return;
        }
        // folders first, then files — each sorted A→Z (case-insensitive)
        const dirs = ents.filter(
          (e) =>
            e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith("."),
        );
        const files = ents.filter((e) => e.isFile() && !e.name.startsWith("."));
        const cmp = (a, b) =>
          a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        dirs.sort(cmp);
        files.sort(cmp);
        for (const d of dirs) {
          if (entries.length >= MAX_ENTRIES) break;
          entries.push({ name: d.name, dir: true, depth });
          walk(path.join(dir, d.name), depth + 1);
        }
        for (const f of files) {
          if (entries.length >= MAX_ENTRIES) break;
          entries.push({ name: f.name, dir: false, depth });
        }
      };
      let ok = false;
      try {
        ok = !!rootPath && fs.statSync(rootPath).isDirectory();
      } catch (_) {}
      if (ok) walk(rootPath, 0);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          root: rootPath,
          entries,
          truncated: entries.length >= MAX_ENTRIES,
        }),
      );
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({ root: "", entries: [], error: e.message }),
      );
    }
  }

  // GET /plugins — the installed plugins and their approval status.
  //
  // A BROKEN manifest is included too (the `rusak` field) rather than dropped
  // silently. A plugin vanishing without trace is precisely how skills.ts came to be
  // forgotten until it turned into a hole.
  if (req.method === "GET" && req.url === "/plugins") {
    try {
      const P = require("./agent/plugins.ts");
      const { plugin, rusak } = P.pindai();
      const setuju = new Set(P.disetujui());
      const aktifSesi = new Set(P.kapabilitasDisetujui());
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          izinDikenal: P.IZIN_DIKENAL,
          plugin: plugin.map((p) => ({
            nama: p.nama,
            versi: p.versi,
            ket: p.ket,
            sumber: [p.command].concat(p.args || []).join(" "),
            izin: p.izin,
            disetujui: setuju.has(p.nama),
            // Approvals are frozen into genesis when the session starts. Something
            // just approved shows `disetujui:true` but `aktifSesi:false` — and that
            // difference MUST be visible, because otherwise the user believes the
            // plugin is live while the agent still cannot call it.
            aktifSesi: aktifSesi.has(P.kapabilitas(p.nama)),
          })),
          rusak,
        }),
      );
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // POST /plugins/pasang — the user installs a new plugin.
  //
  // There is no agent-tool equivalent, and there must not be. This is the user's
  // door; the whole two-door separation collapses if the model can install for
  // itself.
  //
  // ONLY the manifest is written — no code is downloaded or copied. The
  // "fetch from a URL and save it" path that skill_install once had is deliberately
  // not revived.
  if (req.method === "POST" && req.url === "/plugins/pasang") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let b: any = {};
      try {
        b = JSON.parse(raw || "{}");
      } catch (_) {}
      try {
        const P = require("./agent/plugins.ts");
        const r = P.pasang(b);
        res.writeHead(r.ok ? 200 : 400, {
          "Content-Type": "application/json",
        });
        res.end(
          JSON.stringify(
            r.ok
              ? {
                  ok: true,
                  // Installing does NOT grant permission. Said plainly so the user
                  // does not assume the plugin is immediately usable by the agent.
                  catatan:
                    "Terpasang. Belum diberi izin — agent belum bisa memanggilnya.",
                }
              : r,
          ),
        );
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // POST /plugins/copot — user menghapus plugin beserta persetujuannya.
  if (req.method === "POST" && req.url === "/plugins/copot") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let b: any = {};
      try {
        b = JSON.parse(raw || "{}");
      } catch (_) {}
      const nama = String(b.nama || "");
      try {
        const P = require("./agent/plugins.ts");
        // The process is stopped FIRST, before the folder disappears: uninstalling
        // without killing leaves an orphan process still serving calls.
        try {
          require("./agent/mcp-client.ts").stopServer(nama);
        } catch (_) {}
        const r = P.copot(nama);
        res.writeHead(r.ok ? 200 : 400, {
          "Content-Type": "application/json",
        });
        res.end(JSON.stringify(r));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // POST /plugins/setujui — the user GRANTS or REVOKES a plugin's permission.
  //
  // Deliberately with no agent-tool equivalent. This is the user's door; if the model
  // could approve plugins, the whole two-door separation collapses.
  if (req.method === "POST" && req.url === "/plugins/setujui") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let b: any = {};
      try {
        b = JSON.parse(raw || "{}");
      } catch (_) {}
      const nama = String(b.nama || "");
      const beri = b.setujui !== false;
      try {
        const P = require("./agent/plugins.ts");
        const ada = P.pindai().plugin.some((p) => p.nama === nama);
        if (!ada) {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              ok: false,
              error: "plugin tak ditemukan: " + nama,
            }),
          );
          return;
        }
        const kini = new Set(P.disetujui());
        if (beri) kini.add(nama);
        else kini.delete(nama);
        fs.mkdirSync(P.DIR_PLUGIN, { recursive: true });
        fs.mkdirSync(P.DIR_PLUGIN, { recursive: true });
        fs.writeFileSync(
          P.BERKAS_SETUJU,
          JSON.stringify([...kini].sort(), null, 2),
        );

        // A REVOCATION has to take effect NOW, and the approval file alone does not
        // deliver that: this session's genesis is already frozen with that capability
        // inside it, and the process is already running. So the process is killed —
        // nothing is left to call, and the tool disappears from the list.
        let dimatikan = false;
        if (!beri) {
          try {
            const mcp = require("./agent/mcp-client.ts");
            mcp.stopServer(nama);
            dimatikan = true;
          } catch (_) {}
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            disetujui: beri,
            dimatikan,
            // Honest about when it takes effect. Genesis is frozen once per session,
            // so GRANTING a permission does not touch the ruleset already running.
            catatan: beri
              ? "Berlaku mulai sesi berikutnya — genesis sesi ini sudah dibekukan."
              : "Prosesnya dihentikan sekarang; kapabilitasnya hilang dari genesis pada sesi berikutnya.",
          }),
        );
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  // POST /flow/http — the "HTTP Request" node executor for the Logic canvas
  // (integrations). Makes the HTTP request SERVER-SIDE so the renderer does not hit
  // CORS — this is the backbone of "external platform integration": outbound calls
  // are centralised in the backend. Body: { method, url, headers, body, timeoutMs }.
  // Always answers 200 plus a summary { ok, status, body, ms } so a graph node can
  // display the result easily.
  if (req.method === "POST" && req.url === "/flow/http") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      let b: any = {};
      try {
        b = JSON.parse(raw || "{}");
      } catch (_) {}
      const url = String(b.url || "").trim();
      const method = String(b.method || "GET").toUpperCase();
      const headers =
        b.headers && typeof b.headers === "object" ? b.headers : {};
      const timeoutMs = Math.min(Number(b.timeoutMs) || 15000, 30000);
      if (!/^https?:\/\//i.test(url)) {
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            ok: false,
            error: "URL must start with http:// or https://",
          }),
        );
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const t0 = Date.now();
      try {
        const init: any = { method, headers, signal: ctrl.signal };
        if (b.body != null && method !== "GET" && method !== "HEAD")
          init.body =
            typeof b.body === "string" ? b.body : JSON.stringify(b.body);
        const r = await fetch(url, init);
        const text = await r.text();
        const outHeaders: any = {};
        try {
          r.headers.forEach((v, k) => {
            outHeaders[k] = v;
          });
        } catch (_) {}
        clearTimeout(timer);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            ok: r.ok,
            status: r.status,
            statusText: r.statusText,
            headers: outHeaders,
            body: text.slice(0, 20000),
            truncated: text.length > 20000,
            ms: Date.now() - t0,
          }),
        );
      } catch (e) {
        clearTimeout(timer);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            ok: false,
            error: e.name === "AbortError" ? "timeout" : e.message || String(e),
            ms: Date.now() - t0,
          }),
        );
      }
    });
    return;
  }

  // ww ls-save / ls-load: a cross-origin localStorage migration bridge (browser
  // 127.0.0.1:8090 ↔ Electron app://). localStorage cannot be read across origins,
  // so the browser saves a dump of it to one shared file in ~/.wolfspace and Electron
  // reads it. One-shot; the file can be deleted afterwards.
  if (req.method === "POST" && req.url === "/ww/ls-save") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const data = JSON.parse(body || "{}").data || {};
        const dir = path.join(
          process.env.USERPROFILE || require("os").homedir(),
          ".wolfspace",
        );
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, "ls-migrate.json"),
          JSON.stringify(data),
          "utf8",
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, keys: Object.keys(data).length }));
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  if (req.method === "GET" && req.url === "/ww/ls-load") {
    try {
      const f = path.join(
        process.env.USERPROFILE || require("os").homedir(),
        ".wolfspace",
        "ls-migrate.json",
      );
      const data = fs.existsSync(f)
        ? JSON.parse(fs.readFileSync(f, "utf8"))
        : {};
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // ww attach: ATTACH any folder as an isolated workspace. When a folder is attached
  // to WOLFSPACE, this is where it gets a worktree+branch bound to its original
  // address (rather than through a fixed-root watcher). Idempotent and
  // non-destructive.
  if (req.method === "POST" && req.url === "/ww/attach") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let p = "";
      try {
        p = JSON.parse(body || "{}").path || "";
      } catch (_) {}
      if (!p) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "path kosong" }));
      }
      try {
        const st = fs.statSync(p);
        if (!st.isDirectory()) throw new Error("bukan direktori: " + p);
        const ww = require("./scripts/ww.ts");
        const r = ww.initWorkspace(p, path.basename(p.replace(/[\\/]+$/, "")));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            ok: true,
            name: r.name,
            path: r.dir,
            branch: r.branch,
            skipped: !!r.skipped,
          }),
        );
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ww delete: PHYSICALLY REMOVE the folder and repo from disk when the user deletes
  // a workspace in the UI. Before, "delete" only hid it from the list (localStorage)
  // — the original folder stayed forever. The safeguard: only delete when a .ww.json
  // exists inside the folder (proof it really is a ww workspace we created and
  // manage, not some folder whose name happens to match) — which prevents an rm -rf
  // on the wrong path.
  if (req.method === "POST" && req.url === "/ww/delete") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let p = "";
      try {
        p = JSON.parse(body || "{}").path || "";
      } catch (_) {}
      if (!p) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "path kosong" }));
      }
      try {
        const resolved = path.resolve(p);
        const marker = path.join(resolved, ".ww.json");
        if (!fs.existsSync(marker)) {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(
            JSON.stringify({
              error:
                "rejected: no .ww.json — this is not a managed ww workspace",
            }),
          );
        }
        fs.rmSync(resolved, { recursive: true, force: true });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, path: resolved }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // ww verify: check whether a project folder exists (the disk truth) for ANY path,
  // so the UI can drop "ghosts" (projects whose folder is gone) wherever they are.
  if (req.method === "POST" && req.url === "/ww/verify") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let paths: any[] = [];
      try {
        paths = JSON.parse(body || "{}").paths || [];
      } catch (_) {}
      const exists: any = {};
      for (const p of paths) {
        if (typeof p !== "string" || !p) continue;
        try {
          exists[p] = fs.statSync(p).isDirectory();
        } catch (_) {
          exists[p] = false;
        }
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ exists }));
    });
    return;
  }

  // ww git: a READ-ONLY git summary for one folder (branch, dirty/clean, last
  // commit). Used by the sidebar to show each workspace's status.
  // GET /ww/git?path=<absolute>. Never 500s for a non-repo — { repo:false }.
  if (req.method === "GET" && req.url.startsWith("/ww/git")) {
    try {
      const q = new URL(req.url, "http://x").searchParams.get("path") || "";
      const ww = require("./scripts/ww.ts");
      // The async version: the synchronous one ran THREE gits back to back and froze
      // the main thread for ~291 ms every time a workspace's git menu was opened.
      const info = await ww.gitInfoAsync(q);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(info));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ repo: false, error: e.message }));
    }
  }

  // RAG (P1): store and retrieve KNOWLEDGE (project memory + docs). One store per
  // project under ~/.wolfspace/rag/<key>. Ingest is called by the frontend when an
  // agent run finishes (done); retrieve is also available as an agent tool
  // (agent/tools/index.ts).
  if (
    req.method === "POST" &&
    (req.url === "/rag/ingest" || req.url === "/rag/retrieve")
  ) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let b: any = {};
      try {
        b = JSON.parse(body || "{}");
      } catch (_) {}
      let out;
      try {
        const rag = require("./agent/rag.ts");
        if (req.url === "/rag/ingest") {
          out = rag.ingest(b.project || "global", {
            text: b.text,
            kind: b.kind,
            meta: b.meta,
          });
        } else {
          out = rag.retrieve(b.project || "global", b.query, {
            k: b.k,
            kind: b.kind,
          });
        }
      } catch (e) {
        out = { ok: false, err: e.message };
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out || { ok: false, err: "no-op" }));
    });
    return;
  }

  // ww branches: daftar branch lokal + branch aktif. GET /ww/branches?path=<abs>.
  if (req.method === "GET" && req.url.startsWith("/ww/branches")) {
    try {
      const q = new URL(req.url, "http://x").searchParams.get("path") || "";
      const ww = require("./scripts/ww.ts");
      const daftar = await ww.listBranchesAsync(q);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(daftar));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ repo: false, error: e.message }));
    }
  }

  // ww git actions and folder rename (all POST { path, ... }). One handler,
  // dispatched per URL; each operation calls a helper in scripts/ww.ts and reports
  // {ok|err}.
  if (
    req.method === "POST" &&
    (req.url === "/ww/branch/switch" ||
      req.url === "/ww/branch/create" ||
      req.url === "/ww/branch/rename" ||
      req.url === "/ww/branch/delete" ||
      req.url === "/ww/commit" ||
      req.url === "/ww/rename")
  ) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let b: any = {};
      try {
        b = JSON.parse(body || "{}");
      } catch (_) {}
      const ww = require("./scripts/ww.ts");
      let out;
      try {
        if (req.url === "/ww/branch/switch")
          out = ww.switchBranch(b.path, b.branch);
        else if (req.url === "/ww/branch/create")
          out = ww.createBranch(b.path, b.branch, b.from);
        else if (req.url === "/ww/branch/rename")
          out = ww.renameBranch(b.path, b.oldName, b.newName);
        else if (req.url === "/ww/branch/delete")
          out = ww.deleteBranch(b.path, b.branch);
        else if (req.url === "/ww/commit")
          out = ww.commitAll(b.path, b.message);
        else if (req.url === "/ww/rename")
          out = ww.renameWorkspaceFolder(b.path, b.newName);
      } catch (e) {
        out = { ok: false, err: e.message };
      }
      // The /ww/git and /ww/branches caches are INVALIDATED here. Everything above
      // CHANGES git state, and without this the user commits and their panel still
      // reports the pre-commit state for 1.5 seconds — a mistake far worse than being
      // slow.
      //
      // Invalidated whatever the outcome, failures included: an operation that failed
      // partway through can still have left a different state behind.
      try {
        ww.lupakanGit(b.path);
        if (b.newName) ww.lupakanGit(b.newName);
      } catch (_) {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out || { ok: false, err: "no-op" }));
    });
    return;
  }

  // Self-edit agent: edits WOLFSPACE's OWN source (dev copy) with backup + syntax-gate.
  // Edits the dev files; you review and run sync-app.ps1 to apply to the live app.
  if (req.method === "POST" && req.url === "/self-agent") {
    let body = "";
    let cancelled = false,
      curReq: any = null;
    res.on("close", () => {
      if (!res.writableFinished) {
        cancelled = true;
        if (curReq) {
          try {
            curReq.destroy();
          } catch (_) {}
        }
      }
    });
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (e) {
        res.writeHead(400);
        return res.end("bad json");
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const ev = (o) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(o)}\n\n`);
      };
      // Logic lives in the pure selfAgentStream() (shared with the IPC layer).
      delete require.cache[require.resolve("./agent/self_agent.ts")];
      const {
        selfAgentStream: freshSelfAgentStream,
      } = require("./agent/self_agent.ts");

      // ── Which orchestrator handles this request ──
      //
      // OPT-IN, and the JS loop stays the default. WOLFSPACE_AGENT_PY used to be
      // read by pythonAgentEnabled() and by nobody else, so setting it did
      // nothing at all — the Python path was reachable only from its tests. This
      // is the line that makes the switch real.
      //
      // Safe to offer now because the parity gaps are closed rather than merely
      // listed: the approval gate, evidence check and repeat backstop come from
      // agent/penjaga-agent.ts, the planner from agent/perencana-agent.ts, HITL
      // pauses and resumes through the same hitl_response the UI already sends,
      // and the findings journal is read as well as written. Both paths call the
      // SAME runSelfTool, so a tool runs in the same AppContainer, the same
      // broker and the same audit ledger whichever one asked for it.
      //
      // Resolved per request, not cached: the flag can be flipped without a
      // restart, which is what makes comparing the two paths on one machine
      // practical.
      let jalankanAgent = freshSelfAgentStream;
      try {
        delete require.cache[require.resolve("./agent/python-agent.ts")];
        const py = require("./agent/python-agent.ts");
        if (py.pythonAgentEnabled()) {
          jalankanAgent = py.selfAgentStreamPython;
          dlog("self", "info", "orkestrator", { jalur: "python" });
        }
      } catch (e) {
        // A broken Python path must not take the agent down with it: the JS loop
        // is still there, and falling back is better than failing the request.
        dlog("self", "warn", "python orchestrator unavailable", {
          error: String((e && e.message) || e).slice(0, 160),
        });
      }

      await jalankanAgent(payload, ev, {
        isCancelled: () => cancelled,
        setCurReq: (r) => {
          curReq = r;
        },
      });
      if (!res.writableEnded) res.end();
    });
    return;
  }

  // Python autocomplete via Jedi (static analysis, no model)
  if (req.method === "POST" && req.url === "/pycomplete") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let out: any[] = [];
      try {
        const { code, line, column } = JSON.parse(body);
        out = (await jediComplete({ code, line, column })) as any[];
      } catch {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    });
    return;
  }

  // The path without its query string, for the routes below (the old declaration was
  // removed along with the Flutter block; the value is identical to _path above)
  const urlPath = _path;

  // ── Preview file: serve any file from disk for the built-in browser panel ──
  // GET /preview-file?path=C:/Users/dave/Documents/oi/index.html
  // Supports HTML + linked assets (CSS/JS/images) via relative path resolution.
  if (req.method === "GET" && urlPath === "/preview-file") {
    const qs = new URL("http://x" + (req.url || "")).searchParams;
    const filePath = qs.get("path");
    if (!filePath) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Missing ?path= parameter" }));
    }
    const resolved = path.resolve(filePath);
    try {
      if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
        res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
        return res.end(
          `<html><body style="background:#0b0d11;color:#aaa;font-family:system-ui;padding:40px"><h3>404 — File not found</h3><p>${resolved}</p></body></html>`,
        );
      }
      const ext = path.extname(resolved).toLowerCase();
      // ?raw=1 — the SOURCE as-is, for the code editor.
      //
      // The normal path injects a <base> into HTML files so their relative links
      // resolve while previewing. That is right for a preview and WRONG for an
      // editor: what is shown is no longer the file's contents, and the user reads
      // a line that is not on disk. This mode skips all rewriting and sends it as
      // plain text.
      if (qs.get("raw") === "1") {
        res.writeHead(200, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
        });
        return res.end(fs.readFileSync(resolved));
      }
      const mimeTypes = {
        ".html": "text/html",
        ".htm": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".json": "application/json",
        ".xml": "application/xml",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".ico": "image/x-icon",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
        ".mp3": "audio/mpeg",
        ".pdf": "application/pdf",
        ".txt": "text/plain",
      };
      const ct = mimeTypes[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": ct + (ct.startsWith("text/") ? "; charset=utf-8" : ""),
        "Cache-Control": "no-cache",
      });
      // HTML: inject a <base> so relative links (css/js/img) resolve to
      // /preview-file-assets/<absolute-dir>/ — without it the assets endpoint is
      // never reached.
      if (ext === ".html" || ext === ".htm") {
        const dir = resolved.replace(/\\/g, "/").replace(/\/[^\/]*$/, "/");
        const baseTag =
          '<base href="/preview-file-assets/' + encodeURI(dir) + '">';
        let html = fs.readFileSync(resolved, "utf8");
        html = /<head[^>]*>/i.test(html)
          ? html.replace(/<head[^>]*>/i, (m) => m + baseTag)
          : baseTag + html;
        return res.end(html);
      }
      return fs.createReadStream(resolved).pipe(res);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }
  // GET /preview-file-assets/* — serve relative assets for an HTML preview.
  // E.g. if HTML at C:/foo/index.html links <img src="img/logo.png">,
  // the iframe base URL resolves to /preview-file-assets/C:/foo/img/logo.png
  if (req.method === "GET" && urlPath.startsWith("/preview-file-assets/")) {
    const assetPath = decodeURIComponent(
      urlPath.slice("/preview-file-assets/".length),
    );
    const resolved = path.resolve(assetPath);
    try {
      if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
        res.writeHead(404);
        return res.end("Not found");
      }
      const ext = path.extname(resolved).toLowerCase();
      const mimeTypes = {
        ".html": "text/html",
        ".htm": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".mjs": "application/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".ico": "image/x-icon",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".ttf": "font/ttf",
      };
      const ct = mimeTypes[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": ct + (ct.startsWith("text/") ? "; charset=utf-8" : ""),
        "Cache-Control": "no-cache",
      });
      return fs.createReadStream(resolved).pipe(res);
    } catch (e) {
      res.writeHead(500);
      return res.end(e.message);
    }
  }

  // Static files from public/ (e.g. /vendor/codemirror/*) — path-traversal safe
  if (req.method === "GET" && urlPath !== "/") {
    const pubDir = path.join(__dirname, "public");
    const filePath = path.join(
      pubDir,
      path.normalize(urlPath).replace(/^([\\/]|\.\.[\\/])+/, ""),
    );
    if (
      filePath.startsWith(pubDir) &&
      fs.existsSync(filePath) &&
      fs.statSync(filePath).isFile()
    ) {
      const types = {
        ".css": "text/css",
        ".js": "application/javascript",
        ".jsx": "application/javascript",
        ".json": "application/json",
        ".html": "text/html",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ico": "image/x-icon",
        ".ttf": "font/ttf",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".map": "application/json",
      };
      const ct =
        types[path.extname(filePath).toLowerCase()] ||
        "application/octet-stream";

      // ── Serving files that are ALREADY compressed ──
      //
      // Produced by scripts/kompres-aset.cjs, not compressed here. The difference
      // is decisive: compressing per request means CPU in Electron's main process
      // every time an asset is requested — and brotli at quality 11 measured 913 ms
      // of blocked thread for a single 213 KB file. What is already built is merely
      // sent, so the runtime cost really is zero.
      //
      // The public/ assets are 26.35 MB raw -> 4.75 MB brotli (82% smaller). The
      // largest is Monaco, and it is requested every time the app opens in browser
      // mode.
      const pilih = _pilihKompresi(req, filePath);
      if (pilih) {
        res.writeHead(200, {
          "Content-Type": ct + "; charset=utf-8",
          "Cache-Control": "no-cache",
          "Content-Encoding": pilih.encoding,
          // Without Vary, any intermediary is free to serve a brotli response to a
          // client that cannot accept one.
          Vary: "Accept-Encoding",
        });
        return fs.createReadStream(pilih.berkas).pipe(res);
      }

      // no-cache: Electron's disk cache otherwise keeps serving stale app.jsx
      // after sync-app.ps1 updates the files
      res.writeHead(200, {
        "Content-Type": ct + "; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      return fs.createReadStream(filePath).pipe(res);
    }
  }

  // Fallback: serve the chat UI
  fs.readFile(HTML, (e, data) => {
    if (e) {
      res.writeHead(404);
      return res.end("public/index.html not found");
    }
    // Prevent browser from caching index.html so updates are always seen
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    res.end(data);
  });
});

// Start the HTTP server ONLY when run directly (Electron spawns this as the entry).
// When required as a module (by core.js / the IPC layer), expose the logic instead
// of opening a port.
// The identity of the code this backend is running.
//
// Read from a stamp THE LAUNCHER WRITES after synchronising the code, not from git:
// the copy in WSL contains tracked files only, with no .git, so the backend there
// cannot ask for itself.
//
// With no stamp — the server started by hand, or through a Windows path that
// synchronises nothing — the version is "unknown". That is an HONEST answer, and
// the launcher treats it as "cannot be confirmed identical", so it chooses to
// restart rather than reuse something it does not recognise.
const VERSION_FILE = path.join(__dirname, ".wolfspace-version.json");
function versiBackend() {
  try {
    const v = JSON.parse(fs.readFileSync(VERSION_FILE, "utf8"));
    if (v && typeof v.version === "string")
      return { version: v.version, syncedAt: v.syncedAt || null };
  } catch (_) {}
  return { version: "unknown", syncedAt: null };
}

// The PID LISTENING on a port — or null when it cannot be determined.
//
// Returning null is a legitimate and deliberate answer: the caller is better off
// stopping with a clear message than guessing and killing the wrong process. Three
// guards that must not be removed:
//   - the result MUST be a positive integer
//   - it MUST NOT be our own process.pid (this server is not listening yet, so it
//     cannot hold that port — if it appears, the parsing is wrong)
//   - it MUST NOT be PID 1 (init / the distro manager; killing it takes everything
//     down)
function _pidPemegangPort(port) {
  const { execSync } = require("child_process");
  const jalankan = (cmd) => {
    try {
      return execSync(cmd, { encoding: "utf8", timeout: 5000 });
    } catch (_) {
      return "";
    }
  };
  let kandidat: any = null;
  if (process.platform === "win32") {
    const out = jalankan(
      `netstat -ano | findstr "LISTENING" | findstr ":${port}"`,
    );
    const m = out.match(/(\d+)\s*$/m);
    if (m) kandidat = Number(m[1]);
  } else {
    // netstat -tlnp gives "PID/name" on LISTEN lines — far more precise than lsof,
    // which under BusyBox does not understand -t/-i at all.
    const out = jalankan(`netstat -tlnp 2>/dev/null | grep ':${port} '`);
    const m = out.match(/\s(\d+)\/\S+/);
    if (m) kandidat = Number(m[1]);
    if (!kandidat) {
      // Fallback: ss, where available.
      const out2 = jalankan(`ss -tlnp 2>/dev/null | grep ':${port} '`);
      const m2 = out2.match(/pid=(\d+)/);
      if (m2) kandidat = Number(m2[1]);
    }
  }
  if (!Number.isInteger(kandidat) || kandidat <= 0) return null;
  if (kandidat === process.pid || kandidat === 1) return null;
  return kandidat;
}

// `require.main === module` no longer identifies the entry point: server.cjs is a
// launcher that installs the .ts hook and then requires this file, so require.main
// is that launcher whenever the process was started with `node server.cjs`.
// Requiring server.cjs from somewhere else (core.js does) still leaves require.main
// pointing at the real entry, so this stays false and no port is opened — which is
// the behaviour every caller already relies on.
const _dijalankanLangsung =
  require.main === module ||
  (!!require.main && require.main.filename === require.resolve("./server.cjs"));

if (_dijalankanLangsung) {
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `\n  Port ${PORT} sudah dipakai. Mencoba matikan proses lama...`,
      );
      // NEVER pipe any output straight into `kill`.
      //
      // The Linux path used to read: lsof -ti:PORT | xargs kill -9
      // That assumes lsof has -t/-i. BusyBox does NOT: it ignores both and prints
      // the ENTIRE system fd list. Measured on this WSL distro: 120 lines, starting
      // at PID 1 (/init). The first column is the PID, so `xargs kill -9` tried to
      // kill EVERY process in the distro — including the new server running this
      // very code. The symptom: the launcher reporting "the WSL backend stopped
      // first (code 9)".
      //
      // Now the PID is resolved and then VALIDATED, and only ONE process is touched.
      // If the PID cannot be determined the server REFUSES to guess and stops with a
      // clear message — far better than killing the wrong thing.
      try {
        const pid = _pidPemegangPort(PORT);
        if (!pid) {
          console.error(
            `  Tidak bisa memastikan proses mana yang memegang port ${PORT}, ` +
              `jadi tidak ada yang dibunuh.\n` +
              `  Hentikan sendiri, atau jalankan dengan PORT lain: PORT=8091 ...`,
          );
          process.exit(1);
        }
        console.error(`  Menghentikan PID ${pid} yang memegang port ${PORT}…`);
        process.kill(pid, "SIGKILL");
        setTimeout(() => server.listen(PORT, HOST), 500);
      } catch (e) {
        console.error(
          `  Gagal membebaskan port ${PORT}: ${e.message}\n` +
            `  Jalankan dengan PORT lain, mis. PORT=8091`,
        );
        process.exit(1);
      }
    } else {
      console.error("Server error:", err);
      process.exit(1);
    }
  });
  server.listen(PORT, HOST, () => {
    console.log(
      `\n  WOLFSPACE  ->  http://${HOST}:${PORT}\n  (serves chat, executes code, verifies by running)\n`,
    );
    startWwWatcher();
  });
}

// ── ww auto-watcher ──
// A new folder in the ww root becomes an isolated workspace AUTOMATICALLY (its own
// repo+branch) as it is created, with no manual command. The watcher starts with
// the server and dies with it.
let _wwWatcher: any = null;
function startWwWatcher() {
  try {
    if (!(CONFIG.ww && CONFIG.ww.watch)) return;
    const ww = require("./scripts/ww.ts");
    const root = CONFIG.ww.root || ww.DEFAULT_ROOT;
    _wwWatcher = ww.startWatcher(root, {
      log: (m) => console.log("  [ww] " + m),
    });
    console.log(
      `  [ww] auto-watcher aktif di ${root} — folder baru otomatis ter-isolasi (repo+branch).`,
    );
  } catch (e) {
    console.log("  [ww] watcher gagal start: " + e.message);
  }
}

// Pure logic surface (no req/res) for reuse by both HTTP and Electron IPC.
module.exports = {
  server,
  PORT,
  HOST,
  // cloud + key resolution
  CLOUD,
  MODEL_ALIASES,
  loadCloudKeys,
  detectProvider,
  fillCloudKey,
  getCloudKeys: () => CLOUD_KEYS,
  // model calls (callback-based, already pure)
  askCloudStream,
  // high-level streaming ops (emit-based, req/res-free) Ã¢â‚¬â€ for HTTP + IPC
  chatStream,
  selfAgentStream,
  // A test hook. runInWorkspace() is only called from inside the /agent loop, and
  // that loop needs a model call — so it cannot be tested directly. Exported so its
  // execution behaviour can be measured without a network.
  runInWorkspace,
  // system prompts
  SYS,
  WEBDEV_SYS,
  SELF_TOOLS,
  pickSystem,
  isCodingTask,
  // self-agent tools + patch helpers
  applyHunks,
  braceProfile,
  qList,
  qGlob,
  qRead,
  qGrep,
  qBackup,
  // terminal / PTY sessions
  terminalSessions,
  openTerminalSession,
  writeToTerminal,
  resizeTerminal,
  closeTerminalSession,
};

// Marks this file as a MODULE rather than a global script. Left as `export {}`
// rather than converting the requires to imports, because imports HOIST and the
// order in this file is load-bearing: scripts/ts-register.cjs must be installed
// before the .ts routes it pulls in, and several requires are deliberately lazy.
export {};
