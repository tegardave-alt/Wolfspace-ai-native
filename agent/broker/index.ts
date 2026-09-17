// index.ts — the broker's public face. Everything outside agent/broker/ goes
// through this file and never reaches host.ts or zone-process.ts directly, so
// the split between policy, trusted host and isolated zone stays internal.
//
// CONNECTS TO
//   imports  ./policy, ./host, ./zone-process
//   used by  the agent tool layer, via require("agent/broker")
"use strict";
const { Policy } = require("./policy.ts");
const { Broker } = require("./host.ts");
const { runInCapabilityZone } = require("./zone-process.ts");

module.exports = { Policy, Broker, runInCapabilityZone };
