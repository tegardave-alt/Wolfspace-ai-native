// core/agent/vscode-adapter.cjs
// Adapter untuk menambahkan VS Code tools ke Quantum agent saat mode extension aktif.
// Tools VS Code menghasilkan "action" yang dikirim ke extension via bridge, bukan eksekusi langsung.

const path = require('path');
const vscodeTools = require('./tools/vscode-tools.cjs');

const VSCODE_MODE = process.env.VSCODE_MODE === '1';

function isVSCodeMode() {
  return VSCODE_MODE;
}

function getVSCodeTools() {
  if (!VSCODE_MODE) return [];
  return vscodeTools;
}

/**
 * Patch agent config to include VS Code tools.
 * Call this after loading agent config but before starting agent.
 */
function patchConfig(config) {
  if (!VSCODE_MODE) return config;
  const tools = [...(config.tools || []), ...vscodeTools];
  return { ...config, tools };
}

module.exports = { isVSCodeMode, getVSCodeTools, patchConfig };
