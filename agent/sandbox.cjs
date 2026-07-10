// ── WOLFSPACE Sandbox Execution ──
// Inspired by @openclaw/openshell-sandbox & @openclaw/fs-safe
// Provides capability-based filesystem access, resource limits,
// workspace mirroring, and execution audit for safe agent code execution.

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { exec, spawn, execSync } = require('child_process');
const util = require('util');
const execP = util.promisify(exec);
const { dlog } = require('./debug.cjs');

const QROOT = path.resolve(__dirname, '..');

// ── Capability-based filesystem ──
// A "capability" is a permission to read or write a specific directory tree.
// Inspired by @openclaw/fs-safe: capability-style filesystem roots.

class CapabilityFS {
  constructor(opts = {}) {
    this.readRoots  = (opts.readRoots  || []).map(r => path.resolve(r));
    this.writeRoots = (opts.writeRoots || []).map(r => path.resolve(r));
    this.denyPaths  = (opts.denyPaths  || [
      /[\\/]node_modules[\\/]/,
      /[\\/]\.git[\\/]/,
      /cloud-keys\.json$/,
      /\.env$/,
      /[\\/]System32[\\/]/,
      /[\\/]Windows[\\/]/,
    ]);
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
    if (!this.allowRead(abs)) throw new Error(`Sandbox: read denied for ${filePath}`);
    return fs.readFileSync(abs, 'utf8');
  }

  // Write a file through capability check
  writeFile(filePath, content) {
    const abs = path.resolve(filePath);
    if (!this.allowWrite(abs)) throw new Error(`Sandbox: write denied for ${filePath}`);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }

  // List directory through capability check
  listDir(dirPath) {
    const abs = path.resolve(dirPath);
    if (!this.allowRead(abs)) throw new Error(`Sandbox: list denied for ${dirPath}`);
    return fs.readdirSync(abs, { withFileTypes: true });
  }
}

// ── Sandbox execution session ──
// Each session is a temporary workspace with mirrored input files.
class SandboxSession {
  constructor(opts = {}) {
    this.id = 'sbx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), this.id + '-'));
    this.caps = new CapabilityFS(opts);
    this.timeout = opts.timeout || 30000;
    this.maxOutput = opts.maxOutput || 50000;
    this.networkAllowed = opts.network !== false;
    this.auditLog = [];
    this._closed = false;
  }

  _audit(action, detail) {
    const entry = { ts: Date.now(), action, ...detail };
    this.auditLog.push(entry);
    dlog('sandbox', 'info', action, { session: this.id, ...detail });
    return entry;
  }

  // Mirror a file/dir into the sandbox (copy in)
  mirrorIn(srcPath, relDest) {
    const absSrc = path.resolve(srcPath);
    if (!this.caps.allowRead(absSrc)) throw new Error(`Sandbox: mirror read denied for ${srcPath}`);
    const dest = path.join(this.dir, relDest || path.basename(srcPath));
    const st = fs.statSync(absSrc);
    if (st.isDirectory()) {
      fs.cpSync(absSrc, dest, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(absSrc, dest);
    }
    this._audit('mirrorIn', { src: srcPath, dest: relDest });
    return dest;
  }

  // Mirror a file/dir out of the sandbox (copy result back)
  mirrorOut(relSrc, destPath) {
    const absDest = path.resolve(destPath);
    if (!this.caps.allowWrite(absDest)) throw new Error(`Sandbox: mirror write denied for ${destPath}`);
    const src = path.join(this.dir, relSrc);
    const st = fs.statSync(src);
    if (st.isDirectory()) {
      fs.cpSync(src, absDest, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(absDest), { recursive: true });
      fs.copyFileSync(src, absDest);
    }
    this._audit('mirrorOut', { src: relSrc, dest: destPath });
    return absDest;
  }

  // Execute a command inside the sandbox
  async exec(command, opts = {}) {
    const cmdTimeout = opts.timeout || this.timeout;
    const cmdCwd = opts.cwd || this.dir;
    this._audit('exec', { command, cwd: path.relative(this.dir, cmdCwd), timeout: cmdTimeout });

    return new Promise((resolve) => {
      let stdout = '', stderr = '', timedOut = false;
      const child = spawn('cmd.exe', ['/d', '/c', command], {
        cwd: cmdCwd,
        timeout: cmdTimeout,
        windowsHide: true,
        env: {
          ...process.env,
          // Sandbox env markers
          QUANTUM_SANDBOX: '1',
          QUANTUM_SANDBOX_ID: this.id,
          QUANTUM_SANDBOX_DIR: this.dir,
          // Allow network gating via env
          QUANTUM_SANDBOX_NETWORK: this.networkAllowed ? '1' : '0',
        },
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, cmdTimeout);

      child.stdout.on('data', chunk => {
        const text = chunk.toString();
        if (stdout.length < this.maxOutput) stdout += text;
      });
      child.stderr.on('data', chunk => {
        const text = chunk.toString();
        if (stderr.length < this.maxOutput) stderr += text;
      });

      child.on('close', code => {
        clearTimeout(timer);
        const output = (stdout || stderr || '').slice(0, this.maxOutput);
        if (timedOut) {
          this._audit('timeout', { command, timeout: cmdTimeout });
          resolve({ ok: false, output, error: `TIMEOUT (${cmdTimeout}ms)` });
        } else if (code !== 0 && stderr.trim()) {
          this._audit('fail', { command, exitCode: code, error: stderr.trim().slice(0, 200) });
          resolve({ ok: false, output, error: `exit ${code}: ${stderr.trim().slice(0, 1000)}` });
        } else {
          this._audit('ok', { command, exitCode: code, bytes: output.length });
          resolve({ ok: true, output: output || `(exit ${code})` });
        }
      });

      child.on('error', err => {
        clearTimeout(timer);
        this._audit('error', { command, error: err.message });
        resolve({ ok: false, output: '', error: 'spawn error: ' + err.message });
      });
    });
  }

  // Write a temp file in the sandbox and return its path
  writeTemp(filename, content) {
    const dest = path.join(this.dir, filename);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, content, 'utf8');
    this._audit('writeTemp', { file: filename, bytes: content.length });
    return dest;
  }

  // List files in sandbox directory
  listDir(subPath) {
    const dir = subPath ? path.join(this.dir, subPath) : this.dir;
    return fs.readdirSync(dir, { withFileTypes: true }).map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'dir' : 'file',
      size: e.isFile() ? fs.statSync(path.join(dir, e.name)).size : 0,
    }));
  }

  // Read a file from sandbox
  readFile(subPath) {
    const abs = path.join(this.dir, subPath);
    return fs.readFileSync(abs, 'utf8');
  }

  // Cleanup the sandbox directory
  destroy() {
    if (this._closed) return;
    this._closed = true;
    try { fs.rmSync(this.dir, { recursive: true, force: true }); } catch {}
    this._audit('destroy', {});
    dlog('sandbox', 'info', 'Sandbox destroyed', { session: this.id, auditEntries: this.auditLog.length });
  }

  // Get audit trail as text
  auditTrail() {
    return this.auditLog.map(e =>
      `[${new Date(e.ts).toISOString()}] ${e.action}: ${JSON.stringify(e)}`
    ).join('\n');
  }
}

// ── Convenience: run a single command in a throwaway sandbox ──
async function sandboxRun(command, opts = {}) {
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
        try { session.mirrorOut(src, dest); } catch (e) {
          result.mirrorErrors = result.mirrorErrors || [];
          result.mirrorErrors.push(`${src}: ${e.message}`);
        }
      }
    }
    result.sessionId = session.id;
    result.auditTrail = session.auditTrail();
    result.sandboxDir = session.dir;
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
      path.join(QROOT, 'workspace'),
      os.tmpdir(),
    ],
    writeRoots: [
      path.join(QROOT, 'workspace'),
      os.tmpdir(),
      path.join(QROOT, 'skills'),
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
    readRoots: [
      path.join(QROOT, 'workspace'),
      os.tmpdir(),
    ],
    writeRoots: [
      os.tmpdir(),
    ],
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

// Cleanup all sessions on exit
process.on('exit', () => {
  for (const [id, session] of activeSessions) {
    try { session.destroy(); } catch {}
  }
});

module.exports = {
  CapabilityFS,
  SandboxSession,
  sandboxRun,
  createSession,
  destroySession,
  getSession,
  listSessions,
  defaultSandboxOpts,
  strictSandboxOpts,
};

