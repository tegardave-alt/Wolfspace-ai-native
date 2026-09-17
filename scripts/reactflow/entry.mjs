// .mjs, NOT .js. This file is ES modules inside a package whose
// package.json says "type": "commonjs", so `node --check` reads it as
// CommonJS and rejects `import` outright. The pre-commit hook runs exactly
// that check, so the extension is what lets this file be committed at all.
// esbuild never cared either way.
// entry.js — the entry point of the vendored React Flow bundle. It exposes
// React Flow and dagre as ONE global (window.RFLib) so the renderer, which uses
// the UMD window.React, can use them with no bundler at run time — the same
// pattern as the vendored Monaco, mermaid and xterm.
//
// Built from the npm package @xyflow/react (MIT). React is aliased to
// window.React through an esbuild shim (see build.cjs). This was once built
// from a vendored TypeScript fork; the fork was dropped because its only
// modification — the diagonal background pattern — is now a custom component in
// the renderer that touches no internals.
import * as XY from "@xyflow/react";
import dagre from "@dagrejs/dagre";
export { XY, dagre };
