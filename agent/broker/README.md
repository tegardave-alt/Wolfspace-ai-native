# Capability Broker (prototype)

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
- **`zone-process.cjs`** / **`zone-worker.cjs`** — spawns the untrusted code in a *separate* Node process launched with `--permission` and zero `--allow-fs-*` grants, bridging capability requests back to the Broker over IPC.

## Why it's a separate process, not `vm`

The first implementation (deleted, see commit history) ran task code inside
`vm.createContext()` — a "zero ambient authority" JS realm with `request()`
as the only injected global. **It failed a real test**: the classic escape
`this.constructor.constructor('return process')()` reached the host's real
`process` object, and from there `require('fs')` had full disk access —
exactly the `cloud-keys.json` leak this whole broker exists to prevent.
This matches Node's own docs: *"the vm module is not a security mechanism."*

The fix wasn't patching that one escape (whack-a-mole) — it was changing
what the boundary actually *is*. `zone-worker.cjs` runs in a real OS
process launched with `--permission`, Node's built-in permission model. That
enforcement lives at the native `fs` binding layer, not at a JS-realm
boundary, so it doesn't matter how code gets a `require`/`fs` reference —
direct call, `constructor` chain, whatever. Re-running the *exact same*
escape payload against this version: the code still reaches the real
`process` object (there's no realm to escape — it's honestly the same
process), but the `fs.readFileSync` call it then makes is denied by the
runtime. Verified in `test 4a` (see below).

## What this does and doesn't protect

✅ **Protects**: filesystem reads/writes going through Node's own `fs` API in
the zone process — the exact class of bug found in `agent/sandbox.cjs`
testing (reading `cloud-keys.json` despite `readRoots`).

❌ **Does not protect**: network (Node's permission model has no `--allow-net`
equivalent yet — `fetch`/`http` must go through the Broker voluntarily;
nothing stops the zone process from calling `http.get()` directly if the
task code does so instead of using `request()`). Does not protect against
native addons, worker threads, or child-process spawning unless separately
gated with `--allow-child-process`/`--allow-worker`/`--allow-addon`. Does
not limit CPU/memory (that's a different problem — see the Job Object
investigation in project history, which found Windows' memory limit doesn't
even bind to Node processes reliably).

## Status

**Prototype, not wired into `agent/tools/index.cjs` or `self_agent.cjs`.**
Validated standalone with 9 test scenarios (safe requests, policy
violations, direct bypass attempts, the vm-escape payload, audit trail,
timeout) — all passing on Windows. Not yet exercised on macOS/Linux; `zone-worker.cjs`
itself is pure Node so it should be portable, but this hasn't been run there.

Next step to make this real: replace `sandbox_run`'s use of `agent/sandbox.cjs`
with this broker for capability-sensitive operations (fetch, file access
outside the workspace), keeping `sandbox.cjs`'s process-tree-kill/timeout/
cleanup machinery for the parts that already work well.
