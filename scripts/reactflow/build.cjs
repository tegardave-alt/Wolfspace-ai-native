// Membangun file vendor React Flow (reproducible). Jalankan: npm run vendor:reactflow
// Menghasilkan public/vendor/reactflow.bundle.js (React Flow + dagre, React external ->
// window.React) and public/vendor/reactflow.css. Bundling happens HERE, at
// maintenance time; the WOLFSPACE runtime stays bundler-free.
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
    entryPoints: [path.join(here, "entry.mjs")],
    bundle: true,
    minify: true,
    format: "iife",
    globalName: "RFLib",
    outfile: outJs,
    // Built from the npm package @xyflow/react (see entry.mjs). React and
    // react-dom are shimmed onto window.React — the UMD build index.html has
    // already loaded — so there is never a second copy of React.
    define: { "process.env.NODE_ENV": '"production"' },
    alias: {
      react: path.join(here, "react-shim.js"),
      "react-dom": path.join(here, "reactdom-shim.js"),
      "react/jsx-runtime": path.join(here, "jsx-shim.js"),
      "react/jsx-dev-runtime": path.join(here, "jsx-shim.js"),
    },
    banner: {
      js: "/*! bundle: @xyflow/react + @dagrejs/dagre — MIT; see the packages' LICENSE files */",
    },
    logLevel: "info",
  });
  // The official CSS from the npm package. (WOLFSPACE's diagonal variant is now
  // a custom component in the renderer.)
  fs.copyFileSync(
    path.join(root, "node_modules", "@xyflow", "react", "dist", "style.css"),
    outCss,
  );
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
