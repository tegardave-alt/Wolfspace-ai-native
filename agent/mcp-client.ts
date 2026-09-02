import * as fs from "fs";
import * as path from "path";
import { spawn, execFile } from "child_process";
const { dlog } = require("./debug.ts");

// Tracks the PIDs of MCP processes so leftovers from an earlier session can be
// cleaned up.
//
// ONE FILE PER OWNER: config/.mcp-pids/<owner-pid>.json, holding the list of
// server PIDs that process spawned. The owner is in the file NAME, not in its
// contents.
//
// Why this way and not one shared file. A shared file forces read-modify-write
// from many processes at once, and that is a race: two processes reading at the
// same time overwrite each other, one record is lost, and the unrecorded server
// is later killed as an "orphan" despite having an owner. Locking would work,
// but file locks on Windows bring their own problems (a stale lock when the
// holder dies, then a mechanism to seize it). With one file per owner, NO
// process ever writes another process's file — the race is gone by
// construction, without locks.
//
// Orphan = a file whose OWNER is dead. Before this, the file was shared and held
// only [pid, pid] with no trace of ownership, so every new process killed its
// neighbour's live servers. Measured across 3 concurrent processes: one waited
// 127 seconds and then ran with 26 of 50 tools — with no error at all.
// Afterwards: 22 seconds and 50 tools for all three.
const PID_DIR = path.join(__dirname, "..", "config", ".mcp-pids");
// The old file format. Read once, only to clean it up during the upgrade.
const LEGACY_PID_FILE = path.join(__dirname, "..", "config", ".mcp-pids.json");

function _alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function _ownFile(owner = process.pid) {
  return path.join(PID_DIR, owner + ".json");
}

// Entries are stored as {pid, ts}. The old format (a bare number) is still
// terbaca, but an entry without ts cannot be verified — see _bukanMilikKita.
function _readOwn(owner = process.pid) {
  try {
    const raw = JSON.parse(fs.readFileSync(_ownFile(owner), "utf8")) || [];
    return raw
      .map((e) => (typeof e === "number" ? { pid: e, ts: null } : e))
      .filter((e) => e && typeof e.pid === "number");
  } catch (_) {
    return [];
  }
}

function _writeOwn(entries, owner = process.pid) {
  if (!entries.length) {
    try {
      fs.unlinkSync(_ownFile(owner));
    } catch (_) {}
    return;
  }
  fs.writeFileSync(_ownFile(owner), JSON.stringify(entries), "utf8");
}

// Only the owner itself calls this for its own file, so read-modify-write is safe
// here: there is no other writer.
function _recordPid(pid) {
  try {
    if (!fs.existsSync(PID_DIR)) fs.mkdirSync(PID_DIR, { recursive: true });
    const mine = _readOwn();
    if (mine.some((e) => e.pid === pid)) return;
    // ts distinguishes our process from another that later reuses the same PID
    // number. See _bukanMilikKita.
    mine.push({ pid, ts: Date.now() });
    _writeOwn(mine);
  } catch (_) {}
}

// Called when a server stops normally. Without it an owner file only grows: dead
// PIDs pile up forever, and every one of them is a candidate victim of PID reuse
// on the next cleanup.
function _forgetPid(pid) {
  try {
    const mine = _readOwn();
    const sisa = mine.filter((e) => e.pid !== pid);
    if (sisa.length !== mine.length) _writeOwn(sisa);
  } catch (_) {}
}

// Tolerated gap between a process's start time and the moment we record it.
// Recording happens a few milliseconds after spawn, so start <= ts always holds;
// this window only absorbs clock imprecision. A process from PID reuse starts far
// later — usually hours — and is caught easily.
const TOLERANSI_MULAI_MS = 15000;

// The PowerShell side of _waktuMulai, kept as data so the arguments never pass
// through a shell. execSync used to take one long command string, which meant
// every quote in it existed only to survive cmd.exe.
const _SKRIP_MULAI =
  "Get-CimInstance Win32_Process | " +
  "Where-Object { $_.CreationDate } | ForEach-Object { " +
  "\"$($_.ProcessId) $($_.CreationDate.ToUniversalTime().ToString('o'))\" }";

/**
 * Process start time in epoch milliseconds, for a set of PIDs at once. PIDs that
 * cannot be read are left out of the Map.
 *
 * ASYNCHRONOUS, AND THAT IS THE WHOLE POINT. This used to be execSync, and it is
 * the single most expensive blocking call left in the agent: measured at
 * 823/865/1143/1322/1775 ms across six runs. In desktop mode the backend lives
 * in Electron's main process, so every one of those milliseconds was a window
 * that did not pump its message queue — up to a third of the 5000 ms budget that
 * makes Windows draw "Not Responding".
 *
 * Filtering the query to just the PIDs being asked about was tried first and
 * REJECTED on measurement: 698 ms against 823 ms, a 17% saving. The cost is
 * starting PowerShell, not enumerating processes, so narrowing the query solves
 * nothing. Not blocking on it does.
 */
async function _waktuMulai(pids) {
  const peta = new Map();
  if (!pids.length) return peta;
  try {
    if (process.platform === "win32") {
      const out: string = await new Promise((selesai, gagal) => {
        execFile(
          "powershell",
          ["-NoProfile", "-NonInteractive", "-Command", _SKRIP_MULAI],
          { encoding: "utf8", timeout: 20000, windowsHide: true },
          (err, stdout) => (err ? gagal(err) : selesai(String(stdout))),
        );
      });
      for (const baris of out.split("\n")) {
        const [p, iso] = baris.trim().split(/\s+/);
        const pid = parseInt(p, 10);
        const ms = Date.parse(iso);
        if (Number.isFinite(pid) && Number.isFinite(ms)) peta.set(pid, ms);
      }
    } else if (process.platform === "linux") {
      // starttime = field 22 of /proc/<pid>/stat, in clock ticks since boot.
      // Field 2 is comm, which may contain spaces and parentheses, so the split
      // is taken after the LAST ')'.
      const btime = (fs
        .readFileSync("/proc/stat", "utf8")
        .match(/^btime (\d+)/m) || [])[1];
      if (!btime) return peta;
      const HZ = 100; // USER_HZ, fixed at 100 on every mainstream Linux
      for (const pid of pids) {
        try {
          const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
          const medan = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
          const tick = Number(medan[19]); // field 22 minus the first 2 fields
          if (Number.isFinite(tick))
            peta.set(pid, (Number(btime) + tick / HZ) * 1000);
        } catch (_) {}
      }
    }
  } catch (_) {}
  return peta;
}

// A PID number is not an identity: the operating system reuses them. A PID we
// recorded and that later died can be taken over by another application, and
// killing it means killing someone else's process — logged as if cleanup had
// succeeded. Start time separates the two: our process started at or before the
// moment we recorded it, a new occupant always well after.
function _bukanMilikKita(entri, mulai) {
  if (!entri.ts) return false; // old-format entry: no basis on which to refuse
  const t = mulai.get(entri.pid);
  if (t === undefined) return false; // unreadable: do not invent a conclusion
  return t > entri.ts + TOLERANSI_MULAI_MS;
}

/**
 * Resolves a bare command against PATH and PATHEXT, the way CreateProcess does.
 *
 * WHY IT EXISTS. _startServer used to pass `shell: true` on Windows for EVERY
 * command, and Node warns about that for good reason (DEP0190): with a shell,
 * arguments are not escaped, only concatenated into one command line. MCP
 * commands and their arguments come from config/mcp.json, so a `&` or `|` in
 * an argument is a second command, not a string.
 *
 * The shell was not gratuitous: `npx` on Windows is `npx.cmd`, and Node refuses
 * to spawn .cmd/.bat without one. So the fix is not to drop the shell — it is to
 * stop reaching for it when the target is a real executable.
 *
 * Returns the resolved path, or null when nothing matches. Null is not a
 * failure: the caller then keeps the old behaviour rather than turning a working
 * configuration into a broken one.
 */
/**
 * Quote ONE token for a cmd.exe command line.
 *
 * Windows hands a process a command LINE, not an argv array, so every token
 * carrying a separator has to bring its own quotes. Backslashes are special
 * only immediately before a quote, which is why the doubling below is
 * conditional rather than applied everywhere.
 *
 * `%` is deliberately NOT handled. cmd expands %VAR% even inside double quotes
 * and there is no escape for it outside a batch file, so an argument that must
 * contain a literal percent sign cannot survive cmd at all — better that it
 * stay visibly unsupported than be silently half-escaped.
 */
function _kutipCmd(token: any): string {
  const s = String(token == null ? "" : token);
  if (s === "") return '""';
  if (!/[\s"^&|<>()]/.test(s)) return s;
  const isi = s
    // A run of backslashes before a quote doubles, and the quote is escaped.
    .replace(/(\\*)"/g, '$1$1\\"')
    // A trailing run doubles too, so it cannot escape the closing quote.
    .replace(/(\\+)$/, "$1$1");
  return '"' + isi + '"';
}

function _cariExe(cmd: string, env: any): string | null {
  if (!cmd) return null;
  if (cmd.includes("/") || cmd.includes("\\")) {
    try {
      return fs.statSync(cmd).isFile() ? cmd : null;
    } catch (_) {
      return null;
    }
  }
  const exts =
    process.platform === "win32"
      ? String(env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .filter(Boolean)
      : [""];
  const dirs = String(env.PATH || env.Path || "")
    .split(path.delimiter)
    .filter(Boolean);
  for (const d of dirs) {
    for (const e of exts) {
      const p = path.join(d, cmd + e);
      try {
        if (fs.statSync(p).isFile()) return p;
      } catch (_) {}
    }
  }
  return null;
}

async function _killPids(entries, asal) {
  const hidup = entries.filter((e) => _alive(e.pid));
  if (!hidup.length) return;
  const mulai = await _waktuMulai(hidup.map((e) => e.pid));
  for (const e of hidup) {
    try {
      if (_bukanMilikKita(e, mulai)) {
        dlog(
          "mcp",
          "info",
          `PID ${e.pid} skipped: the number has already been recycled.`,
          {
            asal,
            dicatat: new Date(e.ts).toISOString(),
            mulai: new Date(mulai.get(e.pid)).toISOString(),
          },
        );
        continue;
      }
      process.kill(e.pid);
      dlog("mcp", "info", `MCP orphan PID ${e.pid} dihentikan.`, { asal });
    } catch (_) {}
  }
}

async function _killOrphans() {
  // Migrating the old file format: with no owner recorded, its contents cannot be
  // claimed by anyone, so they are treated as orphans and the file is discarded.
  try {
    if (fs.existsSync(LEGACY_PID_FILE)) {
      const raw = JSON.parse(fs.readFileSync(LEGACY_PID_FILE, "utf8")) || [];
      const pids = raw
        .map((e) => (typeof e === "number" ? { pid: e, ts: null } : e))
        .filter((e) => e && typeof e.pid === "number");
      if (pids.length) await _killPids(pids, "stale-file");
      fs.unlinkSync(LEGACY_PID_FILE);
    }
  } catch (_) {}

  let files: string[] = [];
  try {
    files = fs.readdirSync(PID_DIR);
  } catch (_) {
    return; // the directory does not exist yet — nothing to clean up
  }

  let dibersihkan = 0;
  let dipertahankan = 0;
  for (const f of files) {
    const owner = parseInt(path.basename(f, ".json"), 10);
    if (!Number.isFinite(owner)) continue;
    // The owner is still alive (this process included) -> DO NOT touch.
    if (_alive(owner)) {
      dipertahankan++;
      continue;
    }
    await _killPids(_readOwn(owner), "pemilik-" + owner);
    dibersihkan++;
    try {
      fs.unlinkSync(path.join(PID_DIR, f));
    } catch (_) {}
  }
  if (dibersihkan) {
    dlog("mcp", "info", `Membersihkan ${dibersihkan} sesi MCP yatim.`, {
      dipertahankan,
    });
  }
}

const CONFIG_PATH = path.join(__dirname, "..", "config", "mcp.json");

// MCP server arguments carry credentials, and those arguments ARE LOGGED.
//
// Proven in a real debug file (%TEMP%/WOLFSPACE-debug.log), printed in full:
//   Memulai server MCP: figma {"cmd":"npx","args":[...,"--figma-api-key=figd_kQW…"]}
// along with remote server URLs complete with the token in the query string. That
// file is not gitignored, is never cleaned, and rotates only by size — so the
// secret sits on disk until it is pushed out.
//
// env was deliberately never logged; this closes the equivalent hole on argv.
// Only the VALUE is redacted — the flag name stays visible so the log remains
// useful for diagnosing a wrong command.
const _RAHASIA_ARG =
  /(key|token|secret|password|passwd|auth|credential|api[-_]?key)/i;
function _argsAman(args) {
  if (!Array.isArray(args)) return args;
  return args.map((a) => {
    const s = String(a);
    // --flag=nilai
    const m = s.match(
      /^(--?[\w-]*(?:key|token|secret|password|auth)[\w-]*)=(.+)$/i,
    );
    if (m) return m[1] + "=***";
    // URL: drop the query string and userinfo, keep origin + path
    if (/^https?:\/\//i.test(s)) {
      try {
        const u = new URL(s);
        return u.origin + u.pathname + (u.search ? "?***" : "");
      } catch (_) {
        return "***";
      }
    }
    // A bare value that looks like a long token
    if (s.length > 24 && !s.includes(" ") && _RAHASIA_ARG.test(s)) return "***";
    return s;
  });
}

// Panggilan tool nyata boleh lama (kueri Notion, dsb).
const REQUEST_TIMEOUT_MS = 120000;
// A handshake fails faster than a tool call. What matters most is actually the
// PARALLEL start above: with sequential `await`, two misbehaving servers made
// getTools() — which blocks the agent's FIRST step — hang for 240 seconds. In
// parallel the worst case is ONE server's timeout rather than their sum.
//
// 60 seconds, not less. A 25-second attempt REGRESSED: across 4 simultaneous
// cold processes, `npx` instances fought over the npm cache and the handshake
// did not finish within 25 s — the result was 24/0/24/24 tools out of 50. One
// process alone needs 13 s, so the margin has to be wide enough for cold-start
// contention.
const HANDSHAKE_TIMEOUT_MS = 60000;

// How many stderr lines to keep per server, so a failure can say WHY. Small on
// purpose: this exists to quote the last few lines back to the user, not to
// buffer the output of a server that fails by shouting.
const STDERR_DISIMPAN = 40;

/** A configured MCP server, as written in config/mcp.json. */
interface KonfigServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  disabled?: boolean;
  [k: string]: unknown;
}

// A running server: its child process, whether the handshake completed, and the
// verdict of the most recent real tool call.
//
// The last* fields are what make status() honest: a server can start cleanly and
// then fail every single API call — exactly what happens when a GitHub token is
// revoked while the UI still reads "Connected". They are assigned by _catat()
// after the handshake, so they are optional here rather than set in _startServer.
interface ServerHidup {
  proc: import("child_process").ChildProcessWithoutNullStreams;
  ready: boolean;
  lastCallAt?: number;
  lastCallOk?: boolean;
  lastError?: string | null;
  /**
   * The server's last stderr lines, capped at STDERR_DISIMPAN.
   *
   * Kept so a failed handshake can report WHY. Without it the user was told
   * "Failed to initialise MCP server X" while the npm 404 that explains it sat
   * in the debug log.
   */
  stderrAkhir?: string[];
}

/** A tool definition in the SELF_TOOLS shape WOLFSPACE's agent loop consumes. */
interface DefinisiAlat {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

/** One item of an MCP tools/call content array. */
interface IsiBalasan {
  text?: string;
  [k: string]: unknown;
}

/** One tool as advertised by a server's tools/list response. */
interface AlatMCP {
  name: string;
  description?: string;
  inputSchema?: unknown;
  [k: string]: unknown;
}

// A JSON-RPC request still awaiting its response, keyed by message id.
//
// `resolve` is intentionally (nilai: any): one map holds the pending requests of
// EVERY method at once, each with a different response type, so there is no
// single T that fits. The type safety lives at the call sites instead, where
// _request<T>() names the shape that method actually returns.
interface ReqTertunda {
  resolve: (nilai: any) => void;
  reject: (alasan: Error) => void;
  timer?: NodeJS.Timeout;
  [k: string]: unknown;
}

class MCPClient {
  // Fields are DECLARED, not merely assigned in the constructor. TypeScript does
  // not infer class fields from `this.x =` the way JavaScript does, so without
  // this block 33 of this file's first 41 errors were one and the same cause
  // repeated over and over.
  servers: Record<string, ServerHidup>;
  toolsCache: Record<string, AlatMCP[]>;
  msgId: number;
  pendingReqs: Record<number, ReqTertunda>;
  initialized: boolean;
  /** Handshakes still in flight — what status() reports as `starting`. */
  _mulai: Record<string, Promise<void> | undefined>;
  /** Why the last start failed, kept outside this.servers (see the field's use). */
  _galatMulai: Record<string, string | undefined>;

  constructor() {
    this.servers = {}; // serverName -> process info
    this.toolsCache = {}; // serverName -> array of tools
    this.msgId = 1;
    this.pendingReqs = {}; // msgId -> { resolve, reject }
    this.initialized = false;
    // Handshakes still running. A connect returns as soon as the process is
    // SPAWNED, so this is what "starting" means to status() afterwards.
    this._mulai = {}; // serverName -> Promise
    // Why the last start failed, kept OUTSIDE this.servers because a failed
    // start deletes that record — the reason would die with the thing that
    // needed to explain itself.
    this._galatMulai = {}; // serverName -> string
  }

  // The file contents AS THEY ARE.
  //
  // REQUIRED for anything that will WRITE back: only what is actually in the
  // file may be written to the file. _loadConfig() below normalises the shape
  // for readers and must never be the thing that gets saved.
  _loadConfigMentah() {
    try {
      if (fs.existsSync(CONFIG_PATH))
        return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    } catch (e) {
      dlog("mcp", "error", "Failed to load mcp.json", { error: e.message });
    }
    return {};
  }

  _loadConfig() {
    const dasar = this._loadConfigMentah();

    // Normalised for READERS. Never the thing that gets saved — see
    // _loadConfigMentah above.
    return { ...dasar, mcpServers: { ...(dasar.mcpServers || {}) } };
  }

  // Starting MCP servers NO LONGER happens automatically.
  //
  // WHY THIS CHANGED. init() used to spawn EVERY server that was not disabled,
  // and getTools() called it — that is, on the FIRST step of an agent run. The
  // cost was measured directly: 60.3 seconds of silence with not a single event,
  // because each server had to `npx` first and its handshake was allowed up to
  // HANDSHAKE_TIMEOUT_MS. That price was paid EVERY session, for servers that
  // might not be used in it at all.
  //
  // Now: init() only clears orphaned processes from the previous session. Servers
  // start when the user presses Connect (addServer / connectServer) and STAY up
  // for later sessions because the instance is a singleton on globalThis. So the
  // agent uses what is already connected instead of waiting for everything to
  // start.
  //
  // Servers running when the backend hot-reloads do not die with it — this.servers
  // survives (see mcp-hot-reload.test.js).
  async init() {
    if (this.initialized) return;
    // Orphaned MCP processes from earlier sessions are still cleaned up: without
    // that, the next Connect adds a duplicate instead of replacing.
    //
    // AWAITED now that the sweep is asynchronous. `initialized` is set only
    // AFTER it finishes, so two callers arriving together cannot both decide the
    // cleanup still has to run.
    await _killOrphans();
    this.initialized = true;
  }

  // Menyalakan SATU server atas permintaan (tombol Connect di UI).
  // Idempotent: a server already ready is not respawned.
  async connectServer(name, opsi: any = {}) {
    // The single-server path used to SKIP this while connectAll() called it, so
    // orphan cleanup ran only if you happened to press "Connect All". Pressing
    // Connect on servers one at a time — the normal way to use the UI — left
    // every leftover from the previous session running.
    //
    // The two paths were not different by decision, they were different by
    // oversight, and the difference happened to hide the cost: the sweep held
    // the main thread for up to 1775 ms. That is why it was made asynchronous
    // first (see _waktuMulai) and only then made consistent. Doing it the other
    // way round would have added a freeze to the button people press most.
    await this.init();
    const cfg = this._loadConfig().mcpServers || {};
    const conf = cfg[name];
    if (!conf) return { ok: false, error: "MCP server is not in the config" };
    if (conf.disabled) return { ok: false, error: "MCP server dinonaktifkan" };
    const ada = this.servers[name];
    if (ada && ada.ready) return { ok: true, already: true };
    if (this._mulai[name]) return { ok: true, status: "starting" };
    if (ada && ada.proc) this.stopServer(name); // setengah jalan -> mulai bersih
    return this._mulaiServer(name, conf, opsi.tunggu === true);
  }

  /**
   * Spawn, and DO NOT wait for the handshake unless asked to.
   *
   * WHY. The handshake is allowed 60 seconds — deliberately, because `npx` cold
   * starts contend over the npm cache — and it used to be awaited all the way up
   * the call chain: _startServer -> connectServer -> the /mcp route -> the
   * backend host -> main. The host answers requests on that path, so pressing
   * Connect stopped it answering ANY of them. The probe reported exactly that:
   *
   *   "backend-host gagal api: host backend tak menjawab dalam 30000 ms"
   *
   * Nothing was broken; a connection that was merely slow made the whole app
   * look hung, and the user's only evidence was a window that stopped painting.
   *
   * So connecting now returns once the process EXISTS. Readiness is reported by
   * status(), which the UI already polls — the information was always there, it
   * was the waiting that was wrong.
   */
  _mulaiServer(name, conf, tunggu) {
    const p = this._startServer(name, conf);
    this._mulai[name] = p;
    delete this._galatMulai[name];
    const selesai = p.then(
      () => {
        delete this._mulai[name];
        return { ok: true };
      },
      (e) => {
        delete this._mulai[name];
        // stopServer() has already dropped this.servers[name] by now, so the
        // reason is kept here or it is lost.
        this._galatMulai[name] = e.message;
        return { ok: false, error: e.message };
      },
    );
    if (tunggu) return selesai;
    return { ok: true, status: "starting" };
  }

  // Starts EVERY server that is not disabled — used by the "Connect All" button
  // and by older paths that really do want everything running. In parallel, not
  // sequentially: with `await` inside the loop the wait is the SUM over all
  // servers rather than the longest one.
  async connectAll() {
    await this.init();
    const srvs = this._loadConfig().mcpServers || {};
    const hasil = {};
    await Promise.all(
      Object.entries(srvs)
        .filter(([, conf]) => !(conf as KonfigServer).disabled)
        .map(async ([name]) => {
          hasil[name] = await this.connectServer(name);
        }),
    );
    return hasil;
  }

  _startServer(name: string, conf: KonfigServer) {
    // Promise<void>: resolve() is called with no value, and without the type
    // this, TypeScript infers Promise<unknown> and then demands an argument.
    return new Promise<void>((resolve, reject) => {
      // Settled once. The handshake and the process's own death race each
      // other, and after a failure stopServer() kills the child -- which fires
      // `close` again. Without this flag that second path would reject an
      // already-settled promise and, worse, overwrite the real reason.
      let sudahSelesai = false;
      dlog("mcp", "info", `Memulai server MCP: ${name}`, {
        cmd: conf.command,
        args: _argsAman(conf.args),
      });

      const env = { ...process.env, ...conf.env };
      const cmd =
        process.platform === "win32" && conf.command === "npx"
          ? "npx.cmd"
          : conf.command;
      // cwd IS FORWARDED. It used to be silently ignored: the config was allowed
      // to state it, and spawn never used it.
      //
      // The consequence was real, not theoretical. The Penpot MCP server looks for
      // its config file relative to cwd (`data/initial_instructions.md`), so it
      // always looked in the WOLFSPACE root and died at startup with
      // "Configuration file not found" — a message pointing at a path that was
      // never there.
      // SHELL ONLY WHEN THE TARGET NEEDS ONE.
      //
      // This was `shell: process.platform === "win32"` — unconditionally, for
      // every command. Node flags it as DEP0190 because with a shell the
      // arguments are concatenated into one command line rather than escaped, so
      // a `&` or `|` inside an argument stops being text and becomes a second
      // command. Those arguments come from config/mcp.json, which is close
      // enough to input to be worth closing.
      //
      // Dropping the shell outright is not an option: `npx` on Windows is
      // npx.cmd, and Node refuses to spawn .cmd/.bat without one. So the command
      // is resolved first — a real .exe is spawned directly with the arguments
      // passed as a vector, and only .cmd/.bat still go through cmd.exe.
      //
      // An unresolvable command keeps the OLD behaviour rather than failing. The
      // point is to shrink the surface, not to break a configuration that works
      // today for a resolver that guessed wrong.
      const tersolusi = _cariExe(cmd, env);
      const perluShell =
        process.platform === "win32" &&
        (!tersolusi || /\.(cmd|bat)$/i.test(tersolusi));
      // NOT `shell: true`. Node concatenates the arguments into one command line
      // WITHOUT quoting them — its own DEP0190 warning says exactly that — so an
      // argument containing a space silently becomes two.
      //
      // MEASURED, not assumed: ["-y", "hugging face"] reached the child as
      // ["-y", "hugging", "face"], and npm went looking for a package named
      // `hugging`. A Windows path like C:\Program Files\... breaks the same way,
      // and nothing in the resulting error points back at the cause.
      //
      // cmd.exe is invoked the way Node would have (/d /s /c, the whole line
      // wrapped, windowsVerbatimArguments so Node does not re-mangle it) — but
      // the line is built HERE, with every token quoted.
      const proc = perluShell
        ? spawn(
            process.env.ComSpec || "cmd.exe",
            [
              "/d",
              "/s",
              "/c",
              '"' + [cmd, ...(conf.args || [])].map(_kutipCmd).join(" ") + '"',
            ],
            {
              env,
              cwd: conf.cwd || undefined,
              windowsVerbatimArguments: true,
            },
          )
        : spawn(tersolusi || cmd, conf.args || [], {
            env,
            cwd: conf.cwd || undefined,
          });

      let buffer = "";

      proc.stdout.on("data", (data) => {
        buffer += data.toString();
        let nlIdx;
        while ((nlIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nlIdx).trim();
          buffer = buffer.slice(nlIdx + 1);
          if (line) this._handleMessage(name, line);
        }
      });

      // stderr is KEPT, not only logged.
      //
      // A failed handshake used to reach the user as "Failed to initialise MCP
      // server X" and nothing else, while the actual reason — `npm error 404`,
      // a missing API key, a native build failing — sat in the debug log where
      // only someone who knew to look would find it. The reason and the report
      // were in two different places, so the report was useless.
      //
      // Bounded on purpose: a server that fails by shouting must not turn a
      // failure into a memory problem as well.
      proc.stderr.on("data", (data) => {
        const teks = data.toString().trim();
        dlog("mcp", "warn", `[MCP ${name} stderr] ${teks}`);
        const srv = this.servers[name];
        if (srv && teks) {
          srv.stderrAkhir = (srv.stderrAkhir || [])
            .concat(teks.split(/\r?\n/).filter(Boolean))
            .slice(-STDERR_DISIMPAN);
        }
      });

      // A server can exit between spawn and the initialize write. Without a
      // listener on stdin, Windows emits EPIPE as an uncaught stream error and
      // takes down the whole Electron main process. Treat it as a failed MCP
      // connection; connectServer() will return the error to the UI instead.
      proc.stdin.on("error", (err) => {
        dlog("mcp", "error", `[MCP ${name} stdin error]`, {
          error: err.message,
        });
      });

      proc.on("error", (err) => {
        dlog("mcp", "error", `[MCP ${name} process error]`, {
          err: err.message,
        });
      });

      proc.on("close", (code) => {
        dlog("mcp", "info", `MCP server ${name} closed with code ${code}`);
        // A server that died on its own must have its record dropped too;
        // stopServer alone is not enough, because this path does not go through it.
        if (proc.pid) _forgetPid(proc.pid);
        const srv = this.servers[name];
        const kata = (srv && srv.stderrAkhir) || [];
        delete this.servers[name];
        delete this.toolsCache[name];

        // A DEAD PROCESS IS AN ANSWER. Without this the handshake kept waiting
        // for a reply from something that no longer existed, and the caller sat
        // out the full HANDSHAKE_TIMEOUT_MS — sixty seconds to learn that npm
        // had already said "404" and exited within two.
        //
        // That is the shape of the reported failure: `npx -y "hugging face"`
        // died almost immediately, and the UI still waited.
        if (!sudahSelesai) {
          sudahSelesai = true;
          const sebab = kata.length
            ? " — " + kata.slice(-4).join(" | ").slice(0, 500)
            : "";
          reject(
            new Error(
              "the server exited with code " +
                code +
                " before it was ready" +
                sebab,
            ),
          );
        }
      });

      this.servers[name] = { proc, ready: false };

      // Record into THIS PROCESS's own file. Ownership is implied by the file
      // name, so other processes know this server still has an owner without any
      // coordination.
      if (proc.pid) _recordPid(proc.pid);

      // Lakukan Initialize handshake
      this._request(
        name,
        "initialize",
        {
          protocolVersion: "2024-11-05",
          capabilities: {
            roots: { listChanged: true },
            sampling: {},
          },
          clientInfo: { name: "WOLFSPACE", version: "1.0.0" },
        },
        HANDSHAKE_TIMEOUT_MS,
      )
        .then(() => {
          // Kirim initialized notifikasi
          this._notify(name, "notifications/initialized", {});
          if (this.servers[name]) {
            this.servers[name].ready = true;
            dlog("mcp", "info", `MCP server ${name} ready.`);
          }
          sudahSelesai = true;
          resolve();
        })
        .catch((err) => {
          sudahSelesai = true;
          // Carry the server's OWN last words back to the caller. Everything
          // below this point tears the process down, so this is the last moment
          // the reason still exists.
          const srv = this.servers[name];
          const kata = (srv && srv.stderrAkhir) || [];
          if (kata.length) {
            err = new Error(
              err.message + " — " + kata.slice(-4).join(" | ").slice(0, 500),
            );
          }
          dlog("mcp", "error", `Failed to initialise MCP server ${name}`, {
            err: err.message,
          });
          // The process is stopped HERE, not left for the next attempt.
          //
          // Without this the child survived a failed handshake. It was cleaned up
          // eventually — connectServer() calls stopServer() when it finds a
          // half-started record — but only when the user pressed Connect again,
          // and in the meantime the process kept running.
          //
          // That gap is not harmless, because of what these processes are: the
          // handshake timeout is 60 s and the reason it has to be that wide is
          // `npx` instances fighting over the npm cache during cold start (see
          // HANDSHAKE_TIMEOUT_MS — a 25 s attempt produced 24/0/24/24 tools out
          // of 50). A leaked `npx` from a FAILED attempt is one more contender in
          // exactly that fight, so each failure made the next one likelier. That
          // is the shape of the symptom users report: connecting works, then
          // "sometimes" it does not, and the sometimes gets worse over a session.
          //
          // stopServer() rather than proc.kill() so this path drops the PID
          // record and the tools cache the same way every other failure path
          // does — a PID left recorded after death is a candidate victim of
          // number reuse, which _bukanMilikKita() exists to prevent.
          try {
            this.stopServer(name);
          } catch (_) {}
          reject(err);
        });
    });
  }

  _saveConfig(configData) {
    try {
      const dir = path.dirname(CONFIG_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(configData, null, 2));
    } catch (e) {
      dlog("mcp", "error", "Failed to save mcp.json", { error: e.message });
    }
  }

  stopServer(name) {
    const srv = this.servers[name];
    if (srv && srv.proc) {
      dlog("mcp", "info", `Menghentikan MCP server: ${name}`);
      try {
        srv.proc.kill();
      } catch (e) {}
      // The record is dropped here rather than waiting for orphan cleanup: a PID
      // already dead but still recorded is a candidate victim of number reuse.
      if (srv.proc.pid) _forgetPid(srv.proc.pid);
      delete this.servers[name];
      delete this.toolsCache[name];
    }
  }

  async addServer(name, conf) {
    this.stopServer(name);
    // RAW: only what is actually in the file is written back to the file.
    const config = this._loadConfigMentah();
    if (!config.mcpServers) config.mcpServers = {};
    config.mcpServers[name] = conf;
    this._saveConfig(config);
    // Same reasoning as connectServer: the config is SAVED synchronously, so the
    // answer is honest the moment it is sent, but the handshake is not waited
    // for. Adding a server used to hold the backend host for up to 60 seconds
    // exactly like connecting one did.
    return this._mulaiServer(name, conf, false);
  }

  removeServer(name) {
    this.stopServer(name);
    // RAW: only what is actually in the file may be deleted from the file.
    const config = this._loadConfigMentah();
    // Tell "deleted" apart from "never existed": both used to answer {ok:true},
    // so a typo in the name looked like success while the UI silently did nothing.
    const existed = !!(config.mcpServers && config.mcpServers[name]);
    if (existed) {
      delete config.mcpServers[name];
      this._saveConfig(config);
    }
    return { ok: true, removed: existed };
  }

  async toggleServer(name, enabled) {
    // RAW: only what is actually in the file is written back to the file.
    const config = this._loadConfigMentah();
    if (!config.mcpServers || !config.mcpServers[name]) {
      return { ok: false, error: "MCP server not found in configuration" };
    }
    const conf = config.mcpServers[name];
    if (!enabled) {
      this.stopServer(name);
      conf.disabled = true;
      this._saveConfig(config);
      return { ok: true, enabled: false };
    } else {
      delete conf.disabled;
      this._saveConfig(config);
      // Through connectServer rather than _startServer directly: it is idempotent
      // (a server already ready is not respawned) and it cleans up half-started
      // processes. Without that, starting twice leaves an orphan that this.servers
      // never recorded.
      const r: any = await this.connectServer(name);
      return r.ok ? { ok: true, enabled: true } : { ok: false, error: r.error };
    }
  }

  getServers() {
    return this._loadConfig().mcpServers || {};
  }

  _send(name, msg) {
    const srv = this.servers[name];
    if (!srv || !srv.proc || !srv.proc.stdin || srv.proc.stdin.destroyed)
      return false;
    const str = JSON.stringify(msg) + "\r\n";
    try {
      srv.proc.stdin.write(str);
      return true;
    } catch (e) {
      dlog("mcp", "error", `Failed to write to MCP server ${name}`, {
        error: e.message,
      });
      return false;
    }
  }

  _notify(name, method, params) {
    this._send(name, { jsonrpc: "2.0", method, params });
  }

  // timeoutMs is overridable: an `initialize` handshake must fail FAST.
  // A healthy server answers a handshake in seconds, so its timeout is short;
  // real tool calls can legitimately take a while and keep the 120 s budget.
  _request<T = unknown>(
    name: string,
    method: string,
    params?: unknown,
    timeoutMs = REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = this.msgId++;
      // Generic: each caller names the response shape it expects, so tools/list and
      // tools/call get real types instead of `any` on both sides.
      const timer = setTimeout(() => {
        if (this.pendingReqs[id]) {
          delete this.pendingReqs[id];
          reject(new Error(`Timeout MCP request: ${method}`));
        }
      }, timeoutMs);
      if (timer.unref) timer.unref();
      this.pendingReqs[id] = {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      };
      if (!this._send(name, { jsonrpc: "2.0", id, method, params })) {
        delete this.pendingReqs[id];
        clearTimeout(timer);
        reject(new Error(`MCP server ${name} stdin is unavailable`));
      }
    });
  }

  _handleMessage(name, line) {
    try {
      const msg = JSON.parse(line);
      // A response if it has an id and no method
      if (msg.id !== undefined && !msg.method) {
        const p = this.pendingReqs[msg.id];
        if (p) {
          delete this.pendingReqs[msg.id];
          if (msg.error)
            p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else p.resolve(msg.result);
        }
      } else if (msg.method) {
        // A notification or request from the server (ping, for instance)
        dlog(
          "mcp",
          "info",
          `Menerima request/notif dari ${name}: ${msg.method}`,
        );
      }
    } catch (e) {
      dlog("mcp", "warn", `Failed to parse MCP message from ${name}`, {
        text: line,
        err: e.message,
      });
    }
  }

  // Returns tools from servers that are ALREADY connected. It no longer starts
  // anything: init() now only cleans up orphaned processes, and starting is an
  // explicit user action through Connect. This is what keeps the agent's first
  // step free of the `npx` cold start of every server.
  async getTools() {
    await this.init();
    const allTools: DefinisiAlat[] = [];

    for (const name of Object.keys(this.servers)) {
      if (!this.servers[name].ready) continue;

      try {
        if (!this.toolsCache[name]) {
          const res = await this._request<{ tools?: AlatMCP[] }>(
            name,
            "tools/list",
            {},
          );
          this.toolsCache[name] = res.tools || [];
        }

        // Reshape the tool into WOLFSPACE's SELF_TOOLS format
        for (const t of this.toolsCache[name]) {
          const toolName = `mcp_${name}_${t.name}`; // Prefix with the server name to avoid name collisions
          const def: DefinisiAlat = {
            type: "function",
            function: {
              name: toolName,
              description: `[MCP Server: ${name}] ${t.description || ""}`,
              parameters: t.inputSchema || { type: "object", properties: {} },
            },
          };
          allTools.push(def);
        }
      } catch (e) {
        dlog("mcp", "error", `Failed to fetch tools from ${name}`, {
          error: e.message,
        });
      }
    }
    return allTools;
  }

  async callTool(prefixedToolName, args) {
    // prefixedToolName format: mcp_{serverName}_{toolName}
    const match = prefixedToolName.match(/^mcp_([^_]+)_(.+)$/);
    if (!match)
      return {
        ok: false,
        output: `Invalid MCP tool name: ${prefixedToolName}`,
      };

    const serverName = match[1];
    const toolName = match[2];

    if (!this.servers[serverName] || !this.servers[serverName].ready) {
      return { ok: false, output: `Server MCP ${serverName} is not active.` };
    }

    // STRIP WOLFSPACE-INTERNAL arguments before crossing into the MCP protocol.
    // self_agent.ts injects `rencana_tindakan` (chain-of-thought) into the schema
    // of EVERY tool, MCP tools included. An MCP server validates arguments against
    // its own schema, which knows no such field, and REJECTS the call — the
    // symptom being MCP "connected" while every call fails. self_agent has already
    // consumed that field (emit thought) BEFORE dispatch, so dropping it here
    // removes nothing from the UI. This is the right boundary: one place, applying
    // to every MCP server.
    const INTERNAL_ARGS = ["rencana_tindakan"];
    let wireArgs = args;
    if (args && typeof args === "object" && !Array.isArray(args)) {
      wireArgs = {};
      for (const k of Object.keys(args)) {
        if (!INTERNAL_ARGS.includes(k)) wireArgs[k] = args[k];
      }
    }

    try {
      dlog("mcp", "info", `Memanggil tool MCP: ${toolName} di ${serverName}`, {
        args: wireArgs,
      });
      const res = await this._request<{
        isError?: boolean;
        content?: IsiBalasan[];
      }>(serverName, "tools/call", {
        name: toolName,
        arguments: wireArgs,
      });

      // Format balasan MCP
      if (res.isError) {
        const pesan = (res.content || []).map((c) => c.text).join("\\n");
        this._catat(serverName, false, pesan);
        return { ok: false, output: `[MCP Error] ${pesan}` };
      }

      const textOutput = (res.content || []).map((c) => c.text).join("\\n");
      this._catat(serverName, true);
      return { ok: true, output: textOutput };
    } catch (e) {
      dlog("mcp", "error", `Failed to call tool ${toolName} on ${serverName}`, {
        error: e.message,
      });
      this._catat(serverName, false, e.message);
      return { ok: false, output: `Error eksekusi MCP tool: ${e.message}` };
    }
  }

  // Record the LAST call result per server. `ready` alone is not enough to call
  // a server "working": the process can start and handshake cleanly and then
  // fail EVERY API call — exactly what happens when a GitHub token is revoked
  // while the UI still shows "Connected". An honest status needs evidence from
  // a real call, not just from a successful start.
  _catat(name: string, ok: boolean, pesan?: string) {
    const s = this.servers[name];
    if (!s) return;
    s.lastCallAt = Date.now();
    s.lastCallOk = ok;
    s.lastError = ok
      ? null
      : String(pesan || "")
          .replace(/\s+/g, " ")
          .slice(0, 200);
  }

  // RUNTIME status per server (not merely what the config says). The UI uses it
  // so the connection badge reflects reality instead of the `active: true` that
  // used to be hardcoded in the frontend.
  //   configured : present in config/mcp.json
  //   running    : the process is alive
  //   ready      : the initialize handshake completed
  //   lastCallOk : result of the last tool call (null if never called)
  status() {
    const cfg = this._loadConfig().mcpServers || {};
    const out = {};
    for (const name of Object.keys(cfg)) {
      const s = this.servers[name];
      const isDisabled = !!cfg[name].disabled;
      out[name] = {
        configured: true,
        disabled: isDisabled,
        running: !!(s && s.proc),
        ready: !isDisabled && !!(s && s.ready),
        // The state that did not exist before connecting stopped blocking.
        // Without it the UI can only tell "not ready" from "failed" by waiting,
        // which is the thing being removed.
        starting: !!this._mulai[name],
        lastCallOk:
          s && typeof s.lastCallOk === "boolean" ? s.lastCallOk : null,
        lastCallAt: (s && s.lastCallAt) || null,
        // A failed START leaves no server record — stopServer() removes it — so
        // the reason comes from _galatMulai or it is not reported at all.
        lastError: (s && s.lastError) || this._galatMulai[name] || null,
        toolCount: isDisabled ? 0 : (this.toolsCache[name] || []).length,
      };
    }
    return out;
  }
}

// A singleton that SURVIVES HOT RELOAD.
//
// SYMPTOM THIS FIXES: MCP connections dying mid-use and then coming back on
// their own, with nobody touching them.
//
// CAUSE: the backend watcher in electron/main.js drops the ENTIRE require.cache
// under the root whenever a .cjs file changes — a routine event in an app that
// edits its own source. This module went with it, so the next require built a
// NEW MCPClient with initialized=false. init() then called _killOrphans(),
// which read .mcp-pids.json and KILLED MCP processes that were still serving
// requests, mistaking them for leftovers of an earlier session. It respawned
// afterwards, which is why the connection appeared to revive by itself.
//
// Reproduced: start MCP -> simulate the watcher cache bust -> re-require ->
// init() -> 2 of 2 live processes killed.
//
// Keeping the instance on globalThis makes a post-reload require return the
// SAME object: initialized stays true, init() returns immediately,
// _killOrphans never runs, and the process handles in this.servers stay
// intact. agent/self_agent.ts already uses this pattern for the HITL
// checkpointer, for exactly the same reason.
const mcpClient =
  globalThis.__wolfspaceMcpClient ||
  (globalThis.__wolfspaceMcpClient = new MCPClient());

// ── HOT-RELOAD PATCH ──────────────────────────────────────────────────────────
// After the watcher busts require.cache this file is re-required with an
// updated MCPClient class. But because the singleton comes back from
// globalThis, its prototype still points at the OLD class, so new methods
// (toggleServer, for one) stay unavailable until Electron is fully restarted.
//
// Fix: on every reload of this file, re-point the old singleton's prototype at
// the new MCPClient class. The instance stays the same (MCP connections are
// undisturbed) while its new methods become available immediately.
if (Object.getPrototypeOf(mcpClient) !== MCPClient.prototype) {
  Object.setPrototypeOf(mcpClient, MCPClient.prototype);
}

// Test hook. Exported because the only other way to trigger _killOrphans is
// init(), which spawns real MCP servers through `npx` — slow, network-bound,
// and it obscures the very thing under test: the kill/keep decision.
mcpClient._killOrphans = _killOrphans;

// Test hook, same reason. _cariExe decides whether a spawn goes through a shell,
// and that decision is what closes DEP0190 — reaching it only through
// _startServer would mean starting a real server to check a lookup.
mcpClient._cariExe = _cariExe;
mcpClient._recordPid = _recordPid;
mcpClient._forgetPid = _forgetPid;
mcpClient._readOwn = _readOwn;
mcpClient._ownFile = _ownFile;
mcpClient.PID_DIR = PID_DIR;
mcpClient.LEGACY_PID_FILE = LEGACY_PID_FILE;
mcpClient._argsAman = _argsAman;

// Test hook. _kutipCmd is what stops an argument containing a space from
// arriving at the server as two, and the only other way to reach it is to start
// a real MCP server through npx.
mcpClient._kutipCmd = _kutipCmd;

module.exports = mcpClient;
