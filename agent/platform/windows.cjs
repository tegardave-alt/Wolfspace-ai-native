// ── Windows platform adapter ──
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
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
    // Passing `command` directly as a single `/c` argument requires it to
    // survive TWO layers of reparsing (Node's Windows spawn-arg escaping,
    // then cmd.exe's own quote handling). Proven to mis-handle embedded
    // double quotes -- e.g. `node -e "console.log(1)"` either silently
    // drops all output or hands node a corrupted string (a stray leading
    // `"` ends up as literal source text). Writing the command to a script
    // file and running THAT sidesteps both layers: the only thing that
    // needs quoting is a plain file path with no embedded quotes.
    try {
      const scriptPath = path.join(
        os.tmpdir(),
        `wolfspace-cmd-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.cmd`
      );
      fs.writeFileSync(scriptPath, command, 'utf8');
      // Not deleted inline: chaining `& del ...` after the command would
      // replace cmd.exe's exit code with del's, breaking exit-code
      // reporting. These are tiny one-shot files in the OS temp dir; leave
      // cleanup to the OS rather than corrupt the result.
      return ['cmd.exe', ['/d', '/c', 'call', scriptPath]];
    } catch (_) {
      return ['cmd.exe', ['/d', '/c', command]];
    }
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
