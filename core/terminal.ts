"use strict";
/**
 * Terminal session manager — wraps node-pty for persistent PTY sessions.
 * Shared by both the HTTP server and the agent tools.
 */

const os = require("os");
const { getPlatformAdapter } = require("../agent/platform/index.cjs");

// Guarded for the same reason as in server.cjs: node-pty is a NATIVE module and
// may be unavailable (Alpine/musl with no linux prebuild and no toolchain to
// build it, for one). A bare require here would kill EVERY loader of this
// module, not just the terminal feature.
let pty: any = null;
let ptyLoadError: string | null = null;
try {
  pty = require("node-pty");
} catch (e) {
  ptyLoadError = e.message;
}

/** One live PTY session, kept for as long as its process is alive. */
interface SesiTerminal {
  id: string;
  ptyProcess: any;
  /** Live subscribers; each gets every chunk as it arrives. */
  listeners: Array<(data: string) => void>;
  /** Ring-trimmed at OUTPUT_MAX so a late reader still sees recent output. */
  outputBuffer: string[];
  created: number;
}

const sessions = new Map<string, SesiTerminal>();
let nextId = 1;
const OUTPUT_MAX = 4096; // max chars kept in buffer for late readers

const SHELL =
  os.platform() === "win32"
    ? process.env.COMSPEC || "cmd.exe"
    : process.env.SHELL || "/bin/bash";

// Returns a HANDLE, not the session itself: the session (with its pty handle and
// listener list) stays inside this module, so callers cannot reach the raw pty.
function create(
  cwd?: string,
  shellOverride?: string,
): { id: string; pid: number } {
  if (!pty) {
    const e = new Error(
      "Terminal tidak tersedia: node-pty gagal dimuat di platform ini" +
        (ptyLoadError ? " — " + String(ptyLoadError).split("\n")[0] : ""),
    );
    (e as NodeJS.ErrnoException).code = "PTY_UNAVAILABLE";
    throw e;
  }
  const id = `term_${nextId++}`;
  const shell = shellOverride || SHELL;
  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 120,
    rows: 30,
    cwd: cwd || process.cwd(),
    env: { ...process.env, TERM: "xterm-256color" },
  });

  const outputBuffer: string[] = [];
  const session: SesiTerminal = {
    id,
    ptyProcess,
    listeners: [] as Array<(data: string) => void>,
    outputBuffer,
    created: Date.now(),
  };

  ptyProcess.onData((data) => {
    // Keep in buffer for late readers (e.g. agent read tool)
    outputBuffer.push(data);
    let total = 0;
    for (let i = outputBuffer.length - 1; i >= 0; i--) {
      total += outputBuffer[i].length;
      if (total > OUTPUT_MAX) {
        outputBuffer.splice(0, i);
        break;
      }
    }
    // Forward to live listeners
    for (const fn of session.listeners) {
      try {
        fn(data);
      } catch (_) {}
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    const msg = `\n[WOLFSPACE] Process exited (code=${exitCode}, signal=${signal})\n`;
    outputBuffer.push(msg);
    for (const fn of session.listeners) {
      try {
        fn(msg);
      } catch (_) {}
    }
    sessions.delete(id);
  });

  sessions.set(id, session);
  return { id, pid: ptyProcess.pid };
}

function write(id, input) {
  const session = sessions.get(id);
  if (!session) return false;
  session.ptyProcess.write(input);
  return true;
}

function onData(id, listener) {
  const session = sessions.get(id);
  if (!session) return false;
  session.listeners.push(listener);
  return () => {
    const idx = session.listeners.indexOf(listener);
    if (idx !== -1) session.listeners.splice(idx, 1);
  };
}

function resize(id, cols, rows) {
  const session = sessions.get(id);
  if (!session) return false;
  session.ptyProcess.resize(cols, rows);
  return true;
}

// ── Closing a PTY without invoking node-pty's console lister ──
//
// THE PROBLEM. On the ConPTY path, node-pty's kill() forks
// lib/conpty_console_list_agent.js to enumerate the processes on the console
// and then kill them one by one. That fork DIES here with "AttachConsole
// failed" — measured not only under jest but in a plain node process too,
// which means this is the production path. Three consequences:
//   1. a 10-line stack trace printed to stderr every time a terminal closes,
//      which reads as though WOLFSPACE itself had crashed;
//   2. the dead fork's pipe left behind as a handle (jest reports it as
//      PIPEWRAP and cannot exit cleanly);
//   3. a 5-second timeout inside node-pty waiting for a message that never
//      arrives.
// The process list itself NEVER arrives, so that safety net was already not
// working — it is not something lost by this change.
//
// THE REPLACEMENT IS STRONGER, not merely quieter. taskkill /F /T destroys the
// whole process tree, including grandchildren never registered on the console —
// the very case that made node-pty write that path (microsoft/vscode#26807).
// The sandbox already uses the same function through the platform adapter.
//
// Measured before and after, with a long-lived `node` child inside the PTY:
//   before: child dies, BUT stderr is full of stack traces + a leaked handle
//   after:  child dies, stderr is clean, no handle left behind
function _matikanPohon(pid?: number): void {
  if (!pid) return;
  try {
    getPlatformAdapter().killTree({ pid });
  } catch (_) {}
}
async function _matikanPohonAsync(pid) {
  if (!pid) return;
  try {
    await getPlatformAdapter().killTreeAsync({ pid });
  } catch (_) {}
}

// Disables the console lister ONLY on the session being closed. This is a
// private node-pty API, so it is guarded: if its shape changes in a future
// version nothing explodes — we simply fall back to the old, noisy behaviour.
function _bungkamPendaftarKonsol(ptyProcess) {
  try {
    const agent = ptyProcess && ptyProcess._agent;
    if (agent && typeof agent._getConsoleProcessList === "function") {
      agent._getConsoleProcessList = () => Promise.resolve([]);
    }
  } catch (_) {}
}

// The ONLY way a PTY is killed anywhere in this codebase.
//
// Exported because server.cjs has its OWN terminal session manager for the
// HTTP/UI path, separate from the one in this file (which the agent tools use).
// There, closing called `pty.kill("SIGTERM")` — and node-pty on Windows THROWS
// as soon as it is given a signal argument ("Signals not supported on windows",
// windowsTerminal.js:150). The throw was swallowed by `catch {}`, the session was
// deleted from the map, so the PTY stayed alive AND became unreachable for
// cleanup. Measured on a real server process: 3 children before, 9 after three
// open+close cycles — two orphans per cycle, surviving until the whole app was
// closed, while /api/terminal/list already reported none.
//
// The two session managers are left as they are (merging them touches the live
// UI path and is not part of this fix), but there must NOT be two ways to kill.
// The PTY's conin/conout pipes are never closed by node-pty on the non-DLL
// ConPTY path: kill() only sets `readable = false` on _inSocket and _outSocket
// (windowsPtyAgent.js:138-139), then discards _conoutSocketWorker — which is the
// worker socket, not the PTY's own. Both stay open as handles. Measured: 4
// PIPEWRAP left behind for 4 sessions that had ALREADY been closed, and jest
// could never exit cleanly because of it.
function _tutupPipa(ptyProcess) {
  try {
    const a = ptyProcess && ptyProcess._agent;
    if (!a) return;
    for (const s of [a._inSocket, a._outSocket]) {
      try {
        if (s && typeof s.destroy === "function") s.destroy();
      } catch (_) {}
    }
  } catch (_) {}
}

function killPty(ptyProcess) {
  if (!ptyProcess) return;
  // Urutannya penting: pohon dibunuh SELAGI pid-nya masih sah, baru handle
  // node-pty dilepas, baru pipanya ditutup.
  _matikanPohon(ptyProcess.pid);
  _bungkamPendaftarKonsol(ptyProcess);
  try {
    ptyProcess.kill(); // TANPA argumen — lihat catatan di atas
  } catch (_) {}
  _tutupPipa(ptyProcess);
}

// ── The version that does not freeze the calling thread ──
//
// The contents and the ORDER are identical to killPty; the only difference is
// that the tree kill is awaited through a promise instead of holding the thread.
// taskkill /F /T through execSync measurably locked Electron's main thread for
// 1076 ms (worst case 1507 ms) every time a terminal panel was closed.
//
// The synchronous one stays and is still used: callers off the main thread
// (process-shutdown cleanup, for one) genuinely need the "die first, then
// continue" ordering, and there is no window there that could freeze.
async function killPtyAsync(ptyProcess: any): Promise<void> {
  if (!ptyProcess) return;
  await _matikanPohonAsync(ptyProcess.pid);
  _bungkamPendaftarKonsol(ptyProcess);
  try {
    ptyProcess.kill();
  } catch (_) {}
  _tutupPipa(ptyProcess);
}

function destroy(id) {
  const session = sessions.get(id);
  if (!session) return false;
  killPty(session.ptyProcess);
  sessions.delete(id);
  return true;
}

function list() {
  return Array.from(sessions.values()).map((s) => ({
    id: s.id,
    pid: s.ptyProcess.pid,
    created: s.created,
  }));
}

/** Read accumulated output buffer (and optionally clear it) */
function readBuffer(id, clear) {
  const session = sessions.get(id);
  if (!session) return null;
  const text = session.outputBuffer.join("");
  if (clear) session.outputBuffer.length = 0;
  return text;
}

module.exports = {
  create,
  write,
  onData,
  resize,
  destroy,
  list,
  readBuffer,
  killPty,
  killPtyAsync,
};
