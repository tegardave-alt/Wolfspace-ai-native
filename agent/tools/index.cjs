// Tool aggregator - imports all sub-modules and provides runSelfTool dispatcher
const fs = require("fs");
const path = require("path");
const os = require("os");

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
const { spawn } = require("child_process");
const { createSnapshot } = require("../snapshot.cjs");

// ── Hybrid module loading (eager core + lazy peripheral) ──
// Core modules (file-tools, exec-tools) are loaded eagerly — needed on
// almost every agent step. Peripheral modules load only on first tool call,
// reducing startup time and memory when tools are not used.
const _modLoadErrors = {};
const _modCache = {};

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
  fileTools = require("./file-tools.cjs");
} catch (e) {
  _modLoadErrors["file-tools"] = e.message;
  fileTools = {};
}
try {
  execTools = require("./exec-tools.cjs");
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
    (_diskTools = _ensureMod("disk-tools", "./disk-tools.cjs")) ||
    {}
  );
}
function lazyWeb() {
  return (
    _webTools || (_webTools = _ensureMod("web-tools", "./web-tools.cjs")) || {}
  );
}
let _archTools = null;
function lazyArch() {
  return (
    _archTools ||
    (_archTools = _ensureMod("arch-tools", "./arch-tools.cjs")) ||
    {}
  );
}
function lazySkill() {
  return (
    _skillTools ||
    (_skillTools = _ensureMod("skill-tools", "./skill-tools.cjs")) ||
    {}
  );
}
function lazyBroker() {
  return (
    _broker || (_broker = _ensureMod("broker", "../broker/index.cjs")) || {}
  );
}

// Static definitions (pure JSON, never fails)
const { SELF_TOOLS } = require("./tool-definitions.cjs");

// Sandbox validator — non-critical, isolated
let validateOperation = async () => ({
  safe: false,
  reason: "sandbox-validator not available",
});
try {
  const v = require("./sandbox-validator.cjs");
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
const { createSession: createSandboxSession } = require("../sandbox.cjs");
// Peripheral exports — lazy, loaded only when their modules are first used
const resolveDiskPath = (p) => {
  const m = lazyDisk();
  return m.resolveDiskPath ? m.resolveDiskPath(p) : p;
};
const diskList = (...a) => {
  const m = lazyDisk();
  return m.diskList ? m.diskList(...a) : "(disk-tools not loaded)";
};
const diskRead = (...a) => {
  const m = lazyDisk();
  return m.diskRead ? m.diskRead(...a) : "(disk-tools not loaded)";
};
const diskGlob = (...a) => {
  const m = lazyDisk();
  return m.diskGlob ? m.diskGlob(...a) : "(disk-tools not loaded)";
};
const diskGrep = (...a) => {
  const m = lazyDisk();
  return m.diskGrep ? m.diskGrep(...a) : "(disk-tools not loaded)";
};
const webSearch = async (...a) => {
  const m = lazyWeb();
  return m.webSearch ? m.webSearch(...a) : "(web-tools not loaded)";
};
const webFetch = async (...a) => {
  const m = lazyWeb();
  return m.webFetch ? m.webFetch(...a) : "(web-tools not loaded)";
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

// ── Confinement bash ke satu folder workspace (opt-in via context.workspaceRoot) ──
// Kurung setiap perintah bash ke dalam satu folder: cwd wajib di dalamnya, dan
// tidak boleh ada token path yang menembus keluar (.. / path absolut sibling).
function _wwInside(root, p) {
  const r = path.resolve(root);
  const t = path.resolve(p);
  return t === r || t.startsWith(r + path.sep);
}
function _confineBash(cmd, argCwd, confineRoot) {
  const root = path.resolve(confineRoot);
  // 1) cwd harus di dalam root (default = root bila tak diberikan)
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
      return { ok: false, reason: `cwd tidak ada: ${argCwd}` };
    }
    cwd = resolved;
  }
  // 2) tolak traversal '..' bergaya path (konservatif, tapi lolos untuk teks "wait..")
  if (
    /\.\.[\\/]|[\\/]\.\.(?=[\s"')\\/:]|$)|(^|[\s"'=(:])\.\.(?=[\s"')]|$)/.test(
      cmd,
    )
  )
    return { ok: false, reason: `dilarang '..' (traversal keluar workspace)` };
  // 3) setiap token yang berbentuk path harus resolve di dalam root
  const norm = cmd.replace(/>>|>|<|\|/g, " "); // pisahkan operator redirect/pipe
  for (let tok of norm.split(/\s+/)) {
    tok = tok.replace(/^["']|["']$/g, "").trim();
    if (!tok || /:\/\//.test(tok)) continue; // kosong / URL (http://…) — bukan path lokal
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

// ── Pengurungan OS sungguhan untuk bash: jalankan di kontainer Docker throwaway ──
// HANYA folder ww yang di-mount (/work, rw); folder saudara & host tak terlihat
// kontainer sama sekali. rootfs read-only + network none + batas CPU/RAM/pids.
// Ini menutup celah shell yang tak bisa ditutup regex maupun broker.
let _dockerOk = null;
function _hasDocker() {
  if (_dockerOk !== null) return _dockerOk;
  try {
    require("child_process").execSync("docker version", {
      stdio: "ignore",
      timeout: 8000,
    });
    _dockerOk = true;
  } catch {
    _dockerOk = false;
  }
  return _dockerOk;
}
const WW_SANDBOX_IMAGE = process.env.WW_SANDBOX_IMAGE || "wolfspace-sandbox";
function _runBashInDocker(cmd, root, args) {
  const hostDir = path.resolve(root).replace(/\\/g, "/");
  let workdir = "/work";
  if (args.cwd) {
    const resolved = path.isAbsolute(args.cwd)
      ? path.resolve(args.cwd)
      : path.resolve(root, args.cwd);
    if (_wwInside(root, resolved)) {
      const rel = path.relative(root, resolved).replace(/\\/g, "/");
      if (rel) workdir = "/work/" + rel;
    }
  }
  const dargs = [
    "run",
    "--rm",
    "--network",
    "none",
    "--memory",
    "512m",
    "--memory-swap",
    "512m",
    "--cpus",
    "1",
    "--pids-limit",
    "256",
    "--read-only",
    "--tmpfs",
    "/tmp:size=64m",
    "-v",
    `${hostDir}:/work`,
    "-w",
    workdir,
    WW_SANDBOX_IMAGE,
    "sh",
    "-c",
    cmd,
  ];
  return new Promise((resolve) => {
    const child = spawn("docker", dargs, { windowsHide: true });
    let out = "",
      err = "";
    const to = setTimeout(() => {
      try {
        child.kill();
      } catch {}
    }, args.timeout || 60000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      clearTimeout(to);
      const body = (out + (err ? "\n" + err : "")).trim();
      resolve({
        ok: code === 0,
        output: body || `(exit ${code})`,
        sandbox: "docker",
        confinedTo: root,
      });
    });
    child.on("error", (e) => {
      clearTimeout(to);
      resolve({ ok: false, output: "docker error: " + e.message });
    });
  });
}

// ── Opsi 1: akses file per-workspace lewat BROKER (object-capability) ──
// Saat agent dikurung ke satu folder ww, otorisasi read/write/edit dilakukan oleh
// Policy broker (deny-by-default, roots:[folder]) — bukan logika QROOT buatan
// tangan. Broker yang mengeksekusi fs, mengembalikan hasil + jejak audit.
async function _brokeredFileOp(name, args, wsRoot) {
  const b = lazyBroker();
  if (!b.Policy)
    return {
      ok: false,
      output:
        "broker tidak tersedia: " + (_modLoadErrors["broker"] || "unknown"),
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
        path: abs, // path final hasil resolve kurungan — dipakai UI (preview panel)
        output: "brokered write " + rel,
        auditTrail: broker.auditTrail(),
      };
    }
    if (name === "edit") {
      const old = await broker.request("readFile", { path: abs });
      let target = args.old_string;
      if (!old.includes(target)) {
        // Paritas dengan edit reguler (non-broker): fallback whitespace-tolerant.
        // Tanpa ini, edit terkurung yang meleset indentasi hanya membalas
        // "tidak ditemukan" tanpa info baru -> model mengulang panggilan identik
        // sampai kena guard "panggilan tool berulang tanpa kemajuan".
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
          // Beri KONTEN NYATA di sekitar area termirip supaya percobaan berikut
          // model membawa informasi baru (bukan mengulang buta).
          const probe = (
            tLines.find((l) => l.trim().length > 8) || tLines[0] || ""
          )
            .trim()
            .slice(0, 30);
          let hint = "";
          if (probe) {
            const hit = oldLines.findIndex((l) => l.includes(probe.slice(0, 15)));
            if (hit >= 0)
              hint =
                "\nKonten SEBENARNYA di sekitar baris " + (hit + 1) + ":\n" +
                oldLines
                  .slice(Math.max(0, hit - 2), hit + tLines.length + 3)
                  .join("\n");
          }
          return {
            ok: false,
            output:
              "old_string tidak ditemukan di " + rel +
              " (harus PERSIS, termasuk spasi/indentasi)." +
              (hint || " Gunakan tool read dulu untuk melihat konten file."),
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
async function runSelfTool(name, args, emit, context = {}) {
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
          "Tool tidak tersedia: modul " +
          reqMod +
          " gagal dimuat — " +
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
          " kegagalan berurutan). Coba lagi dalam " +
          remaining +
          " detik.",
      };
    }

    // -- MCP Router --
    if (name.startsWith("mcp_")) {
      const mcpClient = require("../mcp-client.cjs");
      return await mcpClient.callTool(name, args);
    }

    // -- Per-workspace broker routing (opt-in via context.workspaceRoot) --
    // Bila agent dikurung ke folder ww, read/write/edit lewat broker (deny-by-default,
    // roots:[folder]) — menggantikan guard QROOT/regex untuk akses file terstruktur.
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
        // Eksplorasi read-only → scope ke folder ww (bukan QROOT).
        if (name === "list") return { ok: true, output: diskList(_wsRoot) };
        if (name === "glob")
          return {
            ok: true,
            output: diskGlob(_wsRoot, args.pattern, { intent: args.intent }),
          };
        if (name === "grep")
          return {
            ok: true,
            output: diskGrep(_wsRoot, args.pattern, {
              intent: args.intent,
              semantic: args.semantic,
            }),
          };
        if (name === "architecture_map") {
          const m = lazyArch();
          if (!m.architectureMap)
            return { ok: false, output: "arch-tools tidak termuat" };
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
        return { ok: false, output: "VALIDASI DITOLAK: " + validation.reason };
      }
    }

    if (name === "list")
      return _cachedResult("list", () => ({ ok: true, output: qList() }));
    if (name === "glob")
      return _cachedResult(
        "glob|" + (args.pattern || "") + "|" + (args.intent || ""),
        () => ({
          ok: true,
          output: qGlob(args.pattern, { intent: args.intent }),
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
            "File backup/copy — baca dari public/ atau agent/ instead. Misal: public/app.jsx",
        };
      return _cachedResult(
        "read|" + (args.path || "") + "|" + (args.near || ""),
        () => ({ ok: true, output: qRead(args.path, args.near) }),
      );
    }
    if (name === "grep") {
      const _grepKey =
        "grep|" +
        (args.pattern || "") +
        "|" +
        (args.intent || "") +
        "|" +
        !!args.semantic;
      let output = qGrep(args.pattern, {
        intent: args.intent,
        semantic: args.semantic,
      });
      // Warn if results contain sensitive files (credential/config_sensitive)
      if (output && !output.startsWith("(") && !args.intent && !args.semantic) {
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
            " file sensitif terdeteksi (kredensial/konfigurasi). Gunakan `semantic:true` atau `intent` untuk pencarian aman.\n\n" +
            output;
        }
      }
      return _cachedResult(_grepKey, () => ({ ok: true, output }));
    }
    if (name === "edit") {
      const dest = qResolve(args.path, true);
      const old = fs.readFileSync(dest, "utf8");
      let targetToReplace = args.old_string;
      if (!old.includes(targetToReplace)) {
        // Smart fallback: cocokkan berdasarkan baris dengan normalisasi indentasi (whitespace-tolerant match)
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
              "old_string tidak ditemukan di file. Gunakan tool read terlebih dahulu untuk melihat baris yang tepat, atau gunakan replace_file_content dengan start_line dan end_line.",
          };
        }
      }
      if (targetToReplace === args.new_string)
        return {
          ok: false,
          output: "NOOP: old_string sama dengan new_string — edit dibatalkan.",
        };
      const patched = old.replace(targetToReplace, args.new_string);
      if (old === patched)
        return {
          ok: false,
          output:
            "NOOP: replace tidak mengubah konten (old_string tidak match atau sudah sama).",
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
            "DITOLAK DARI SANDBOX (sintaks rusak, file asli aman):\n" +
            chk.error,
        };
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

      let newBlock;
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
            output: `GAGAL: target_content tidak ditemukan persis di baris ${args.start_line}-${args.end_line}.\n\nTeks asli di baris tersebut:\n${targetBlock}`,
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
            "DITOLAK DARI SANDBOX (sintaks rusak, file asli aman):\n" +
            chk.error,
        };
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
      // Validasi: jangan pernah menulis "# undefined\n\nundefined" lalu melapor sukses.
      // Args kosong biasanya berarti JSON argumen gagal parse (content besar terpotong).
      const title = (args.title || "").trim();
      const content = (args.content || "").trim();
      if (!title || !content) {
        return {
          ok: false,
          output:
            "GAGAL menulis artifact: title/content kosong (kemungkinan argumen tidak lengkap atau JSON terpotong). JANGAN anggap berhasil — panggil ulang write_artifact dengan title DAN content terisi.",
        };
      }
      const artifactDir = path.join(QROOT, "artifacts");
      if (!fs.existsSync(artifactDir))
        fs.mkdirSync(artifactDir, { recursive: true });
      // Turunkan filename dari title bila tak diberikan, supaya artifact berbeda tidak
      // saling menimpa ke "artifact.md" default yang sama.
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
          output: "DITOLAK DARI SANDBOX (sintaks rusak):\n" + chk.error,
        };
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
        return { ok: false, output: "perintah berbahaya ditolak" };
      // Reject bash commands that try to edit files — must use 'edit' tool instead
      if (
        /\b(sed|findstr|Set-Content|Out-File|Add-Content|node\s+-e|node\s+--eval|fs\.writeFile)\b/i.test(
          cmd,
        )
      )
        return {
          ok: true,
          output:
            'DILARANG edit file via bash. Gunakan tool "edit" sekarang dengan parameter: path=file, old_string=kode yang dihapus, new_string="" (kosong untuk hapus). JANGAN coba bash lagi.',
        };
      let cwd = QROOT;
      if (args.cwd) {
        try {
          const resolved = resolveDiskPath(args.cwd);
          const st = fs.statSync(resolved);
          if (st.isDirectory()) cwd = resolved;
        } catch {}
      }
      // ── Confinement per-workspace (opt-in): kurung bash ke folder aktif ──
      const _confineRoot =
        (context && context.workspaceRoot) ||
        process.env.WW_WORKSPACE_ROOT ||
        null;
      if (_confineRoot) {
        // Utama: pengurungan OS via Docker (hanya folder ww yang di-mount) — batas nyata.
        if (_hasDocker() && process.env.WW_BASH_NATIVE !== "1") {
          return await _runBashInDocker(cmd, _confineRoot, args);
        }
        // Cadangan: guard regex (bocor, defense-in-depth) saat Docker tak tersedia.
        const guard = _confineBash(cmd, args.cwd, _confineRoot);
        if (!guard.ok)
          return {
            ok: false,
            output: "TERKURUNG WORKSPACE (regex fallback): " + guard.reason,
          };
        cwd = guard.cwd;
      }
      // Resolve session from context (passed by self_agent) or fallback to default
      const sessId = (context && context.sessionId) || "_default";
      if (!_sessionResources.has(sessId)) createSession();
      // Use spawn with AbortController for external cancellation
      return new Promise((resolve) => {
        const controller = new AbortController();
        const signal = controller.signal;
        const child = spawn("cmd.exe", ["/d", "/c", cmd], {
          cwd,
          windowsHide: true,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
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
          clearInterval(cancelCheck);
          _unregisterBashProcess(sessId, entry);
          // AbortError (from isCancelled or external abort) is expected — don't surface as error
          if (err.name === "AbortError")
            return resolve({
              ok: false,
              output: "DIBATALKAN: " + cmd.slice(0, 200),
            });
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
          // Baca dari lokasi kunci yang benar (~/.wolfspace via keys-path.cjs). Path lama
          // <project>/cloud-keys.json sudah dipindah keluar demi keamanan sesi lalu, jadi
          // pembacaan lama SELALU gagal (ditelan catch) dan opencode_run kehilangan kunci.
          const { resolveKeysPath } = require("../keys-path.cjs");
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
          output: "terminal tidak tersedia (node-pty tidak terinstall)",
        };
      const r = term.create(args.cwd || undefined, args.shell || undefined);
      return {
        ok: true,
        output: "terminal opened: " + r.id + " (pid " + r.pid + ")",
      };
    }
    if (name === "terminal_write") {
      if (!term) return { ok: false, output: "terminal tidak tersedia" };
      if (!args.id) return { ok: false, output: "parameter id wajib" };
      const ok = term.write(args.id, args.data);
      return { ok, output: ok ? "written" : "session not found: " + args.id };
    }
    // ACTIVE: terminal_read is registered in tool-definitions.cjs and invoked by the agent
    // to poll accumulated PTY output. The polling loop (up to 2s) prevents empty reads
    // right after a terminal_write before the shell has produced output.
    if (name === "terminal_read") {
      if (!term) return { ok: false, output: "terminal tidak tersedia" };
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
      if (!term) return { ok: false, output: "terminal tidak tersedia" };
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
        return { ok: false, output: "arch-tools tidak termuat" };
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
    if (name === "retrieve") {
      // RAG: recall PENGETAHUAN (memori proyek + docs). P1 = satu store "global"
      // agar ingest (frontend) & retrieve (di sini) selalu sekunci. Isolasi per-ww
      // (scope via workspaceRoot) = P3 — saat itu ingest juga dikunci ke ref sama.
      const rag = require("../rag.cjs");
      const out = rag.retrieveFormatted("global", args.query, { k: args.k, kind: args.kind || undefined });
      return { ok: true, output: out };
    }
    if (name === "dspy") {
      // Real DSpy optimization via native JS (WOLFSPACE's cloud LLM, no Python)
      const dspyTool = require("./dspy_tool.cjs");
      return dspyTool.run(args);
    }
    if (name === "disk_list")
      return _cachedResult("disk_list|" + (args.path || ""), () => ({
        ok: true,
        output: diskList(args.path),
      }));
    if (name === "disk_read")
      return _cachedResult(
        "disk_read|" + (args.path || "") + "|" + (args.near || ""),
        () => ({ ok: true, output: diskRead(args.path, args.near) }),
      );
    if (name === "disk_glob")
      return _cachedResult(
        "disk_glob|" +
          (args.path || "") +
          "|" +
          (args.pattern || "") +
          "|" +
          (args.intent || ""),
        () => ({
          ok: true,
          output: diskGlob(args.path, args.pattern, { intent: args.intent }),
        }),
      );
    if (name === "disk_grep")
      return _cachedResult(
        "disk_grep|" +
          (args.path || "") +
          "|" +
          (args.pattern || "") +
          "|" +
          (args.include_extensions || ""),
        () => ({
          ok: true,
          output: diskGrep(args.path, args.pattern, {
            include_extensions: args.include_extensions,
          }),
        }),
      );

    if (name === "skill_list") {
      const list = skills.listSkills();
      const text = list.length
        ? list
            .map((s) => "- " + s.name + " v" + s.version + ": " + s.description)
            .join("\n")
        : "(belum ada skill terinstall. Gunakan skill_install untuk menambah.)";
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
          output: "source diperlukan (npm package name atau path ke .cjs)",
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
    if (name === "sandbox_run") {
      const opts = { ...sandbox.defaultSandboxOpts() };
      if (args.timeout) opts.timeout = args.timeout;
      if (args.cwd) opts.cwd = args.cwd;
      if (args.network !== undefined) opts.networkAllowed = args.network;
      if (args.readRoots) opts.readRoots = args.readRoots;
      if (args.writeRoots) opts.writeRoots = args.writeRoots;
      return sandbox.sandboxRun(args.command, opts).then(
        (r) => ({
          ok: r.ok,
          output: r.output + (r.error ? "\nError: " + r.error : ""),
          sandboxId: r.sessionId,
        }),
        (e) => ({ ok: false, output: e.message }),
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
      const workDir = WORKSPACE || path.join(QROOT, "workspace");
      try {
        fs.mkdirSync(workDir, { recursive: true });
      } catch (_) {}
      let cloudHosts = [];
      try {
        cloudHosts = Object.values(require("../cloud.cjs").CLOUD || {})
          .map((c) => c.host)
          .filter(Boolean);
      } catch (_) {}
      const policy = new Policy({
        readFile: { roots: [workDir] },
        writeFile: { roots: [workDir] },
        fetch: { hosts: [...new Set(cloudHosts)] },
      });
      const broker = new Broker(policy);
      return runInCapabilityZone(args.code, broker, {
        timeout: args.timeout || 10000,
      }).then(
        (result) => ({
          ok: true,
          output: typeof result === "string" ? result : JSON.stringify(result),
          auditTrail: broker.auditTrail(),
        }),
        (e) => ({
          ok: false,
          output: e.message,
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
  qSyntaxOk,
  qResolve,
  diskList,
  diskRead,
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
