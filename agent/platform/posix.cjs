// ── POSIX platform adapter (base for macOS & Linux) ──
'use strict';

const { execSync } = require('child_process');
const { PlatformAdapter } = require('./adapter.cjs');

class PosixAdapter extends PlatformAdapter {
  get name() { return 'posix'; }

  capabilities() {
    return {
      processTreeKill: true,       // detached process group + kill(-pid)
      fsIsolation: 'advisory',
      networkIsolation: false,
      resourceLimits: false,
    };
  }

  shellFor(command) {
    return ['/bin/sh', ['-c', command]];
  }

  // Run the shell as its own process-group leader so the entire tree can be
  // signalled with a single negative-pid kill.
  spawnOptions() {
    return { detached: true };
  }

  killTree(child) {
    if (!child || !child.pid) { try { child && child.kill('SIGKILL'); } catch (_) {} return; }
    try {
      // Negative pid => signal the whole process group (child + its descendants).
      process.kill(-child.pid, 'SIGKILL');
    } catch (_) {
      try { execSync(`pkill -KILL -P ${child.pid}`); } catch (__) {}
      try { child.kill('SIGKILL'); } catch (___) {}
    }
  }

  sandboxEnv(sessionDir) {
    return {
      PATH: process.env.PATH,
      TMPDIR: sessionDir,
      HOME: sessionDir, // contained home so untrusted code can't read the real one
    };
  }
}

// macOS and Linux share the POSIX base today. They are separate classes so each
// can later declare/enable native isolation (Seatbelt on macOS; namespaces +
// seccomp / bubblewrap on Linux) without touching the other or the sandbox.
class MacAdapter extends PosixAdapter {
  get name() { return 'macos'; }
  // Future: capabilities().fsIsolation -> 'enforced' via sandbox-exec profile.
}

class LinuxAdapter extends PosixAdapter {
  get name() { return 'linux'; }
  // Future: capabilities().fsIsolation -> 'enforced' via bubblewrap/namespaces.
}

module.exports = { PosixAdapter, MacAdapter, LinuxAdapter };
