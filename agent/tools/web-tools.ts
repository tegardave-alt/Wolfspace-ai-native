// web-tools.ts — the tool wrappers for web_search, web_fetch and dspy.
//
// ROLE IN THE SYSTEM. Thin by design: the HTTP work and the SSRF guard live in
// agent/web.ts, and the prompt optimiser in agent/dspy_tool.ts. This is only
// the surface the agent calls them through.
//
// CONNECTS TO
//   imports  ../web, ../dspy_tool
//   used by  agent/tools/index.ts
//
// `export {}` makes this a MODULE — see agent/tools/tool-definitions.ts for why
// that matters in this repo.
export {};

const { webSearch, webFetch } = require("../web.ts");

module.exports = {
  webSearch,
  webFetch,
};
