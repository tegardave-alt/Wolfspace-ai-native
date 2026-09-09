// index.ts — picks the platform adapter for the host OS, once, and hands the
// same instance to everyone.
//
// ROLE IN THE SYSTEM. This is the ONLY door to the platform layer: callers ask
// here and then negotiate through capabilities(), never by testing
// process.platform themselves.
//
// CONNECTS TO
//   imports  ./windows (WindowsAdapter), ./posix (MacAdapter, LinuxAdapter)
//   used by  agent/sandbox.ts, agent/tools/index.ts, core/terminal.ts,
//            agent/broker/zone-process.ts
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
