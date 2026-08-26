// ── WOLFSPACE Sandbox Execution ──
// Inspired by @openclaw/openshell-sandbox & @openclaw/fs-safe
// Provides capability-based filesystem access, resource limits,
// workspace mirroring, and execution audit for safe agent code execution.

// import, not require, so this file is a MODULE. A .ts file with neither
// import nor export is treated by TypeScript as a global script, which makes
// `fs`, `path` and friends collide with the same names in other .ts files.
// The hook in scripts/ts-register.cjs converts the module form at load time —
// see the note there about which entry points must install it.
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec, spawn, execSync } from "child_process";
import * as util from "util";

const execP = util.promisify(exec);
const { dlog } = require("./debug.ts");
const { getPlatformAdapter } = require("./platform/index.ts");

/** Read/write permission over specific directory trees. */
interface OpsiKapabilitas {
  readRoots?: string[];
  writeRoots?: string[];
  denyPaths?: RegExp[];
}

/** Options for creating a sandbox session; every field has a default. */
interface OpsiSesi extends OpsiKapabilitas {
  adapter?: any;
  timeout?: number;
  maxOutput?: number;
  /** false means the network is OFF; anything else allows it. */
  network?: boolean;
}

/** One line of the execution audit journal. */
interface EntriAudit {
  ts: number;
  action: string;
  [k: string]: unknown;
}

// Result of a single execution inside the sandbox.
//
// The shape is READ from the actual finish() payloads rather than invented:
// output is ONE field (stdout, or stderr when stdout is empty, truncated at
// maxOutput), and `error` appears only on failure. The first version of this
// interface guessed stdout/stderr/code and tsc rejected it in five places —
// the same lesson the agent-events contract taught.
interface HasilEksekusi {
  ok: boolean;
  output: string;
  error?: string;
  /** Attached by sandboxRun(), not by exec(). */
  sessionId?: string;
  auditTrail?: string;
  sandboxDir?: string;
  terkurungAc?: boolean;
  mirrorErrors?: string[];
  [k: string]: unknown;
}

const QROOT = path.resolve(__dirname, "..");

// ── Capability-based filesystem ──
// A "capability" is a permission to read or write a specific directory tree.
// Inspired by @openclaw/fs-safe: capability-style filesystem roots.

class CapabilityFS {
  readRoots: string[];
  writeRoots: string[];
  denyPaths: RegExp[];

  constructor(opts: OpsiKapabilitas = {}) {
    this.readRoots = (opts.readRoots || []).map((r) => path.resolve(r));
    this.writeRoots = (opts.writeRoots || []).map((r) => path.resolve(r));
    this.denyPaths = opts.denyPaths || [
      /[\\/]node_modules[\\/]/,
      /[\\/]\.git[\\/]/,
      /cloud-keys\.json$/,
      /[\\/]\.wolfspace[\\/]/, // secrets now live in ~/.wolfspace (see agent/keys-path.ts)
      /\.env$/,
      /[\\/]System32[\\/]/,
      /[\\/]Windows[\\/]/,
    ];
  }

  // Check if a path is allowed for the given operation
  _allowed(absPath, roots) {
    for (const root of roots) {
      if (absPath === root || absPath.startsWith(root + path.sep)) {
        return true;
      }
    }
    return false;
  }

  _denied(absPath) {
    for (const re of this.denyPaths) {
      if (re.test(absPath)) return true;
    }
    return false;
  }

  allowRead(absPath) {
    if (this._denied(absPath)) return false;
    if (this.readRoots.length === 0) return true; // no restrictions
    return this._allowed(absPath, this.readRoots);
  }

  allowWrite(absPath) {
    if (this._denied(absPath)) return false;
    if (this.writeRoots.length === 0) return true; // no restrictions
    return this._allowed(absPath, this.writeRoots);
  }

  // Read a file through capability check
  readFile(filePath) {
    const abs = path.resolve(filePath);
    if (!this.allowRead(abs))
      throw new Error(`Sandbox: read denied for ${filePath}`);
    return fs.readFileSync(abs, "utf8");
  }

  // Write a file through capability check
  writeFile(filePath, content) {
    const abs = path.resolve(filePath);
    if (!this.allowWrite(abs))
      throw new Error(`Sandbox: write denied for ${filePath}`);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
  }

  // List directory through capability check
  listDir(dirPath) {
    const abs = path.resolve(dirPath);
    if (!this.allowRead(abs))
      throw new Error(`Sandbox: list denied for ${dirPath}`);
    return fs.readdirSync(abs, { withFileTypes: true });
  }
}

// ── Sandbox execution session ──
// Each session is a temporary workspace with mirrored input files.
class SandboxSession {
  id: string;
  dir: string;
  caps: CapabilityFS;
  adapter: any;
  timeout: number;
  maxOutput: number;
  networkAllowed: boolean;
  /** Set by exec(): whether the command was actually AppContainer-wrapped. */
  terkurungAc?: boolean;
  auditLog: EntriAudit[];
  _closed: boolean;

  constructor(opts: OpsiSesi = {}) {
    this.id =
      "sbx-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), this.id + "-"));
    this.caps = new CapabilityFS(opts);
    this.adapter = opts.adapter || getPlatformAdapter(); // OS-specific exec/kill/env
    this.timeout = opts.timeout || 30000;
    this.maxOutput = opts.maxOutput || 50000;
    this.networkAllowed = opts.network !== false;
    this.auditLog = [];
    this._closed = false;
  }

  _audit(action: string, detail?: Record<string, unknown>): EntriAudit {
    const entry = { ts: Date.now(), action, ...detail };
    this.auditLog.push(entry);
    dlog("sandbox", "info", action, { session: this.id, ...detail });
    return entry;
  }

  // Mirror a file/dir into the sandbox (copy in)
  mirrorIn(srcPath, relDest) {
    const absSrc = path.resolve(srcPath);
    if (!this.caps.allowRead(absSrc))
      throw new Error(`Sandbox: mirror read denied for ${srcPath}`);
    const dest = path.join(this.dir, relDest || path.basename(srcPath));
    const st = fs.statSync(absSrc);
    if (st.isDirectory()) {
      fs.cpSync(absSrc, dest, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(absSrc, dest);
    }
    this._audit("mirrorIn", { src: srcPath, dest: relDest });
    return dest;
  }

  // Mirror a file/dir out of the sandbox (copy result back)
  mirrorOut(relSrc, destPath) {
    const absDest = path.resolve(destPath);
    if (!this.caps.allowWrite(absDest))
      throw new Error(`Sandbox: mirror write denied for ${destPath}`);
    const src = path.join(this.dir, relSrc);
    const st = fs.statSync(src);
    if (st.isDirectory()) {
      fs.cpSync(src, absDest, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(absDest), { recursive: true });
      // ATOMIC: copy to a temp file in the SAME directory, then rename.
      //
      // copyFileSync opens the destination with O_TRUNC — it TRUNCATES the
      // target file first and writes afterwards. Measured: a 5000-byte
      // destination became 6 bytes instantly. If the process dies in
      // between, what remains is a truncated file — and this is the path
      // EVERY agent write and edit goes through.
      //
      // A same-volume rename is atomic on NTFS and POSIX alike: the target
      // holds either the old version or the new one, never half of either.
      // The temp file sits deliberately beside the target — across volumes
      // rename degrades to copy-then-delete and the guarantee is lost.
      const tmp = absDest + "." + process.pid + ".atomic";
      try {
        fs.copyFileSync(src, tmp);
        fs.renameSync(tmp, absDest);
      } catch (e) {
        try {
          fs.unlinkSync(tmp);
        } catch (_) {}
        throw e;
      }
    }
    this._audit("mirrorOut", { src: relSrc, dest: destPath });
    return absDest;
  }

  // Execute a command inside the sandbox
  async exec(
    command: string,
    opts: { timeout?: number; cwd?: string } = {},
  ): Promise<HasilEksekusi> {
    const cmdTimeout = opts.timeout || this.timeout;
    const cmdCwd = opts.cwd || this.dir;
    this._audit("exec", {
      command,
      cwd: path.relative(this.dir, cmdCwd),
      timeout: cmdTimeout,
    });

    // ── The SAME kernel containment the bash tool uses ──
    //
    // WHY THIS EXISTS. Once bash was contained by AppContainer, sandbox_run
    // still spawned processes with ordinary filesystem access — measured,
    // not assumed: `echo bocor > C:\Users\dave\Desktop\x.txt` was DENIED
    // through bash, SUCCEEDED through sandbox_run, and the file really
    // landed on the Desktop. Reading C:\Users\dave\Documents worked too.
    //
    // Closing one door while the one next to it stays open is worse than
    // closing nothing: people stop being careful because they believe the
    // session is contained. The same pattern was found in this repo before, for
    // proc.raw admission, and it came back in a new form as soon as bash was
    // contained on its own.
    //
    // The scratch directory is opened via beriSementara(), NOT siapUntuk():
    // it is not a workspace, so it must not displace the workspace currently in
    // use. The command script file also has to land within reach of the
    // container, otherwise the command fails before it can start.
    let _ac: any = null;
    if (process.platform === "win32") {
      try {
        const m = require("./tools/appcontainer-jail.ts");
        if (
          process.env.WOLFSPACE_BASH_AC !== "0" &&
          process.env.WOLFSPACE_BASH_AC !== "false" &&
          (await m.beriSementara(cmdCwd))
        )
          _ac = m;
      } catch (_) {}
    }

    let [shellCmd, shellArgs] = this.adapter.shellFor(command, {
      cwd: cmdCwd,
      networkAllowed: this.networkAllowed,
      scriptDir: _ac ? path.join(cmdCwd, ".wolfspace-cmd") : undefined,
    });
    if (_ac) [shellCmd, shellArgs] = _ac.bungkus(cmdCwd, shellCmd, shellArgs);
    // Recorded so the RESULT can report the enforcement that actually
    // applied. Without this, sandbox_run stays labelled "advisory/helper-js"
    // from the adapter capabilities() — the right answer before it was
    // wrapped, and an understatement afterwards. A label wrong in either
    // direction does equal damage: one makes people trust too much, the
    // other makes them build extra guards for a boundary that already exists.
    this.terkurungAc = !!_ac;

    return new Promise((resolve) => {
      let stdout = "",
        stderr = "",
        timedOut = false,
        settled = false;
      const child = spawn(shellCmd, shellArgs, {
        cwd: cmdCwd,
        windowsHide: true,
        ...this.adapter.spawnOptions(),
        env: {
          // OS-specific contained base env (PATH + system vars + home/temp
          // remapped to the sandbox dir). Home remapping keeps the real home
          // path out of untrusted code — see the adapter for this OS.
          ...this.adapter.sandboxEnv(this.dir),
          // CreateProcessW refuses to create an AppContainer process without
          // LOCALAPPDATA (code 203, which names no variable at all).
          ...(_ac ? _ac.envTambahan(cmdCwd) : {}),
          // App-level sandbox markers (OS-independent)
          QUANTUM_SANDBOX: "1",
          QUANTUM_SANDBOX_ID: this.id,
          QUANTUM_SANDBOX_DIR: this.dir,
          // Advisory network flag (real enforcement needs OS isolation)
          QUANTUM_SANDBOX_NETWORK: this.networkAllowed ? "1" : "0",
        },
      });

      const finish = (payload: HasilEksekusi) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (graceTimer) clearTimeout(graceTimer);
        resolve(payload);
      };

      // Kill the WHOLE process tree, not just the shell — otherwise a runaway
      // grandchild (e.g. `node hang.js`) keeps running and the timeout wouldn't
      // actually bound runtime. The adapter knows how per OS (taskkill /T on
      // Windows, process-group kill on POSIX).
      const killTree = () => {
        try {
          this.adapter.killTree(child);
        } catch (_) {
          try {
            child.kill("SIGKILL");
          } catch (__) {}
        }
      };

      let graceTimer: NodeJS.Timeout | null = null;
      const timer = setTimeout(() => {
        timedOut = true;
        killTree();
        // If 'close' doesn't fire shortly after the kill (detached grandchildren,
        // stuck pipes), resolve anyway so a runaway process can't hang the caller.
        graceTimer = setTimeout(() => {
          this._audit("timeout", { command, timeout: cmdTimeout });
          finish({
            ok: false,
            output: (stdout || stderr || "").slice(0, this.maxOutput),
            error: `TIMEOUT (${cmdTimeout}ms)`,
          });
        }, 1500);
      }, cmdTimeout);

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        if (stdout.length < this.maxOutput) stdout += text;
      });
      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        if (stderr.length < this.maxOutput) stderr += text;
      });

      child.on("close", (code) => {
        const output = (stdout || stderr || "").slice(0, this.maxOutput);
        if (timedOut) {
          this._audit("timeout", { command, timeout: cmdTimeout });
          finish({ ok: false, output, error: `TIMEOUT (${cmdTimeout}ms)` });
        } else if (code !== 0 && stderr.trim()) {
          this._audit("fail", {
            command,
            exitCode: code,
            error: stderr.trim().slice(0, 200),
          });
          finish({
            ok: false,
            output,
            error: `exit ${code}: ${stderr.trim().slice(0, 1000)}`,
          });
        } else {
          this._audit("ok", { command, exitCode: code, bytes: output.length });
          finish({ ok: true, output: output || `(exit ${code})` });
        }
      });

      child.on("error", (err) => {
        this._audit("error", { command, error: err.message });
        finish({ ok: false, output: "", error: "spawn error: " + err.message });
      });
    });
  }

  // Write a temp file in the sandbox and return its path
  writeTemp(filename, content) {
    const dest = path.join(this.dir, filename);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, "utf8");
    this._audit("writeTemp", { file: filename, bytes: content.length });
    return dest;
  }

  // List files in sandbox directory
  listDir(subPath) {
    const dir = subPath ? path.join(this.dir, subPath) : this.dir;
    return fs.readdirSync(dir, { withFileTypes: true }).map((e) => ({
      name: e.name,
      type: e.isDirectory() ? "dir" : "file",
      size: e.isFile() ? fs.statSync(path.join(dir, e.name)).size : 0,
    }));
  }

  // Read a file from sandbox
  readFile(subPath) {
    const abs = path.join(this.dir, subPath);
    return fs.readFileSync(abs, "utf8");
  }

  // Cleanup the sandbox directory
  destroy() {
    if (this._closed) return;
    this._closed = true;
    try {
      fs.rmSync(this.dir, { recursive: true, force: true });
    } catch {}
    this._audit("destroy", {});
    dlog("sandbox", "info", "Sandbox destroyed", {
      session: this.id,
      auditEntries: this.auditLog.length,
    });
  }

  // Get audit trail as text
  auditTrail() {
    return this.auditLog
      .map(
        (e) =>
          `[${new Date(e.ts).toISOString()}] ${e.action}: ${JSON.stringify(e)}`,
      )
      .join("\n");
  }
}

// ── Convenience: run a single command in a throwaway sandbox ──
async function sandboxRun(
  command: string,
  opts: OpsiSesi & {
    mirrorIn?: Record<string, string>;
    files?: Record<string, string>;
    mirrorOut?: Record<string, string>;
    timeout?: number;
    cwd?: string;
  } = {},
): Promise<HasilEksekusi> {
  const session = new SandboxSession(opts);
  try {
    // If input files specified, mirror them in
    if (opts.mirrorIn) {
      for (const [src, dest] of Object.entries(opts.mirrorIn)) {
        session.mirrorIn(src, dest);
      }
    }
    // Write any inline files
    if (opts.files) {
      for (const [name, content] of Object.entries(opts.files)) {
        session.writeTemp(name, content);
      }
    }
    const result = await session.exec(command, opts);
    // Mirror out if requested
    if (result.ok && opts.mirrorOut) {
      for (const [src, dest] of Object.entries(opts.mirrorOut)) {
        try {
          session.mirrorOut(src, dest);
        } catch (e) {
          result.mirrorErrors = result.mirrorErrors || [];
          result.mirrorErrors.push(`${src}: ${e.message}`);
        }
      }
    }
    result.sessionId = session.id;
    result.auditTrail = session.auditTrail();
    result.sandboxDir = session.dir;
    result.terkurungAc = !!session.terkurungAc;
    return result;
  } finally {
    session.destroy();
  }
}

// ── Default sandbox for general agent use ──
// Read: entire user home + workspace + project
// Write: workspace + temp
function defaultSandboxOpts() {
  return {
    readRoots: [
      os.homedir(),
      QROOT,
      path.join(QROOT, "workspace"),
      os.tmpdir(),
    ],
    writeRoots: [
      QROOT,
      path.join(QROOT, "workspace"),
      os.tmpdir(),
      path.join(QROOT, "skills"),
    ],
    timeout: 60000,
    maxOutput: 100000,
    networkAllowed: true,
  };
}

// ── Strict sandbox for untrusted code ──
// Read: only workspace + temp
// Write: only temp
function strictSandboxOpts() {
  return {
    readRoots: [path.join(QROOT, "workspace"), os.tmpdir()],
    writeRoots: [os.tmpdir()],
    timeout: 15000,
    maxOutput: 20000,
    networkAllowed: false,
  };
}

// ── Active session tracking (for long-running sandboxes) ──
const activeSessions = new Map();

function createSession(opts = {}) {
  const merged = { ...defaultSandboxOpts(), ...opts };
  const session = new SandboxSession(merged);
  activeSessions.set(session.id, session);
  return session;
}

function destroySession(id) {
  const session = activeSessions.get(id);
  if (session) {
    session.destroy();
    activeSessions.delete(id);
    return true;
  }
  return false;
}

function getSession(id) {
  return activeSessions.get(id) || null;
}

function listSessions() {
  return Array.from(activeSessions.entries()).map(([id, s]) => ({
    id,
    dir: s.dir,
    createdAt: s.auditLog[0]?.ts || null,
    opsCount: s.auditLog.length,
  }));
}

// Cleanup all sessions on exit.
//
// INSTALLED ONCE PER PROCESS, not once per module load. electron/main.js drops
// the project's ENTIRE require.cache on every file change under agent/, and the
// WOLFSPACE agent edits its own files -- so this module is reloaded many times
// within a single session. Without a guard, every load adds another 'exit'
// handler that is never released; on a simulated reload cycle the process
// listener count climbed steadily (2, 3, 4, 5, ...).
//
// The handler reads activeSessions THROUGH the module reference it captured,
// so an old handler points at a Map that has already been discarded: it cleans
// up nothing and merely accumulates. What survives on globalThis is the
// installation marker; the real cleanup is still done by the live module
// instance.
if (!globalThis.__wolfspaceSandboxExit) {
  globalThis.__wolfspaceSandboxExit = true;
  process.on("exit", () => {
    const aktif = globalThis.__wolfspaceSandboxSesi;
    if (!aktif) return;
    for (const [, session] of aktif) {
      try {
        session.destroy();
      } catch {}
    }
  });
}
// Always re-point at the freshly loaded instance's Map, so the single handler
// above cleans up the sessions that are actually live.
globalThis.__wolfspaceSandboxSesi = activeSessions;

// The adapter capabilities this module ACTUALLY uses, passed through verbatim.
// Exported so tool callers can report the enforcement level without guessing
// from process.platform — a guess that would be wrong in exactly the case that
// matters most (Linux without bwrap reads the same as Linux with bwrap).
function adapterCapabilities() {
  try {
    return getPlatformAdapter().capabilities();
  } catch (_) {
    return null;
  }
}

module.exports = {
  CapabilityFS,
  SandboxSession,
  sandboxRun,
  adapterCapabilities,
  createSession,
  destroySession,
  getSession,
  listSessions,
  defaultSandboxOpts,
  strictSandboxOpts,
};
