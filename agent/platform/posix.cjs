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

// Linux: real namespace isolation via bubblewrap (unprivileged, no root/setuid
// needed -- confirmed by testing as a plain non-root user). Memory limits via
// cgroup v2 are a SEPARATE story: writing cgroup.procs/memory.max requires
// either root or a delegated subtree (systemd user sessions get one; a bare
// container/init like the one this was tested in does not) -- confirmed by
// testing: a non-root user got EACCES creating its own cgroup. So
// resourceLimits is probed at runtime (is systemd-run present?) rather than
// assumed, consistent with the capability-negotiation design of this adapter
// layer: report what's actually available, don't promise what isn't.
class LinuxAdapter extends PosixAdapter {
  get name() { return 'linux'; }

  capabilities() {
    return {
      processTreeKill: true,
      fsIsolation: this._hasBwrap() ? 'enforced' : 'advisory',
      networkIsolation: this._hasBwrap(),
      resourceLimits: this._hasSystemdRun(),
    };
  }

  _probe(bin) {
    const key = '__probe_' + bin;
    if (this[key] === undefined) {
      try { execSync(`which ${bin}`, { stdio: 'ignore' }); this[key] = true; }
      catch (_) { this[key] = false; }
    }
    return this[key];
  }
  _hasBwrap() { return this._probe('bwrap'); }
  _hasSystemdRun() { return this._probe('systemd-run'); }

  // opts: { cwd, networkAllowed } -- both optional, threaded through by
  // sandbox.cjs's exec(). Falls back to plain '/bin/sh -c' (PosixAdapter's
  // behaviour) when bwrap isn't installed, so this degrades gracefully
  // instead of failing outright on a minimal system.
  shellFor(command, opts = {}) {
    if (!this._hasBwrap()) return super.shellFor(command);
    const workDir = opts.cwd || process.cwd();
    const args = [
      '--ro-bind', '/usr', '/usr',
      '--ro-bind-try', '/lib', '/lib',
      '--ro-bind-try', '/lib64', '/lib64',
      '--ro-bind-try', '/bin', '/bin',
      '--ro-bind-try', '/sbin', '/sbin',
      '--ro-bind-try', '/etc/resolv.conf', '/etc/resolv.conf',
      '--proc', '/proc',
      '--dev', '/dev',
      '--bind', workDir, workDir, // read-write, but ONLY this directory
      '--chdir', workDir,
      '--die-with-parent',
    ];
    // Tested: with --unshare-net, an http request gets ECONNRESET at the
    // kernel level (no interface in the namespace) -- not an app-level
    // refusal. Only unshare when the caller explicitly disallows network,
    // since sandbox_run defaults to network-allowed.
    if (opts.networkAllowed === false) args.unshift('--unshare-net');
    args.push('--', '/bin/sh', '-c', command);
    return ['bwrap', args];
  }

  // Best-effort hard memory cap via systemd-run's cgroup delegation. Returns
  // the command unmodified if unavailable (see capabilities().resourceLimits
  // to know ahead of time whether this will actually do anything). Tested:
  // MemoryMax alone lets the kernel reclaim/swap instead of killing: only
  // combined with MemorySwapMax=0 does exceeding the limit trigger a real
  // OOM kill (confirmed: exit 137, cgroup memory.events showed oom_kill=1).
  wrapWithMemoryLimit(shellCmd, shellArgs, memoryMB) {
    if (!memoryMB || !this._hasSystemdRun()) return [shellCmd, shellArgs];
    return ['systemd-run', [
      '--user', '--scope', '--collect', '--quiet',
      '-p', `MemoryMax=${memoryMB}M`,
      '-p', 'MemorySwapMax=0',
      '--', shellCmd, ...shellArgs,
    ]];
  }
}

module.exports = { PosixAdapter, MacAdapter, LinuxAdapter };
