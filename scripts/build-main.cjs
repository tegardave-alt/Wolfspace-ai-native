#!/usr/bin/env node
"use strict";

// Compiles electron/main.ts -> electron/main.js.
//
// Electron's main entry must be a .js file: the runtime loads it itself, before
// any of our code runs, so the require() hook in scripts/ts-register.cjs cannot
// be installed in time. Even if it could, transpiling here at load time measured
// ~286 ms against a startup budget this repo deliberately cut from 1071 ms to
// 314 ms — so the cost moves to build time, exactly as it did for the preload.
//
// TRANSFORM, NOT BUNDLE — this is the one place it differs from
// scripts/build-preload.cjs. main.ts resolves several requires at run time
// (core.js under unpackedRoot(), the spawned server) and keeps others lazy on
// purpose for startup time. Bundling would hoist and inline both away.
//
// The generated main.js IS committed on purpose: electron-builder and CI package
// directly, without an npm build step first, so a missing file would ship a
// broken app. tests/main-terbangun.test.js re-runs this build and compares,
// which is what keeps the committed copy from going stale.

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "electron", "main.ts");
const OUT = path.join(ROOT, "electron", "main.js");

const HEADER = [
  "// GENERATED FILE — DO NOT EDIT.",
  "// Built from electron/main.ts by scripts/build-main.cjs.",
  "// Run `npm run build:main` after changing the source.",
  "",
].join("\n");

/** Returns the main.js contents that the current main.ts implies. */
function bangun() {
  const hasil = esbuild.transformSync(fs.readFileSync(SRC, "utf8"), {
    loader: "ts",
    format: "cjs",
    target: "es2022",
    platform: "node",
    // esbuild drops comments when transforming, so the generated file carries no
    // documentation and its lines no longer line up with the source. An inline
    // map is what makes a crash in the packaged app point back at main.ts.
    sourcemap: "inline",
    sourcefile: "main.ts",
    logLevel: "silent",
  });
  return HEADER + hasil.code;
}

module.exports = { bangun, SRC, OUT };

if (require.main === module) {
  const isi = bangun();
  fs.writeFileSync(OUT, isi);
  console.log(
    "[build-main] electron/main.js written (" + isi.length + " bytes)",
  );
}
