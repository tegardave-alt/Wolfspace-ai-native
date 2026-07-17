// ── Windows platform adapter ──
'use strict';

const path = require('path');
const { execSync } = require('child_process');
const { PlatformAdapter } = require('./adapter.cjs');

class WindowsAdapter extends PlatformAdapter {
  get name() { return 'windows'; }

  capabilities() {
    return {
      processTreeKill: true,       // taskkill /T walks the whole tree
      fsIsolation: 'advisory',     // capability roots gate JS helpers only (see sandbox.cjs)
      networkIsolation: false,     // QUANTUM_SANDBOX_NETWORK is only an advisory env flag
      resourceLimits: false,       // no Job Object yet — would upgrade fsIsolation->enforced
    };
  }

  shellFor(command) {
    return ['cmd.exe', ['/d', '/c', command]];
  }

  killTree(child) {
    if (!child || !child.pid) { try { child && child.kill('SIGKILL'); } catch (_) {} return; }
    // child.kill() would only kill cmd.exe; taskkill /T terminates the whole
    // tree (e.g. the `node hang.js` grandchild), /F forces it.
    try {
      execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore', timeout: 4000 });
    } catch (_) {
      try { child.kill('SIGKILL'); } catch (__) {}
    }
  }

  sandboxEnv(sessionDir) {
    const root = path.parse(sessionDir).root.replace(/[\\/]$/, ''); // e.g. "C:"
    return {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      SystemDrive: process.env.SystemDrive,
      ComSpec: process.env.ComSpec,
      TEMP: sessionDir,
      TMP: sessionDir,
      // Remap the user-profile family at the sandbox dir so untrusted code
      // can't read the real home path and stray writes stay contained.
      USERPROFILE: sessionDir,
      HOMEDRIVE: root,
      HOMEPATH: sessionDir.slice(root.length),
      APPDATA: sessionDir,
      LOCALAPPDATA: sessionDir,
    };
  }
}

module.exports = { WindowsAdapter };
