"use strict";

// TypeScript transformer for Jest.
//
// scripts/ts-register.cjs is NOT enough here. It installs a hook on
// require.extensions, but Jest has its own module registry and transform
// pipeline and never goes through require.extensions at all. Without this file,
// a test that requires a .ts module directly fails in babel with a syntax error
// on the type annotations, even though the very same module loads fine in the
// application.
//
// It uses esbuild, the same as the production path, so both produce identical
// JavaScript and the tests are not exercising a different transpilation from the
// one that actually runs.

const esbuild = require("esbuild");

module.exports = {
  process(source, filename) {
    const { code } = esbuild.transformSync(source, {
      loader: "ts",
      format: "cjs",
      target: "es2022",
      sourcefile: filename,
      sourcemap: "inline",
    });
    return { code };
  },
};
