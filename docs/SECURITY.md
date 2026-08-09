# Security & resiliency model

Detail behind the summaries in the [README](../README.md). This document describes how
WOLFSPACE isolates code execution and survives bad edits — including what each layer
does **not** protect against.

> This is an architecture document, not a vulnerability-disclosure policy.

---

## Trust levels

Code execution and file access happen at **three different trust levels**. Know which one
a given tool gives you.

| Layer                                       | What it's for                                                   | What it actually enforces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`sandbox_run`** (`agent/sandbox.cjs`)     | Isolating crashes/hangs during normal dev use                   | Runs in a throwaway temp dir with a remapped home, a timeout that kills the _whole_ process tree (`taskkill /F /T` / process-group kill), and auto-cleanup. On **Windows** (no `bwrap`), `readRoots`/`writeRoots`/`network` are **advisory only** — the spawned process has normal OS-level access. On **Linux with bubblewrap installed**, the platform adapter transparently wraps the command in `bwrap`, making isolation real — same tool, same options, stronger guarantee depending on what the OS can actually provide. |
| **`capability_exec`** (`agent/broker/*`)    | Running code that must not read/write outside an explicit scope | Task code runs in a separate process launched with Node's `--permission` flag and **zero** filesystem grants. Its only way to affect anything is `await request(capability, params)`, checked by a deny-by-default `Policy` and logged to an audit trail. Does **not** cover network egress (no `--allow-net` exists yet in Node), worker threads, or native addons.                                                                                                                                                            |
| **Bash jail** (`agent/tools/bash-jail.cjs`) | Confining the `bash` tool without a daemon                      | **Linux only.** `unshare -m -n -p -f --mount-proc` + a chroot built from read-only bind mounts of `/bin /sbin /usr /lib /lib64`, a `tmpfs` workdir, a minimal `/dev`, and `ulimit` caps (256 procs, 512MB address space, 60s CPU). Empty network namespace, so there is no route out at all. On Windows the tool falls back to a path guard, which is advisory.                                                                                                                                                                 |

### Verified against a real escape attempt

The broker was tested with the classic `vm`-escape payload:

```js
this.constructor.constructor("return process")();
```

It **still reaches a `process` object** — that part of the escape works. But the subsequent
`fs` call is denied by the Node runtime regardless of how the reference was obtained,
because `--permission` is enforced at the native binding layer rather than by hiding
globals. Enforcement that depends on hiding references is defeated by this payload;
enforcement at the binding layer is not.

### The Docker execution sandbox was removed

This document used to describe a fourth level: a throwaway container per execution, driven
by `runSandboxed()` in `server.cjs` and `_runBashInDocker()` in `agent/tools/index.cjs`.
Both callers are gone. What made it removable rather than a regression:

- `_runBashInDocker()` self-activated whenever a Docker daemon happened to be running, with
  **no config flag** — so the confinement of the bash tool depended on whether an unrelated
  background service was up. `bash-jail.cjs` replaces it with a namespace jail that needs no
  daemon and therefore can't silently switch itself off.
- `runSandboxed()` was gated on `"sandbox": true` in `config.json`, **unset by default**, so
  in the default posture it never ran. `agent/runners.cjs` still exports the name; nothing
  calls it.

`sandbox/Dockerfile` has now been deleted too, along with the root `Dockerfile`,
`.dockerignore`, `config.docker.json`, and the CI job that built them. It was kept for a
while as a CI-verified non-root image, but nothing in the app shelled out to `docker run`,
so it only proved that an unused file still compiled.

### Default posture

WOLFSPACE runs generated and agent code **on your machine, with your permissions**, like
other local AI coding tools. Keep it bound to `127.0.0.1` and **don't expose the server to a
network**. On Windows the kernel-level containment (netns, bash jail) does not apply at all
unless you launch via `npm run app:wsl`; the filesystem layer (`--permission`) applies on
both.

---

## Linux: namespaces + cgroups

`LinuxAdapter` (`agent/platform/posix.cjs`) wraps sandboxed commands in
[bubblewrap](https://github.com/containers/bubblewrap) — unprivileged Linux namespaces,
the same primitive Flatpak uses — instead of running them unconfined. This was validated
on a real WSL2 Linux kernel, as a **non-root user**, against the same payloads used to
test the Windows path:

| Test                                     | Windows (Job Object — tried and rejected)                   | Linux (bubblewrap + cgroup v2)                                                                              |
| ---------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 300MB alloc vs. a 128MB memory cap       | not enforced — the allocation succeeded                     | `memory.max` + `memory.swap.max=0` → real kernel OOM kill (`SIGKILL`; `memory.events` showed `oom_kill: 1`) |
| Outbound HTTP to a non-allowlisted host  | not covered by `capability_exec` (no `--allow-net` in Node) | `--unshare-net` → `ECONNRESET`, no interface exists in the namespace                                        |
| Reading a file outside the granted scope | `ERR_ACCESS_DENIED` (file visible, access refused)          | `ENOENT` — the file isn't mounted, so it doesn't exist from the process's point of view                     |

Note the difference in the last row: denying access still reveals that a file exists.
Namespace isolation removes it from the process's view entirely.

**Two honest caveats:**

- Namespace isolation (`fsIsolation`/`networkIsolation`) works unprivileged and is used
  automatically whenever `bwrap` is on `PATH` — `capabilities()` probes for it at runtime
  rather than assuming it.
- The memory-cap path (`wrapWithMemoryLimit`, via `systemd-run --user --scope`) needs
  cgroup v2 delegation, which systemd-based user sessions get automatically but a bare
  container/init does not — confirmed by testing: a non-root user got `EACCES` trying to
  create its own cgroup directly. `capabilities().resourceLimits` reflects whether
  `systemd-run` was actually found, not whether Linux theoretically supports it.

---

## Resiliency

The frontend and backend both assume any given edit — by the agent, by a bad model
completion, or by you — might be broken, and are built to survive that:

1. **Safe-edit** (`agent/safe-edit.cjs`) — every agent file write goes through
   snapshot → syntax-check → apply-or-quarantine. A syntactically broken write never
   reaches disk.
2. **Babel sandbox with auto-rollback** (`public/index.html`) — the UI compiles
   `app.jsx` in the browser; a compile error or an uncaught runtime error
   (`window.onerror`, `unhandledrejection`, and a React `ErrorBoundary` all feed the
   same path) reloads the last version that rendered successfully, with a 60s
   anti-loop guard.
3. ~~**Server auto-rollback** (`start.cjs`)~~ — **removed.** The supervisor that restored
   `server.cjs` from the last build that stayed up 10+ seconds no longer exists.
4. ~~**Bypass lane** (`server/static-server.cjs`)~~ — **removed.** The second, independent
   static process that kept the UI reachable during an API crash no longer exists.

   Both went out together, and the loss is real: a crashing `server.cjs` now stays down
   until restarted by hand, and takes the UI with it. They are listed here rather than
   deleted from the doc because "we used to have this" is the kind of fact that costs time
   when it goes missing — see the stale-doc note in `agent/broker/README.md`.

---

## Known gaps

- `capability_exec` gets no network enforcement from Node itself — there is no
  `--allow-net`. The isolation comes from the kernel (`unshare -n`), so it exists only on
  Linux, and on Windows only under `npm run app:wsl`.
- `MacAdapter` shares `PosixAdapter`'s advisory-only behavior; Seatbelt
  (`sandbox-exec`) is not wired up, and nothing here has been verified on real macOS
  hardware.
- Windows has no namespace equivalent in use. AppContainer / restricted tokens are on
  the roadmap; Job Objects were tried and rejected — they don't reliably bind Node's
  memory use.
