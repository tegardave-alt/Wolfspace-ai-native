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
const { getPlatformAdapter } = require("../platform/index.cjs");
const { dlog } = require("../debug.cjs");
// Gerbang kualitas struktural. WAJIB di modul INI, bukan cuma di safe-edit.cjs:
// self_agent.cjs memakai ./tools.cjs -> tools/index.cjs, sedangkan safeWriteFile
// hanya dipanggil server.cjs yang jalur agent-nya sudah tak terpakai. Gerbang di
// sana tak pernah menyentuh agent sama sekali.
const codeQuality = require("../code-quality.cjs");
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

// CommandChain (Fase 2): bash = kapabilitas proc.raw. Dimuat malas + gagal-aman —
// kalau modulnya tak bisa dimuat, bash tetap jalan (perilaku lama), tak lumpuh.
let _cc;
function lazyCC() {
  if (_cc !== undefined) return _cc;
  try {
    _cc = require("../broker/commandchain.cjs");
  } catch (_) {
    _cc = null;
  }
  return _cc;
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
// Jalur tool agent memakai varian ASINKRON. Di mode Electron kode ini berjalan
// di proses main — pemilik jendela — jadi pemindaian sinkron di sini membekukan
// UI. Fallback ke versi sinkron kalau modulnya versi lama (mis. salinan di
// _agent_backups yang di-require jalur lain), supaya tak ada yang mati total.
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
const diskGlob = (...a) => {
  const m = lazyDisk();
  return m.diskGlob ? m.diskGlob(...a) : "(disk-tools not loaded)";
};
const diskGrep = (...a) => {
  const m = lazyDisk();
  return m.diskGrep ? m.diskGrep(...a) : "(disk-tools not loaded)";
};
// Varian ASINKRON untuk jalur tool agent. Di mode Electron kode ini berjalan di
// proses main (pemilik jendela), dan profil CPU menunjukkan diskWalk sinkron
// menahannya 8-13 detik sekali hentak. Fallback ke sinkron kalau modulnya versi
// lama, supaya tak ada tool yang mati total.
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
      return { ok: false, reason: `cwd does not exist: ${argCwd}` };
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

const _bashJail = require("./bash-jail.cjs");

// Ubah cwd host jadi path DI DALAM jail. Sama seperti perhitungan `-w` untuk
// Docker: hanya cwd yang benar-benar di bawah root workspace yang dihormati,
// sisanya jatuh ke /work.
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

// ── Pengurungan OS sungguhan untuk bash ──
// HANYA folder ww yang terlihat (/work, rw); folder saudara & host tak terlihat
// sama sekali. Sistem read-only + jaringan kosong + /tmp tmpfs + batas pids.
// Ini menutup celah shell yang tak bisa ditutup regex maupun broker.
//
// Dulu dikerjakan kontainer Docker sekali-pakai; kini agent/tools/bash-jail.cjs
// dengan namespace Linux. Jaminannya sama, tapi tanpa daemon yang harus dipasang
// dan dinyalakan — dan justru ketergantungan itu yang membuat pengurungan
// terkuat jadi paling jarang aktif: saat daemon mati, yang benar-benar berjalan
// adalah penjaga regex di bawah.
const _sandboxPolicy = require("../sandbox-policy.cjs");

// PENEGAKAN DI KODE (bukan anjuran prompt): tolak perintah bash yang menyebut
// path HOST di luar workspace, SEBELUM dikirim ke container.
//
// Kenapa hardcode: bash jalur Docker hanya me-mount folder workspace, jadi path
// seperti C:\Users\... atau /c/Users/... TIDAK PERNAH ada di dalam container.
// Tanpa penjaga ini, `sh` cuma membalas "can't cd to /c/Users/..." — pesan yang
// tak menjelaskan APA PUN tentang sebabnya, sehingga agent mengulang perintah
// yang sama berkali-kali (terpantau 6x beruntun sampai penjaga kemandekan
// menghentikannya). Instruksi di prompt tak cukup: model bisa mengabaikannya.
// Di sini kegagalan diubah jadi ARAHAN — sebutkan batasnya dan tool penggantinya.
// Environment bash TIDAK lagi diwariskan utuh.
//
// KENAPA. Penjaga path (_HOST_PATH_RE di bawah) memeriksa STRING perintah
// sebelum dijalankan. Tapi %VAR% baru diperluas DI DALAM cmd.exe — sesudah
// pemeriksaan itu selesai. Penjaga melihat "%TEMP%", shell melihat
// "C:\Users\dave\AppData\Local\Temp". Dua string berbeda, dan yang benar-benar
// menyentuh disk adalah yang kedua.
//
// Diukur pada worktree DI LUAR TEMP (supaya tak bisa dibantah sebagai "cuma
// naik satu tingkat"):
//     type C:\...\rahasia.txt   -> DITAHAN
//     type %TEMP%\rahasia.txt   -> BOCOR
//     type %TMP%\rahasia.txt    -> BOCOR
//     type %USERPROFILE%\...    -> BOCOR
//
// Menambal regex tak menyelesaikannya: jumlah variabel tak terbatas, dan
// cmd.exe punya %CD%, substring expansion (%TEMP:~0,3% menghasilkan "C:\"
// tanpa pernah menuliskannya), serta penyambungan lewat `set`. Lomba yang tak
// bisa dimenangkan pemeriksa string.
//
// Yang ditutup di sini SUMBERNYA: kalau %TEMP% tak ada di environment, ia tak
// bisa diperluas jadi apa pun — pemeriksa dan shell kembali melihat string yang
// sama. Pola dan daftarnya mengikuti _envVerifikasi() di server.cjs, yang sudah
// melakukan hal ini untuk jalur verifikasi.
//
// BUKAN pengurungan sungguhan. Ini menutup satu keluarga pelarian, bukan
// membuat shell tak bisa menjangkau luar — path absolut yang ditulis terang
// masih diandalkan pada penjaga regex. Pengurungan sungguhan butuh level OS
// (bash-jail.cjs di Linux; di Windows padanannya WSL).
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
  // Jalan keluar darurat, dan sengaja hanya bisa disetel oleh yang MELUNCURKAN
  // aplikasi — bukan oleh agent, yang tak bisa menyentuh env proses backend.
  if (process.env.WOLFSPACE_BASH_ENV === "full")
    return { ...process.env, ELECTRON_RUN_AS_NODE: "1" };

  const e = process.env;
  const out = {};
  for (const k of _ENV_BASH_IZIN) if (e[k] != null) out[k] = e[k];
  // TEMP/TMP diarahkan ke DALAM direktori kerja, bukan dihapus: banyak alat
  // (npm, python, kompilator) menulis berkas sementara dan GAGAL bila keduanya
  // hilang. Mengarahkannya membuat berkas itu mendarat di dalam cakupan, dan
  // %TEMP% tak lagi menunjuk ke pohon host.
  out.TEMP = cwd;
  out.TMP = cwd;
  out.PYTHONIOENCODING = out.PYTHONIOENCODING || "utf-8";
  out.ELECTRON_RUN_AS_NODE = "1";

  // MENYARING SAJA TIDAK CUKUP DI WINDOWS.
  //
  // cmd.exe memasok sendiri variabel identitas pengguna dari token proses,
  // terlepas dari blok environment yang diberikan. Terukur: sesudah allowlist
  // dipasang, `set` di dalam shell tetap memperlihatkan HOMEDRIVE, HOMEPATH,
  // LOGONSERVER, USERDOMAIN, USERNAME, dan USERPROFILE — dan %USERPROFILE%
  // tetap menembus penjaga path, satu-satunya yang masih bocor dari empat
  // kasus uji.
  //
  // Karena itu keenamnya DITIMPA, bukan dihapus: nilai eksplisit mengalahkan
  // suntikan cmd.exe. Yang menunjuk lokasi diarahkan ke direktori kerja;
  // yang sekadar identitas dinetralkan supaya tak membocorkan nama akun.
  out.USERPROFILE = cwd;
  out.HOMEDRIVE = String(cwd).slice(0, 2); // "C:"
  out.HOMEPATH = String(cwd).slice(2) || "\\";
  out.HOME = cwd; // dipakai git/ssh di jalur POSIX
  out.USERNAME = "wolfspace";
  out.USERDOMAIN = "wolfspace";
  out.LOGONSERVER = "";
  return out;
}

const _HOST_PATH_RE = [
  /\b[A-Za-z]:[\\/]/, //  C:\... atau D:/...
  /(^|\s|['"=(])\/[a-z]\/(Users|Program|Windows)/i, // /c/Users/... (gaya MSYS)
  /(^|\s|['"=(])\/mnt\/[a-z]\//i, //  /mnt/c/... (gaya WSL)
];

// Menulis berkas KODE lewat shell melewati gerbang kualitas DAN syntax check.
// Penjaga nama-perintah (sed/Set-Content/node -e) tak menangkap ini; diuji
// empiris, `echo ... > x.jsx`, `printf ... > x.jsx`, dan `tee x.jsx` semuanya
// lolos dan berkasnya mendarat di disk.
//
// Sengaja SEMPIT: yang dilarang hanya yang menargetkan ekstensi kode. Redirect
// ke log/teks (`> build.log`, `> out.txt`) tetap sah — memblokir semua redirect
// akan melumpuhkan pemakaian bash yang wajar.
const _CODE_EXT = String.raw`(?:js|jsx|cjs|mjs|ts|tsx|py|json|css|html)`;
const _BASH_CODE_WRITE_RE = new RegExp(
  [
    String.raw`>>?\s*['"]?[^\s'"|;&]+\.${_CODE_EXT}\b`, // > x.jsx / >> x.jsx
    String.raw`\btee\s+(?:-a\s+)?['"]?[^\s'"|;&]+\.${_CODE_EXT}\b`, // tee x.jsx
    String.raw`\b(?:cp|mv|copy|move)\b[^|;&]*\.${_CODE_EXT}\b`, // cp/mv ke .jsx
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
// Saat agent dikurung ke satu folder ww, otorisasi read/write/edit dilakukan oleh
// Policy broker (deny-by-default, roots:[folder]) — bukan logika QROOT buatan
// tangan. Broker yang mengeksekusi fs, mengembalikan hasil + jejak audit.
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

    // _cachedResult sudah menangani nilai balik berupa Promise (ia menyimpan
    // hasilnya setelah resolve), jadi ketiga tool ini bisa asinkron tanpa
    // mengubah pemanggilnya.
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
        () => ({ ok: true, output: qRead(args.path, args.near) }),
      );
    }
    if (name === "grep") {
      // qGrep() memindai SELURUH pohon source (readFileSync tiap berkas cocok,
      // sampai 600 berkas) — diukur 5,26s dingin, 252ms panas, dan LOOP
      // TERBLOKIR hampir sepanjang itu (event loop sampler: ~93% dari durasi).
      //
      // Cache-nya dulu tak berguna: qGrep() dipanggil DI LUAR _cachedResult,
      // jadi kerja mahalnya selalu dijalankan ulang — _cachedResult hanya
      // menyimpan hasil yang SUDAH dihitung, bukan mencegah penghitungannya.
      // Pola paling umum di run agent adalah grep pola yang sama/mirip
      // berkali-kali dalam satu sesi; itu yang tak terselamatkan sama sekali.
      // Sekarang qGrep() pindah ke DALAM callback, menyamai pola list/read/glob.
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
      // Gerbang kualitas struktural (agent/code-quality.cjs) — ratchet: berkas
      // kotor boleh disunting, tapi tak boleh bertambah dalam.
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
      // Gerbang kualitas struktural. Jalur ini TERLEWAT di penambalan pertama —
      // ia punya Verify-Then-Commit sendiri yang hanya memeriksa SINTAKS, jadi
      // edit yang memperdalam sarang 8 -> 40 spasi lolos dan commit sukses.
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
      // Validasi: jangan pernah menulis "# undefined\n\nundefined" lalu melapor sukses.
      // Args kosong biasanya berarti JSON argumen gagal parse (content besar terpotong).
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
          output: "REJECTED BY SANDBOX (broken syntax):\n" + chk.error,
        };
      }
      // Gerbang kualitas struktural. Berkas BARU (existed=false) kena batas keras;
      // yang sudah ada kena ratchet terhadap isi lamanya.
      let _oldForGate = null;
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
      // Reject bash commands that try to edit files — must use 'edit' tool instead.
      //
      // SEMPIT, tak sekadar cocok nama perintah. Regex lama menandai `findstr`
      // (grep Windows, tak pernah menulis), `sed` tanpa -i (juga tak menulis),
      // dan `node -e`/`node --eval` APA PUN isinya — termasuk perintah
      // verifikasi paling wajar sekalipun, `node -e "console.log(1)"`. Diuji
      // langsung: perintah itu ditolak dengan pesan "gunakan tool edit" yang
      // tak nyambung (tak ada satu berkas pun yang mau diedit).
      //
      // ok DULU true untuk penolakan ini — bug tersendiri. `ok:true` membuat
      // pesan penolakan lolos sebagai "bukti" ke hallucination guard
      // (localAccessed, self_agent.cjs) dan tak pernah terhitung gagal oleh
      // gerbang item-macet (yang hanya melihat `!r.ok`). Sekarang `ok:false`,
      // supaya penolakan terlihat sebagai penolakan.
      if (
        /\b(sed\s+(?:-[a-z]*i\S*|--in-place)|Set-Content|Out-File|Add-Content|fs\.writeFile)\b/i.test(
          cmd,
        )
      )
        return {
          ok: false,
          output:
            'DILARANG edit file via bash. Gunakan tool "edit" now with parameters: path=file, old_string=the removed code, new_string="" (kosong untuk hapus). JANGAN coba bash lagi.',
        };

      // ── Tutup bypass gerbang kualitas lewat shell ──
      // Penjaga di atas hanya menangkap NAMA PERINTAH (sed/Set-Content/node -e).
      // Diuji empiris: `echo ... > x.jsx`, `printf ... > x.jsx`, dan `tee x.jsx`
      // semuanya LOLOS dan berkasnya mendarat di disk — artinya seluruh gerbang
      // kualitas (dan syntax check) bisa dilewati hanya dengan redirect shell.
      // Yang dijaga di sini BUKAN redirect apa pun (`> build.log` tetap sah),
      // melainkan redirect/salin yang MENARGETKAN berkas kode.
      if (_BASH_CODE_WRITE_RE.test(cmd))
        return {
          ok: false,
          output:
            "DITOLAK: menulis berkas kode lewat bash melewati gerbang kualitas & syntax check. " +
            'Gunakan tool "write" (berkas baru) atau "edit" (ubah yang ada) — keduanya memverifikasi ' +
            "sintaks dan struktur sebelum menyentuh disk.",
        };

      // ── CommandChain: bash adalah kapabilitas proc.raw ──
      //
      // Sampai Fase 2, bash melompati broker sepenuhnya: tak masuk audit, bisu
      // soal cakupan, tak bisa dikunci. Di sini ia menjadi transaksi CommandChain:
      //   - ADMISSION: proc.raw harus ada di kosakata genesis sesi. Bila sebuah
      //     sesi dibekukan TANPA proc.raw, bash mati — tak terbypass di tengah
      //     jalan (itulah properti smart contract-nya).
      //   - CATAT: tiap eksekusi bash dirantai ke ledger, dengan penanda cakupan
      //     yang JUJUR (advisory di Windows — tak ada namespace).
      // Gagal-aman: bila CommandChain tak bisa dimuat, bash tetap jalan.
      {
        const cc = lazyCC();
        if (cc) {
          const rs = cc.sesiRuleset();
          const adm = cc.periksa(rs, "proc.raw");
          // Cakupan jujur: hanya di Linux dengan bash-jail siap ia benar-benar
          // ditegakkan; selain itu (termasuk SEMUA Windows) advisory.
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
                "CommandChain menolak proc.raw (bash): " +
                adm.alasan +
                ". Sesi ini dikunci tanpa eksekusi shell mentah.",
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

      let cwd = QROOT;
      if (args.cwd) {
        try {
          const resolved = resolveDiskPath(args.cwd);
          const st = fs.statSync(resolved);
          if (st.isDirectory()) cwd = resolved;
        } catch {}
      }
      // ── Confinement bash: SELALU ada akarnya, tak pernah null ──
      //
      // Dulu opt-in: tanpa proyek aktif, _confineRoot null dan seluruh blok di
      // bawah — termasuk _confineBash — TIDAK PERNAH jalan. Bash lalu bebas
      // sepenuhnya. Terukur, dan inilah yang membuat perbaikan %VAR% tampak
      // "belum terjadi" saat diuji tanpa memilih proyek:
      //
      //   tanpa workspaceRoot : `type C:\...\rahasia.txt` -> BOCOR
      //   dengan workspaceRoot: `type C:\...\rahasia.txt` -> TERKURUNG
      //
      // Ke-13 kasus pelarian yang saya uji sebelumnya semuanya memakai
      // workspaceRoot, jadi kondisi "belum pilih proyek" tak pernah tersentuh —
      // padahal itu keadaan default saat aplikasi baru dibuka.
      //
      // Sekarang QROOT jadi akar cadangan: agent tetap bisa menyunting sumbernya
      // sendiri (itu memang fungsi self-agent), tapi tak bisa keluar dari pohon
      // WOLFSPACE. Pengurungan jadi sifat yang selalu ada, bukan yang menyala
      // hanya bila kebetulan ada proyek dipilih.
      const _confineRoot =
        (context && context.workspaceRoot) ||
        process.env.WW_WORKSPACE_ROOT ||
        QROOT;
      if (_confineRoot) {
        // Utama: pengurungan OS lewat namespace Linux — batas nyata, bukan regex.
        // Gerbangnya lewat kebijakan terpusat (agent/sandbox-policy.cjs) dengan
        // fallback "auto"; setelan eksplisit sandbox:false / WOLFSPACE_SANDBOX=off
        // tetap dihormati.
        //
        // Diuji 13/13 di WSL, termasuk 7 percobaan lolos: isi berkas host, /root,
        // /etc/passwd, naik direktori, tulis /bin, jaringan (diuji di level TCP
        // agar tak lulus hanya karena DNS mati), dan injeksi heredoc.
        if (
          process.env.WW_BASH_NATIVE !== "1" &&
          _sandboxPolicy.shouldSandbox(
            _sandboxPolicy.configSandbox(),
            _bashJail.tersedia(),
            "auto",
          )
        ) {
          // Penjaga path host tetap dipakai: jail hanya me-mount folder
          // workspace, jadi perintah yang menyebut path absolut host pasti tak
          // menemukannya — ditolak lebih awal dengan alasan yang jelas ketimbang
          // gagal dengan "No such file" yang membingungkan.
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
          return await _bashJail.jalankan(cmd, _confineRoot, {
            timeout: args.timeout || 60000,
            workdir: wd,
          });
        }
        // Cadangan: guard regex (bocor, defense-in-depth) saat namespace tak
        // tersedia — mis. di Windows, yang tak punya padanan di kernelnya.
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
        // Shell dipilih lewat adapter platform, BUKAN hardcode "cmd.exe".
        //
        // Dulu baris ini memanggil cmd.exe tanpa syarat. Di Windows itu benar,
        // tapi begitu backend dijalankan di Linux/WSL, interop WSL dengan patuh
        // meluncurkan cmd.exe Windows yang ASLI — lalu gagal:
        //     exit 2: '\\wsl.localhost\WolfspaceTest\root\wolfspace'
        //     CMD.EXE was started with the above path as the current directory.
        //     UNC paths are not supported.
        // Yang menyesatkan, perintah sesederhana `echo halo` tetap BERHASIL
        // (cmd.exe juga punya echo), sehingga kerusakannya hanya muncul pada
        // perintah khas Unix seperti `ls`. Adapter platform sudah ada dan
        // memang untuk ini: posix mengembalikan ['/bin/sh', ['-c', cmd]].
        const [shBin, shArgs] = getPlatformAdapter().shellFor(cmd);
        const child = spawn(shBin, shArgs, {
          cwd,
          windowsHide: true,
          env: _envBash(cwd),
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
          // AbortError bisa datang dari DUA sumber (timer timeout ATAU cancelCheck
          // user), dan `error` selalu menyala lebih dulu daripada `close` — spawn
          // dengan `signal` melempar error segera setelah abort(), sementara close
          // menunggu OS benar-benar mereap proses. Jadi cabang "TIMEOUT" di close
          // di bawah TAK PERNAH tercapai untuk kasus timeout: error menang duluan.
          // Diukur langsung: timeout 3s dilaporkan sebagai "DIBATALKAN: perintah
          // dihentikan oleh user" — model membaca ini sebagai "user menghentikan
          // saya", bukan "perintah saya terlalu lama", dan tak pernah belajar
          // memperpendek pekerjaannya. `aborted` hanya diset true oleh cancelCheck
          // (pembatalan user sungguhan), jadi itu yang membedakan keduanya.
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
    // ── Lampiran: barangnya sudah menyeberang, alamatnya tidak pernah ──
    //
    // Tak ada pemeriksaan path di sini, dan itu BUKAN kelalaian: jembatan
    // (agent/attachment-bridge.cjs) tak pernah menerima path, jadi tak ada
    // alamat yang bisa diperiksa maupun ditembus. Yang dipegang agent adalah
    // handle acak; memegangnya memberi tepat satu hal — isi satu berkas itu.
    // Ia tak memberi tahu berkas itu ada di mana, tak bisa dipakai membaca
    // saudaranya, dan tak bisa mendaftar isi direktori mana pun.
    //
    // Tetap lewat CommandChain supaya teraudit dan bisa DIKUNCI per sesi
    // (buatRuleset({ tanpa:["attachment.read"] })), mengikuti pola proc.raw.
    if (name === "attachment_list" || name === "attachment_read") {
      let bridge;
      try {
        bridge = require("../attachment-bridge.cjs");
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
        // enforced=true, dan ini SATU-SATUNYA kapabilitas berkas yang boleh
        // mengakuinya di Windows: jaminannya bukan pengurungan direktori
        // (yang memang advisory di sini) melainkan ketiadaan path sama sekali.
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

      // PTY adalah shell PENUH — apa pun yang diketik ke sini dieksekusi tanpa
      // melewati penjaga bash maupun gerbang kualitas. Selama tool ini rusak
      // (term=null) celah itu tak terlihat; begitu diperbaiki, ia langsung
      // terbukti: `echo "<40 spasi>" > x.jsx` lewat terminal_write mendarat utuh
      // di disk. Penjaga yang sama dengan bash/sandbox_run dipakai di sini.
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
    // ACTIVE: terminal_read is registered in tool-definitions.cjs and invoked by the agent
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
    if (name === "retrieve") {
      // RAG: recall PENGETAHUAN (memori proyek + docs). P1 = satu store "global"
      // agar ingest (frontend) & retrieve (di sini) selalu sekunci. Isolasi per-ww
      // (scope via workspaceRoot) = P3 — saat itu ingest juga dikunci ke ref sama.
      const rag = require("../rag.cjs");
      const out = rag.retrieveFormatted("global", args.query, {
        k: args.k,
        kind: args.kind || undefined,
      });
      return { ok: true, output: out };
    }
    if (name === "dspy") {
      // Real DSpy optimization via native JS (WOLFSPACE's cloud LLM, no Python)
      const dspyTool = require("./dspy_tool.cjs");
      return dspyTool.run(args);
    }
    if (name === "generate_3d") {
      // Text/image-to-3D via Replicate (TRELLIS + flux). Konfinemen keluaran ke
      // workspaceRoot ditangani di dalam modul.
      const g3 = require("./gen3d-tools.cjs");
      return await g3.generate3d(args, context);
    }
    // Tool disk_* DIHAPUS — dulu di sini ada disk_list/disk_read/disk_glob/
    // disk_grep yang menerima path SEMBARANG dan tak pernah melewati blok
    // `if (_wsRoot)` di atas, sehingga mereka mengabaikan pengurungan worktree
    // sepenuhnya.
    //
    // Mereka sudah lama dicabut dari SELF_TOOLS (lihat catatan di
    // tool-definitions.cjs), jadi model TIDAK BISA memanggilnya — implementasi
    // ini kode mati. Tapi kode mati yang menembus pengurungan adalah ranjau:
    // satu baris yang mengembalikannya ke daftar tool sudah cukup untuk
    // membatalkan seluruh pengurungan, tanpa satu pun tes menjadi merah.
    //
    // Fungsi disk-tools.cjs sendiri TETAP dipakai: diskListA/diskGlobA/
    // diskGrepA melayani list/glob/grep yang DIKURUNG ke _wsRoot, dan
    // resolveDiskPath dipakai bash untuk cwd. Yang dihapus jalur tool-nya,
    // bukan modulnya.

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
    if (name === "sandbox_run") {
      // Deskripsi tool ini menyatakan sendiri bahwa proses yang di-spawn punya
      // "normal OS-level filesystem access" — jadi ia bisa menulis berkas kode di
      // mana pun, melewati gerbang kualitas DAN syntax check. Terbukti empiris:
      // `echo "<40 spasi>" > public/x.jsx` mendarat utuh di disk.
      // Penjaga yang sama dengan bash dipakai di sini; batasnya juga sama sempit
      // (hanya yang menargetkan ekstensi kode).
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
      // Cakupan mengikuti workspace YANG SEDANG AKTIF, bukan WORKSPACE global.
      //
      // WORKSPACE adalah satu folder tetap di dalam pohon WOLFSPACE sendiri
      // (QROOT/workspace). Memakainya saat agent dikurung ke folder lain salah
      // di DUA arah sekaligus:
      //   1. bocor  — agent yang dikurung ke proyek X tetap diberi izin baca
      //      /tulis di dalam pohon WOLFSPACE. Itu justru menembus pengurungan
      //      yang dipasang read/write/edit/bash tepat di atas.
      //   2. lumpuh — request() ke berkas proyeknya SENDIRI selalu ditolak,
      //      sehingga capability_exec praktis tak bisa dipakai di mode ww.
      // Sumber cakupan disamakan dengan tool lain di berkas ini
      // (context.workspaceRoot -> WW_WORKSPACE_ROOT -> global).
      const workDir =
        (context && context.workspaceRoot) ||
        process.env.WW_WORKSPACE_ROOT ||
        WORKSPACE ||
        path.join(QROOT, "workspace");
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
      // Keluaran cetak zona ikut dilaporkan, tidak dibuang. Untuk sandbox,
      // console.log adalah cara utama orang melihat apa yang terjadi — dan
      // sebelumnya stdout tak pernah dibaca sama sekali, sehingga hilang DAN
      // menggantung prosesnya begitu melewati kapasitas buffer pipa.
      const _withIo = (teks, z) => {
        const bagian = [];
        if (z && z.stdout) bagian.push(z.stdout.trimEnd());
        if (z && z.stderr) bagian.push("[stderr]\n" + z.stderr.trimEnd());
        if (teks) bagian.push(teks);
        if (z && z.truncated) bagian.push("[keluaran dipotong]");
        // Penanda turunnya jaminan, di dalam keluaran yang DIBACA MODEL.
        // Kalau hanya ada di field terpisah, model tak akan melihatnya dan
        // tetap menyimpulkan "kode ini berjalan terkurung" — kesimpulan yang
        // salah, dan justru itu yang mahal.
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
