// ── Broker (trusted host) ──
// The ONLY thing in the system with real fs/network access on behalf of a
// capability zone. Code in the zone never touches fs/https directly — it sends
// a request here, the Broker checks it against Policy, executes it itself if
// allowed, and returns just the result. The zone never sees credentials, real
// paths outside its grant, or raw sockets.
"use strict";

import * as fs from "fs";
import * as https from "https";
import * as http from "http";
import type { Capability, Params, Policy } from "./policy";

/** One audit entry, as written to this.audit and to the tamper-evident ledger. */
export interface AuditEntry {
  ts: number;
  capability: string;
  params: unknown;
  decision: "ALLOW" | "DENY" | "ALLOW_BUT_FAILED" | "BLOCKED";
  reason: string | null;
  resultBytes?: number;
  [k: string]: unknown;
}

/** Result of a brokered fetch: status plus a truncated body. */
export interface FetchResult {
  status?: number;
  body: string;
}

// Loaded LAZILY so this file can still be required in an environment without
// disk write permission (a test that only inspects Policy, for instance). A
// failure to load it must not cripple the broker — a dead audit log is harmful,
// a dead broker is fatal.
type AuditSink = { catat(entry: AuditEntry): void };

let _al: AuditSink | undefined;
function _auditLog(): AuditSink {
  if (_al) return _al;
  // Assigned through a local so the return type stays non-optional without a
  // cast: every branch below produces a sink, including the fallback.
  let sink: AuditSink;
  try {
    sink = require("./audit-log.ts");
  } catch (_) {
    sink = { catat() {} };
  }
  _al = sink;
  return sink;
}

// CommandChain (phase 1): genesis + admission. Loaded lazily for the same reason
// as the audit log — failing to load degrades it to a no-op rather than killing
// the broker.
let _cc: any;
let _ccRuleset: any = null;
function _commandChain() {
  if (_cc) return _cc;
  try {
    _cc = require("./commandchain.ts");
  } catch (_) {
    _cc = { mulaiSesi: () => null, periksa: () => ({ allow: true }) };
  }
  return _cc;
}

// Genesis is written ONCE per process, before the first record. mulaiSesi() is
// itself a no-op once the ledger is non-empty, so calling this repeatedly is safe.
function _pastikanSesi() {
  if (_ccRuleset) return _ccRuleset;
  try {
    _ccRuleset = _commandChain().mulaiSesi();
  } catch (_) {
    _ccRuleset = null;
  }
  return _ccRuleset;
}

export class Broker {
  policy: Policy;
  audit: AuditEntry[];

  constructor(policy: Policy) {
    this.policy = policy;
    this.audit = [];
  }

  _log(
    capability: string,
    params: unknown,
    decision: AuditEntry["decision"],
    reason: string | null,
    extra?: Record<string, unknown>,
  ): AuditEntry {
    const entry: AuditEntry = {
      ts: Date.now(),
      capability,
      params,
      decision,
      reason,
      ...extra,
    };
    this.audit.push(entry);
    // Genesis is anchored before the first record, then every record is chained
    // into the tamper-evident ledger (see audit-log.ts / docs/COMMANDCHAIN.md).
    _pastikanSesi();
    _auditLog().catat(entry);
    return entry;
  }

  // The single entry point the capability zone calls. Deny-by-default:
  // Policy.evaluate must explicitly allow, otherwise this throws.
  async request(capability: Capability | string, params: Params | any) {
    // CommandChain admission FIRST: is this capability part of the genesis
    // vocabulary frozen when the session began? Deny-by-default, and — this is
    // the point — genesis cannot be loosened mid-session, so prompt injection
    // cannot talk the broker into accepting an undeclared capability. The
    // per-call Policy (below) still applies afterwards.
    const rs = _pastikanSesi();
    if (rs) {
      const adm = _commandChain().periksa(rs, capability);
      if (!adm.allow) {
        this._log(capability, params, "DENY", "commandchain: " + adm.alasan);
        const err: any = new Error(
          `CommandChain denied ${capability}: ${adm.alasan}`,
        );
        err.code = "COMMANDCHAIN_DENIED";
        throw err;
      }
    }
    const { allowed, reason } = this.policy.evaluate(capability, params);
    if (!allowed) {
      this._log(capability, params, "DENY", reason);
      const err: any = new Error(`Broker denied ${capability}: ${reason}`);
      err.code = "BROKER_DENIED";
      throw err;
    }
    try {
      const result = await this._execute(capability, params);
      this._log(capability, params, "ALLOW", null, {
        resultBytes: typeof result === "string" ? result.length : undefined,
      });
      return result;
    } catch (e) {
      this._log(capability, params, "ALLOW_BUT_FAILED", (e as Error).message);
      throw e;
    }
  }

  async _execute(capability: Capability | string, params: any) {
    switch (capability) {
      case "readFile":
        return fs.readFileSync(params.path, "utf8");
      case "writeFile":
        fs.mkdirSync(require("path").dirname(params.path), { recursive: true });
        fs.writeFileSync(params.path, params.content, "utf8");
        return { ok: true };
      case "fetch":
        return this._fetch(params.url, { timeout: params.timeout || 8000 });
      default:
        throw new Error(`no executor for capability "${capability}"`);
    }
  }

  _fetch(url: string, opts: { timeout: number }): Promise<FetchResult> {
    const lib = url.startsWith("https:") ? https : http;
    return new Promise((resolve, reject) => {
      const req = lib.get(url, { timeout: opts.timeout }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: body.slice(0, 5000) }),
        );
      });
      req.on("timeout", () => {
        req.destroy();
        reject(new Error("fetch timeout"));
      });
      req.on("error", reject);
    });
  }

  // Record an attempt that NEVER went through request().
  //
  // Why a separate path is needed: the broker only sees what is asked of it.
  // Zone code that reaches straight for a socket asks for nothing — it simply
  // fails on its own inside an empty network namespace. Measured: such an
  // attempt produced `EAI_AGAIN` in the zone and **zero audit entries**. So it
  // was stopped, yet there was no signal at all that it had ever been tried.
  //
  // This closes that gap. Note carefully: the reporter lives INSIDE the zone and
  // is NOT a guard — it has been shown to be bypassable with
  // `require('node:https')` and `process.binding('tcp_wrap')`. What holds is
  // still the kernel. This only makes the attempt visible.
  catatPercobaanLangsung(modul: string, detail?: Record<string, unknown>) {
    return this._log(
      "network:" + modul,
      detail || {},
      "BLOCKED",
      "direct path, never went through request() — held by the network namespace",
    );
  }

  auditTrail(): AuditEntry[] {
    return this.audit.slice();
  }
}
