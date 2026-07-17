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
/**
/**
 * WOLFSPACE server Ã¢â‚¬â€ serves the chat UI, runs code blocks, and orchestrates the
 * generate -> execute -> fix loop against local models.
 *
 *   GET  /             -> chat UI (public/index.html)
 *   GET  /models       -> list of configured models {name, port, default}
 *   POST /run          -> execute one code block, return real stdout/stderr
 *   POST /chat (SSE)   -> stream tokens; auto-run generated code; if it fails,
 *                         feed the error back to the model and retry (<=3x)
 *
 * The differentiator: the model only GUESSES code; the CPU is the judge.
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { exec, spawn } = require("child_process");
const util = require("util");
const execP = util.promisify(exec);
const pty = require("node-pty");

// Strip ANSI escape sequences from CLI output (cursor movements, colors, etc.)
const stripAnsi = (str) =>
  str
    .replace(/\x1b\[[\x20-\x3f]*[\x40-\x7e]/g, "") // CSI: all sequences (colors, cursor, DEC modes)
    .replace(/\x1bP[^\x1b]*\x1b\\/g, "") // DCS: device control strings
    .replace(/\x1b\][^\x07]*\x07/g, "") // OSC: operating system commands (BEL terminated)
    .replace(/\x1b\][^\x1b]*\x1b\\/g, "") // OSC: ST terminated
    .replace(/\x1b[PX^_\\]/g, "") // Other C1 escape sequences
    .replace(/\x1b[\[\(\]\)]/g, "") // Escape + bracket/paren
    // Braille pattern spinners (U+2800..U+28FF) + TUI block/box/geometric chars
    .replace(
      /[\u2800-\u28FF\u2580-\u259F\u25A0-\u25FF\u2500-\u257F\u2300-\u23FF]/g,
      "",
    )
    // Status bar artifacts: "esc interrupt", "ctrl+p commands", etc.
    .replace(/\b(esc|ctrl\+[a-z]|alt\+[a-z]|tab|shift\+[a-z])\s+\w+/gi, "")
    // Percentage markers: "8.4K (4%)"
    .replace(/[\d.]+[KM]?\s*\(\d+%\)/g, "")
    // Timing: "+ Thought: 386ms"
    .replace(/^\+\s*\w+:\s*\d+ms\s*$/gm, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "")
    // Collapse 3+ blank lines
    .replace(/\n{3,}/g, "\n\n")
    // Dedup: collapse identical consecutive lines (TUI redraw artifact)
    .replace(/^(.+)\n(\1\n)+/gm, "$1\n")
    .trim();

const CONFIG_PATH = path.join(__dirname, "config.json");
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const HOST = (CONFIG.server && CONFIG.server.host) || "0.0.0.0";
const PORT = process.env.PORT || (CONFIG.server && CONFIG.server.port) || 8090;
const HTML = path.join(__dirname, "public", "index.html");
const TMP_PY = path.join(os.tmpdir(), "_quantum_run.py");
// Shared execution timeout for full-access runtimes (ms). Generous so that
// browser automation / network calls (e.g. Playwright) have time to finish.
const EXEC_TIMEOUT = CONFIG.execTimeout || 120000;
// The JS runtime that launched this server (bun.exe here, node elsewhere).
// We reuse it to execute generated JS so there is no hard dependency on `node`.
const JS_RUNTIME = process.execPath;

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function openclawCommand() {
  return process.platform === "win32" ? "openclaw.cmd" : "openclaw";
}

function friendlyOpenClawError(stderr, stdout, err) {
  const raw = [stderr, stdout, err && err.message].filter(Boolean).join("\n");
  if (err && err.code === "ENOENT") {
    return "OpenClaw CLI tidak ditemukan. Install dulu dengan: npm.cmd install -g openclaw@latest";
  }
  if (/timeout|timed out/i.test(raw)) {
    return "OpenClaw terlalu lama merespons. Coba lagi, atau jalankan: openclaw.cmd status";
  }
  if (/gateway|onboard|configure|not configured|auth|api key|credential/i.test(raw)) {
    return "OpenClaw belum siap dikonfigurasi. Jalankan: openclaw.cmd onboard";
  }
  return raw.trim() || "OpenClaw gagal dijalankan.";
}

function parseOpenClawText(stdout, stderr) {
  const out = (stdout || "").trim();
  if (!out) return stripAnsi(stderr || "").trim();
  try {
    const parsed = JSON.parse(out);
    return (
      parsed.text ||
      parsed.message ||
      parsed.reply ||
      parsed.output ||
      parsed.result ||
      JSON.stringify(parsed, null, 2)
    );
  } catch (_) {
    return stripAnsi(out);
  }
}

function runOpenClawAgent(message) {
  return new Promise((resolve) => {
    const tempPath = path.join(
      os.tmpdir(),
      `WOLFSPACE-openclaw-${process.pid}-${Date.now()}.txt`,
    );
    try {
      fs.writeFileSync(tempPath, message, "utf8");
    } catch (err) {
      return resolve({
        ok: false,
        text: "",
        raw: "",
        error: "Tidak bisa membuat file pesan sementara: " + err.message,
        exitCode: null,
      });
    }

    const args = [
      "agent",
      "--message-file",
      tempPath,
      "--session-key",
      "WOLFSPACE-openclaw",
      "--json",
      "--timeout",
      "600",
    ];
    let child;
    try {
      // Node >=20: spawn .cmd tanpa shell melempar EINVAL sinkron (crash server)
      child = spawn(openclawCommand(), args, {
        cwd: __dirname,
        windowsHide: true,
        shell: process.platform === "win32",
      });
    } catch (err) {
      try { fs.unlinkSync(tempPath); } catch (_) {}
      return resolve({
        ok: false,
        text: "",
        raw: "",
        error: friendlyOpenClawError("", "", err),
        exitCode: null,
      });
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      settled = true;
      try {
        child.kill();
      } catch (_) {}
      try {
        fs.unlinkSync(tempPath);
      } catch (_) {}
      resolve({
        ok: false,
        text: "",
        raw: stdout,
        error: friendlyOpenClawError(stderr, stdout, new Error("timeout")),
        exitCode: null,
      });
    }, 610000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        fs.unlinkSync(tempPath);
      } catch (_) {}
      resolve({
        ok: false,
        text: "",
        raw: stdout,
        error: friendlyOpenClawError(stderr, stdout, err),
        exitCode: null,
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        fs.unlinkSync(tempPath);
      } catch (_) {}
      const text = parseOpenClawText(stdout, stderr);
      resolve({
        ok: code === 0,
        text,
        raw: stdout,
        error: code === 0 ? "" : friendlyOpenClawError(stderr, stdout),
        exitCode: code,
      });
    });
  });
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Debug bus Ã¢â‚¬â€ a single event log wired through ALL of WOLFSPACE's logic.
// Every meaningful step (model call, execution, retry, cloud request, error)
// emits a structured event. Events live in a ring buffer, stream live to any
// /debug viewer, and append to a log file. Toggle with config.debug = false.
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
const DEBUG_ON = CONFIG.debug !== false;
const VERBOSE = CONFIG.verbose === true;
const LOG_FILE = path.join(os.tmpdir(), "WOLFSPACE-debug.log");
const LOG_RING = []; // recent events, in memory
const LOG_MAX = 800;
const debugSubs = new Set(); // live SSE writers

// Precision debugging via trace system
const trace = require("./agent/trace.cjs");
let _evSeq = 0;
function dlog(cat, level, msg, data) {
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
    else _writeSafe(_origLog, prefix, msg, data ? JSON.stringify(data, null, 0) : "");
  } else if (DEBUG_ON && level === "error") {
    _writeSafe(_origError, `[WOLFSPACE:${cat}] ${msg}`, data && data.error ? data.error : "");
  }
  return e;
}

// Ã¢â€â€š Intercept all console output to feed into the debug bus Ã¢â€â€š
// This ensures EVERY console.log/error/warn from the backend is visible
// in the /debug viewer and the Debug panel.
const _origLog = console.log;
const _origError = console.error;
const _origWarn = console.warn;
const _writeSafe = (fn, ...args) => { try { fn(...args); } catch (_) {} };
let _qLogReentrant = false;
console.log = function (...args) {
  _writeSafe(_origLog, console, ...args);
  if (_qLogReentrant) return;
  _qLogReentrant = true;
  try {
    dlog(
      "console",
      "info",
      args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "),
    );
  } finally { _qLogReentrant = false; }
};
console.error = function (...args) {
  _writeSafe(_origError, console, ...args);
  if (_qLogReentrant) return;
  _qLogReentrant = true;
  try {
    dlog(
      "console",
      "error",
      args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "),
    );
  } finally { _qLogReentrant = false; }
};
console.warn = function (...args) {
  _writeSafe(_origWarn, console, ...args);
  if (_qLogReentrant) return;
  _qLogReentrant = true;
  try {
    dlog(
      "console",
      "warn",
      args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "),
    );
  } finally { _qLogReentrant = false; }
};

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// Code intelligence Ã¢â‚¬â€ static quality analysis (heuristics, zero dependencies).
// WOLFSPACE already proves code RUNS; this judges how WELL it is written and
// surfaces actionable notes + a 0Ã¢â‚¬â€œ100 score alongside the execution verdict.
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
function analyzeCode(lang, code) {
  const notes = [],
    add = (sev, msg) => notes.push({ sev, msg });
  const src = code || "",
    lines = src.split("\n"),
    L = lines.length;
  if (lang === "python" && /\binput\s*\(/.test(src))
    add(
      "error",
      "memakai input() Ã¢â‚¬â€ sandbox tanpa stdin, akan gagal (EOFError)",
    );
  if (/\b(eval|exec)\s*\(/.test(src))
    add("warn", "memakai eval/exec Ã¢â‚¬â€ hindari demi keamanan & kejelasan");
  if (/\b(TODO|FIXME|XXX)\b/.test(src))
    add("warn", "ada TODO/FIXME Ã¢â‚¬â€ kode tampak belum selesai");
  if (lang === "python") {
    if (/except\s*:/.test(src))
      add("warn", 'bare "except:" Ã¢â‚¬â€ tangkap exception yang spesifik');
    if (/except[^\n:]*:\s*\n\s*pass\b/.test(src))
      add("warn", '"except ...: pass" Ã¢â‚¬â€ menelan error diam-diam');
    if (L > 15 && !/\b(def|class)\s+\w+/.test(src))
      add(
        "info",
        "kode panjang tanpa fungsi Ã¢â‚¬â€ pertimbangkan pecah jadi fungsi",
      );
    if (/\bdef\s+\w+/.test(src) && !/"""|'''/.test(src))
      add("info", "fungsi tanpa docstring");
  } else if (lang === "javascript") {
    if (/\bvar\s+\w/.test(src)) add("info", "gunakan let/const, bukan var");
    if (/[^=!<>]==[^=]/.test(src))
      add("info", "gunakan === / !== (perbandingan ketat)");
  }
  const hasTest = /\bassert\b|console\.assert|expect\s*\(/.test(src);
  let score = 100;
  for (const n of notes)
    score -= n.sev === "error" ? 25 : n.sev === "warn" ? 10 : 4;
  if (!hasTest && L > 8) {
    score -= 6;
    add("info", "tanpa assertion/self-test Ã¢â‚¬â€ sulit dibuktikan benar");
  }
  return { score: Math.max(0, Math.min(100, score)), hasTest, lines: L, notes };
}

// Unambiguous per-language signatures. Checked BEFORE the loose python/js
// heuristics Ã¢â‚¬â€ Kotlin/Go/Rust/Java code full of `var`/`//` otherwise gets
// mistaken for JavaScript (and `import x.y.*` for Python).
const STRONG_LANG = [
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
// Detect desktop-GUI code (Swing/tkinter/JavaFX/...). It opens a REAL window on
// the user's desktop, then its event loop blocks until the timeout kills it Ã¢â‚¬â€
// the "mysterious separate interface" symptom. Visual UIs belong in the Canvas
// (web/Flutter), so ask the model for a console version instead.
function opensGuiWindow(lang, code) {
  const s = code || "";
  switch (lang) {
    case "python":
      return /\b(tkinter|Tkinter|PyQt\d|PySide\d|kivy|pygame|turtle|wxPython|\bwx\.)\b/.test(
        s,
      );
    case "kotlin":
    case "java":
      return /javax\.swing|java\.awt|javafx\.|JFrame\b|JOptionPane\b|JDialog\b/.test(
        s,
      );
    case "javascript":
      return /require\(\s*['"]electron['"]\s*\)/.test(s);
    case "c":
    case "cpp":
      return /windows\.h[\s\S]{0,400}CreateWindow|gtk\/gtk\.h|QApplication\b/.test(
        s,
      );
    default:
      return false;
  }
}
// JavaScript meant for the BROWSER (React/JSX, ES modules, DOM) Ã¢â‚¬â€ must NOT be run
// as a Node script (it would crash). It belongs in the Canvas preview instead.
function isBrowserJs(code) {
  const s = code || "";
  return (
    /^\s*import\s.+\sfrom\s+['"]/m.test(s) ||
    /\bexport\s+default\b/.test(s) ||
    /from\s+['"]react['"]/.test(s) ||
    /\b(useState|useEffect|ReactDOM|createRoot)\b/.test(s) ||
    /\bdocument\.\w|\bwindow\.\w/.test(s)
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Execution sandbox (Docker) Ã¢â‚¬â€ gate #1 for serving untrusted/other-user code Ã¢â€â‚¬Ã¢â€â‚¬
const SANDBOX_IMAGE = "WOLFSPACE-sandbox";
function hasDocker() {
  try {
    execSync("docker version", { stdio: "ignore", timeout: 8000 });
    return true;
  } catch (e) {
    return false;
  }
}
const USE_SANDBOX = CONFIG.sandbox === true && hasDocker();
// Run code in a throwaway, network-less, resource-capped, read-only container.
async function runSandboxed(lang, code) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qsbx-"));
  const isJs = lang === "javascript";
  fs.writeFileSync(path.join(dir, isJs ? "main.js" : "main.py"), code, "utf8");
  const inner = isJs ? "node /code/main.js" : "python /code/main.py";
  const hostDir = dir.replace(/\\/g, "/");
  const args = [
    "run",
    "--rm",
    "--network",
    "none",
    "--memory",
    "256m",
    "--memory-swap",
    "256m",
    "--cpus",
    "0.5",
    "--pids-limit",
    "128",
    "--read-only",
    "--tmpfs",
    "/tmp:size=16m",
    "-v",
    hostDir + ":/code:ro",
    "-w",
    "/code",
    SANDBOX_IMAGE,
    "sh",
    "-c",
    inner,
  ];
  let res;
  try {
    const { stdout } = await execP(
      "docker " +
        args.map((a) => (/[\s"]/.test(a) ? JSON.stringify(a) : a)).join(" "),
      {
        timeout: EXEC_TIMEOUT,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    res = { ok: true, output: stdout };
  } catch (e) {
    res = {
      ok: false,
      output: (e.stdout || "").toString(),
      error: ((e.stderr || "") + "").trim() || e.message,
    };
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
  return res;
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Execute JavaScript with FULL runtime access (require/import anything) Ã¢â€â‚¬Ã¢â€â‚¬
// NOTE: no longer sandboxed. Generated code runs as a real subprocess with the
// same privileges as this server, can require any installed module (including
// node_modules in this project), touch the filesystem, network, etc.
// Keep this server bound to 127.0.0.1 and never expose it to a network.
async function runJS(code) {
  if (USE_SANDBOX) return await runSandboxed("javascript", code);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qjs-"));
  const src = path.join(dir, "main.cjs");
  fs.writeFileSync(src, code, "utf8");
  let res;
  try {
    const { stdout } = await execP(`"${JS_RUNTIME}" "${src}"`, {
      cwd: __dirname,
      timeout: EXEC_TIMEOUT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: SAFE_ENV,
      windowsHide: true,
    });
    res = { ok: true, output: stdout };
  } catch (e) {
    res = {
      ok: false,
      output: (e.stdout || "").toString(),
      error: ((e.stderr || "") + "").trim() || e.message,
    };
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
  return res;
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Resolve real Python executable (skips Windows Store alias that errors) Ã¢â€â‚¬Ã¢â€â‚¬
function findPython() {
  const candidates = [
    process.env.QUANTUM_PYTHON, // user override via config/env
    // Bundled Python distributed with WOLFSPACE (uv-managed)
    process.env.APPDATA &&
      path.join(
        process.env.APPDATA,
        "uv",
        "python",
        "cpython-3.12.10-windows-x86_64-none",
        "python.exe",
      ),
    "python3",
    "python",
    "py",
    // Common Windows install paths
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
      const out = execSync(`"${cmd}" --version`, {
        timeout: 3000,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      if (/Python 3/i.test(out)) return cmd;
    } catch (_) {}
  }
  return "python"; // fallback
}
const PY_BIN = findPython();

// Ã¢â€â‚¬Ã¢â€â‚¬ Shared patch machinery for visual edits + compile auto-fix Ã¢â€â‚¬Ã¢â€â‚¬
// Apply <<<<ORIGINAL/====/>>>> hunks by literal string replacement; null on any miss.
const { fillCloudKey } = require("./agent/cloud.cjs");
const { resolveKeysPath } = require("./agent/keys-path.cjs");
function applyHunks(src, reply) {
  const re = new RegExp(
    "<<<<ORIGINAL\\r?\\n([\\s\\S]*?)\\r?\\n====\\r?\\n([\\s\\S]*?)\\r?\\n>>>>",
    "g",
  );
  const hunks = [];
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
// String/comment-aware brace+paren balance Ã¢â‚¬â€ catches patches that bisect a class/method.
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
// Resolve cloud key from server-side storage (mutates the passed object).
// (Removed fillCloudKey from here, imported from ./agent/cloud)
// Ask the user's selected model (cloud or local) Ã¢â‚¬â€ non-streaming, returns text.
async function askSelectedModel(cloud, port, sysPrompt, userPrompt) {
  if (cloud && cloud.key) {
    return await askCloudStream(
      { ...cloud, system: sysPrompt },
      [{ role: "user", content: userPrompt }],
      () => {},
      () => {},
    );
  }
  const modelCfg =
    (CONFIG.models || []).find((m) => m.default) || (CONFIG.models || [])[0];
  if (!modelCfg)
    throw new Error(
      "Tidak ada model aktif (lokal tidak jalan, cloud tidak dipilih)",
    );
  const portNum = Number(port || modelCfg.port);
  if (portNum < 1 || !Number.isFinite(portNum))
    throw new Error("Port model tidak valid");
  const aiResp = await fetch(
    `http://127.0.0.1:${portNum}/v1/chat/completions`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "local",
        stream: false,
        messages: [
          { role: "system", content: sysPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 8192,
        temperature: 0.1,
      }),
    },
  );
  const aiJson = await aiResp.json();
  return aiJson.choices?.[0]?.message?.content || "";
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Execute Python as a script via subprocess (full access, import anything) Ã¢â€â‚¬Ã¢â€â‚¬
// Force UTF-8 I/O so generated Python that prints Ã¢Å“â€œ/Ã¢Å“â€”/emoji doesn't crash with
// UnicodeEncodeError under Windows' legacy cp1252 stdout codec.
// Detect if code contains input() calls (outside strings/comments) to reject stdin-dependent scripts.
function needsStdin(lang, code) {
  if (lang !== "python") return false;
  // Strip string literals and comments, then check for bare input() calls.
  const cleaned = code
    .replace(/#[^\n]*/g, "") // strip single-line comments
    .replace(/'''[^']*'''/g, "") // strip triple-single quotes
    .replace(/"""[^"]*"""/g, "") // strip triple-double quotes
    .replace(/'[^']*'/g, "") // strip single-quoted strings
    .replace(/"[^"]*"/g, ""); // strip double-quoted strings
  return /\binput\s*\(/.test(cleaned);
}
const SAFE_ENV = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, SystemDrive: process.env.SystemDrive, ComSpec: process.env.ComSpec };

async function runPy(code) {
  if (needsStdin("python", code)) {
    return {
      ok: false,
      output: "",
      error:
        "Python code memanggil input() tapi stdin tidak tersedia (eksekusi headless). Gunakan nilai hardcoded.",
    };
  }
  if (USE_SANDBOX) return await runSandboxed("python", code);
  
  const tmpPy = path.join(os.tmpdir(), `_quantum_run_${Date.now()}_${Math.random().toString(36).slice(2)}.py`);
  fs.writeFileSync(tmpPy, code, "utf8");
  try {
    const { stdout } = await execP(`"${PY_BIN}" "${tmpPy}"`, {
      timeout: EXEC_TIMEOUT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...SAFE_ENV, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
      windowsHide: true,
    });
    fs.rmSync(tmpPy, { force: true });
    return { ok: true, output: stdout };
  } catch (e) {
    try { fs.rmSync(tmpPy, { force: true }); } catch(_) {}
    return {
      ok: false,
      output: (e.stdout || "").toString(),
      error: ((e.stderr || "") + "").trim() || e.message,
    };
  }
}

const RUN = CONFIG.runners || {};

// Ã¢â€â‚¬Ã¢â€â‚¬ Persistent Jedi worker: real Python autocomplete (static analysis, no model) Ã¢â€â‚¬Ã¢â€â‚¬
let jediProc = null,
  jediBuf = "",
  jediQueue = [];
function startJedi() {
  try {
    jediProc = spawn(PY_BIN, [path.join(__dirname, "jedi_worker.py")], {
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

// Describe a failed child process even when stderr is empty (e.g. killed by
// timeout: execSync leaves stderr blank, only signal/status tell the story).
function procErr(e) {
  const err = ((e.stderr || "") + "").trim();
  if (err) return err;
  if (e.signal)
    return `proses dihentikan (${e.signal}) Ã¢â‚¬â€ kemungkinan timeout / infinite loop`;
  if (typeof e.status === "number")
    return `exit code ${e.status} tanpa pesan error`;
  return e.message || "runtime error";
}

// Compile (C/C++) -> run the produced exe. Returns {ok, output, error}.
async function compileRun(code, ext, compiler, label, env) {
  if (!compiler)
    return {
      ok: false,
      error: `${label} not available (set runners in config.json)`,
    };
  const base = path.join(os.tmpdir(), "_q_" + Date.now());
  const src = base + ext,
    exe = base + ".exe";
  fs.writeFileSync(src, code, "utf8");
  let res;
  try {
    await execP(`"${compiler}" "${src}" -o "${exe}"`, {
      timeout: 60000,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env: env || process.env,
    });
    try {
      const { stdout } = await execP(`"${exe}"`, {
        timeout: 8000,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        env: env || process.env,
      });
      res = { ok: true, output: stdout };
    } catch (e) {
      res = {
        ok: false,
        output: (e.stdout || "").toString(),
        error: procErr(e),
      };
    }
  } catch (e) {
    res = {
      ok: false,
      error: "compile error:\n" + (((e.stderr || "") + "").trim() || e.message),
    };
  }
  try {
    fs.rmSync(src, { force: true });
    fs.rmSync(exe, { force: true });
  } catch {}
  return res;
}
const runC = (code) => compileRun(code, ".c", RUN.c, "gcc");
const runCpp = (code) => compileRun(code, ".cpp", RUN.cpp, "g++");

async function runGo(code) {
  if (!RUN.go)
    return {
      ok: false,
      error: "go not available (set runners.go in config.json)",
    };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qgo-"));
  const src = path.join(dir, "main.go");
  fs.writeFileSync(src, code, "utf8");
  let res;
  try {
    const { stdout } = await execP(`"${RUN.go}" run "${src}"`, {
      timeout: 30000,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    res = { ok: true, output: stdout };
  } catch (e) {
    res = {
      ok: false,
      output: (e.stdout || "").toString(),
      error: ((e.stderr || "") + "").trim() || "error",
    };
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
  return res;
}

async function runJava(code) {
  if (!RUN.java || !RUN.javac)
    return {
      ok: false,
      error: "java not available (set runners.java/javac in config.json)",
    };
  const m = code.match(/public\s+class\s+(\w+)/);
  const cls = m ? m[1] : "Main";
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qjava-"));
  const src = path.join(dir, cls + ".java");
  fs.writeFileSync(src, code, "utf8");
  let res;
  try {
    await execP(`"${RUN.javac}" "${src}"`, {
      cwd: dir,
      timeout: 30000,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    try {
      const { stdout } = await execP(`"${RUN.java}" -cp "${dir}" ${cls}`, {
        timeout: 10000,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      res = { ok: true, output: stdout };
    } catch (e) {
      res = {
        ok: false,
        output: (e.stdout || "").toString(),
        error: procErr(e),
      };
    }
  } catch (e) {
    res = {
      ok: false,
      error: "compile error:\n" + (((e.stderr || "") + "").trim() || e.message),
    };
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
  return res;
}

// PHP: interpreter runs the file directly
async function runPhp(code) {
  if (!RUN.php)
    return {
      ok: false,
      error: "php not available (set runners.php in config.json)",
    };
  const src = path.join(os.tmpdir(), "_q_" + Date.now() + ".php");
  fs.writeFileSync(src, code, "utf8");
  let res;
  try {
    const { stdout } = await execP(`"${RUN.php}" "${src}"`, {
      timeout: 8000,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    res = { ok: true, output: stdout };
  } catch (e) {
    res = {
      ok: false,
      output: (e.stdout || "").toString(),
      error: ((e.stderr || "") + "").trim() || "error",
    };
  }
  try {
    fs.rmSync(src, { force: true });
  } catch {}
  return res;
}
// Rust: rustc compiles to an exe. GNU toolchain needs mingw on PATH (linker + DLLs).
function runRust(code) {
  const mingwBin = RUN.c ? path.dirname(RUN.c) : ""; // gcc.exe dir = mingw/bin
  const env = {
    ...process.env,
    PATH: mingwBin + path.delimiter + (process.env.PATH || ""),
  };
  return compileRun(code, ".rs", RUN.rust, "rustc", env);
}
// Kotlin: kotlinc -> jar, java runs it (slow: JVM startup + compile). Needs JAVA_HOME.
async function runKotlin(code) {
  if (!RUN.kotlinc || !RUN.java)
    return {
      ok: false,
      error: "kotlin not available (set runners.kotlinc/java in config.json)",
    };
  const javaHome = path.dirname(path.dirname(RUN.java));
  const env = { ...process.env, JAVA_HOME: javaHome };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qkt-"));
  const src = path.join(dir, "main.kt"),
    jar = path.join(dir, "app.jar");
  fs.writeFileSync(src, code, "utf8");
  let res;
  try {
    await execP(`"${RUN.kotlinc}" "${src}" -include-runtime -d "${jar}"`, {
      timeout: 150000,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });
    try {
      const { stdout } = await execP(`"${RUN.java}" -jar "${jar}"`, {
        timeout: 15000,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      res = { ok: true, output: stdout };
    } catch (e) {
      res = {
        ok: false,
        output: (e.stdout || "").toString(),
        error: procErr(e),
      };
    }
  } catch (e) {
    res = {
      ok: false,
      error: "compile error:\n" + (((e.stderr || "") + "").trim() || e.message),
    };
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
  return res;
}

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
const KNOWN = [
  "python",
  "javascript",
  "typescript",
  "html",
  "css",
  "json",
  "yaml",
  "c",
  "cpp",
  "go",
  "java",
  "kotlin",
  "rust",
  "ruby",
  "php",
  "sql",
  "shell",
  "markdown",
];

function detectLang(lang, code) {
  const l = (lang || "").toLowerCase();
  const canon = ALIAS[l] || l;
  if (KNOWN.includes(canon)) return canon;
  const sl = strongLang(code); // Kotlin/Go/Rust/Java/C/C++ signatures first
  if (sl) return sl;
  if (/(^|\n)\s*(def |import |print\(|class \w+:|elif )/.test(code))
    return "python";
  return "javascript";
}

// Single dispatch used by both /run and /chat Ã¢â‚¬â€ every execution is logged.
async function runByLang(lang, code) {
  const t0 = Date.now();
  let r;
  switch (lang) {
    case "python":
      r = await runPy(code);
      break;
    case "javascript":
      r = await runJS(code);
      break;
    case "c":
      r = await runC(code);
      break;
    case "cpp":
      r = await runCpp(code);
      break;
    case "go":
      r = await runGo(code);
      break;
    case "java":
      r = await runJava(code);
      break;
    case "php":
      r = await runPhp(code);
      break;
    case "rust":
      r = await runRust(code);
      break;
    case "kotlin":
      r = await runKotlin(code);
      break;
    default:
      r = {
        ok: false,
        error: `no runtime for "${lang}" — edit & highlight only`,
      };
  }
  dlog("exec", r.ok ? "info" : "warn", `run ${lang}`, {
    ok: !!r.ok,
    ms: Date.now() - t0,
    bytes: (code || "").length,
    sandbox: USE_SANDBOX,
    error: r.ok ? undefined : errTail(r.error),
  });
  return r;
}

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
  // Guard: jika work bukan array, tidak ada yang bisa dicek
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
  const blocks = [];
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
  const seen = new Set(),
    uniq = [];
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
// Fill-in-the-middle completion (for gray ghost-text). Qwen2.5-Coder FIM tokens.
function askFIM(port, prefix, suffix, reg) {
  if (
    !port ||
    port === "" ||
    Number(port) < 1 ||
    !Number.isFinite(Number(port))
  )
    return Promise.reject(new Error("FIM: local model tidak aktif"));
  return new Promise((resolve, reject) => {
    const prompt = `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`;
    const body = JSON.stringify({
      prompt,
      n_predict: 12,
      temperature: 0.1,
      top_p: 0.9,
      stop: [
        "<|fim_pad|>",
        "<|endoftext|>",
        "<|fim_prefix|>",
        "<|file_sep|>",
        "<|im_end|>",
        "\n\n",
        "```",
      ],
      cache_prompt: true,
    });
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/completion",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 30000,
      },
      (s) => {
        let d = "";
        s.on("data", (c) => (d += c));
        s.on("end", () => {
          try {
            resolve(JSON.parse(d).content || "");
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    r.on("error", reject);
    r.on("timeout", () => {
      r.destroy();
      reject(new Error("timeout"));
    });
    if (reg) reg(r);
    r.write(body);
    r.end();
  });
}

// Streaming local-model call via llama-server's OpenAI-compatible chat endpoint.
// Using /v1/chat/completions lets llama.cpp apply EACH model's own chat template
// (from the GGUF), so Qwen/Llama/Phi/Gemma all honor the system prompt correctly.
// `messages` is [{role, content}, ...]. reg() exposes the request for cancel.
function askModelStream(port, messages, onToken, reg) {
  if (
    !port ||
    port === "" ||
    Number(port) < 1 ||
    !Number.isFinite(Number(port))
  )
    return Promise.reject(
      new Error("local model tidak aktif â€” tidak ada port"),
    );
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    dlog("model", "info", "local model start", {
      port,
      messages: messages.length,
    });
    if (VERBOSE)
      dlog("model", "info", "local model request", { port, messages });
    const body = JSON.stringify({
      messages,
      stream: true,
      temperature: 0.3,
      top_p: 0.9,
      max_tokens: 1024,
      cache_prompt: true,
    });
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 600000,
      },
      (s) => {
        let acc = "",
          buf = "",
          errBody = "";
        s.on("data", (chunk) => {
          buf += chunk.toString();
          const lines = buf.split("\n");
          buf = lines.pop();
          for (const line of lines) {
            const m = line.match(/^data:\s*(.*)$/);
            if (!m) continue;
            if (m[1] === "[DONE]") continue;
            try {
              const j = JSON.parse(m[1]);
              const t =
                j.choices &&
                j.choices[0] &&
                j.choices[0].delta &&
                j.choices[0].delta.content;
              if (t) {
                acc += t;
                onToken(t);
              }
            } catch {}
          }
        });
        s.on("end", () => {
          dlog("model", "info", "local model end", {
            port,
            ms: Date.now() - t0,
            chars: acc.length,
          });
          if (VERBOSE)
            dlog("model", "info", "local model full response", {
              response: acc.slice(0, 5000),
            });
          resolve(acc);
        });
      },
    );
    r.on("error", (e) => {
      dlog("model", "error", "local model error", { port, error: e.message });
      reject(e);
    });
    r.on("timeout", () => {
      dlog("model", "error", "local model timeout", { port });
      r.destroy();
      reject(new Error("model timeout"));
    });
    if (reg) reg(r);
    r.write(body);
    r.end();
  });
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
let CLOUD_KEYS = {};
function loadCloudKeys() {
  CLOUD_KEYS = {};
  try {
    const raw = JSON.parse(
      fs.readFileSync(resolveKeysPath(), "utf8"),
    );
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
async function probeProvider(provider, key) {
  const t = PROBE[provider];
  if (!t) return 0;
  let path = t.path;
  const headers = {};
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

// Streams a cloud model's reply, forwarding tokens via onToken. Same contract as askModelStream.
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
      port = null,
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
    const reqOpts = {
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
        buf = lines.pop();
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

// Kill whatever process is LISTENING on a TCP port (to stop a model's llama-server).
function killPort(port) {
  try {
    const out = execSync("netstat -ano", { encoding: "utf8" });
    const pids = new Set(
      out
        .split("\n")
        .filter((l) => l.includes(":" + port) && /LISTENING/i.test(l))
        .map((l) => l.trim().split(/\s+/).pop())
        .filter((p) => p && p !== "0"),
    );
    for (const pid of pids) {
      try {
        execSync("taskkill /F /PID " + pid, { stdio: "ignore" });
      } catch (e) {}
    }
  } catch (e) {}
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
  const out = [];
  (function walk(dir, depth) {
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
  return out.length ? out.join("\n") : "(workspace kosong)";
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
  const hits = [];
  const files = wsList("")
    .split("\n")
    .map((l) => l.replace(/ \(\d+b\)$/, ""))
    .filter((f) => f && f !== "(workspace kosong)");
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
  return hits.length ? hits.join("\n") : "(tidak ada kecocokan)";
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Self-edit agent: operate on WOLFSPACE'S OWN source (dev copy), with guardrails Ã¢â€â‚¬Ã¢â€â‚¬
const QROOT = __dirname; // the WOLFSPACE app source root (dev copy)
// Editable: source files under safe dirs. NEVER node_modules/builds/backups/keys.
const Q_ALLOWED =
  /^(server\.cjs|[\w.-]+\.cjs|[\w.-]+([\\/][\w.-]+)+\.cjs|config\.json|public[\\/].+\.(jsx|css|html|js|json))$/;
// Never touch these even if they match above (secrets / generated / heavy).
const Q_FORBID =
  /(^|[\\/])(cloud-keys\.json|node_modules|\.git|_agent_backups|dist-app|build|\.dart_tool|workspace)([\\/]|$)/;
function qWalk(filterRe) {
  const skip =
    /^(node_modules|\.git|_agent_backups|dist-app|workspace|build|\.dart_tool|vendor)$/;
  // NEVER expose secrets via LIST/GREP/GLOB Ã¢â‚¬â€ these read file *contents*.
  const secret =
    /(cloud-keys\.json|\.env|\.pem$|\.key$|secret|credential|token)/i;
  const out = [];
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
// else the quotes become literal regex/path chars Ã¢â€ â€™ "tidak ada kecocokan" forever.
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
  return hits.length ? hits.slice(0, 200).join("\n") : "(tidak ada file cocok)";
}
function qRead(p, near) {
  const fp = qResolve(p, false);
  let st;
  try {
    st = fs.statSync(fp);
  } catch (e) {
    throw new Error("file tidak ada: " + unq(p));
  }
  if (st.isDirectory()) {
    // EISDIR guard â€” show contents instead of failing
    const items = fs.readdirSync(fp).slice(0, 100).join("\n");
    return "(ini direktori, bukan file) isi:\n" + items;
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
  const out = [];
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
  const hits = [];
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
  return hits.length ? hits.join("\n") : "(tidak ada kecocokan)";
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
function diskWalk(dir, filterRe, maxDepth) {
  const skip =
    /^(node_modules|\.git|_agent_backups|dist-app|build|\.dart_tool|vendor|__pycache__|\.cache|\.vs|\.nuget|packages|Debug|Release|obj|bin|\.next|\.nuxt|target|bower_components|\.terraform|cache)$/i;
  const secret =
    /(\.env|\.pem$|\.key$|\.secret|credentials?|token|cloud-keys|\.lock$)/i;
  const out = [];
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
  const out = [];
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
  return hits.length ? hits.slice(0, 200).join("\n") : "(tidak ada file cocok)";
}
function diskRead(p, near) {
  const fp = resolveDiskPath(p);
  let st;
  try {
    st = fs.statSync(fp);
  } catch {
    throw new Error("file tidak ada: " + p);
  }
  if (st.isDirectory())
    return (
      "(ini direktori) isi:\n" + fs.readdirSync(fp).slice(0, 100).join("\n")
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
  const hits = [];
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
  return hits.length ? hits.join("\n") : "(tidak ada kecocokan)";
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
function _askCloudToolsOnce(cloud, messages) {
  return new Promise((resolve, reject) => {
    const provider = cloud.provider || detectProvider(cloud.key);
    const cfg = CLOUD[provider] || CLOUD.openai;
    let model = (cloud.model || "").trim();
    if (!model || /^(sk-|gsk_|AIza|nvapi-)/.test(model)) model = cfg.model;
    const aliases = MODEL_ALIASES[provider];
    if (aliases && aliases[model.toLowerCase()])
      model = aliases[model.toLowerCase()];
    let host = cfg.host,
      p = cfg.path,
      port,
      transport = https;
    if (cloud.baseUrl) {
      try {
        const u = new URL(
          cloud.baseUrl.replace(/\/+$/, "") + "/chat/completions",
        );
        host = u.hostname;
        p = u.pathname + (u.search || "");
        port = u.port || undefined;
        transport = u.protocol === "http:" ? http : https;
      } catch {}
    }
    // max_tokens caps runaway rambling (some models write essays instead of a tool call),
    // which keeps each agent step fast. Tool calls + short answers fit easily.
    const isReasoning = /deepseek|reason/i.test(model);
    const body = JSON.stringify({
      model,
      messages,
      tools: SELF_TOOLS,
      tool_choice: "auto",
      temperature: 0.1,
      stream: true,
      max_tokens: isReasoning ? 16384 : 8192,
    });
    const headers = {
      "content-type": "application/json",
      authorization: "Bearer " + cloud.key,
      "content-length": Buffer.byteLength(body),
    };
    const r = transport.request(
      {
        hostname: host,
        port,
        path: p,
        method: "POST",
        headers,
        timeout: 300000,
      },
      (s) => {
        const bad = s.statusCode >= 400;
        let buf = "",
          errBody = "",
          content = "",
          reasoning = "";
        const tcs = [];
        s.on("data", (c) => {
          if (bad) {
            errBody += c;
            return;
          }
          buf += c;
          let nl;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            const m = line.match(/^data:\s*(.*)$/);
            if (!m || m[1] === "[DONE]") continue;
            let j;
            try {
              j = JSON.parse(m[1]);
            } catch {
              continue;
            }
            const delta = j.choices && j.choices[0] && j.choices[0].delta;
            if (!delta) continue;
            if (delta.content) content += delta.content;
            else if (delta.reasoning_content)
              reasoning += delta.reasoning_content;
            if (delta.tool_calls)
              for (const t of delta.tool_calls) {
                const i = t.index || 0;
                if (!tcs[i])
                  tcs[i] = {
                    id: t.id || "call_" + i,
                    type: "function",
                    function: { name: "", arguments: "" },
                  };
                if (t.id) tcs[i].id = t.id;
                if (t.function) {
                  if (t.function.name) tcs[i].function.name = t.function.name;
                  if (t.function.arguments)
                    tcs[i].function.arguments += t.function.arguments;
                }
              }
          }
        });
        s.on("end", () => {
          if (bad) {
            // Some providers (esp. groq) hard-fail with tool_use_failed when the model
            // answers in plain text Ã¢â‚¬â€ treat that text as a normal reply, not an error.
            try {
              const err = JSON.parse(errBody).error || {};
              if (
                (err.code === "tool_use_failed" ||
                  /tool/i.test(err.message || "")) &&
                err.failed_generation
              )
                return resolve({
                  role: "assistant",
                  content: String(err.failed_generation)
                  // Jangan kirim tool_calls: [] karena DeepSeek menolak array kosong
                });
            } catch (_) {}
            return reject(
              new Error(
                provider + " " + s.statusCode + ": " + errBody.slice(0, 300),
              ),
            );
          }
          const validToolCalls = tcs.filter(Boolean);
          const response = {
            role: "assistant",
            content: content || reasoning || null
          };
          // Hanya kirim tool_calls jika ada setidaknya 1 tool call (hindari error DeepSeek)
          if (validToolCalls.length > 0) {
            response.tool_calls = validToolCalls;
          }
          resolve(response);
        });
      },
    );
    r.on("error", reject);
    r.on("timeout", () => r.destroy(new Error("timeout")));
    r.write(body);
    r.end();
  });
}

// Retry transient network failures (read ECONNRESET / timeout / socket hang up).
const _TRANSIENT =
  /ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|timeout|EAI_AGAIN|network|ECONNREFUSED|ENOTFOUND|503|404|429|too busy|Service Unavailable|service_unavailable|Rate limit|FreeUsageLimit/i;
async function askCloudTools(cloud, messages) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await _askCloudToolsOnce(cloud, messages);
    } catch (e) {
      last = e;
      if (!_TRANSIENT.test(e.message || "") || attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }
  throw last;
}

// Execute one validated tool call. Returns { ok, output, edited }.
function runSelfTool(name, args, emit) {
  try {
    if (name === "list") return { ok: true, output: qList() };
    if (name === "glob") return { ok: true, output: qGlob(args.pattern) };
    if (name === "read")
      return { ok: true, output: qRead(args.path, args.near) };
    if (name === "grep") return { ok: true, output: qGrep(args.pattern) };
    if (name === "edit") {
      const dest = qResolve(args.path, true);
      const old = fs.readFileSync(dest, "utf8");
      if (!old.includes(args.old_string))
        return {
          ok: false,
          output:
            "old_string tidak ditemukan di file \u2014 read ulang & salin persis.",
        };
      if (args.old_string === args.new_string)
        return {
          ok: false,
          output:
            "NOOP: old_string sama dengan new_string \u2014 edit dibatalkan.",
        };
      const patched = old.replace(args.old_string, args.new_string);
      if (old === patched)
        return {
          ok: false,
          output:
            "NOOP: replace tidak mengubah konten (old_string tidak match atau sudah sama).",
        };
      // Safe-Edit Protocol: snapshot → syntax check → apply / rollback + quarantine
      const editResult = safeWriteFile(dest, patched);
      if (!editResult.ok) {
        return {
          ok: false,
          output: "DITOLAK & ROLLBACK otomatis (sintaks rusak):\n" + editResult.error +
            "\n[Snapshot: " + editResult.snapshotId + "]" +
            "\n[Karantina: " + (editResult.quarantineFile || '-') + "]",
        };
      }
      return {
        ok: true,
        edited: true,
        output:
          "edited " + args.path +
          " (" + old.length + "->" + patched.length + " b, sintaks OK)" +
          " [snapshot: " + editResult.snapshotId + "]",
      };
    }

    if (name === "write") {
      const dest = qResolve(args.path, true);
      // Safe-Edit Protocol: snapshot → syntax check → apply / rollback + quarantine
      const writeResult = safeWriteFile(dest, args.content || "");
      if (!writeResult.ok) {
        return {
          ok: false,
          output: "DITOLAK & ROLLBACK otomatis (sintaks rusak):\n" + writeResult.error +
            "\n[Snapshot: " + writeResult.snapshotId + "]" +
            "\n[Karantina: " + (writeResult.quarantineFile || '-') + "]",
        };
      }
      return {
        ok: true,
        edited: true,
        output: "created/overwrote " + args.path + " (sintaks OK) [snapshot: " + writeResult.snapshotId + "]",
      };
    }
    if (name === "bash") {
      const cmd = (args.command || "").trim();
      if (
        /\brm\s+-rf\b|\bdel\s+\/|\bformat\b|\bmkfs\b|shutdown|\breboot\b|:\(\)\s*\{|>\s*\/dev\/sd|\bcurl\b[^|]*\|\s*(sh|bash)|\bgit\s+push\b/i.test(
          cmd,
        )
      )
        return { ok: false, output: "perintah berbahaya ditolak" };
      let cwd = QROOT;
      if (args.cwd) {
        try {
          const resolved = resolveDiskPath(args.cwd);
          const st = fs.statSync(resolved);
          if (st.isDirectory()) cwd = resolved;
        } catch {}
      }
      // Use spawn for streaming output — no blocking
      return new Promise((resolve) => {
        const child = spawn("cmd.exe", ["/d", "/c", cmd], {
          cwd,
          windowsHide: true,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        });
        let stdout = "",
          stderr = "",
          timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          child.kill();
        }, 60000);
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
          if (timedOut)
            return resolve({
              ok: false,
              output: "TIMEOUT (60s): " + cmd.slice(0, 100),
            });
          const full = (stdout || stderr || "").trim();
          if (code !== 0 && stderr) {
            resolve({
              ok: false,
              output:
                "exit " +
                code +
                ":\n" +
                (stderr.trim() || stdout.trim() || "(no output)").slice(
                  0,
                  4000,
                ),
            });
          } else {
            resolve({
              ok: true,
              output: full.slice(0, 4000) || "(exit " + code + ")",
            });
          }
        });
        child.on("error", (err) => {
          clearTimeout(timer);
          resolve({ ok: false, output: "spawn error: " + err.message });
        });
      });
    }
    if (name === "disk_list") return { ok: true, output: diskList(args.path) };
    if (name === "disk_read")
      return { ok: true, output: diskRead(args.path, args.near) };
    if (name === "disk_glob")
      return { ok: true, output: diskGlob(args.path, args.pattern) };
    if (name === "disk_grep")
      return { ok: true, output: diskGrep(args.path, args.pattern) };
    if (name === "web_search")
      return {
        ok: true,
        output: "(web_search tidak tersedia dari workspace agent)",
      };
    if (name === "web_fetch")
      return {
        ok: true,
        output: "(web_fetch tidak tersedia dari workspace agent)",
      };
    if (name === "todowrite") return { ok: true, output: "task list updated" };
    if (name === "question")
      return {
        ok: true,
        output: "question: " + (args.question || ""),
        needsAnswer: true,
        question: args.question || "",
        choices: args.choices || [],
      };
    return { ok: false, output: "unknown tool: " + name };
  } catch (e) {
    return { ok: false, output: "error: " + e.message };
  }
}

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
function parseAction(text) {
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
async function runInWorkspace(lang, code) {
  const l = (lang || "").toLowerCase();
  try {
    if (l === "javascript" || l === "js" || l === "node") {
      fs.writeFileSync(path.join(WORKSPACE, "_run.cjs"), code, "utf8");
      const out = await new Promise((resolve, reject) => {
        exec(
          `"${JS_RUNTIME}" "_run.cjs"`,
          {
            cwd: WORKSPACE,
            timeout: EXEC_TIMEOUT,
            encoding: "utf8",
            maxBuffer: 200 * 1024,
            env: process.env,
          },
          (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve(stdout);
          },
        );
      });
      return { ok: true, output: (out || "").slice(0, 4000) };
    }
    if (l === "python" || l === "py") {
      fs.writeFileSync(path.join(WORKSPACE, "_run.py"), code, "utf8");
      const out = await new Promise((resolve, reject) => {
        exec(
          `python "_run.py"`,
          {
            cwd: WORKSPACE,
            timeout: EXEC_TIMEOUT,
            encoding: "utf8",
            maxBuffer: 200 * 1024,
            env: PY_ENV,
          },
          (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve(stdout);
          },
        );
      });
      return { ok: true, output: (out || "").slice(0, 4000) };
    }
    return {
      ok: false,
      error: `RUN supports python or javascript (got "${lang}")`,
    };
  } catch (e) {
    return {
      ok: false,
      output: (e.stdout || "").toString(),
      error: ((e.stderr || "") + "").trim() || e.message,
    };
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ HuggingFace model browser / downloader Ã¢â€â‚¬Ã¢â€â‚¬
function hfGetJson(p) {
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
  let url = null;
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
  return new Promise((resolve, reject) => {
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
const { chatStream } = require("./agent/chat.cjs");
const { createSnapshot, rollback, listSnapshots } = require("./agent/snapshot.cjs");
const { safeWriteFile, quarantine } = require("./agent/safe-edit.cjs");

// ── Modular route handlers (server/routes/*) ──
// Each exports handle(req, res, deps) → truthy when the request was handled.
// State stays in server.cjs and is injected via deps; modules hold logic only.
const _debugRoutes = require("./server/routes/debug.cjs");
const _terminalRoutes = require("./server/routes/terminal.cjs");
const _snapshotRoutes = require("./server/routes/snapshots.cjs");
const _openclawRoutes = require("./server/routes/openclaw.cjs");
const _hunkRoutes = require("./server/routes/hunks.cjs");
const _cloudRoutes = require("./server/routes/cloud.cjs");
const _agentRunnerRoutes = require("./server/routes/agent-runner.cjs");

// Pure self-edit agent loop (function-calling tools over WOLFSPACE's own source).
// emit(event)/ctl.isCancelled()/ctl.setCurReq() â€” shared by HTTP + IPC.
// If a chat reply contains a runnable code block, execute it (model guesses, CPU judges)
// so the UI can show the terminal/verdict â€” same behavior as the plain /chat path.
async function runReply(text) {
  try {
    const cb = extractCode(text || "");
    if (!cb) return null;
    let lang =
      ALIAS[(cb.lang || "").toLowerCase()] || (cb.lang || "").toLowerCase();
    if (!RUNNABLE.has(lang)) return null;
    if (
      (lang === "javascript" && isBrowserJs(cb.code)) ||
      launchesShell(cb.code) ||
      opensGuiWindow(lang, cb.code) ||
      readsStdin(lang, cb.code)
    )
      return null;
    const run = await runByLang(lang, cb.code);
    run.language = lang;
    run.quality = analyzeCode(lang, cb.code);
    return run;
  } catch (e) {
    return null;
  }
}

// Recover tool calls that a model wrote as plain text instead of real tool_calls,
// e.g. `<function=read={"path":"x"}>` or `<function=list>` (groq/llama quirk).
function parsePseudoCalls(text) {
  if (!text || text.indexOf("<function") < 0) return [];
  const out = [];
  const re =
    /<function\s*=\s*([\w.-]+)\s*=?\s*(\{[\s\S]*?\})?\s*\/?>(?:\s*<\/function>)?/g;
  let m;
  while ((m = re.exec(text))) {
    let args = {};
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
// The full implementation now lives in `agent/self_agent.cjs`.
const { selfAgentStream } = require("./agent/self_agent.cjs");

// â”€â”€ Persistent PTY Terminal Sessions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Each session is a background pseudo-terminal that keeps state (cd, env).
// Designed for AI agents to run interactive commands without losing context.
const terminalSessions = new Map(); // id â†’ { pty, shell, cwd, createdAt, listeners, outputBuffer }
const TERM_OUTPUT_MAX = 4096; // max chars kept per session for late joiners

function generateTerminalId() {
  return (
    "term_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 8)
  );
}

// Determine which shell to use based on the platform.
function detectShell() {
  if (process.platform === "win32") {
    // Prefer PowerShell Core, then Windows PowerShell, then cmd
    const candidates = ["pwsh.exe", "powershell.exe", "cmd.exe"];
    for (const c of candidates) {
      try {
        execSync(`where "${c}"`, { stdio: "ignore", timeout: 2000 });
        return c;
      } catch {}
    }
    return "cmd.exe";
  }
  return process.env.SHELL || "/bin/bash";
}

// Open a new PTY session rooted at the workspace directory.
function openTerminalSession(customCwd, customShell) {
  const id = generateTerminalId();
  const shell = customShell || detectShell();
  const cwd = customCwd || WORKSPACE;
  try {
    fs.mkdirSync(cwd, { recursive: true });
  } catch {}

  const useConpty = process.platform === "win32";
  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 100,
    rows: 30,
    cwd,
    env: { ...process.env, TERM: "xterm-256color", PROMPT_COMMAND: "" },
    useConpty,
  });

  const listeners = new Set();
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
function closeTerminalSession(id) {
  const session = terminalSessions.get(id);
  if (!session) return;
  try {
    session.pty.kill("SIGTERM");
  } catch {}
  // Give the process a moment to exit gracefully, then force-kill.
  setTimeout(() => {
    try {
      session.pty.kill("SIGKILL");
    } catch {}
    terminalSessions.delete(id);
  }, 200);
}

// ── Agent Runner Registry (module-level, persists across requests) ──
const AGENT_REGISTRY = [
  {
    id: "WOLFSPACE",
    name: "WOLFSPACE Native",
    icon: "⚡",
    description: "WOLFSPACE built-in agent",
    available: true,
  },
  {
    id: "opencode",
    name: "OpenCode CLI",
    icon: "opencode-logo.png",
    description: "SST OpenCode — multi-model TUI agent",
    available: false,
  },
  {
    id: "claude",
    name: "Claude Code",
    icon: "🤖",
    description: "Anthropic Claude Code CLI",
    available: false,
  },
];
const agentSessions = new Map();

const server = http.createServer(async (req, res) => {
  // Dynamic CORS: in bypass mode, allow only the frontend origin
  const CORS_ORIGIN = process.env.STATIC_PORT ? `http://localhost:${process.env.STATIC_PORT}` : "*";
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
  if (_debugRoutes.handle(req, res, { trace, LOG_RING, debugSubs, DEBUG_VIEWER, dlog })) return;
  if (_terminalRoutes.handle(req, res, { terminalSessions, openTerminalSession, writeToTerminal, resizeTerminal, closeTerminalSession })) return;
  if (_snapshotRoutes.handle(req, res, { listSnapshots, rollback })) return;
  if (_openclawRoutes.handle(req, res, { spawn, __dirname, openclawCommand, friendlyOpenClawError, stripAnsi, runOpenClawAgent, writeJson })) return;
  if (_hunkRoutes.handle(req, res, {})) return;
  if (_cloudRoutes.handle(req, res, { CLOUD_KEYS, CLOUD, PROVIDER_NAMES, loadCloudKeys, detectKey, fillCloudKey, dlog })) return;

  // HuggingFace: search GGUF models
  if (req.method === "GET" && (req.url || "").startsWith("/hf/search")) {
    const q = new URL("http://x" + req.url).searchParams.get("q") || "";
    try {
      const data = await hfGetJson(
        "/api/models?search=" +
          encodeURIComponent(q) +
          "&filter=gguf&limit=24&sort=downloads&direction=-1&full=true",
      );
      const arr = Array.isArray(data) ? data : [];
      const authors = [
        ...new Set(arr.map((m) => (m.id || "").split("/")[0]).filter(Boolean)),
      ];
      await Promise.all(authors.map((a) => hfAvatar(a)));
      const SKIP = new Set([
        "gguf",
        "transformers",
        "text-generation",
        "conversational",
        "safetensors",
        "endpoints_compatible",
        "autotrain_compatible",
        "text-generation-inference",
      ]);
      const out = arr.map((m) => {
        const author = (m.id || "").split("/")[0];
        const tags = (m.tags || [])
          .filter((t) => !t.includes(":") && !SKIP.has(t))
          .slice(0, 3);
        return {
          id: m.id,
          author,
          downloads: m.downloads || 0,
          likes: m.likes || 0,
          avatar: AVATAR_CACHE.get(author) || null,
          pipeline: m.pipeline_tag || "",
          library: m.library_name || "",
          updated: m.lastModified || m.createdAt || "",
          gated: !!m.gated,
          tags,
        };
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  // Ollama: realtime model library (scraped from ollama.com Ã¢â‚¬â€ they have no JSON API).
  // Returns full info per model: description, capabilities, sizes, pulls, tags, updated.
  if (req.method === "GET" && (req.url || "").startsWith("/ollama/search")) {
    const q = (new URL("http://x" + req.url).searchParams.get("q") || "")
      .toLowerCase()
      .trim();
    try {
      // Always pull the full library (their search page has different markup);
      // filter by query server-side over name + description.
      const html = await new Promise((resolve, reject) => {
        https
          .get(
            "https://ollama.com/library?sort=popular",
            { headers: { "user-agent": "Mozilla/5.0 WOLFSPACE" } },
            (s) => {
              if (s.statusCode >= 400) {
                s.resume();
                return reject(new Error("ollama " + s.statusCode));
              }
              let d = "";
              s.on("data", (c) => (d += c));
              s.on("end", () => resolve(d));
            },
          )
          .on("error", reject);
      });
      const cards = html.match(/<li x-test-model[\s\S]*?<\/li>/g) || [];
      let out = cards
        .map((b) => {
          const grab = (re) => {
            const m = b.match(re);
            return m ? m[1].trim() : "";
          };
          const all = (re) => [...b.matchAll(re)].map((m) => m[1].trim());
          return {
            name: grab(/x-test-model-title title="([^"]+)"/),
            description: grab(/text-md">([^<]+)</)
              .replace(/&amp;/g, "&")
              .replace(/&#39;/g, "'")
              .replace(/&quot;/g, '"'),
            capabilities: all(/x-test-capability[^>]*>([^<]+)</g),
            sizes: all(/x-test-size[^>]*>([^<]+)</g),
            pulls: grab(/x-test-pull-count[^>]*>([^<]+)</),
            tags: grab(/x-test-tag-count[^>]*>([^<]+)</),
            updated: grab(/x-test-updated[^>]*>([^<]+)</),
          };
        })
        .filter((m) => m.name);
      if (q)
        out = out.filter((m) =>
          (m.name + " " + m.description).toLowerCase().includes(q),
        );
      out = out.slice(0, 60);
      dlog("http", "info", "ollama search", { q, count: out.length });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // HuggingFace: list .gguf files of a repo (with sizes)
  if (req.method === "GET" && (req.url || "").startsWith("/hf/files")) {
    const id = new URL("http://x" + req.url).searchParams.get("id") || "";
    try {
      const tree = await hfGetJson("/api/models/" + id + "/tree/main");
      const out = (Array.isArray(tree) ? tree : [])
        .filter((f) => f.type !== "directory" && /\.gguf$/i.test(f.path || ""))
        .map((f) => ({ path: f.path, size: f.size || 0 }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  // HuggingFace: download a GGUF Ã¢â€ â€™ register in config Ã¢â€ â€™ launch llama-server (SSE progress)
  if (req.method === "POST" && req.url === "/hf/download") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let id, file, name;
      try {
        ({ id, file, name } = JSON.parse(body));
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
        if (!res.writableEnded)
          res.write("data: " + JSON.stringify(o) + "\n\n");
      };
      let cancelled = false,
        dlReq = null,
        dest = null;
      res.on("close", () => {
        if (!res.writableFinished) {
          cancelled = true;
          if (dlReq) {
            try {
              dlReq.destroy();
            } catch (e) {}
          }
        }
      });
      try {
        const modelDir = CONFIG.modelDir || path.dirname(CONFIG_PATH);
        const base = path.basename(file);
        dest = path.join(modelDir, base);
        const srcUrl =
          "https://huggingface.co/" +
          id +
          "/resolve/main/" +
          file.split("/").map(encodeURIComponent).join("/");
        let lastPct = -1,
          lastT = 0;
        await hfDownload(
          srcUrl,
          dest,
          (got, total) => {
            const pct = total ? Math.floor((got / total) * 100) : 0;
            const now = Date.now();
            if (pct !== lastPct && now - lastT > 300) {
              lastPct = pct;
              lastT = now;
              ev({ t: "progress", pct, got, total });
            }
          },
          (rq) => {
            dlReq = rq;
          },
        );
        const used = new Set((CONFIG.models || []).map((m) => m.port));
        let port = 8085;
        while (used.has(port)) port++;
        const entry = {
          name: name || base.replace(/\.gguf$/i, ""),
          file: base,
          url: srcUrl,
          port,
        };
        CONFIG.models.push(entry);
        try {
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2));
        } catch (e) {}
        const serverExe = path.join(modelDir, "llama-server.exe");
        const ctx = (CONFIG.llama && CONFIG.llama.ctxSize) || 2048,
          threads = (CONFIG.llama && CONFIG.llama.threads) || 2;
        try {
          spawn(
            serverExe,
            [
              "-m",
              dest,
              "--host",
              "127.0.0.1",
              "--port",
              String(port),
              "--ctx-size",
              String(ctx),
              "--threads",
              String(threads),
              "--mlock",
            ],
            { detached: true, stdio: "ignore" },
          ).unref();
        } catch (e) {}
        ev({ t: "done", model: { name: entry.name, port } });
      } catch (e) {
        // Remove the partial/orphan file on ANY failure (cancel OR error) Ã¢â‚¬â€ not just cancel.
        try {
          if (dest) fs.rmSync(dest, { force: true });
        } catch (e2) {}
        if (!cancelled) ev({ t: "err", m: e.message });
      }
      if (!res.writableEnded) res.end();
    });
    return;
  }

  // Ollama: real download size (bytes) of a model:tag Ã¢â‚¬â€ reads the GGUF layer
  // size from the OCI manifest. Frontend resolves this per visible card.
  if (req.method === "GET" && (req.url || "").startsWith("/ollama/size")) {
    const sp = new URL("http://x" + req.url).searchParams;
    const name = sp.get("name") || "",
      tag = sp.get("tag") || "latest";
    try {
      const man = await new Promise((resolve, reject) => {
        https
          .get(
            `https://registry.ollama.ai/v2/library/${name}/manifests/${tag}`,
            {
              headers: {
                Accept: "application/vnd.docker.distribution.manifest.v2+json",
                "User-Agent": "WOLFSPACE",
              },
            },
            (s) => {
              if (s.statusCode >= 400) {
                s.resume();
                return reject(new Error("manifest " + s.statusCode));
              }
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
          )
          .on("error", reject);
      });
      const layer = (man.layers || []).find(
        (l) => l.mediaType === "application/vnd.ollama.image.model",
      );
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ bytes: layer ? layer.size : 0 }));
    } catch (e) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: e.message, bytes: 0 }));
    }
    return;
  }

  // Ollama: download the GGUF blob from the OCI registry Ã¢â€ â€™ register Ã¢â€ â€™ launch
  // llama-server. Same pipeline + SSE progress as /hf/download Ã¢â‚¬â€ no Ollama install.
  if (req.method === "POST" && req.url === "/ollama/download") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let name, tag;
      try {
        ({ name, tag } = JSON.parse(body));
      } catch (e) {
        res.writeHead(400);
        return res.end("bad json");
      }
      tag = tag || "latest";
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const ev = (o) => {
        if (!res.writableEnded)
          res.write("data: " + JSON.stringify(o) + "\n\n");
      };
      let cancelled = false,
        dlReq = null,
        dest = null;
      res.on("close", () => {
        if (!res.writableFinished) {
          cancelled = true;
          if (dlReq) {
            try {
              dlReq.destroy();
            } catch (e) {}
          }
        }
      });
      try {
        // 1) manifest Ã¢â€ â€™ find the GGUF model layer (vnd.ollama.image.model)
        const manUrl = `https://registry.ollama.ai/v2/library/${name}/manifests/${tag}`;
        const man = await new Promise((resolve, reject) => {
          https
            .get(
              manUrl,
              {
                headers: {
                  Accept:
                    "application/vnd.docker.distribution.manifest.v2+json",
                  "User-Agent": "WOLFSPACE",
                },
              },
              (s) => {
                if (s.statusCode >= 400) {
                  s.resume();
                  return reject(
                    new Error(
                      "manifest " +
                        s.statusCode +
                        " Ã¢â‚¬â€ cek nama/tag (mis. qwen2.5:7b)",
                    ),
                  );
                }
                let d = "";
                s.on("data", (c) => (d += c));
                s.on("end", () => {
                  try {
                    resolve(JSON.parse(d));
                  } catch (e) {
                    reject(new Error("manifest tidak valid"));
                  }
                });
              },
            )
            .on("error", reject);
        });
        const layer = (man.layers || []).find(
          (l) => l.mediaType === "application/vnd.ollama.image.model",
        );
        if (!layer) throw new Error("layer GGUF tidak ditemukan di manifest");

        // 2) download the blob Ã¢â€ â€™ models dir
        const modelDir = CONFIG.modelDir || path.dirname(CONFIG_PATH);
        const safe = (name + "-" + tag).replace(/[^\w.-]+/g, "_");
        const base = safe + ".gguf";
        dest = path.join(modelDir, base);
        const blobUrl = `https://registry.ollama.ai/v2/library/${name}/blobs/${layer.digest}`;
        let lastPct = -1,
          lastT = 0;
        await hfDownload(
          blobUrl,
          dest,
          (got, total) => {
            const t = total || layer.size || 0;
            const pct = t ? Math.floor((got / t) * 100) : 0;
            const now = Date.now();
            if (pct !== lastPct && now - lastT > 300) {
              lastPct = pct;
              lastT = now;
              ev({ t: "progress", pct, got, total: t });
            }
          },
          (rq) => {
            dlReq = rq;
          },
        );

        // 3) register + launch llama-server (identical to HF path)
        const used = new Set((CONFIG.models || []).map((m) => m.port));
        let port = 8085;
        while (used.has(port)) port++;
        const entry = {
          name: name + ":" + tag,
          file: base,
          url: blobUrl,
          port,
        };
        CONFIG.models.push(entry);
        try {
          fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2));
        } catch (e) {}
        const serverExe = path.join(modelDir, "llama-server.exe");
        const ctx = (CONFIG.llama && CONFIG.llama.ctxSize) || 2048,
          threads = (CONFIG.llama && CONFIG.llama.threads) || 2;
        try {
          spawn(
            serverExe,
            [
              "-m",
              dest,
              "--host",
              "127.0.0.1",
              "--port",
              String(port),
              "--ctx-size",
              String(ctx),
              "--threads",
              String(threads),
              "--mlock",
            ],
            { detached: true, stdio: "ignore" },
          ).unref();
        } catch (e) {}
        dlog("http", "info", "ollama download done", {
          name: entry.name,
          port,
        });
        ev({ t: "done", model: { name: entry.name, port } });
      } catch (e) {
        // Remove the partial/orphan file on ANY failure (cancel OR error) Ã¢â‚¬â€ not just cancel.
        try {
          if (dest) fs.rmSync(dest, { force: true });
        } catch (e2) {}
        if (!cancelled) ev({ t: "err", m: e.message });
      }
      if (!res.writableEnded) res.end();
    });
    return;
  }

  // List configured models (UI builds the dropdown from this) Ã¢â‚¬â€ with on-disk size
  if (req.method === "GET" && req.url === "/models") {
    const md = CONFIG.modelDir || "";
    const out = (CONFIG.models || []).map((m) => {
      let size = 0;
      try {
        if (m.file) size = fs.statSync(path.join(md, m.file)).size;
      } catch (e) {}
      return {
        name: m.name,
        port: m.port,
        default: !!m.default,
        file: m.file || "",
        size,
      };
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(out));
  }

  // Delete a model: stop its llama-server, remove from config, delete the .gguf file
  if (req.method === "POST" && req.url === "/model/delete") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let port;
      try {
        ({ port } = JSON.parse(body));
      } catch (e) {
        res.writeHead(400);
        return res.end("bad json");
      }
      const idx = (CONFIG.models || []).findIndex(
        (m) => String(m.port) === String(port),
      );
      if (idx < 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "model tidak ditemukan" }));
      }
      const m = CONFIG.models[idx];
      killPort(m.port);
      CONFIG.models.splice(idx, 1);
      try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2));
      } catch (e) {}
      let deleted = false;
      try {
        if (m.file) {
          fs.rmSync(path.join(CONFIG.modelDir || "", m.file), { force: true });
          deleted = true;
        }
      } catch (e) {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, deleted, name: m.name }));
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
      curReq = null;
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
      curReq = null;
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
            reply = await askModelStream(
              port || (CONFIG.models[0] && CONFIG.models[0].port),
              [{ role: "system", content: AGENT_SYS }, ...convo],
              (tok) => ev({ t: "tok", c: tok }),
              (r) => {
                curReq = r;
              },
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
          // Verifikasi anti-halu: DONE hanya boleh jika ada eksekusi yang OK.
          // Kalau model mengirim DONE tanpa bukti eksekusi sukses, kita tolak.
          if (!act || act.kind === "done") {
            if (!hasRunOk) {
              ev({
                t: "adone",
                steps: step,
                summary:
                  "DONE ditolak: belum ada verifikasi eksekusi yang sukses (ok=false atau tidak ada run). Lanjutkan agent.",
              });
              convo.push({
                role: "user",
                content:
                  "DONE ditolak karena belum terverifikasi. Tolong lanjutkan pekerjaan dan pastikan hasil akhir divalidasi dengan menjalankan perintah eksekusi sehingga CPU memberi ok=true.",
              });
              continue;
            }
            ev({ t: "adone", steps: step, summary: act ? act.body || "Selesai." : reply });
            break;
          }

          let result = { ok: false };
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
              result = { ok: false, error: "baca gagal: " + e.message };
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
              result = { ok: false, error: "edit gagal: " + e.message };
            }
          } else {
            // run
            result = await runInWorkspace(act.arg, act.body);
            if (result.ok) hasRunOk = true; // Mark as verified!
          }
          ev({
            t: "act",
            kind: act.kind,
            arg: act.arg,
            ok: !!result.ok,
            output: result.output || result.error || "",
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

  // Self-edit agent: edits WOLFSPACE's OWN source (dev copy) with backup + syntax-gate.
  // Edits the dev files; you review and run sync-app.ps1 to apply to the live app.
  if (req.method === "POST" && req.url === "/self-agent") {
    let body = "";
    let cancelled = false,
      curReq = null;
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
      delete require.cache[require.resolve("./agent/self_agent.cjs")];
      const { selfAgentStream: freshSelfAgentStream } = require("./agent/self_agent.cjs");
      await freshSelfAgentStream(payload, ev, {
        isCancelled: () => cancelled,
        setCurReq: (r) => {
          curReq = r;
        },
      });
      if (!res.writableEnded) res.end();
    });
    return;
  }

  // Inline ghost-text completion (FIM) Ã¢â‚¬â€ uses the fast "ghost" model
  if (req.method === "POST" && req.url === "/complete") {
    let body = "";
    let cancelled = false,
      curReq = null;
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
      let prefix = "",
        suffix = "",
        port = CONFIG.ghostPort || (CONFIG.models[0] && CONFIG.models[0].port);
      try {
        const j = JSON.parse(body);
        prefix = j.prefix || "";
        suffix = j.suffix || "";
        if (j.port) port = j.port;
      } catch {}
      let text = "";
      try {
        text = await askFIM(
          port,
          prefix.slice(-800),
          (suffix || "").slice(0, 300),
          (r) => {
            curReq = r;
          },
        );
      } catch (e) {
        text = "";
      }
      // trim ghost text: drop markdown/prose, keep one block, remove suffix overlap
      text = (text || "").replace(/```[\s\S]*$/, "").split("\n\n")[0];
      const sufLine = (suffix || "").split("\n")[0].trim();
      if (sufLine && sufLine.length > 1 && text.includes(sufLine))
        text = text.slice(0, text.indexOf(sufLine));
      text = text.replace(/\s+$/, "").slice(0, 200);
      if (cancelled || res.writableEnded) return;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ text }));
    });
    return;
  }

  // Python autocomplete via Jedi (static analysis, no model)
  if (req.method === "POST" && req.url === "/pycomplete") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let out = [];
      try {
        const { code, line, column } = JSON.parse(body);
        out = await jediComplete({ code, line, column });
      } catch {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    });
    return;
  }

  // Path tanpa query-string untuk route di bawah (deklarasi lama ikut terhapus
  // bersama blok Flutter; nilainya identik dengan _path di atas)
  const urlPath = _path;

  if (_agentRunnerRoutes.handle(req, res, { AGENT_REGISTRY, agentSessions, pty, CORS_ORIGIN, runSelfTool })) return;

  // Static files from public/ (e.g. /vendor/codemirror/*) Ã¢â‚¬â€ path-traversal safe
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
      "Pragma": "no-cache",
      "Expires": "0"
    });
    res.end(data);
  });
});

// Start the HTTP server ONLY when run directly (Electron spawns this as the entry).
// When required as a module (by core.js / the IPC layer), expose the logic instead
// of opening a port Ã¢â‚¬â€ see docs/A2UI-DESIGN.md step 1.
if (require.main === module) {
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `\n  Port ${PORT} sudah dipakai. Mencoba matikan proses lama...`,
      );
      try {
        const { execSync } = require("child_process");
        if (process.platform === "win32") {
          const out = execSync(
            `netstat -ano | findstr "LISTENING" | findstr ":${PORT}"`,
            { encoding: "utf8", timeout: 5000 },
          );
          const match = out.match(/(\d+)\s*$/m);
          if (match) {
            execSync(`taskkill /F /PID ${match[1]}`, {
              stdio: "ignore",
              timeout: 3000,
            });
          }
        } else {
          execSync(`lsof -ti:${PORT} | xargs kill -9 2>/dev/null`, {
            stdio: "ignore",
            timeout: 5000,
          });
        }
        setTimeout(() => server.listen(PORT, HOST), 500);
      } catch (e) {
        console.error(
          `  Gagal: ${e.message}. Coba start ulang dengan "dev.bat"`,
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
  });
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
  askCloudTools,
  // high-level streaming ops (emit-based, req/res-free) Ã¢â‚¬â€ for HTTP + IPC
  chatStream,
  selfAgentStream,
  // system prompts
  SYS,
  WEBDEV_SYS,
  SELF_TOOLS,
  pickSystem,
  isCodingTask,
  // self-agent tools + patch helpers
  runSelfTool,
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

