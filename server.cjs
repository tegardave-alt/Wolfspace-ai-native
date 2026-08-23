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

// ── Jejak KELUAR, bukan hanya jejak CRASH ──
//
// KEJADIAN YANG MEMICU INI. Backend mati pukul 10:42 dan tidak meninggalkan
// APA PUN: _crash.log terakhir ditulis lima hari sebelumnya, tak ada dump
// Crashpad, tak ada entri Windows Error Reporting. Yang tersisa cuma gejala —
// cangkang Electron masih berdiri dengan jendela "Wolfspace UI", tak ada yang
// mendengarkan port 8090, dan baris log terakhir sebuah stop HITL yang normal.
// Penyebabnya tak bisa ditentukan, dan itu bukan karena kurang dicari.
//
// Sebabnya struktural: handler di atas hanya menangkap uncaughtException.
// Keluar karena sebab LAIN — promise ditolak tanpa penangkap, sinyal, atau
// process.exit dari mana pun — tidak meninggalkan sebaris pun. Padahal justru
// itu yang paling sulit didiagnosis belakangan, karena tak ada artefak untuk
// dibaca.
//
// Yang dicatat di sini sengaja termasuk kepergian yang WAJAR. "Keluar normal
// dengan kode 0" adalah jawaban yang sangat berbeda dari "dibunuh" atau
// "promise ditolak", dan tanpa catatan ini ketiganya terlihat identik: senyap.
(function jejakKeluar() {
  // SEKALI PER PROSES, bukan sekali per pemuatan modul.
  //
  // electron/main.js membuang SELURUH require.cache proyek pada tiap perubahan
  // berkas di agent/, public/, electron/, scripts/ -- dan agent menyunting
  // berkasnya sendiri, jadi ia memicu itu berkali-kali dalam satu sesi. Tanpa
  // penjaga ini, tiap muat ulang memasang enam handler baru tanpa melepas yang
  // lama. Terukur pada siklus reload tiruan: jumlah listener proses naik terus
  // (2, 3, 4, 5, ...) sampai Node memperingatkan kebocoran.
  //
  // Akibatnya bukan cuma boros: satu kepergian akan menulis SATU BARIS PER
  // PEMUATAN, dan jejak yang seharusnya menjelaskan justru jadi berisik.
  if (globalThis.__wolfspaceJejakKeluar) return;
  globalThis.__wolfspaceJejakKeluar = true;

  const _fs = require("fs");
  const _path = require("path");
  const BERKAS = _path.join(__dirname, "_crash.log");
  const MULAI = Date.now();
  let sudah = false;

  const tulis = (sebab, rinci) => {
    if (sudah) return; // satu baris per kepergian, bukan satu per handler
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

  // Sinkron: pada 'exit' event loop sudah berhenti, jadi hanya panggilan
  // sinkron yang sempat selesai. appendFileSync memang untuk kasus ini.
  process.on("exit", (kode) => tulis("exit", "kode=" + kode));

  // Promise ditolak tanpa penangkap TIDAK dicatat handler mana pun sebelum ini.
  // Prosesnya tak dihentikan di sini — perilaku dibiarkan apa adanya, yang
  // ditambahkan cuma catatannya.
  process.on("unhandledRejection", (alasan) =>
    tulis(
      "unhandledRejection",
      (alasan && (alasan.stack || alasan.message)) || alasan,
    ),
  );

  // Sinyal: dicatat lalu diteruskan dengan keluar. Tanpa handler, sinyal
  // mematikan proses tanpa sepatah kata; dengan handler, ia harus keluar
  // sendiri supaya perilakunya tidak berubah jadi "abaikan sinyal".
  for (const [sinyal, kode] of [
    ["SIGTERM", 143],
    ["SIGINT", 130],
    ["SIGBREAK", 149],
    ["SIGHUP", 129],
  ]) {
    try {
      process.on(sinyal, () => {
        tulis("sinyal", sinyal);
        process.exit(kode);
      });
    } catch (_) {
      // Sebagian sinyal tak ada di semua platform; ketiadaannya bukan galat.
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
// HARUS PALING ATAS, sebelum require .ts mana pun.
//
// Modul yang sudah bermigrasi ke TypeScript (agent/mcp-client.ts, server/routes/*.ts)
// hanya bisa dimuat setelah hook ini terpasang. Node 24 kebetulan melucuti tipe
// sendiri, sehingga urutan yang salah tetap jalan di mesin pengembang — tapi CI
// dan pengguna memakai Node 20, dan di sana SELURUH backend gagal dimuat dengan
// "Unexpected identifier". Terbukti dengan menjalankan berkas ini memakai
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
// node-pty adalah modul NATIVE, jadi ia bisa saja tak tersedia di platform tempat
// biner-nya tak terpasang atau tak bisa dibangun. Dulu require ini telanjang di
// tingkat atas, sehingga modul yang hilang tidak sekadar mematikan terminal — ia
// MEMBUNUH SELURUH SERVER sebelum sempat mendengarkan port. Terbukti saat backend
// dijalankan di WSL/Alpine (musl, tanpa prebuild linux dan tanpa python3/make/g++
// untuk membangunnya): server gagal start total, padahal terminal cuma satu dari
// sekian fitur.
//
// Terminal kini fitur OPSIONAL: kalau modulnya tak ada, sisa server tetap hidup
// dan hanya endpoint terminal yang menolak dengan pesan jelas.
let pty = null;
let ptyLoadError = null;
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
// HOST dulu hanya dari config, sehingga `ENV HOST=` di Dockerfile tak berpengaruh
// apa pun — menyesatkan bagi siapa pun yang men-deploy ke host container, karena
// platform seperti Railway/Render/Fly memang mengendalikan bind lewat env.
// Urutannya kini sama dengan PORT: env menang atas config.
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
const LOG_RING = []; // recent events, in memory
const LOG_MAX = 800;
const debugSubs = new Set(); // live SSE writers

// Precision debugging via trace system
const trace = require("./agent/trace.cjs");
// sandbox-policy TIDAK lagi di-require di sini: satu-satunya pemakainya dulu
// adalah gerbang sandbox Docker untuk eksekusi kode, yang sudah dihapus. Modulnya
// sendiri masih hidup dan dipakai agent/tools/index.ts untuk menggerbangi
// pengurungan bash berbasis namespace.
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
// Argumen kedua adalah KONTEKS (`this`), bukan data yang dicetak.
//
// Ketiga pemanggil di bawah menulis `_writeSafe(_origLog, console, ...args)` —
// maksudnya jelas `_origLog.call(console, ...args)`. Tapi versi lama menyapu
// semuanya ke dalam `...args` lalu `fn(...args)`, sehingga `console` ikut
// TERCETAK sebagai argumen pertama. Akibatnya SETIAP baris log backend
// menyeret dump 25 properti objek console:
//
//   Object [console] { log: [Function], warn: [Function], ... } [renderer:warning] …
//
// Terlihat di stdout `npm run app` pada setiap pesan, dan di mode Electron
// backend berjalan di proses MAIN — jadi ongkos serialisasi itu ditanggung
// pemilik jendela, berulang untuk tiap baris log.
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

// Sandbox eksekusi berbasis Docker DIHAPUS.
//
// Gerbangnya default "off" (agent/sandbox-policy.ts) sehingga tak pernah
// menyala sendiri, dan engine Docker-nya sudah tak ada di mesin ini — jadi
// jalur ini tak pernah dieksekusi. Menyimpannya hanya menyisakan kode mati yang
// memberi kesan ada pengurungan padahal tidak.
//
// Pengurungan OS yang AKTIF, tanpa daemon:
//   bash terkurung workspace -> agent/tools/bash-jail.ts (namespace Linux)
//   zona kapabilitas         -> agent/broker/ (--permission + unshare -n)

// Ã¢â€ â‚¬Ã¢â€ â‚¬ Resolve real Python executable (skips Windows Store alias that errors) Ã¢â€ â‚¬Ã¢â€ â‚¬
let _pyBinCache = null;
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

// RUN (= CONFIG.runners) DIHAPUS bersama compileRun dan sembilan runner
// bahasa. Ia satu-satunya pembaca `runners` di config.json, jadi kunci gcc/
// g++/go/javac/php/rustc/kotlinc di sana kini tak dibaca siapa pun. Eksekusi
// yang masih hidup ada di runInWorkspace(), dan itu hanya python + javascript.

// Ã¢â€â‚¬Ã¢â€â‚¬ Persistent Jedi worker: real Python autocomplete (static analysis, no model) Ã¢â€â‚¬Ã¢â€â‚¬
let jediProc = null,
  jediBuf = "",
  jediQueue = [];
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
  const hits = [];
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
// Berkas rahasia. Dulu pola ini hidup di dalam qWalk saja, yang HANYA menyaring
// pembacaan — Q_FORBID tak menyebut .env/.pem/.key sama sekali. Begitu ada rute
// TULIS (/ww/tulis-berkas), selisih itu jadi lubang: berkas yang disembunyikan
// dari pohon berkas tetap bisa ditimpa. Satu pola dipakai dua sisi supaya
// keduanya tak bisa menyimpang lagi.
const Q_RAHASIA =
  /(cloud-keys\.json|\.env|\.pem$|\.key$|secret|credential|token)/i;
// Kurungan untuk rute yang MENULIS ke workspace atas perintah renderer. Satu
// fungsi dipakai semua rute tulis: dua salinan aturan yang sama pasti akan
// menyimpang, dan yang menyimpang di sini adalah batas keamanan.
function _kurungDiAkar(root, p) {
  if (!root || !p) return { kode: 400, galat: "root and path are required" };
  const akar = path.resolve(String(root));
  const berkas = path.resolve(String(p));
  // path.relative lebih dapat dipercaya daripada startsWith: "C:\a-lain"
  // diawali "C:\a" secara tekstual, tapi bukan di dalamnya.
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
// CATATAN: _askCloudToolsOnce / askCloudTools / runSelfTool DIHAPUS dari sini.
//
// Ketiganya salinan LENGKAP dari jalur agent yang sudah pindah ke modul
// (agent/cloud.ts dan agent/tools/index.ts), dan tak punya satu pun
// pemanggil: tidak di server.cjs, tidak di electron/main.js, tidak di preload,
// tidak di renderer. Diekspor, tapi tak pernah dikonsumsi.
//
// KENAPA DIHAPUS, bukan dibiarkan. Salinan runSelfTool di sini menjalankan bash
// dengan  — TANPA pemangkasan env, TANPA _confineBash,
// TANPA CommandChain. Semua yang baru ditutup di jalur modul masih menganga di
// sini. Kode mati yang menembus pengurungan adalah ranjau: satu baris yang
// memanggilnya membatalkan seluruh pengurungan tanpa satu pun tes jadi merah.
// Pola yang sama sudah dihapus untuk tool disk_* (cdc00bb).
//
// _TRANSIENT sengaja DIPERTAHANKAN di bawah — ia masih dipakai baris ~1999.

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
// Cakupan tempat verifikasi eksekusi berjalan — DIBAWA di setiap verdict.
//
// KENAPA. Loop anti-halu menolak DONE tanpa satu eksekusi ok=true. Tapi "ok=true"
// selama ini hanya berarti "proses keluar 0" — tak sepatah pun tentang DI MANA ia
// jalan. `cwd: WORKSPACE` BUKAN batas: kode bisa membuka path absolut mana pun,
// dan `env: process.env` mewariskan seluruh lingkungan host ke dalam kode yang
// diverifikasi. Jadi verdict hijau bisa jadi eksekusi yang menyentuh hal di luar
// cakupan, dan tetap dilaporkan berhasil.
//
// v2: verdict membawa status cakupannya sendiri. "ok=true" tak lagi tampil
// telanjang — ia selalu diikuti "terkurung ke X" atau "cakupan advisory". Ini
// pola yang sama dengan penanda [TANPA PENGURUNGAN JARINGAN] pada zona: batas
// yang tak bisa ditegakkan di Windows minimal dinyatakan, bukan diam-diam dikira
// ada. JUJUR: di Windows ini attestation, bukan penegakan — tak ada namespace,
// jadi enforced:false apa adanya.
function _cakupanVerifikasi() {
  return {
    root: WORKSPACE,
    enforced: false, // Windows: cwd bukan batas; Linux jail belum dipasang di jalur ini
    mekanisme: "cwd + env terbatas (advisory)",
  };
}

// Lingkungan MINIMAL untuk eksekusi verifikasi — bukan process.env utuh.
//
// Mewariskan seluruh env host berarti kode yang diverifikasi bisa membaca apa pun
// di dalamnya (mis. variabel yang memuat rahasia) DAN meng-expand path lewat
// %VAR% — vektor yang sama yang membuat penjaga bash bocor. Yang disisakan hanya
// yang benar-benar dibutuhkan interpreter untuk hidup di Windows/Unix.
function _envVerifikasi() {
  const e = process.env;
  const sisa = {};
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
  // TEMP/TMP diarahkan ke DALAM workspace, bukan Temp host — supaya berkas
  // sementara kode uji tak berserakan di luar cakupan, dan %TEMP% tak lagi
  // menunjuk ke pohon host.
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
      const out = await new Promise((resolve, reject) => {
        exec(
          `"${JS_RUNTIME}" "_run.cjs"`,
          {
            cwd: WORKSPACE,
            timeout: EXEC_TIMEOUT,
            encoding: "utf8",
            maxBuffer: 200 * 1024,
            // JS_RUNTIME adalah process.execPath. Di `npm run app` backend jalan
            // IN-PROCESS di dalam Electron, jadi nilainya electron.exe — bukan
            // node.exe. Tanpa tanda ini, `electron.exe skrip.js` memperlakukan
            // skrip sebagai entri APLIKASI: ia mencetak stdout dengan benar lalu
            // TIDAK PERNAH KELUAR, karena Electron menunggu event aplikasi yang
            // tak akan datang. Akibatnya exec menunggu sampai EXEC_TIMEOUT habis
            // lalu menolak dengan SIGTERM, dan verifikasi dilaporkan GAGAL
            // meskipun kodenya benar. Terukur: 120.046 ms, ok:false, sementara
            // stdout-nya berisi "halo dari javascript" — hasil yang benar,
            // vonis yang salah. Pola yang sama sudah dipakai
            // agent/tools/index.ts dan agent/tools/file-tools.ts.
            //
            // _envVerifikasi() memakai daftar-putih, jadi variabel ini TIDAK
            // diwarisi dari proses induk dan harus disetel di sini. Di luar
            // Electron ia diabaikan, jadi jalur `npm start` tak berubah.
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
      const out = await new Promise((resolve, reject) => {
        exec(
          `python "_run.py"`,
          {
            cwd: WORKSPACE,
            timeout: EXEC_TIMEOUT,
            encoding: "utf8",
            maxBuffer: 200 * 1024,
            // Dulu memakai PY_ENV — variabel yang TAK PERNAH dideklarasikan,
            // sehingga cabang ini selalu melempar ReferenceError dan setiap
            // verifikasi Python diam-diam gagal (ok=false). Kini pakai env
            // terbatas yang sama dengan cabang JS.
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
// Manajer sesinya berbeda dari core/terminal.ts (yang dipakai tool agent), tapi
// cara MEMBUNUH PTY diambil dari sana — satu implementasi saja. Alasannya
// panjang dan ada di closeTerminalSession() di bawah.
const coreTerminal = require("./core/terminal.ts");

function generateTerminalId() {
  return (
    "term_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 8)
  );
}

// ── Memilih berkas pra-kompres yang boleh dikirim ──
//
// Mengembalikan null bila tak ada yang cocok — pemanggil lalu mengirim aslinya.
//
// Kesegaran DIPERIKSA, bukan diasumsikan. Berkas .br yang lebih tua dari
// sumbernya berarti aset sudah berubah tapi belum dikompres ulang: pemakai akan
// menerima versi LAMA, dan tak ada satu pun tanda bahwa itu yang terjadi —
// bentuk kegagalan paling membingungkan yang bisa dibuat lapisan ini.
function _pilihKompresi(req, berkasAsli) {
  // HANYA untuk permintaan yang datang lewat soket sungguhan.
  //
  // Di aplikasi desktop, electron/main.js membuat req/res SINTETIS dan membaca
  // balasannya sebagai `Buffer.concat(chunks).toString("utf8")` — teks. Byte
  // brotli yang dipaksa jadi teks UTF-8 menghasilkan sampah, dan sampah itu
  // tak akan memberi galat apa pun: aset yang dimuat hanya diam-diam rusak.
  //
  // Hari ini jalur itu memang tak pernah mengirim accept-encoding, jadi cabang
  // ini tak pernah menyala di sana. Tapi itu keselamatan yang kebetulan —
  // menambahkan satu header di masa depan sudah cukup merusaknya. Adanya
  // soket adalah pembeda yang tak bisa keliru.
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
  // Brotli lebih dulu: pada aset di sini ia rata-rata 24% lebih kecil dari gzip
  // (4,75 MB vs 6,23 MB), dan keduanya sama-sama sudah jadi.
  const calon = [
    ["br", berkasAsli + ".br"],
    ["gzip", berkasAsli + ".gz"],
  ];
  for (const [encoding, berkas] of calon) {
    if (terima.indexOf(encoding) < 0) continue;
    try {
      const st = fs.statSync(berkas);
      if (st.mtimeMs < stAsli.mtimeMs) continue; // basi -> jangan dipakai
      return { encoding, berkas };
    } catch (_) {}
  }
  return null;
}

// Determine which shell to use based on the platform.
// ── Mencari program di PATH TANPA menjalankan proses ──
//
// Versi sebelumnya memanggil `where "<nama>"` lewat execSync. Begitu execSync
// benar-benar terikat (dulu ia melempar ReferenceError, jadi ongkosnya nol dan
// hasilnya selalu salah), ongkos itu muncul utuh: terukur 2008 ms MENGUNCI
// THREAD pada satu kali /api/terminal/open — hampir seluruhnya dihabiskan
// `where "pwsh.exe"` yang menunggu sampai batas 2000 ms karena pwsh memang tak
// terpasang. Seluruh server.cjs berjalan DI DALAM proses utama Electron, jadi
// dua detik itu adalah dua detik jendela membeku, dan tombol Run membuka
// terminal — jadi ia terasa persis saat pemakai menekan Run.
//
// Yang dikerjakan `where` sebenarnya cuma menelusuri PATH. Itu bisa dilakukan
// dengan fs.existsSync: tak ada proses yang dilahirkan, terukur di bawah 1 ms.
function _adaDiPath(nama) {
  const dirs = String(process.env.PATH || "").split(path.delimiter);
  // Nama telanjang dicoba DULU, lalu tiap akhiran PATHEXT. Tanpa itu,
  // memeriksa "python" atau "dlv" di Windows selalu menjawab tidak ada:
  // yang benar-benar duduk di PATH adalah "python.exe" dan "dlv.exe", dan
  // pemanggil yang menuliskan akhirannya sendiri (mis. "powershell.exe")
  // tetap benar karena nama telanjangnya yang dicoba lebih dulu.
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
// Debugger yang dikenal panel Code, dan biner yang harus ada agar ia berguna.
// Kuncinya SAMA dengan jenisDebugger() di public/app.jsx — kalau menyimpang,
// yang terjadi bukan galat melainkan tombol yang menilai debugger yang salah.
const _BINER_DEBUG = { node: "node", pdb: "python", rdbg: "rdbg", dlv: "dlv" };
let _debugTersedia = null;

// Hasilnya di-CACHE: shell yang terpasang tak berubah di tengah sesi, sementara
// tanpa cache biayanya dibayar ulang tiap kali terminal dibuka.
let _shellTerpilih = null;
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
    e.code = "PTY_UNAVAILABLE";
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
//
// Dulu: pty.kill("SIGTERM"), lalu pty.kill("SIGKILL") 200 ms kemudian. KEDUANYA
// tak pernah membunuh apa pun di Windows — node-pty MELEMPAR begitu diberi
// argumen sinyal ("Signals not supported on windows", windowsTerminal.js:150),
// dan lemparannya ditelan `catch {}`. Sesi tetap dihapus dari map, jadi PTY-nya
// hidup terus sekaligus tak terjangkau untuk dibersihkan. Terukur pada proses
// server sungguhan: 3 anak sebelum, 9 sesudah tiga kali buka+tutup — dua proses
// yatim per siklus, bertahan sampai seluruh aplikasi ditutup, sementara
// /api/terminal/list sudah melaporkan kosong.
//
// Sekarang memakai satu-satunya jalur pembunuh PTY di basis kode ini
// (core/terminal.ts killPty): taskkill /F /T untuk seluruh pohon, tanpa
// argumen sinyal, plus menonaktifkan pendaftar konsol node-pty yang crash.
// Penghapusan dari map tak perlu ditunda lagi — pembunuhannya sinkron, jadi
// jendela 200 ms itu hanya menunda tanpa menjamin apa pun.
// TIDAK memblokir. Ini jalur HTTP/UI, dan seluruh server.cjs berjalan di dalam
// proses utama Electron — `taskkill /F /T` lewat execSync terukur mengunci
// thread 1076 ms (terburuk 1507 ms) tiap kali panel terminal ditutup, dan itu
// jendela yang benar-benar membeku.
//
// Sesi dihapus dari map SEKARANG, sebelum pembunuhannya selesai. Bukan
// kelalaian: begitu ia dihapus, tak ada lagi yang bisa menulis atau membaca
// PTY itu, jadi /api/terminal/list langsung jujur — sementara menunggu
// taskkill hanya menahan jawaban tanpa mengubah apa pun yang terlihat.
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
  // Healthcheck — SEBELUM segalanya, sengaja.
  // Host container (Railway/Render/Fly) mem-probe endpoint ini terus-menerus.
  // Tanpa jalur khusus, probe akan mengenai "/" dan menyajikan index.html ~16KB
  // setiap beberapa detik selamanya. Balasan ini tak menyentuh disk, config,
  // maupun state agent — jadi ia tetap menjawab meski bagian lain sedang sibuk,
  // yang justru penting: healthcheck yang ikut macet akan memicu restart beruntun.
  if (req.url === "/healthz") {
    // Menyertakan VERSI, bukan cuma "ok".
    //
    // Backend bisa berjalan di tempat lain (WSL) dari salinan kode yang
    // disinkronkan, dan salinan itu bisa tertinggal. Terjadi nyata: setelah
    // beberapa commit, md5 berkas di WSL berbeda dari yang di Windows, dan
    // satu-satunya cara menjawab "versi mana yang saya jalankan?" adalah
    // membandingkan checksum satu per satu.
    //
    // Sekarang peluncur bisa membandingkannya sendiri: kalau versi backend yang
    // hidup sama dengan yang mau dijalankan, ia DIPAKAI ULANG — tak ada proses
    // kedua. Kalau beda, dihentikan lalu dinyalakan ulang. Itu yang membuat
    // "satu server" jadi jaminan, bukan harapan.
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
  // Kurungannya DIOPER, bukan disalin: `program` datang dari renderer, dan dua
  // salinan aturan keamanan yang sama pasti akan menyimpang.
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
  // Status RUNTIME per server MCP. Endpoint TERPISAH dari /mcp secara sengaja:
  // /mcp mengembalikan peta konfigurasi LANGSUNG, dan frontend sudah membacanya
  // dgn Object.entries(data) — mengubah bentuknya akan mengulang bug lama di mana
  // daftar MCP tak pernah tersegarkan.
  if (_path === "/mcp/status" && req.method === "GET") {
    const mcpClient = require("./agent/mcp-client.ts");
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(mcpClient.status()));
  }

  // Menyalakan server MCP atas permintaan user (tombol Connect), bukan saat
  // aplikasi start. Tanpa `name`, semua server yang tak di-disable dinyalakan.
  //
  // Ini pasangan backend dari perubahan di mcp-client: init() tak lagi
  // men-spawn apa pun, sehingga langkah pertama run agent tidak menanggung
  // cold start `npx` seluruh server (terukur 60,3 detik diam tanpa satu pun
  // event sebelum perubahan ini).
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

  // Penyerahan lampiran lewat jembatan: barangnya menyeberang, alamatnya tidak.
  //
  // Beda dari /upload di bawah, yang menulis ke <WOLFSPACE>/public/uploads/ lalu
  // menyerahkan PATH-nya ke agent. Saat agent dikurung ke satu worktree, path
  // itu di luar cakupan dan broker menolaknya — pengurungan yang benar justru
  // mematikan attach. Di sini yang dikembalikan HANDLE, bukan lokasi, sehingga
  // pengurungan tak perlu dilonggarkan sedikit pun.
  //
  // Tak ada yang menyentuh disk: isinya tinggal di memori proses backend, dan
  // pratinjau di UI memakai URL.createObjectURL lokal yang sudah ada.
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
          nama: name, // dipotong jadi basename di dalam jembatan
          isi: Buffer.from(data, "base64"),
          tipe: type || null,
        });
        // Sengaja mencatat NAMA hasil sanitasi, bukan `name` mentah: kalau
        // pemanggil keliru mengirim path absolut (File.path di renderer
        // Electron), ia tak boleh mendarat di berkas log.
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
      let verifiedKurungan = null; // cakupan eksekusi yang menggerbang DONE
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
            // no longer means anything. agent/chat.cjs states the same rule.
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
          // Verifikasi anti-halu: DONE hanya boleh jika ada eksekusi yang OK.
          // Kalau model mengirim DONE tanpa bukti eksekusi sukses, kita tolak.
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
            // "ok=true" tak pernah tampil telanjang: verdict akhir menyatakan
            // CAKUPAN eksekusi yang memvalidasinya. Kalau terkurung sungguhan,
            // itu jaminan; kalau advisory (Windows), itu peringatan agar tak
            // dikira lebih. Sejalan dengan penanda pengurungan pada zona.
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
              // Cakupan eksekusi yang MENGGERBANG DONE disimpan, supaya verdict
              // akhir bisa menyatakannya. Tanpa ini "ok=true" tampil telanjang.
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

  // ww workspaces: daftar folder terisolasi dari DISK (kebenaran, bukan localStorage UI).
  if (req.method === "GET" && req.url === "/ww/list") {
    try {
      const ww = require("./scripts/ww.cjs");
      const root = (CONFIG.ww && CONFIG.ww.root) || ww.DEFAULT_ROOT;
      const workspaces = ww.listWorkspaces(root);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ root, workspaces }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // GET /ww/tree?path=<absolut>&depth=<n> — pohon file workspace (untuk sidebar
  // Logic saat web-dev). Rata (flattened) jadi [{ name, dir, depth }], folder dulu
  // lalu file (A→Z), lewati folder berat/tak relevan, dibatasi agar tak membeku
  // pada repo besar. Tak pernah 500 karena path tak ada → { entries: [] }.
  // ── Menyimpan suntingan manual dari panel kode ──
  //
  // Panel kode di tampilan Logic sebelumnya BACA-SAJA: `readOnly: true` di
  // editornya, dan tak ada satu pun rute yang bisa menuliskannya kembali.
  // Melonggarkan editornya saja tak cukup — tanpa rute ini, ketikan pemakai
  // hidup di memori lalu hilang begitu berkas lain dibuka.
  //
  // KURUNGANNYA DI SINI, BUKAN DI UI. Panel mengirim path apa adanya, dan path
  // itu datang dari renderer — jadi ia tak boleh dipercaya. Tiga lapis:
  //   1. harus DI DALAM akar yang dikirim, dibandingkan sesudah path.resolve
  //      (bukan sesudah pemeriksaan tekstual, yang bisa ditembus "..")
  //   2. akarnya sendiri harus akar kerja yang sah
  //   3. Q_FORBID + Q_RAHASIA tetap berlaku — .git, node_modules, build, dan
  //      berkas rahasia (.env/.pem/.key) yang memang sudah disembunyikan dari
  //      pohon berkas, jadi ia juga tak boleh bisa ditimpa dari sini
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
          // Membuat TIDAK BOLEH menimpa. Tanpa ini, mengetik nama berkas yang
          // sudah ada di kotak "berkas baru" akan mengosongkannya diam-diam.
          if (fs.existsSync(berkas)) return tolak(409, "file already exists");
          // Nama bertingkat ("src/util/a.js") membuat foldernya sekalian,
          // sama seperti VS Code. Tanpa ini writeFileSync gagal ENOENT.
          const induk = path.dirname(berkas);
          if (induk !== akar) fs.mkdirSync(induk, { recursive: true });
          // wx: gagal kalau berkas muncul di antara existsSync dan tulis.
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
          let isi = [];
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

  // ── GET /debug/tersedia — debugger mana yang BENAR-BENAR terpasang ──
  //
  // Tanpa ini, tombol Debug menyala hanya berdasarkan EKSTENSI berkas. Buka
  // .rb di mesin tanpa rdbg, tekan Debug: perintahnya terkirim, gagal di
  // terminal, tapi UI tetap menyatakan "Sesi hidup · rdbg" — keadaan yang
  // dilaporkan aplikasi tak sama dengan keadaan yang sebenarnya.
  //
  // Memakai _adaDiPath (menelusuri PATH lewat fs), bukan menjalankan
  // "<debugger> --version": melahirkan empat proses di thread utama Electron
  // adalah persis kesalahan yang bikin jendela membeku 2 detik dulu.
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

  // ── GET /ww/pustaka?path=<akar> — daftar pustaka untuk saran pengetikan ──
  //
  // Yang muncul di editor saat mengetik `require("` atau `import … from "`.
  // Sumbernya MANIFES proyek (package.json / requirements.txt), bukan isi
  // node_modules: menelusuri node_modules berarti ribuan folder di thread yang
  // sama dengan yang menggambar jendela, dan hasilnya pun lebih buruk —
  // dependensi transitif ikut tersaran padahal bukan milik proyek ini.
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
    let js = [];
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
    let py = [];
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
      // Modul bawaan Node, diambil dari runtime — bukan daftar yang ditulis
      // tangan lalu basi diam-diam tiap kali Node naik versi.
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
      const entries = [];
      const walk = (dir, depth) => {
        if (depth > maxDepth || entries.length >= MAX_ENTRIES) return;
        let ents;
        try {
          ents = fs.readdirSync(dir, { withFileTypes: true });
        } catch (_) {
          return;
        }
        // folder dulu, lalu file — masing-masing terurut A→Z (case-insensitive)
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

  // GET /plugins — daftar plugin terpasang + status persetujuannya.
  //
  // Manifest yang RUSAK ikut dikirim (field `rusak`), tidak dibuang diam-diam.
  // Plugin yang hilang tanpa jejak adalah persis cara skills.ts jadi terlupakan
  // sampai akhirnya jadi celah.
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
            // Persetujuan dibekukan ke genesis saat sesi mulai. Yang baru
            // disetujui tampil `disetujui:true` tapi `aktifSesi:false` — dan
            // perbedaan itu HARUS terlihat, karena kalau tidak user mengira
            // plugin sudah hidup padahal agent belum bisa memanggilnya.
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

  // POST /plugins/pasang — user memasang plugin baru.
  //
  // Tak ada padanannya sebagai tool agent, dan tak boleh ada. Ini pintu user;
  // seluruh pemisahan dua pintu runtuh kalau model bisa memasang sendiri.
  //
  // Yang ditulis HANYA manifest — tak ada kode yang diunduh atau disalin. Jalur
  // "ambil dari URL lalu simpan" yang dulu ada di skill_install sengaja tidak
  // dihidupkan kembali.
  if (req.method === "POST" && req.url === "/plugins/pasang") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let b = {};
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
                  // Memasang TIDAK memberi izin. Dikatakan terus terang supaya
                  // user tak mengira plugin langsung bisa dipakai agent.
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
      let b = {};
      try {
        b = JSON.parse(raw || "{}");
      } catch (_) {}
      const nama = String(b.nama || "");
      try {
        const P = require("./agent/plugins.ts");
        // Prosesnya dihentikan DULU, sebelum foldernya hilang: mencopot tanpa
        // mematikan meninggalkan proses yatim yang masih melayani panggilan.
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

  // POST /plugins/setujui — user MEMBERI atau MENCABUT izin sebuah plugin.
  //
  // Sengaja tak ada padanannya sebagai tool agent. Ini pintu user; kalau model
  // bisa menyetujui plugin, seluruh pemisahan dua pintu itu runtuh.
  if (req.method === "POST" && req.url === "/plugins/setujui") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      let b = {};
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

        // PENCABUTAN harus punya efek SEKARANG, dan berkas persetujuan saja tak
        // memberikannya: genesis sesi ini sudah dibekukan dengan kapabilitas itu
        // di dalamnya, dan prosesnya sudah menyala. Jadi prosesnya dimatikan —
        // tak ada yang tersisa untuk dipanggil, dan tool-nya lenyap dari daftar.
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
            // Jujur soal kapan berlakunya. Genesis dibekukan sekali per sesi,
            // jadi PEMBERIAN izin tidak menyentuh ruleset yang sedang berjalan.
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

  // POST /flow/http — eksekutor node "HTTP Request" untuk kanvas Logic (integrasi).
  // Melakukan permintaan HTTP dari SISI SERVER supaya renderer tak kena CORS —
  // inilah tulang punggung "integrasi platform luar": panggilan keluar terpusat di
  // backend. Body: { method, url, headers, body, timeoutMs }. Selalu balas 200 +
  // ringkasan { ok, status, body, ms } agar node graph mudah menampilkan hasil.
  if (req.method === "POST" && req.url === "/flow/http") {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", async () => {
      let b = {};
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
        const init = { method, headers, signal: ctrl.signal };
        if (b.body != null && method !== "GET" && method !== "HEAD")
          init.body =
            typeof b.body === "string" ? b.body : JSON.stringify(b.body);
        const r = await fetch(url, init);
        const text = await r.text();
        const outHeaders = {};
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

  // ww ls-save / ls-load: jembatan migrasi localStorage antar-origin (browser
  // 127.0.0.1:8090 ↔ Electron app://). localStorage tak bisa dibaca lintas origin,
  // jadi browser menyimpan dump-nya ke satu file bersama di ~/.wolfspace, Electron
  // membacanya. Sekali jalan; file bisa dihapus setelahnya.
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

  // ww attach: PASANG folder mana pun sebagai workspace terisolasi. Saat sebuah
  // folder dipasang ke WOLFSPACE, di sinilah ia mendapat worktree+branch terikat ke
  // alamat aslinya (bukan lewat watcher root-tetap). Idempoten & non-destruktif.
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
        const ww = require("./scripts/ww.cjs");
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

  // ww delete: HAPUS FISIK folder+repo dari disk saat user hapus workspace di UI.
  // Sebelumnya "hapus" hanya menyembunyikan dari daftar (localStorage) — folder
  // asli tetap ada selamanya. Pengaman: hanya hapus kalau ada .ww.json di dalam
  // folder (bukti itu memang workspace ww yang kita buat/kelola, bukan folder
  // sembarang yang kebetulan namanya cocok) — mencegah rm -rf pada path salah.
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

  // ww verify: cek keberadaan folder project (kebenaran disk) untuk path APA PUN,
  // supaya UI bisa membuang "hantu" (project yang foldernya sudah tak ada) di mana pun.
  if (req.method === "POST" && req.url === "/ww/verify") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let paths = [];
      try {
        paths = JSON.parse(body || "{}").paths || [];
      } catch (_) {}
      const exists = {};
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

  // ww git: ringkasan git READ-ONLY untuk satu folder (branch, kotor/bersih,
  // commit terakhir). Dipakai sidebar untuk menampilkan status tiap workspace.
  // GET /ww/git?path=<absolut>. Tak pernah 500 karena bukan repo — { repo:false }.
  if (req.method === "GET" && req.url.startsWith("/ww/git")) {
    try {
      const q = new URL(req.url, "http://x").searchParams.get("path") || "";
      const ww = require("./scripts/ww.cjs");
      // Versi async: yang sinkron menjalankan TIGA git beruntun dan membekukan
      // thread utama ~291 ms tiap kali menu git sebuah workspace dibuka.
      const info = await ww.gitInfoAsync(q);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(info));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ repo: false, error: e.message }));
    }
  }

  // RAG (P1): simpan/ambil PENGETAHUAN (memori proyek + docs). Store per-proyek
  // di ~/.wolfspace/rag/<key>. Ingest dipanggil frontend saat run agent selesai
  // (adone); retrieve juga tersedia sbg tool agent (agent/tools/index.ts).
  if (
    req.method === "POST" &&
    (req.url === "/rag/ingest" || req.url === "/rag/retrieve")
  ) {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let b = {};
      try {
        b = JSON.parse(body || "{}");
      } catch (_) {}
      let out;
      try {
        const rag = require("./agent/rag.cjs");
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
      const ww = require("./scripts/ww.cjs");
      const daftar = await ww.listBranchesAsync(q);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify(daftar));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ repo: false, error: e.message }));
    }
  }

  // ww aksi git & rename folder (semua POST { path, ... }). Satu handler, dispatch
  // per-url; tiap operasi memanggil helper di scripts/ww.cjs dan melapor {ok|err}.
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
      let b = {};
      try {
        b = JSON.parse(body || "{}");
      } catch (_) {}
      const ww = require("./scripts/ww.cjs");
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
      // Cache /ww/git dan /ww/branches DIBATALKAN di sini. Semua yang di atas
      // MENGUBAH keadaan git, dan tanpa ini pemakai melakukan commit lalu
      // panelnya masih melaporkan keadaan sebelum commit selama 1,5 detik —
      // kesalahan yang jauh lebih buruk daripada lambat.
      //
      // Dibatalkan apa pun hasilnya, termasuk saat gagal: operasi yang gagal
      // di tengah jalan tetap bisa meninggalkan keadaan yang berbeda.
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
      const {
        selfAgentStream: freshSelfAgentStream,
      } = require("./agent/self_agent.cjs");
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
      // ?raw=1 — SUMBER apa adanya, untuk editor kode.
      //
      // Jalur biasa menyuntikkan <base> ke berkas HTML supaya link relatifnya
      // resolve saat di-preview. Itu benar untuk preview dan SALAH untuk
      // editor: yang tampil bukan lagi isi berkasnya, dan pemakai membaca satu
      // baris yang tidak ada di disk. Mode ini melewati seluruh penulisan ulang
      // dan mengirimkannya sebagai teks biasa.
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
      // HTML: inject <base> agar link relatif (css/js/img) resolve ke
      // /preview-file-assets/<dir-absolut>/ — tanpa ini endpoint assets tak pernah kena.
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

      // ── Menyajikan berkas yang SUDAH dikompres ──
      //
      // Hasil scripts/kompres-aset.cjs, bukan dikompres di sini. Bedanya
      // menentukan: memampatkan per permintaan berarti CPU di proses utama
      // Electron tiap kali aset diminta — dan brotli kualitas 11 terukur
      // mengunci thread 913 ms untuk satu berkas 213 KB. Yang sudah jadi cuma
      // dikirim, jadi ongkos runtime-nya benar-benar nol.
      //
      // Aset public/ seluruhnya 26,35 MB mentah -> 4,75 MB brotli (82% lebih
      // kecil). Yang terbesar Monaco, dan ia diminta setiap kali aplikasi
      // dibuka di mode browser.
      const pilih = _pilihKompresi(req, filePath);
      if (pilih) {
        res.writeHead(200, {
          "Content-Type": ct + "; charset=utf-8",
          "Cache-Control": "no-cache",
          "Content-Encoding": pilih.encoding,
          // Tanpa Vary, perantara mana pun boleh menyajikan balasan
          // ber-brotli kepada klien yang tak menyanggupinya.
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
// Identitas kode yang sedang dijalankan backend ini.
//
// Dibaca dari stempel yang DITULIS PELUNCUR sesudah menyinkronkan kode, bukan
// dari git: salinan di WSL berisi berkas terlacak saja, tanpa .git, jadi backend
// di sana tak bisa menanyakannya sendiri.
//
// Kalau stempelnya tak ada — server dijalankan manual, atau lewat jalur Windows
// yang tak menyinkronkan apa pun — versinya "unknown". Itu jawaban yang JUJUR,
// dan peluncur memperlakukannya sebagai "tak bisa dipastikan sama" sehingga
// memilih menyalakan ulang ketimbang memakai ulang sesuatu yang tak dikenalnya.
const VERSION_FILE = path.join(__dirname, ".wolfspace-version.json");
function versiBackend() {
  try {
    const v = JSON.parse(fs.readFileSync(VERSION_FILE, "utf8"));
    if (v && typeof v.version === "string")
      return { version: v.version, syncedAt: v.syncedAt || null };
  } catch (_) {}
  return { version: "unknown", syncedAt: null };
}

// PID yang MENDENGARKAN di sebuah port — atau null bila tak bisa dipastikan.
//
// Mengembalikan null itu jawaban yang sah dan disengaja: pemanggil lebih baik
// berhenti dengan pesan jelas daripada menebak lalu membunuh proses yang salah.
// Tiga penjaga yang tak boleh dilepas:
//   - hasilnya WAJIB bilangan bulat positif
//   - TIDAK boleh process.pid sendiri (server ini belum listen, jadi tak mungkin
//     memegang port itu — kalau muncul, berarti parsingnya keliru)
//   - TIDAK boleh PID 1 (init/pengelola distro; membunuhnya menjatuhkan semuanya)
function _pidPemegangPort(port) {
  const { execSync } = require("child_process");
  const jalankan = (cmd) => {
    try {
      return execSync(cmd, { encoding: "utf8", timeout: 5000 });
    } catch (_) {
      return "";
    }
  };
  let kandidat = null;
  if (process.platform === "win32") {
    const out = jalankan(
      `netstat -ano | findstr "LISTENING" | findstr ":${port}"`,
    );
    const m = out.match(/(\d+)\s*$/m);
    if (m) kandidat = Number(m[1]);
  } else {
    // netstat -tlnp memberi "PID/nama" pada baris LISTEN — jauh lebih tepat
    // daripada lsof, yang di BusyBox tak mengenal -t/-i sama sekali.
    const out = jalankan(`netstat -tlnp 2>/dev/null | grep ':${port} '`);
    const m = out.match(/\s(\d+)\/\S+/);
    if (m) kandidat = Number(m[1]);
    if (!kandidat) {
      // Cadangan: ss, bila tersedia.
      const out2 = jalankan(`ss -tlnp 2>/dev/null | grep ':${port} '`);
      const m2 = out2.match(/pid=(\d+)/);
      if (m2) kandidat = Number(m2[1]);
    }
  }
  if (!Number.isInteger(kandidat) || kandidat <= 0) return null;
  if (kandidat === process.pid || kandidat === 1) return null;
  return kandidat;
}

if (require.main === module) {
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `\n  Port ${PORT} sudah dipakai. Mencoba matikan proses lama...`,
      );
      // JANGAN pipe keluaran apa pun langsung ke `kill`.
      //
      // Jalur Linux dulu berbunyi: lsof -ti:PORT | xargs kill -9
      // Itu mengandaikan lsof punya flag -t/-i. BusyBox TIDAK: ia mengabaikan
      // keduanya dan mencetak SELURUH daftar fd sistem. Terukur di distro WSL
      // ini: 120 baris, dimulai dari PID 1 (/init). Kolom pertamanya PID, jadi
      // `xargs kill -9` mencoba membunuh SETIAP proses di distro — termasuk
      // server baru yang sedang menjalankan kode ini. Gejalanya: peluncur
      // melaporkan "backend WSL berhenti lebih dulu (kode 9)".
      //
      // Sekarang PID diresolusi lalu DIVALIDASI, dan hanya SATU proses yang
      // disentuh. Kalau PID-nya tak bisa dipastikan, server MENOLAK menebak dan
      // berhenti dengan pesan yang jelas — jauh lebih baik daripada membunuh
      // sesuatu yang salah.
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
// Folder baru di root ww → OTOMATIS jadi workspace terisolasi (repo+branch sendiri)
// saat dibuat, tanpa perintah manual. Watcher menyala bersama server, mati bersamanya.
let _wwWatcher = null;
function startWwWatcher() {
  try {
    if (!(CONFIG.ww && CONFIG.ww.watch)) return;
    const ww = require("./scripts/ww.cjs");
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
  // Kait uji. runInWorkspace() hanya dipanggil dari dalam loop /agent, dan
  // loop itu butuh panggilan model — tak bisa diuji langsung. Diekspor supaya
  // perilaku eksekusinya bisa diukur tanpa jaringan.
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
