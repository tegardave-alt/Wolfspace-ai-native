# TypeScript migration — what is done, and what stays CommonJS

This records the decisions, not the progress. Progress is visible in the file
extensions; decisions are not, and without them the next person re-litigates the
same questions.

## The language split

```
TypeScript  application, contracts, UI, IPC, API, light orchestration
Python      agent/AI workflows that need LangGraph/LangChain
Rust/C++    native runtime and heavy CPU/GPU work (profiling-driven only)
CJS/JS      launchers and simple scripts
PowerShell  Windows installers and automation
```

Everything written INTO a file — code, comments, JSDoc, config comments — is in
English. Narrow, documented exceptions only: strings that stored data must match,
wire-contract field names, and verbatim citations of Indonesian text the code
itself matches (tagged `verbatim`, which
`tests/migrated-code-is-english.test.js` honours).

## The two entry points that keep a .cjs launcher

`server.cjs` and the `.ts` hook it installs are the pattern, and the reason is
the same in both cases: **an entry point cannot install a require() hook for
itself.** Node has already decided how to load it. CI runs Node 20, which cannot
load `.ts` at all, so `node server.ts` would work on a modern dev machine and
die in CI — the exact divergence `scripts/ts-register.cjs` exists to prevent.

- **`server.cjs`** — three lines: install the hook, re-export `./server.ts`.
  Around thirty places name this path (package.json start/dev, the spawn in
  `electron/main.ts`, `build.files`, the CI packaging check,
  `playwright.config.cjs`, `core.js`). The launcher keeps every one of them
  working. Note that `require.main === module` no longer identifies the entry
  point inside `server.ts`; the gate there recognises the launcher too.
- **`electron/main.js`** — GENERATED from `electron/main.ts` by
  `scripts/build-main.cjs`, the same way `preload.js` is generated from
  `preload.ts`. Electron's main entry must be `.js`, and transpiling at load
  measured ~286 ms against a startup budget deliberately cut from 1071 ms to
  314 ms.

  Neither generated file is committed. `.gitignore` excludes both, CI builds
  them before `electron-builder` runs, and the packaged asar is verified to
  contain both. `tests/main-terbangun.test.js` and
  `tests/preload-terbangun.test.js` assert against `bangun()` — the build
  function — rather than against a file on disk, which is stricter: a stale
  artefact could satisfy a disk read and cannot satisfy a fresh build. They
  also pin the ordering in `ci.yml`, because losing that build step is the one
  way this arrangement ships an app with no main process.

## The renderer is compiled ahead of time too

`public/index.html` used to fetch fifteen `.tsx`/`.jsx` files and compile them
with a vendored Babel INSIDE THE BROWSER, on every load, before a pixel was
drawn. Measured A/B on this machine, identical conditions, one variable:

|                            | `RENDERER-STOP` | main thread |
| -------------------------- | --------------- | ----------- |
| with `public/app.build.js` | never fired     | 912 ms      |
| compiling in the browser   | ~3053 ms        | 1206 ms     |

`scripts/build-app.cjs` produces that file. Two properties are load-bearing and
easy to break without noticing:

- **transform, never bundle.** These files carry no `import`/`export` on purpose;
  they are concatenated in a fixed order into ONE global scope, and components
  defined in later files are referenced by earlier ones through hoisting. A
  bundler would give each its own scope and the app would break at first render.
- **the order is READ FROM `index.html`**, not copied into the builder. Two
  surfaces holding the same list is how this repo has produced bugs before.

The in-browser Babel path REMAINS, and is not hedging: the agent edits its own
UI source and HMR re-runs `loadApp()`, at which point the prebuilt file is stale
by definition. The HMR handler passes `{ segar: true }` to skip it. That also
means a fresh clone works before anything has been built — just slower.

Because Babel is still loaded for that fallback, the CSP still needs
`unsafe-eval`. Removing it is a separate decision, not a side effect of this.

## What stays CommonJS under `scripts/`, and why

Not leftovers. Each is a launcher or a standalone script, which is what the split
reserves CommonJS for.

| File                                                                                  | Why it stays                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ts-register.cjs`                                                                     | It _is_ the hook. It cannot be TypeScript.                                                                                                                                                                                                                                                                                                                       |
| `build-main.cjs`, `build-preload.cjs`                                                 | They compile the TypeScript. Making them TypeScript would make the build depend on the thing it builds.                                                                                                                                                                                                                                                          |
| `app.cjs`, `wsl-app.cjs`                                                              | Launchers.                                                                                                                                                                                                                                                                                                                                                       |
| `mcp-http-bridge.cjs`                                                                 | A **spawned entry point whose command string is persisted in user configuration**. `public/app/Config.tsx` resolves an HTTP MCP server to `{command:"node", args:["scripts/mcp-http-bridge.cjs", url]}`, and that resolution is saved into `config/mcp.json`. Renaming the file would break existing installs silently, at connect time, with no migration path. |
| `kompres-aset.cjs`, `three/build.cjs`, `reactflow/build.cjs`, `ikon-bahasa/build.cjs` | Asset/vendor build scripts, run standalone.                                                                                                                                                                                                                                                                                                                      |
| `ambil-js-debug.cjs`                                                                  | A one-shot fetcher, run by hand. `core/dap.ts` names it in the message it prints.                                                                                                                                                                                                                                                                                |
| `langgraph-flow-server.cjs`, `telemetri-ke-n8n.cjs`, `stress.cjs`, `profil-beku.cjs`  | Standalone dev/ops tools; nothing in the application's runtime graph reaches them.                                                                                                                                                                                                                                                                               |

`scripts/ww.ts` is the exception that proves the rule: `server.ts` requires it on
every `/ww` route, so it is backend code that happens to live under `scripts/`.
It is type-checked with `server.ts` in `tsconfig.server.json`, and its CLI is
reachable through `npm run ww -- <command>`, which carries the hook.

## The cost of loading TypeScript at run time, and where it went

`scripts/ts-register.cjs` transpiles with esbuild on require. A cold backend
start loads 30 `.ts` files totalling 684 KB, and that transpile was 37% of
`require("./core.js")` — paid again on every launch, for output that is a pure
function of the file's bytes.

There are now TWO cache tiers, and they survive different things:

- **in memory, on `globalThis`** — survives a `require.cache` drop. Hot-reload
  discards every project entry, and the agent triggers that on its own edits.
- **on disk, `node_modules/.cache/wolfspace-ts`** — survives a process restart,
  which the memory tier cannot.

Measured in one session, same machine:

|                        | `require("./core.js")` |
| ---------------------- | ---------------------- |
| `WOLFSPACE_TS_CACHE=0` | 711 / 841 / 684 ms     |
| warm disk cache        | 296 / 305 / 276 ms     |

Three properties are load-bearing:

- **the key is CONTENT**, plus the esbuild version and the transform options. A
  key based on path or mtime would serve an edited file its old compile, which
  looks like the source is haunted; a key without the compiler version would keep
  serving the previous esbuild's work after an upgrade.
- **the write is NOT awaited.** Writing those 30 files synchronously measured
  435 ms of blocked startup, which made the first run of any edited file slower
  than no cache at all. The compile is already in hand; persisting it is for the
  next process.
- **every disk operation degrades to "just transpile".** In a packaged app
  `node_modules` is inside `app.asar` and read-only. A cache that can break
  startup is a bug, not an optimisation.

`WOLFSPACE_TS_CACHE=0` turns the disk tier off. The directory needs no pruning:
`npm ci` deletes `node_modules` outright, so it self-cleans on every clean
install.

## Two orchestrators, one set of guarantees

Phase 10 put a LangGraph state machine in `services/agent-python/`. It decides
which node runs next; everything a node actually DOES stays on the host —
the model call, the tool call, the sandbox, the broker, the audit ledger.

Both orchestrators call the SAME `runSelfTool`, so a tool runs in the same
AppContainer, the same broker, and the same ledger whichever one asked. An agent
whose security boundary depended on which code path invoked it would be no
boundary at all.

Anything a run relies on lives in ONE module with two callers, never a copy:

| shared                                         | module                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| approval gate, evidence check, repeat backstop | `agent/penjaga-agent.ts`                                                 |
| planner checklist, provider fallback           | `agent/perencana-agent.ts`                                               |
| findings journal                               | `agent/temuan.ts` — the WRITES were already shared, inside `runSelfTool` |

Two predicates in that set look interchangeable and are not:

- `penjaga.galatSementara` — "retry the SAME provider?" Transport shapes only.
- `perencana.layakGantiProvider` — "try ANOTHER provider?" Also auth and quota.

A 401 is not worth retrying against the same key, but it is exactly the reason
to reach for the next one. Collapsing them would silently disable fallback for
dead keys — on a real run here, 8 of the 10 keys in `CLOUD_KEYS` were dead.

### Running it

```
WOLFSPACE_AGENT_PY=1
```

`/self-agent` asks `pythonAgentEnabled()` per REQUEST, so the flag can be
flipped without a restart. The JS loop is the default and stays it; if the
Python module fails to load, the request falls back rather than failing.

For a long time that flag did nothing at all: `pythonAgentEnabled()` read it and
nobody read `pythonAgentEnabled()`. "It is opt-in" was true of the code and
false of the product — which is its own kind of bug, and the reason
`tests/agent-pemilihan-orkestrator.test.js` now pins the switch itself.

## The three ratchets

`tests/kontrak-tipe.test.js` holds one list, `SUDAH_TYPESCRIPT`, and derives
three guarantees from it:

1. a migrated file stays `.ts`;
2. every migrated file is actually REACHED by some tsconfig project (verified
   with `tsc --listFiles`, not by reading the `include` globs);
3. backend migrated files are MODULES, not global scripts.

Point 3 matters more than it looks. A `.ts` file with neither `import` nor
`export` is a global script, and all its top-level names share one scope with
every other script in the same project — so a name used twice becomes a
redeclaration error far from either definition. Files here carry `export {}`
rather than converting their requires to imports, because **imports hoist**, and
several load orders in this codebase are load-bearing (the lazy LangGraph require
that cut startup 1071 ms -> 314 ms; the hook that must be installed before the
`.ts` routes it pulls in).

`public/app/*.tsx` are deliberately scripts: `index.html` concatenates them into
one scope.

## How a migration is verified

Type-checking and a green suite are necessary but not sufficient — both have
passed over a real behaviour change more than once. The check that catches it:

```
esbuild.transformSync(source, { minifyWhitespace: true })
```

on the pre-migration file and the migrated one. Minifying whitespace drops
comments, so what remains compares code against code. Every intentional change is
applied to the baseline first, and anything still differing is an accident.

That check is what caught an `options` parameter added to the wrong function, and
what proved that translating 376 comment lines in `server.ts` swallowed no code.

## Known issues surfaced by the migration, deliberately NOT fixed

Flagged in place rather than fixed in passing, because fixing them changes
behaviour nobody asked to change:

- **`wsList()` in `server.ts`** — the IIFE `walk(dir, depth)` is called with one
  argument, so `depth` is `undefined`, `depth + 1` is `NaN`, and `depth > 8` is
  never true. **The depth cap is dead, and always has been.** The count cap (300)
  still bounds the walk. Switching the depth cap on would change what `wsList`
  returns for deep trees.
