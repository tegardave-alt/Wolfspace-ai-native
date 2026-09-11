// tools.ts — a compatibility shim: the tool registry moved to tools/index.ts,
// and this keeps the old import path working.
//
// Prefer requiring agent/tools/index.ts directly in new code. This exists so
// the three long-standing callers below did not all have to change at once.
//
// CONNECTS TO
//   re-exports  ./tools/index
//   used by     agent/chat.ts, agent/self_agent.ts, agent/python-agent.ts
const mod = require("./tools/index.ts");
module.exports = mod;
module.exports.getToolDefs =
  mod.getToolDefs || (async () => [...(mod.SELF_TOOLS || [])]);
