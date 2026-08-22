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
//   agent/tools/index.cjs       (reached directly by test subprocesses)
//   agent/plugins.cjs
//   agent/self_agent.cjs
//   scripts/mcp-http-bridge.cjs
//   tests/setup-jest.cjs        (plus tests/transformer-ts.cjs for Jest itself)
//
// electron/preload.ts is the deliberate exception: scripts/build-preload.cjs
// compiles it ahead of time, so it is never loaded through require() at all.

const fs = require("fs");
const esbuild = require("esbuild");

if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = function loadTypeScript(module, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const { code } = esbuild.transformSync(source, {
      loader: "ts",
      format: "cjs",
      target: "es2022",
      sourcefile: filename,
      sourcemap: "inline",
    });
    module._compile(code, filename);
  };
}
