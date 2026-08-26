import * as fs from "fs";
import * as path from "path";
import { spawn, execSync } from "child_process";
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

// Process start time in epoch milliseconds, for a set of PIDs at once. PIDs that
// cannot be read are left out of the Map. One call for all of them: cleanup only
// happens at startup, and only when an orphan file exists.
function _waktuMulai(pids) {
  const peta = new Map();
  if (!pids.length) return peta;
  try {
    if (process.platform === "win32") {
      const out = execSync(
        'powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process | ' +
          "Where-Object { $_.CreationDate } | ForEach-Object { " +
          '\\"$($_.ProcessId) $($_.CreationDate.ToUniversalTime().ToString(\'o\'))\\" }"',
        {
          encoding: "utf8",
          timeout: 20000,
          stdio: ["ignore", "pipe", "ignore"],
        },
      );
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

function _killPids(entries, asal) {
  const hidup = entries.filter((e) => _alive(e.pid));
  if (!hidup.length) return;
  const mulai = _waktuMulai(hidup.map((e) => e.pid));
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

function _killOrphans() {
  // Migrating the old file format: with no owner recorded, its contents cannot be
  // claimed by anyone, so they are treated as orphans and the file is discarded.
  try {
    if (fs.existsSync(LEGACY_PID_FILE)) {
      const raw = JSON.parse(fs.readFileSync(LEGACY_PID_FILE, "utf8")) || [];
      const pids = raw
        .map((e) => (typeof e === "number" ? { pid: e, ts: null } : e))
        .filter((e) => e && typeof e.pid === "number");
      if (pids.length) _killPids(pids, "stale-file");
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
    _killPids(_readOwn(owner), "pemilik-" + owner);
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

/** A configured MCP server as written in config/mcp.json (or by a plugin). */
interface KonfigServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  disabled?: boolean;
  /** Set when the entry came from a plugin manifest rather than the file. */
  _plugin?: string;
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

  constructor() {
    this.servers = {}; // serverName -> process info
    this.toolsCache = {}; // serverName -> array of tools
    this.msgId = 1;
    this.pendingReqs = {}; // msgId -> { resolve, reject }
    this.initialized = false;
  }

  // The file contents AS THEY ARE, without plugins.
  //
  // REQUIRED for anything that will WRITE back. _loadConfig() below returns file
  // plus plugins merged; saving that merged result would bake plugin entries into
  // config/mcp.json permanently — complete with the _plugin marker — so a plugin
  // would have two homes at once and the config/mcp.json one would win. Exactly
  // the class of mistake that lets dead config survive unnoticed.
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

    // Plugins the user has APPROVED join as ordinary MCP servers, so every path
    // below (spawn, handshake, orphan processes, hot reload) needs no duplicate.
    // The only difference is the `_plugin` marker, which forces their tools and
    // calls through CommandChain admission.
    //
    // Placed AFTER the base: a config/mcp.json entry of the same name wins, so a
    // plugin cannot hijack the name of a server the user already uses.
    let plug = {};
    try {
      plug = require("./plugins.ts").konfigMcp();
    } catch (_) {
      plug = {};
    }
    const gabung = { ...plug, ...(dasar.mcpServers || {}) };
    return { ...dasar, mcpServers: gabung };
  }

  // Whether this server came from a plugin.
  //
  // Read from DISK via plugins.adalahPlugin(), not from the merged config. The
  // config holds only approved plugins, so using it here would make a revoked
  // permission answer "not a plugin" — and the caller would conclude no gate is
  // needed. Revoking would OPEN the gate. Pinned by the test
  // "mencabut izin tidak boleh membuka gerbang" (test name, kept verbatim).
  _dariPlugin(nama) {
    try {
      return require("./plugins.ts").adalahPlugin(nama);
    } catch (_) {
      return false;
    }
  }

  // TWO conditions, both required. The asymmetry is deliberate:
  //
  //   frozen genesis    -> ADDING a permission does not apply until the next session
  //   approval file     -> REVOKING a permission applies IMMEDIATELY
  //
  // The rule in one sentence: narrowing is always allowed, widening is not.
  // Widening mid-session would mean there is a way to loosen genesis after it was
  // frozen, and the whole point of freezing is gone. Narrowing has no such
  // problem — it only takes back something previously allowed.
  //
  // Without the second condition, revoking a permission has NO effect while the
  // plugin process is alive: its capabilities are already in genesis. That is
  // measured — see the note in tests/plugin-gerbang.test.js.
  _izinPlugin(nama) {
    if (!this._dariPlugin(nama)) return { allow: true, alasan: null };
    try {
      const cc = require("./broker/commandchain.ts");
      const P = require("./plugins.ts");

      const vonis = cc.periksa(cc.sesiRuleset(), P.kapabilitas(nama));
      if (!vonis.allow) return vonis;

      if (!P.disetujui().includes(String(nama))) {
        return { allow: false, alasan: "izin plugin dicabut user" };
      }
      return vonis;
    } catch (e) {
      // Failing to load the guard = DENY. Deny-by-default, never fail-open.
      return {
        allow: false,
        alasan: "the admission guard could not be loaded",
      };
    }
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
    _killOrphans();
    this.initialized = true;
  }

  // Menyalakan SATU server atas permintaan (tombol Connect di UI).
  // Idempotent: a server already ready is not respawned.
  async connectServer(name) {
    const cfg = this._loadConfig().mcpServers || {};
    const conf = cfg[name];
    if (!conf) return { ok: false, error: "MCP server is not in the config" };
    if (conf.disabled) return { ok: false, error: "MCP server dinonaktifkan" };
    const ada = this.servers[name];
    if (ada && ada.ready) return { ok: true, already: true };
    if (ada && ada.proc) this.stopServer(name); // setengah jalan -> mulai bersih
    try {
      await this._startServer(name, conf);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
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
      // never there. It also made the `cwd` written by plugins.ts konfigMcp()
      // useless: relative args in a plugin manifest resolved from the parent
      // process's cwd rather than from the repo root.
      const proc = spawn(cmd, conf.args || [], {
        env,
        shell: process.platform === "win32",
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

      proc.stderr.on("data", (data) => {
        dlog("mcp", "warn", `[MCP ${name} stderr] ${data.toString().trim()}`);
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
        delete this.servers[name];
        delete this.toolsCache[name];
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
          resolve();
        })
        .catch((err) => {
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
    // RAW, not merged: saving the merged result would write plugin entries into
    // config/mcp.json permanently.
    const config = this._loadConfigMentah();
    if (!config.mcpServers) config.mcpServers = {};
    config.mcpServers[name] = conf;
    this._saveConfig(config);
    try {
      await this._startServer(name, conf);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  removeServer(name) {
    this.stopServer(name);
    // RAW: only what is actually in the file may be deleted from the file.
    // Plugins are uninstalled from the Plugins page, not from here.
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
    // RAW, like addServer/removeServer: writing the merged result would bake
    // plugin entries into config/mcp.json.
    const config = this._loadConfigMentah();
    if (!config.mcpServers || !config.mcpServers[name]) {
      // A plugin will indeed not be found here, and that is correct: whether it
      // runs is decided by the user's APPROVAL on the Plugins page, not by a
      // disabled switch in config/mcp.json. Said plainly so the user does not
      // conclude the switch is broken.
      if (this._dariPlugin(name)) {
        return {
          ok: false,
          error:
            `'${name}' is a plugin, not a config/mcp.json entry. ` +
            "Beri atau cabut izinnya di halaman Plugins.",
        };
      }
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
      const r = await this.connectServer(name);
      return r.ok ? { ok: true, enabled: true } : { ok: false, error: r.error };
    }
  }

  getServers() {
    return this._loadConfig().mcpServers || {};
  }

  _send(name, msg) {
    const srv = this.servers[name];
    if (!srv || !srv.proc) return;
    const str = JSON.stringify(msg) + "\r\n";
    srv.proc.stdin.write(str);
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
      this._send(name, { jsonrpc: "2.0", id, method, params });
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

      // Unapproved plugins DO NOT APPEAR AT ALL in the tool list.
      //
      // This differs importantly from "refused when called": the model never sees
      // the tool, so there is nothing it can be talked into calling. Untrusted
      // content the model reads cannot direct it toward something that is not on
      // the list.
      const izin = this._izinPlugin(name);
      if (!izin.allow) {
        dlog("mcp", "info", `Plugin ${name} disembunyikan dari daftar tool`, {
          alasan: izin.alasan,
        });
        continue;
      }

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

    // The SECOND gate. getTools() already hides unapproved plugins, but the tool
    // list is built once at the start of a turn while approval can be revoked,
    // and a tool name can arrive from conversation history — not only from the
    // list just sent. This check at the point of use is the decisive one; the one
    // in getTools() merely keeps the temptation out of sight.
    const izin = this._izinPlugin(serverName);
    if (!izin.allow) {
      try {
        const cc = require("./broker/commandchain.ts");
        const P = require("./plugins.ts");
        cc.catat({
          capability: P.kapabilitas(serverName),
          decision: "DENY",
          reason: izin.alasan,
          params: { tool: toolName },
          kurungan: {
            enforced: true,
            mekanisme: "genesis admission — plugin not approved by the user",
          },
        });
      } catch (_) {}
      return {
        ok: false,
        output:
          `Plugin '${serverName}' is not approved for this session: ` +
          izin.alasan +
          ". Persetujuan diberikan user di halaman Plugins, dan berlaku mulai sesi berikutnya.",
      };
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
        lastCallOk:
          s && typeof s.lastCallOk === "boolean" ? s.lastCallOk : null,
        lastCallAt: (s && s.lastCallAt) || null,
        lastError: (s && s.lastError) || null,
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
mcpClient._recordPid = _recordPid;
mcpClient._forgetPid = _forgetPid;
mcpClient._readOwn = _readOwn;
mcpClient._ownFile = _ownFile;
mcpClient.PID_DIR = PID_DIR;
mcpClient.LEGACY_PID_FILE = LEGACY_PID_FILE;
mcpClient._argsAman = _argsAman;

module.exports = mcpClient;
