// ── Capability policy ──
// Declarative allow-rules the Broker checks BEFORE executing anything.
// Deny-by-default: if no rule matches, the request is refused.
"use strict";

import * as path from "path";

/** Capabilities the Broker can be asked to perform. */
export type Capability = "fetch" | "readFile" | "writeFile";

/** Grant for `fetch`: only these hostnames may be reached. */
export interface GrantFetch {
  hosts?: string[];
}

/** Grant for `readFile` / `writeFile`: only these directory roots are in scope. */
export interface GrantPath {
  roots?: string[];
}

export interface Grants {
  fetch?: GrantFetch;
  readFile?: GrantPath;
  writeFile?: GrantPath;
}

// The verdict, as a discriminated union rather than { allowed, reason? }.
//
// This is the point of typing this file: a denial CANNOT be expressed without a
// reason. host.cjs puts that reason straight into the thrown error and into the
// audit log, so a denial that lost its reason would show up as
// "Broker denied readFile: undefined" — refusing the work while destroying the
// only evidence of why.
export type Verdict =
  { allowed: true; reason?: undefined } | { allowed: false; reason: string };

export interface ParamsFetch {
  url: string;
}

export interface ParamsPath {
  path: string;
}

export type Params = ParamsFetch | ParamsPath;

/**
 * A policy grants access per capability:
 *   fetch:     { hosts: ['api.github.com', ...] }
 *   readFile:  { roots: ['/abs/dir', ...] }
 *   writeFile: { roots: ['/abs/dir', ...] }
 */
export class Policy {
  grants: Grants;

  constructor(grants: Grants = {}) {
    this.grants = grants;
  }

  evaluate(capability: Capability | string, params: any): Verdict {
    const grant = (this.grants as Record<string, unknown>)[capability];
    if (!grant)
      return {
        allowed: false,
        reason: `no grant for capability "${capability}"`,
      };

    switch (capability) {
      case "fetch": {
        const hosts = (grant as GrantFetch).hosts || [];
        let host: string;
        try {
          host = new URL(params.url).hostname;
        } catch (_) {
          return { allowed: false, reason: "invalid URL" };
        }
        const ok = hosts.includes(host);
        return ok
          ? { allowed: true }
          : {
              allowed: false,
              reason: `host "${host}" not in allowlist [${hosts.join(", ")}]`,
            };
      }
      case "readFile":
      case "writeFile": {
        const abs = path.resolve(params.path || "");
        const roots = ((grant as GrantPath).roots || []).map((r) =>
          path.resolve(r),
        );
        // path.relative would be the sturdier test, but startsWith with the
        // separator appended is what shipped and what the jail tests pin:
        // "/a-lain" does NOT match root "/a" because "/a" + sep is "/a/".
        const ok = roots.some(
          (root) => abs === root || abs.startsWith(root + path.sep),
        );
        return ok
          ? { allowed: true }
          : {
              allowed: false,
              reason: `path "${abs}" outside granted roots [${roots.join(", ")}]`,
            };
      }
      default:
        return {
          allowed: false,
          reason: `unknown capability "${capability}"`,
        };
    }
  }
}
