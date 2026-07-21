// Membangun file vendor React Flow (reproducible). Jalankan: npm run vendor:reactflow
// Menghasilkan public/vendor/reactflow.bundle.js (React Flow + dagre, React external ->
// window.React) dan public/vendor/reactflow.css. Bundling terjadi di sini (maintainer),
// runtime WOLFSPACE tetap tanpa-bundler.
"use strict";
const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const here = __dirname;
const root = path.resolve(here, "..", "..");
const outJs = path.join(root, "public", "vendor", "reactflow.bundle.js");
const outCss = path.join(root, "public", "vendor", "reactflow.css");

(async () => {
  await esbuild.build({
    entryPoints: [path.join(here, "entry.js")],
    bundle: true,
    minify: true,
    format: "iife",
    globalName: "RFLib",
    outfile: outJs,
    // Build dari SOURCE TS/TSX yang di-vendor (lihat entry.js). esbuild menanggalkan
    // tipe & meng-compile TSX (JSX otomatis -> react/jsx-runtime yang di-shim ke
    // window.React). @xyflow/system dipetakan ke source vendored.
    loader: { ".js": "jsx", ".ts": "ts", ".tsx": "tsx" },
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      "@xyflow/system": path.join(here, "vendor", "system", "index.ts"),
      react: path.join(here, "react-shim.js"),
      "react-dom": path.join(here, "reactdom-shim.js"),
      "react/jsx-runtime": path.join(here, "jsx-shim.js"),
      "react/jsx-dev-runtime": path.join(here, "jsx-shim.js"),
    },
    logLevel: "info",
  });
  // CSS terkompilasi di-vendor juga (lepas dari node_modules @xyflow).
  fs.copyFileSync(path.join(here, "vendor", "style.css"), outCss);
  const kb = (p) => (fs.statSync(p).size / 1024).toFixed(0);
  console.log(
    "OK -> reactflow.bundle.js (" +
      kb(outJs) +
      " KB), reactflow.css (" +
      kb(outCss) +
      " KB)",
  );
})().catch((e) => {
  console.error("BUILD ERROR:", e.message);
  process.exit(1);
});
