// Backward compatibility wrapper - re-exports from tools/index.ts
const mod = require("./tools/index.ts");
module.exports = mod;
module.exports.getToolDefs =
  mod.getToolDefs || (async () => [...(mod.SELF_TOOLS || [])]);
