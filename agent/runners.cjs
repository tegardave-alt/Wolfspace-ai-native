// Runner utilities for WOLFSPACE (extracted from server.cjs)
// Dependencies – same as original file
const fs = require("fs");
const path = require("path");
const os = require("os");
const { exec, spawn } = require("child_process");
const util = require("util");
const execP = util.promisify(exec);

// Load configuration (same as server.cjs)
const CONFIG_PATH = path.join(__dirname, "..", "config.json");
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const EXEC_TIMEOUT = CONFIG.execTimeout || 120000;
const RUN = CONFIG.runners || {};
const JS_RUNTIME = process.execPath;

// Debug logger (from ./debug.cjs)
const { dlog } = require("./debug.cjs");

// -------------------------------------------------------------------
// Helper functions (error handling, language detection, etc.)
// -------------------------------------------------------------------
function errTail(e) {
  const s = (e || "").trim();
  if (!s) return "";
  const lines = s.split("\n").filter(Boolean);
  return lines.slice(-2).join(" | ").slice(-240);
}
function errForModel(e) {
  const s = (e || "").trim();
  return s.length <= 700 ? s : s.slice(0, 160) + "\n…\n" + s.slice(-520);
}

// Strong language signatures – used before loose heuristics
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

function reconcileLang(lang, code) {
  const src = code || "";
  const sl = strongLang(src);
  if (sl && sl !== lang) return sl;
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

function launchesShell(code) {
  const s = code || "";
  return (
    /\bos\.system\s*\(/.test(s) ||
    /\bos\.popen\s*\(/.test(s) ||
    /\bcode\.interact\s*\(/.test(s) ||
    /\bpty\..\w/.test(s) ||
    /\bsubprocess\.(Popen|run|call)\s*\([^)]*shell\s*=\s*True/.test(s) ||
    /\bsubprocess\.Popen\s*\(\s*['"]python/.test(s) ||
    /require\(\s*['"]child_process['"]\s*\)\s*[\s\S]{0,200}\.spawn\s*\(\s*['"](?:cmd|powershell|bash|sh|python)['"]/.test(
      s,
    )
  );
}
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
function isBrowserJs(code) {
  const s = code || "";
  return (
    /^\s*import\s.+\sfrom\s+['"]/.m.test(s) ||
    /\bexport\s+default\b/.test(s) ||
    /from\s+['"]react['"]/.test(s) ||
    /\b(useState|useEffect|ReactDOM|createRoot)\b/.test(s) ||
    /\bdocument\.|\bwindow\./.test(s)
  );
}

// -------------------------------------------------------------------
// Sandbox execution (Docker) – optional, based on config
// -------------------------------------------------------------------
const SANDBOX_IMAGE = "wolfspace-sandbox"; // Docker requires lowercase repo names
function hasDocker() {
  try {
    execSync("docker version", { stdio: "ignore", timeout: 8000 });
    return true;
  } catch (e) {
    return false;
  }
}
// Kebijakan terpusat (agent/sandbox-policy.cjs); fallback "off" = default lama
// jalur eksekusi kode, jadi perilaku tanpa konfigurasi tak berubah.
const sandboxPolicy = require("./sandbox-policy.cjs");
const USE_SANDBOX = sandboxPolicy.shouldSandbox(
  CONFIG.sandbox,
  hasDocker(),
  "off",
);
async function runSandboxed(lang, code) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qsbx-"));
  const isJs = lang === "javascript";
  fs.writeFileSync(path.join(dir, isJs ? "main.js" : "main.py"), code, "utf8");
  const inner = isJs ? "node /code/main.js" : "python /code/main.py";
  const hostDir = dir.replace(/\\\\/g, "/");
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
    `${hostDir}:/code:ro`,
    "-w",
    "/code",
    SANDBOX_IMAGE,
    "sh",
    "-c",
    inner,
  ];
  try {
    const { stdout } = await execP(
      "docker " +
        args.map((a) => (/[\s\"]/.test(a) ? JSON.stringify(a) : a)).join(" "),
      {
        timeout: EXEC_TIMEOUT,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    return { ok: true, output: stdout };
  } catch (e) {
    return { ok: false, error: errForModel(e) };
  } finally {
    // cleanup temporary directory
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  }
}

// -------------------------------------------------------------------
// Language‑specific runners (Python, JS, compiled languages, etc.)
// -------------------------------------------------------------------
async function runPy(code) {
  const src = path.join(os.tmpdir(), "_q_" + Date.now() + ".py");
  fs.writeFileSync(src, code, "utf8");
  // Resolve Python: config override → bundled → system PATH
  const PY_BIN =
    RUN.python ||
    (() => {
      const bundled =
        process.env.APPDATA &&
        path.join(
          process.env.APPDATA,
          "uv",
          "python",
          "cpython-3.12.10-windows-x86_64-none",
          "python.exe",
        );
      try {
        if (bundled && fs.existsSync(bundled)) return bundled;
      } catch (_) {}
      return "python";
    })();
  const env = { ...process.env };
  try {
    const { stdout } = await execP(`"${PY_BIN}" "${src}"`, {
      timeout: EXEC_TIMEOUT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      env,
      windowsHide: true,
    });
    return { ok: true, output: stdout };
  } catch (e) {
    return {
      ok: false,
      output: (e.stdout || "").toString(),
      error: procErr(e),
    };
  } finally {
    try {
      fs.rmSync(src, { force: true });
    } catch (_) {}
  }
}
async function runJS(code) {
  const src = path.join(os.tmpdir(), "_q_" + Date.now() + ".js");
  fs.writeFileSync(src, code, "utf8");
  try {
    const { stdout } = await execP(`"${JS_RUNTIME}" "${src}"`, {
      timeout: EXEC_TIMEOUT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    return { ok: true, output: stdout };
  } catch (e) {
    return {
      ok: false,
      output: (e.stdout || "").toString(),
      error: procErr(e),
    };
  } finally {
    try {
      fs.rmSync(src, { force: true });
    } catch (_) {}
  }
}

// Compile‑run helpers (C, C++, Go, Java, PHP, Rust, Kotlin) – re‑using the code from server.cjs
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
  } catch (_) {}
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
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  }
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
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  }
  return res;
}
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
  } finally {
    try {
      fs.rmSync(src, { force: true });
    } catch (_) {}
  }
  return res;
}
async function runRust(code) {
  const mingwBin = RUN.c ? path.dirname(RUN.c) : "";
  const env = {
    ...process.env,
    PATH: mingwBin + path.delimiter + (process.env.PATH || ""),
  };
  return await compileRun(code, ".rs", RUN.rust, "rustc", env);
}
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
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  }
  return res;
}

// -------------------------------------------------------------------
// HTTP helper for streaming model requests
const http = require("http");

/**
 * Streaming local-model call via llama-server's OpenAI-compatible chat endpoint.
 * Uses /v1/chat/completions with server-sent events.
 * @param {number} port - local model port
 * @param {Array} messages - [{role, content}, ...]
 * @param {function(string):void} onToken - called per token
 * @param {function|null} reg - optional callback to expose the request for cancellation
 * @returns {Promise<string>} full accumulated response
 */
function askModelStream(port, messages, onToken, reg) {
  if (
    !port ||
    port === "" ||
    Number(port) < 1 ||
    !Number.isFinite(Number(port))
  )
    return Promise.reject(new Error("local model is not active — no port"));
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const VERBOSE = require("./debug.cjs").VERBOSE;
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

// -------------------------------------------------------------------
// Language detection helpers (used by chat & run endpoints)
// -------------------------------------------------------------------
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
  const sl = strongLang(code);
  if (sl) return sl;
  if (/(^|\n)\s*(def |import |print\(|class \w+:|elif )/.test(code))
    return "python";
  return "javascript";
}

// -------------------------------------------------------------------
// Central dispatcher used by /run and /chat endpoints
// -------------------------------------------------------------------
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

// Helper to format process errors – mirroring original procErr implementation
function procErr(e) {
  const err = ((e.stderr || "") + "").trim();
  if (err) return err;
  if (e.signal)
    return `proses dihentikan (${e.signal}) — kemungkinan timeout / infinite loop`;
  if (typeof e.status === "number")
    return `exit code ${e.status} tanpa pesan error`;
  return e.message || "runtime error";
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
    return { lang: first.lang, code: longest.code };
  }
  return { lang: first.lang, code: uniq.map((b) => b.code).join("\n\n") };
}

module.exports = {
  errTail,
  errForModel,
  strongLang,
  reconcileLang,
  launchesShell,
  readsStdin,
  opensGuiWindow,
  isBrowserJs,
  runSandboxed,
  runPy,
  runJS,
  runC,
  runCpp,
  runGo,
  runJava,
  runPhp,
  runRust,
  runKotlin,
  detectLang,
  runByLang,
  procErr,
  extractCode,
  askModelStream,
  RUNNABLE,
  ALIAS,
};
