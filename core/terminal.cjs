'use strict';
/**
 * Terminal session manager — wraps node-pty for persistent PTY sessions.
 * Shared by both the HTTP server and the agent tools.
 */

const os  = require('os');
const pty = require('node-pty');

const sessions = new Map();
let nextId = 1;
const OUTPUT_MAX = 4096; // max chars kept in buffer for late readers

const SHELL = os.platform() === 'win32'
  ? (process.env.COMSPEC || 'cmd.exe')
  : (process.env.SHELL  || '/bin/bash');

function create(cwd, shellOverride) {
  const id = `term_${nextId++}`;
  const shell = shellOverride || SHELL;
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: cwd || process.cwd(),
    env: { ...process.env, TERM: 'xterm-256color' },
  });

  const outputBuffer = [];
  const session = { id, ptyProcess, listeners: [], outputBuffer, created: Date.now() };

  ptyProcess.onData((data) => {
    // Keep in buffer for late readers (e.g. agent read tool)
    outputBuffer.push(data);
    let total = 0;
    for (let i = outputBuffer.length - 1; i >= 0; i--) {
      total += outputBuffer[i].length;
      if (total > OUTPUT_MAX) { outputBuffer.splice(0, i); break; }
    }
    // Forward to live listeners
    for (const fn of session.listeners) {
      try { fn(data); } catch (_) {}
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    const msg = `\n[WOLFSPACE] Process exited (code=${exitCode}, signal=${signal})\n`;
    outputBuffer.push(msg);
    for (const fn of session.listeners) {
      try { fn(msg); } catch (_) {}
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

function destroy(id) {
  const session = sessions.get(id);
  if (!session) return false;
  try { session.ptyProcess.kill(); } catch (_) {}
  sessions.delete(id);
  return true;
}

function list() {
  return Array.from(sessions.values()).map(s => ({
    id: s.id,
    pid: s.ptyProcess.pid,
    created: s.created,
  }));
}

/** Read accumulated output buffer (and optionally clear it) */
function readBuffer(id, clear) {
  const session = sessions.get(id);
  if (!session) return null;
  const text = session.outputBuffer.join('');
  if (clear) session.outputBuffer.length = 0;
  return text;
}

module.exports = { create, write, onData, resize, destroy, list, readBuffer };

