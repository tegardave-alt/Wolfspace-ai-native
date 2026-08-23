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
const path = require("path");
const crypto = require("crypto");
const esbuild = require("esbuild");

const OPSI = {
  loader: "ts",
  format: "cjs",
  target: "es2022",
  sourcemap: "inline",
};

// TWO caches, because there are two different things to survive.
//
// IN MEMORY, on globalThis — survives a require.cache drop.
//
// Hot-reload drops every project entry in require.cache (see electron/main.ts),
// and the agent triggers that on its own edits, repeatedly, mid-run. A cache
// living in module scope would be dropped with it and every .ts module in the
// graph would be transpiled again — a cost that grew with each migration phase
// until tests/tahan-hot-reload.test.js measured it crossing its budget.
//
// ON DISK — survives a process restart, which the in-memory one cannot.
// Measured on this repo: a cold backend start loads 30 .ts files totalling
// 684 KB, and transpiling them costs 208 ms of the ~560 ms that
// require("./core.js") takes. That is 37% of backend startup paid again every
// launch, for output that is a pure function of the file's bytes.
//
// Both are keyed by CONTENT, so an edited file is never served a stale compile —
// that is the whole point of the reload the memory cache exists to survive.
const _cache =
  globalThis.__wolfspaceTsCache || (globalThis.__wolfspaceTsCache = new Map());

/**
 * Where compiled output is kept between runs, or null when nowhere is writable.
 *
 * node_modules/.cache is the conventional spot and is already ignored by git. In
 * a PACKAGED app it lives inside app.asar and is read-only, which is why every
 * disk operation here degrades to "just transpile" rather than failing: the
 * cache is an optimisation, and an optimisation that can break startup is a bug.
 */
function _direktoriCache() {
  if (globalThis.__wolfspaceTsDir !== undefined)
    return globalThis.__wolfspaceTsDir;
  let dir = null;
  // An escape hatch worth having: a cache that serves wrong output is the kind
  // of bug that looks like the source is haunted, and the first useful question
  // is "does it still happen with the cache off". Also how the before/after
  // numbers in the comment above were measured.
  if (String(process.env.WOLFSPACE_TS_CACHE || "") === "0") {
    globalThis.__wolfspaceTsDir = null;
    return null;
  }
  try {
    const d = path.join(
      __dirname,
      "..",
      "node_modules",
      ".cache",
      "wolfspace-ts",
    );
    fs.mkdirSync(d, { recursive: true });
    fs.accessSync(d, fs.constants.W_OK);
    dir = d;
  } catch (_) {
    dir = null; // read-only tree (packaged app), or no node_modules at all
  }
  globalThis.__wolfspaceTsDir = dir;
  return dir;
}

/** Cache file name for this exact source, under these exact options. */
function _namaCache(source) {
  return (
    crypto
      .createHash("sha1")
      .update(esbuild.version + " " + JSON.stringify(OPSI) + " " + source)
      .digest("hex") + ".js"
  );
}

if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = function loadTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const key = filename + "\u0000" + source.length + "\u0000" + source;
    let code = _cache.get(key);
    if (code === undefined) {
      const dir = _direktoriCache();
      const berkas = dir && path.join(dir, _namaCache(source));
      if (berkas) {
        try {
          code = fs.readFileSync(berkas, "utf8");
        } catch (_) {
          code = undefined; // not cached yet, or unreadable — transpile below
        }
      }

      if (code === undefined) {
        code = esbuild.transformSync(source, {
          ...OPSI,
          sourcefile: filename,
        }).code;
        if (berkas) {
          // NOT awaited, and that is the point. Writing the 30 files a cold
          // start compiles measured 435 ms of blocked startup — the cache made
          // the first run of any edited file SLOWER than no cache at all, and
          // the agent edits its own source constantly. The compile is already in
          // hand; persisting it is for the NEXT process, so it has no business
          // holding this one up.
          //
          // Written to a temp file and renamed: rename is atomic, so a second
          // process reading concurrently sees either nothing or a complete
          // compile — never a half-written one, which would fail in a way that
          // looks like a syntax error in the source.
          //
          // If the process exits before the write lands, nothing breaks: the
          // entry simply is not cached, and the next run writes it again.
          const tmp = berkas + "." + process.pid + ".tmp";
          fs.promises
            .writeFile(tmp, code)
            .then(() => fs.promises.rename(tmp, berkas))
            .catch(() => {
              // Cannot persist. Everything still works, just not across restarts.
              fs.promises.unlink(tmp).catch(() => {});
            });
        }
      }

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
