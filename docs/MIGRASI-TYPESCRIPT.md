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
