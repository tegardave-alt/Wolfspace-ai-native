// Sandbox tool module — the lazily loaded home of sandbox_run.
//
// WAS skill-tools.ts, and carried the skills module alongside the sandbox. The
// skills feature was removed; sandbox_run was only ever filed here because the
// two arrived together, and it never had anything to do with skills.
//
// `export {}` makes this a MODULE rather than a global script.
//
// A .ts file with no import or export shares one global scope with every
// other such file, so two of them declaring the same top-level name collide
// (TS2451) — which is how mcp-client.ts and dspy_tool.ts both declaring
// `dlog` surfaced a problem that had been latent for several phases.
export {};

const sandbox = require("../sandbox.ts");

module.exports = {
  sandbox,
};
