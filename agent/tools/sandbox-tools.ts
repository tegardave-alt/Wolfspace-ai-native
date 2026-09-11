// sandbox-tools.ts — the lazily loaded home of the `sandbox_run` tool.
//
// ROLE IN THE SYSTEM. A thin tool wrapper: the containment itself lives in
// agent/sandbox.ts. It is loaded lazily so that a failure here costs one tool
// rather than the whole registry.
//
// CONNECTS TO
//   imports  ../sandbox
//   used by  agent/tools/index.ts
//
// (Formerly skill-tools.ts. The skills feature was removed; sandbox_run was
// only ever filed alongside it because the two arrived together.)
//
// `export {}` makes this a MODULE — see agent/tools/tool-definitions.ts for why
// that matters in this repo.
export {};

const sandbox = require("../sandbox.ts");

module.exports = {
  sandbox,
};
