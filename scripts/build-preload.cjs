#!/usr/bin/env node
"use strict";

// Compiles electron/preload.ts -> electron/preload.js.
//
// The preload is the one TypeScript file that CANNOT use the require() hook in
// scripts/ts-register.cjs: Electron loads a preload itself, and the script blocks
// the page until it returns. Transpiling at load time measured ~154 ms per window
// (25 ms to load esbuild, ~129 ms to spawn esbuild.exe on the first transform),
// paid again for every window — so the cost moves here, where it is paid once.
//
// The generated preload.js IS committed on purpose: CI and electron-builder run
// packaging directly, without an npm build step first, so a missing file would
// silently ship a backend-less app. tests/preload-terbangun.test.js re-runs this
// build and compares, which is what keeps the committed copy from going stale.

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "electron", "preload.ts");
const OUT = path.join(ROOT, "electron", "preload.js");

const HEADER = [
  "// GENERATED FILE — DO NOT EDIT.",
  "// Built from electron/preload.ts by scripts/build-preload.cjs.",
  "// Run `npm run build:preload` after changing the source.",
  "",
].join("\n");

/** Returns the preload.js contents that the current preload.ts implies. */
function bangun() {
  const hasil = esbuild.buildSync({
    entryPoints: [SRC],
    bundle: true,
    // "electron" and Node built-ins are provided by the preload environment.
    // Bundling is still on so relative type-only imports resolve away cleanly.
    platform: "node",
    target: "es2022",
    format: "cjs",
    external: ["electron"],
    write: false,
    logLevel: "silent",
  });
  return HEADER + hasil.outputFiles[0].text;
}

module.exports = { bangun, SRC, OUT };

if (require.main === module) {
  const isi = bangun();
  fs.writeFileSync(OUT, isi);
  console.log(
    "[build-preload] electron/preload.js written (" + isi.length + " bytes)",
  );
}
