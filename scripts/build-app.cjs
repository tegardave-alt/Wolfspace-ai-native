#!/usr/bin/env node
"use strict";

// Compiles the renderer ahead of time -> public/app.build.js.
//
// WHY. public/index.html fetches fifteen .tsx/.jsx files and compiles them with
// a vendored Babel INSIDE THE BROWSER, on every load, before a single pixel is
// drawn. That is 631 KB through a JavaScript compiler running in the page; the
// app's own probe recorded RENDERER-STOP ~3101 ms. For comparison, everything
// this repo has measured on the backend adds up to roughly 340 ms, most of it
// already asynchronous.
//
// The same move was already made twice here for the same reason — preload.ts
// (~154 ms per window) and main.ts (~286 ms) — so the cost lands at build time,
// where it is paid once.
//
// TRANSFORM PER FILE, THEN CONCATENATE — never bundle. index.html deliberately
// keeps these files in ONE GLOBAL SCOPE: they carry no import/export, they are
// concatenated in a fixed order, and components defined in later files are
// referenced by earlier ones through hoisting. A bundler would give each its own
// scope and the app would break at first render. That is why esbuild is called
// with transform(), not build().
//
// THE ORDER LIVES IN index.html, and is read from there rather than copied. Two
// surfaces holding the same list is exactly how this repo has produced bugs
// before (the MCP command list, twice). Adding a component stays a one-line
// change in index.html.

const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const HTML = path.join(ROOT, "public", "index.html");
const OUT = path.join(ROOT, "public", "app.build.js");

const HEADER = [
  "// GENERATED FILE — DO NOT EDIT.",
  "// Built from public/app.tsx + public/app/*.tsx by scripts/build-app.cjs.",
  "// Run `npm run build:app` after changing the source.",
  "",
].join("\n");

/**
 * The renderer's load order, read out of index.html.
 *
 * Returns paths relative to public/, app.tsx last — the same order index.html
 * uses, because several components render during the first pass and must be
 * defined before App runs at the end of app.tsx.
 */
function daftarModul() {
  const html = fs.readFileSync(HTML, "utf8");
  const m = html.match(/const APP_MODULES = \[([\s\S]*?)\];/);
  if (!m) {
    throw new Error(
      "APP_MODULES not found in public/index.html — the renderer's load order " +
        "lives there, and this build refuses to guess it.",
    );
  }
  const modul = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  if (!modul.length)
    throw new Error("APP_MODULES is empty in public/index.html");
  return [...modul, "/app.tsx"];
}

/** Returns the app.build.js contents that the current sources imply. */
function bangun() {
  const potongan = daftarModul().map((rel) => {
    const berkas = path.join(ROOT, "public", rel.replace(/^\//, ""));
    const src = fs.readFileSync(berkas, "utf8");
    // The loader follows the extension, exactly as index.html chooses its Babel
    // presets: .jsx is left out of the TypeScript parser on purpose, because the
    // TS parser is stricter in places and there is no reason to risk it.
    const loader = /\.tsx$/.test(rel)
      ? "tsx"
      : /\.jsx$/.test(rel)
        ? "jsx"
        : "ts";
    return esbuild.transformSync(src, {
      loader,
      jsx: "transform", // React.createElement, matching Babel's `react` preset
      target: "es2020",
      sourcefile: rel,
      logLevel: "silent",
    }).code;
  });

  // Joined with `;` and wrapped in an IIFE — byte for byte the shape index.html
  // builds at run time, so the injected script behaves identically. The IIFE is
  // what stops const/let colliding when HMR re-injects.
  return HEADER + "(() => {\n" + potongan.join("\n;\n") + "\n})();\n";
}

module.exports = { bangun, daftarModul, HTML, OUT };

if (require.main === module) {
  const isi = bangun();
  fs.writeFileSync(OUT, isi);
  console.log(
    "[build-app] public/app.build.js written (" + isi.length + " bytes)",
  );
}
