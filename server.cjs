"use strict";

// LAUNCHER. The application lives in server.ts; this file exists to get there.
//
// Every entry point that can reach a .ts module must install the require() hook
// FIRST (see scripts/ts-register.cjs), and an entry point cannot install a hook
// for itself: Node has already chosen how to load it. CI also runs Node 20,
// which cannot load .ts at all, so `node server.ts` would work on a modern dev
// machine and die in CI — the exact divergence the hook exists to prevent.
//
// Keeping the .cjs name is deliberate rather than leftover. Roughly thirty
// places name this path — package.json start/dev, electron/main.ts's spawn,
// build.files, the CI packaging check, playwright.config.cjs, core.js — and a
// launcher is precisely what this project's language split reserves CommonJS
// for. Re-exporting means `require("./server.cjs")` keeps returning the same
// surface it always did.
// V8 COMPILE CACHE. ts-register already caches its TRANSPILED output (text), but
// V8 still parses and compiles that JS to bytecode on every launch. This caches
// the bytecode too, so a warm start skips the compile. Node 22.8+; the optional
// call is a no-op on older Node (CI still runs Node 20), and the try/catch keeps
// a cache-dir problem from ever blocking boot — it is an optimisation, not a
// dependency. Called BEFORE ts-register so the whole agent graph is covered.
try {
  require("module").enableCompileCache?.();
} catch (_) {}
require("./scripts/ts-register.cjs");
module.exports = require("./server.ts");
