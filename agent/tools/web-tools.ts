// Web tools (web_search, web_fetch, dspy)
// `export {}` makes this a MODULE rather than a global script.
//
// A .ts file with no import or export shares one global scope with every
// other such file, so two of them declaring the same top-level name collide
// (TS2451) — which is how mcp-client.ts and dspy_tool.ts both declaring
// `dlog` surfaced a problem that had been latent for several phases.
export {};

const { webSearch, webFetch } = require("../web.ts");

module.exports = {
  webSearch,
  webFetch,
};
