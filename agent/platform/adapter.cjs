// ── Platform Adapter contract ──
// An MCP-style abstraction for OS-specific execution. One interface, many
// interchangeable per-OS implementations selected at runtime (see index.cjs).
//
// The parallel to MCP:
//   MCP protocol            -> this PlatformAdapter interface
//   MCP server              -> WindowsAdapter / MacAdapter / LinuxAdapter
//   MCP capability handshake -> capabilities(): callers ask "what can this OS do?"
//                               and degrade gracefully instead of assuming.
//
// Everything OS-specific (which shell, how to kill a process tree, how to
// remap the home dir for a contained env) lives behind this contract so the
// rest of the codebase (sandbox.cjs, agent tools) stays platform-agnostic.
'use strict';

class PlatformAdapter {
  // Human-readable id, e.g. 'windows' | 'macos' | 'linux'.
  get name() { return 'base'; }

  // Capability discovery — the MCP-style handshake. Callers read this and adapt.
  //   processTreeKill: can we terminate the whole child tree, not just the shell?
  //   fsIsolation:     'none' | 'advisory' | 'enforced'
  //                    - advisory  = capability roots gate our JS helpers only;
  //                      a spawned process still has full FS access.
  //                    - enforced  = the OS actually confines the process
  //                      (Job Object / namespaces / sandbox profile).
  //   networkIsolation: can we actually block network for a spawned process?
  //   resourceLimits:   can we cap CPU/memory at the OS level?
  capabilities() {
    return { processTreeKill: false, fsIsolation: 'none', networkIsolation: false, resourceLimits: false };
  }

  // Return [command, argsArray] to run a shell command line on this OS.
  shellFor(/* command */) { throw new Error(`${this.name}: shellFor() not implemented`); }

  // Extra spawn() options this OS needs (e.g. detached process group on POSIX
  // so the whole tree can be signalled). Merged into the caller's spawn opts.
  spawnOptions() { return {}; }

  // Kill the entire process tree rooted at the given child process object.
  killTree(/* child */) { throw new Error(`${this.name}: killTree() not implemented`); }

  // Build a contained base environment for a sandbox session: PATH + whatever
  // system vars the shell needs, with the home/temp family remapped to
  // sessionDir so untrusted code sees a contained home instead of the real one.
  sandboxEnv(/* sessionDir */) { throw new Error(`${this.name}: sandboxEnv() not implemented`); }
}

module.exports = { PlatformAdapter };
