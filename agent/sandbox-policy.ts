// sandbox-policy.ts — the single source of truth for one question: should this
// execution be contained?
//
// ROLE IN THE SYSTEM. It decides ONLY the intent, never the mechanism. That
// separation is the whole point: containment used to mean Docker, and Docker is
// now gone from the production path entirely (bash uses Linux namespaces in
// agent/tools/bash-jail.ts, capability zones use --permission + unshare -n in
// agent/broker/) — yet nothing here had to change, because the decision
// outlived its implementation. It is why the second parameter is called
// `pengurunganTersedia` ("containment available") and not `hasDocker`.
//
// CONNECTS TO
//   imports  fs, path only — no dependency on any containment backend
//   read by  agent/tools/index.ts, the tool registry, which asks before every
//            contained execution
//   inputs   env WOLFSPACE_SANDBOX, then config.json "sandbox", then the
//            caller's default
//
// WHY A TRI-STATE AND NOT A BOOLEAN. There used to be two gates that disagreed:
// server/runners required `CONFIG.sandbox === true && hasDocker()` (and
// "sandbox" was never set anywhere, so that path was dead), while
// agent/tools/index.ts checked Docker alone and switched itself on whenever
// Docker happened to be running — ignoring `sandbox: false`. So "false" did not
// disable it and "true" did not guarantee it. Three states let the intent be
// stated instead of inferred:
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

// For callers that do not load CONFIG themselves (e.g. agent/tools/index.ts).
// Read once and cached; config.json does not change while the process lives.
//
// The cache uses a SENTINEL rather than `undefined`. It used to test
// `_cfgCache !== undefined`, which meant the one value it most often holds —
// undefined, because config.json has no "sandbox" key at all — never counted as
// cached, so the file was re-read from disk on every single call. The comment
// above claimed "read once" while the code did the opposite.
const BELUM_DIBACA = Symbol("not read yet");
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
