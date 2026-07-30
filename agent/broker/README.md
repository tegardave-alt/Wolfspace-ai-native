# Capability Broker

An object-capability pattern for running untrusted agent code, modelled on
hardware-wallet delegation (the code never holds the "key" — it asks a
trusted broker to act on its behalf, request by request) rather than
sandbox-style containment (build a wall around the code).

## Architecture

```
┌───────────────────────┐          ┌───────────────────────────┐
│  ZONE (untrusted)      │ request  │  BROKER (trusted host)     │
│  separate Node process │─────────▶│  • Policy.evaluate()       │
│  --permission, no      │◀─────────│  • executes if allowed     │
│  --allow-fs-read/write │  result  │  • audit log (every call)  │
└───────────────────────┘          └───────────────────────────┘
```

- **`policy.cjs`** — deny-by-default rules: `{ fetch: {hosts:[...]}, readFile: {roots:[...]}, writeFile: {roots:[...]} }`.
- **`host.cjs`** (`Broker`) — the only thing with real `fs`/`https` access. Validates every request against `Policy` before executing, logs every decision.
- **`zone-process.cjs`** / **`zone-worker.cjs`** — spawns the untrusted code in a _separate_ Node process launched with `--permission` and zero `--allow-fs-*` grants, bridging capability requests back to the Broker over IPC.

## Why it's a separate process, not `vm`

The first implementation (deleted, see commit history) ran task code inside
`vm.createContext()` — a "zero ambient authority" JS realm with `request()`
as the only injected global. **It failed a real test**: the classic escape
`this.constructor.constructor('return process')()` reached the host's real
`process` object, and from there `require('fs')` had full disk access —
exactly the `cloud-keys.json` leak this whole broker exists to prevent.
This matches Node's own docs: _"the vm module is not a security mechanism."_

The fix wasn't patching that one escape (whack-a-mole) — it was changing
what the boundary actually _is_. `zone-worker.cjs` runs in a real OS
process launched with `--permission`, Node's built-in permission model. That
enforcement lives at the native `fs` binding layer, not at a JS-realm
boundary, so it doesn't matter how code gets a `require`/`fs` reference —
direct call, `constructor` chain, whatever. Re-running the _exact same_
escape payload against this version: the code still reaches the real
`process` object (there's no realm to escape — it's honestly the same
process), but the `fs.readFileSync` call it then makes is denied by the
runtime. Verified in `test 4a` (see below).

## What this does and doesn't protect

✅ **Protects**: filesystem reads/writes going through Node's own `fs` API in
the zone process — the exact class of bug found in `agent/sandbox.cjs`
testing (reading `cloud-keys.json` despite `readRoots`).

⚠️ **Network: platform-dependent.** On **Linux** the zone runs under
`unshare -n` and has no route out at all — direct `http.get()` fails, only
`request('fetch')` works (see "Network containment" below). On **Windows** it is
**not** protected: Node's permission model has no `--allow-net` equivalent, so
`fetch`/`http` go through the Broker only voluntarily and nothing stops the zone
from calling `http.get()` directly.

❌ **Does not protect** against
native addons, worker threads, or child-process spawning unless separately
gated with `--allow-child-process`/`--allow-worker`/`--allow-addon`. Does
not limit CPU/memory (that's a different problem — see the Job Object
investigation in project history, which found Windows' memory limit doesn't
even bind to Node processes reliably).

## Status

**Wired into production.** Exposed to the model as the `capability_exec` tool
(`agent/tools/tool-definitions.cjs`) and dispatched at `agent/tools/index.cjs`
(`name === "capability_exec"`), which builds the `Policy` per call: `readFile`/
`writeFile` scoped to the active workspace dir, `fetch` scoped to known
cloud-provider hosts from `agent/cloud.cjs`.

> An earlier revision of this section said "prototype, not wired into
> `agent/tools/index.cjs` or `self_agent.cjs`". That was stale — the wiring
> landed but the doc wasn't updated. Kept as a note because stale docs cost
> real time in this repo before (see the `WOLFSPACE-sandbox` uppercase-tag
> comment that survived the fix that removed the bug).

### Re-verified against the live tool

Probes run through `runSelfTool("capability_exec", …)`, not standalone:

| Probe                                                                | Result                                            |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| `require('fs').readFileSync` outside workspace                       | denied — `ERR_ACCESS_DENIED`                      |
| vm-escape payload `this.constructor.constructor('return process')()` | denied — `ERR_ACCESS_DENIED`                      |
| `request('readFile')` outside policy roots                           | denied by Broker policy                           |
| `fs.writeFileSync` outside workspace                                 | denied — `ERR_ACCESS_DENIED`                      |
| direct `https.get()` bypassing `request()`                           | **succeeded** on Windows / **denied** under netns |

Two distinct layers show up in those results and both matter: A/B/D are refused
by the **Node runtime** (`ERR_ACCESS_DENIED`, i.e. `--permission`), while C is
refused by the **Broker policy**.

### Network containment (Linux only)

The last row used to succeed everywhere, because Node's permission model has no
network dimension at all — there is no flag to add. Patching it _from inside_ the
zone is not a boundary either: replacing `http/https/net/tls/dgram` in
`require.cache` and then attacking it, `require('node:https')` gets through (a
different cache key) and `process.binding('tcp_wrap')` gets through (it sits
_below_ the module layer) — 2 of 5 attempts, first try. That is the same mistake
as the old `vm.createContext` zone: hiding references instead of removing
capability.

The real boundary is the kernel. On Linux the zone is launched under
`unshare -n`, giving it an empty network namespace — loopback only, no route.
The IPC channel **survives**, because its socketpair is already open before the
process enters the namespace, so `request()` keeps working: the Broker runs in
the host, which still has network.

Same attack table, same broker code, measured on WSL2 (kernel 6.18, node
v24.16.0):

| Probe                                      | Windows (fork)         | Linux (`unshare -n`)     |
| ------------------------------------------ | ---------------------- | ------------------------ |
| direct `https.get()` bypassing `request()` | succeeded — status 403 | **denied — `EAI_AGAIN`** |
| `request('fetch')` to an allow-listed host | ok — status 403        | **ok — status 403**      |

Cost is not measurable: spawning under `unshare -n` ran at a 78.3 ms median vs
95.0 ms for a plain spawn, with overlapping ranges. No daemon, no container pool.

Windows has no equivalent: firewall rules are per-executable and the zone is the
_same_ `node.exe` as the host, so no rule can tell them apart. There
`netnsWrapper()` returns null and behaviour is unchanged.

### Running the backend in WSL (how to actually get this on Windows)

Since containment is Linux-only, the backend has to run inside WSL and Electron
points at it. Steps that were **not** obvious, recorded so they don't have to be
re-derived:

1. **Node ≥ 23 inside the distro.** `--permission` was `--experimental-permission`
   before that, and Alpine's `apk` only ships Node 20. Install a musl build to a
   separate prefix (`/opt/node24`) so the system Node stays untouched:
   `unofficial-builds.nodejs.org/download/release/v24.16.0/node-v24.16.0-linux-x64-musl.tar.xz`.
2. **Copy the repo into the WSL filesystem**, not `/mnt/c`, and `npm install`
   there. Installing over `/mnt/c` would overwrite the Windows `node_modules`
   (native binaries differ per platform). `git archive HEAD | tar -x` works.
3. **`node-pty` needs building from source** — no linux prebuild ships. Requires
   `apk add python3 make g++ linux-headers`, plus **node-gyp ≥ 10**: the bundled
   v9 fails with `ModuleNotFoundError: No module named 'distutils'` because
   Python 3.12 removed it. And pass `--dist-url=https://nodejs.org/dist`, since
   gyp otherwise looks for headers on unofficial-builds and 404s.
   Without this the server still runs — terminals just report `PTY_UNAVAILABLE`.
4. **Point the UI at it**: `WOLFSPACE_BACKEND=http://<wsl-ip>:8090/`. Both
   `electron/main.js` (loadURL) and `electron/preload.js` (drops the `ipc` flag,
   so the frontend uses its HTTP path) read that variable.
5. **Use the WSL IP, not `127.0.0.1`.** WSL2's localhost forwarding proved
   unreliable here — it worked, then stopped mid-session while the server was
   still serving fine from inside the distro. The IP changes on restart.

Steps 1–3 are one-time setup. After that just run:

```
npm run app:wsl
```

`scripts/wsl-app.cjs` starts the backend inside the distro, **holds** that
`wsl.exe` process (WSL kills the distro — and the server with it — as soon as the
last session closes, so a detached/`nohup` server does not survive), waits for
`/healthz`, detects the current distro IP, and launches Electron with
`WOLFSPACE_BACKEND` set. Closing the app stops the backend. Override with
`WOLFSPACE_WSL_DISTRO`, `WOLFSPACE_WSL_DIR`, `WOLFSPACE_WSL_NODE`, `PORT`.

Verified end to end this way: full suite **59/59 in WSL** (Windows skips the 3
netns behaviour tests), and a real agent run driven from Windows over HTTP
answered _"Linux x86_64 … WSL2 … kernel 6.18"_ after running `uname -a` itself.

## How it compares to the Docker sandbox

Both hold the filesystem, but for different reasons, and that difference decides
which one to reach for:

|                  | Docker sandbox                                 | Capability broker                                   |
| ---------------- | ---------------------------------------------- | --------------------------------------------------- |
| Filesystem       | file simply **is not there** (nothing mounted) | file is visible but the `fs` call is **refused**    |
| Network          | blocked (`--network none`)                     | blocked on Linux (`unshare -n`); **not** on Windows |
| Granularity      | all-or-nothing per container                   | per request, with audit trail                       |
| Requires install | Docker Desktop                                 | **no** — plain Node                                 |

That last row is why the broker matters on Windows, where
`agent/platform/windows.cjs` reports `fsIsolation: 'advisory'` and
`networkIsolation: false`: the broker is the only thing that gives _enforced_
filesystem limits without asking the user to install Docker. It is not a
replacement for Docker — the network gap is real.

Next step to make this real everywhere: replace `sandbox_run`'s use of
`agent/sandbox.cjs` with this broker for capability-sensitive operations
(fetch, file access outside the workspace), keeping `sandbox.cjs`'s
process-tree-kill/timeout/cleanup machinery for the parts that already work
well. Still not exercised on macOS/Linux; `zone-worker.cjs` is pure Node so it
should be portable, but that hasn't been run there.
