// ── Platform registry ──
// Selects the right adapter for the host OS at runtime (the MCP-style handshake:
// pick the implementation, then let callers negotiate via capabilities()).
"use strict";

const { WindowsAdapter } = require("./windows.ts");
const { MacAdapter, LinuxAdapter } = require("./posix.ts");

let _cached = null;

function getPlatformAdapter() {
  if (_cached) return _cached;
  switch (process.platform) {
    case "win32":
      _cached = new WindowsAdapter();
      break;
    case "darwin":
      _cached = new MacAdapter();
      break;
    default:
      _cached = new LinuxAdapter();
      break; // linux + other unix
  }
  return _cached;
}

module.exports = { getPlatformAdapter };
