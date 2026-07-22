// Membangun file vendor 3D (reproducible). Jalankan: npm run vendor:three
// Menghasilkan public/vendor/three3d.bundle.js (three + GLTFLoader + STLLoader +
// OrbitControls) sebagai IIFE -> window.WOLFSPACE3D. Bundling terjadi di sini
// (maintainer); runtime WOLFSPACE tetap tanpa-bundler.
"use strict";
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const here = __dirname;
const root = path.resolve(here, "..", "..");
const outJs = path.join(root, "public", "vendor", "three3d.bundle.js");

(async () => {
  await esbuild.build({
    entryPoints: [path.join(here, "entry.js")],
    bundle: true,
    minify: true,
    format: "iife",
    globalName: "WOLFSPACE3D",
    outfile: outJs,
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "/*! bundle: three.js (r160) + GLTFLoader/STLLoader/OrbitControls — MIT; see three/LICENSE */" },
    logLevel: "info",
  });
  const kb = (p) => (fs.statSync(p).size / 1024).toFixed(0);
  console.log("three3d.bundle.js:", kb(outJs) + " KB");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
