// The single source of truth for "should this execution be contained?".
//
// HISTORICAL NOTE: containment used to always mean Docker, and the background
// below was written assuming that. Docker has since been removed from the
// production path entirely — bash containment uses Linux namespaces
// (agent/tools/bash-jail.ts) and capability zones use --permission + unshare -n
// (agent/broker/). This module stays alive because what it guards is the
// DECISION, not the mechanism; that is why its second parameter is named
// `pengurunganTersedia` ("containment available") rather than `hasDocker`.
// The background is kept because it explains WHY the tri-state exists.
//
// BACKGROUND: there used to be TWO gates that disagreed with each other --
//   - server.cjs/runners.cjs : CONFIG.sandbox === true && hasDocker()
//       -> "sandbox" was never set in config.json nor in config.docker.json
//          (that file has since been deleted along with every Docker file), so
//          this path was dead; setting it to false made no difference either.
//   - agent/tools/index.cjs  : _hasDocker() alone
//       -> turned itself on whenever Docker was running, and IGNORED
//          sandbox:false.
// The upshot was that "sandbox: false" did not actually disable the sandbox, and
// "sandbox: true" did not actually guarantee it. This module unifies the rule.
//
// TRI-STATE (not a boolean), so the user's intent can be stated explicitly:
//   "on"   -> sandbox REQUIRED. The caller fails closed when containment is
//             unavailable — better to refuse than to silently run native.
//   "off"  -> do NOT sandbox, even when containment is available.
//   "auto" -> use containment when available, otherwise the fallback path.
//
// Precedence: env WOLFSPACE_SANDBOX > config.json "sandbox" > caller default.
// The default is deliberately DIFFERENT per path so old behavior does not change
// silently:
//   - Python/JS code execution -> defaults to "off" (the sandbox implies
//     --network none; enabling it automatically would break code that needs
//     the network)
//   - workspace-contained bash -> defaults to "auto" (which it already was)
"use strict";

import * as fs from "fs";
import * as path from "path";

/** Resolved containment intent. Never a boolean — see the tri-state note above. */
export type SandboxMode = "on" | "off" | "auto";

/** CONFIG.sandbox as it may appear in config.json: set either way, or absent. */
export type ConfigSandbox = boolean | undefined;

const ON = ["on", "1", "true", "force", "yes"];
const OFF = ["off", "0", "false", "never", "no"];

function envMode(): SandboxMode | null {
  const v = String(process.env.WOLFSPACE_SANDBOX || "")
    .trim()
    .toLowerCase();
  if (!v) return null;
  if (ON.includes(v)) return "on";
  if (OFF.includes(v)) return "off";
  if (v === "auto") return "auto";
  return null; // unknown value -> ignore, never change behavior silently
}

/**
 * @param cfgSandbox value of CONFIG.sandbox (true | false | undefined)
 * @param fallback   the calling path's own default ("off" | "auto")
 */
export function resolveMode(
  cfgSandbox: ConfigSandbox,
  fallback: SandboxMode,
): SandboxMode {
  const e = envMode();
  if (e) return e;
  if (cfgSandbox === true) return "on";
  if (cfgSandbox === false) return "off";
  return fallback;
}

export function shouldSandbox(
  cfgSandbox: ConfigSandbox,
  pengurunganTersedia: unknown,
  fallback: SandboxMode,
): boolean {
  const m = resolveMode(cfgSandbox, fallback);
  if (m === "off") return false;
  if (m === "on") return true; // the caller decides how to fail closed
  return !!pengurunganTersedia;
}

// For callers that do not load CONFIG themselves (e.g. agent/tools/index.cjs).
// Read once and cached; config.json does not change while the process lives.
//
// The cache uses a SENTINEL rather than `undefined`. It used to test
// `_cfgCache !== undefined`, which meant the one value it most often holds —
// undefined, because config.json has no "sandbox" key at all — never counted as
// cached, so the file was re-read from disk on every single call. The comment
// above claimed "read once" while the code did the opposite.
const BELUM_DIBACA = Symbol("belum dibaca");
let _cfgCache: ConfigSandbox | typeof BELUM_DIBACA = BELUM_DIBACA;

export function configSandbox(): ConfigSandbox {
  if (_cfgCache !== BELUM_DIBACA) return _cfgCache;
  try {
    const p = path.join(__dirname, "..", "config.json");
    _cfgCache = JSON.parse(fs.readFileSync(p, "utf8")).sandbox;
  } catch {
    _cfgCache = undefined;
  }
  return _cfgCache as ConfigSandbox;
}
