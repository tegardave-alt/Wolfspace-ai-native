"use strict";

// Lets require() load .ts files directly, transpiled on the fly by esbuild —
// no separate build step. This is the runtime path for TypeScript modules
// introduced during the gradual CJS -> TS migration (see packages/contracts
// and docs on the migration phases). Safe to require multiple times; the
// extension handler is only installed once.
//
// EVERY ENTRY POINT THAT CAN REACH A .ts MODULE MUST REQUIRE THIS FIRST.
//
// Not just the app: CI runs Node 20, which has no TypeScript support of its own,
// so without this hook a .ts require fails outright. Node 22.18+/24 does strip
// types natively, which is exactly what makes the mistake easy to miss — the
// same code runs fine on a modern dev machine and dies in CI.
//
// Native stripping is also not a substitute here. This package declares
// "type": "commonjs", so Node reads a .ts file containing `import` or `export`
// as ESM and refuses it with "Cannot use import statement outside a module".
// esbuild converts the module form, so through this hook it simply works.
//
// The entry points that install it today:
//   server.cjs                  (line 1, before agent/mcp-client.ts)
//   agent/tools/index.ts       (reached directly by test subprocesses)
//   agent/plugins.ts
//   agent/self_agent.ts
//   scripts/mcp-http-bridge.cjs
//   tests/setup-jest.cjs        (plus tests/transformer-ts.cjs for Jest itself)
//
// electron/preload.ts is the deliberate exception: scripts/build-preload.cjs
// compiles it ahead of time, so it is never loaded through require() at all.

const fs = require("fs");
const esbuild = require("esbuild");

// Transpiled output is cached on globalThis, NOT in module scope.
//
// Hot-reload drops every project entry in require.cache (see electron/main.ts),
// and the agent triggers that on its own edits, repeatedly, mid-run. A cache
// living in module scope would be dropped with it and every .ts module in the
// graph would be transpiled again — a cost that grew with each migration phase
// until tests/tahan-hot-reload.test.js measured it crossing its budget.
//
// The key is the file's content, so an edited file is never served a stale
// compile: that is the whole point of the reload the cache is surviving.
const _cache =
  globalThis.__wolfspaceTsCache || (globalThis.__wolfspaceTsCache = new Map());

if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = function loadTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const key = filename + "\u0000" + source.length + "\u0000" + source;
    let code = _cache.get(key);
    if (code === undefined) {
      code = esbuild.transformSync(source, {
        loader: "ts",
        format: "cjs",
        target: "es2022",
        sourcefile: filename,
        sourcemap: "inline",
      }).code;
      // Keyed by content, so an entry for an older version of this file is dead
      // the moment the file changes — drop it rather than growing without bound
      // across a long session of edits.
      for (const k of _cache.keys()) {
        if (k.slice(0, filename.length + 1) === filename + "\u0000") {
          _cache.delete(k);
        }
      }
      _cache.set(key, code);
    }
    module._compile(code, filename);
  };
}
