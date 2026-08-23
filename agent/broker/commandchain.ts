// ── CommandChain — phase 1: genesis + admission ──
//
// A thin layer on top of the chained ledger (audit-log.ts). It adds the two
// things that make the chain "smart-contract"-like:
//
//   1. GENESIS — a ruleset FROZEN when the session starts, whose hash is
//      anchored as entry 0 of the chain. Nothing during the session can change
//      it: not the model, not content injected through prompt injection, not an
//      agent action. This is "make sure it is hardcoded" as an architectural
//      guarantee rather than an instruction that can be talked around.
//
//   2. ADMISSION — a PURE function (ruleset, capability) -> allow|deny,
//      deny-by-default. Deterministic: same input, same decision, always. An
//      operation is refused when it is not a capability genesis declared.
//
// HONEST LIMITS (docs/COMMANDCHAIN.md §2):
//   - "deterministic" applies to this DECISION only, not to the execution.
//   - allowlist, not denylist: what is not in the vocabulary cannot run.
//   - the hash chain is tamper-EVIDENT, not tamper-PROOF.
"use strict";

import * as audit from "./audit-log";

/**
 * The genesis ruleset — frozen when the session starts, and impossible to loosen
 * afterwards. Fields are readonly because the object really is deep-frozen at
 * runtime; the type says out loud what bekukanDalam() enforces.
 */
export interface Ruleset {
  readonly versi: number;
  readonly sesi: string;
  /** The DECLARED vocabulary; anything outside it is refused. */
  readonly kapabilitas: readonly string[];
  readonly gas: number | null;
  readonly catatan: string;
}

/**
 * The admission verdict — written as a UNION, not `{allow:boolean, alasan?:string}`.
 *
 * The difference is not stylistic. The loose shape permits `{allow:false}` with
 * no reason and `{allow:true, alasan:"refused"}` at the same time — two states
 * that must not exist, with nothing preventing them. The union makes both
 * UNSPEAKABLE: an allow never carries a reason, a denial always carries its cause.
 *
 * This is the same principle as the frozen genesis itself — enforced by the
 * shape, not by the discipline of whoever writes the next line.
 */
export type Vonis =
  { allow: true; alasan: null } | { allow: false; alasan: string };

export interface OpsiRuleset {
  kapabilitas?: string[];
  tanpa?: string[];
  sesi?: string;
  gas?: number | null;
}

// The default vocabulary — the capabilities genesis declares.
//
// proc.raw (raw bash) has been in here since phase 2, ON BY DEFAULT. Ideally it
// would be off by default (the smart-contract principle: an escape should have to
// be asked for), BUT defaulting it off would break the agent — every use of bash
// would fail. So the honest compromise: on by default FOR COMPATIBILITY, but
// revocable from the session ruleset (buatRuleset({ tanpa: ["proc.raw"] })), and
// once genesis is frozen without proc.raw, bash is GENUINELY dead — not
// bypassable mid-session. That is the real smart-contract property: not "off",
// but "lockable off, declaratively and permanently, for that session".
const KOSAKATA_DEFAULT = [
  "readFile",
  "writeFile",
  "fetch",
  "network:http",
  "network:https",
  "network:net",
  "network:tls",
  "network:dgram",
  "proc.raw",
  // Reading a file the user HANDED OVER through the attachment bridge.
  //
  // Separate from readFile, and not merely for tidiness: readFile takes a PATH
  // and is therefore subject to the roots policy. attachment.read takes a
  // HANDLE — there is no path to check, because the file's address never enters
  // the system at all (see agent/attachment-bridge.ts). Keeping them apart lets
  // a session be locked down without attachments
  // (buatRuleset({ tanpa: ["attachment.read"] })) without also killing file
  // reads inside the worktree.
  "attachment.read",
];

// Freeze the object ALL THE WAY DOWN. A shallow Object.freeze still lets nested
// objects be modified — and a ruleset that is only partly immutable is not an
// immutable ruleset.
function bekukanDalam<T>(obj: T): T {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj as object))
      bekukanDalam((obj as Record<string, unknown>)[k]);
  }
  return obj;
}

// Build a ruleset from a capability list (+ options). Returned already FROZEN —
// the caller cannot loosen it afterwards.
//   opts.kapabilitas : an explicit list (replaces the default)
//   opts.tanpa       : revoke specific capabilities from the default (e.g.
//                      lockdown with tanpa:["proc.raw"] → bash dies for that
//                      session)
function buatRuleset(opts: OpsiRuleset = {}): Ruleset {
  let kapabilitas = opts.kapabilitas || KOSAKATA_DEFAULT.slice();
  if (Array.isArray(opts.tanpa) && opts.tanpa.length) {
    // Copied to a const first. The narrowing from Array.isArray() above does not
    // reach inside the closure — TypeScript assumes opts.tanpa could change
    // before the callback runs. Here it cannot (filter is synchronous), but
    // copying makes that true by construction rather than by coincidence.
    const tanpa = opts.tanpa;
    kapabilitas = kapabilitas.filter((k) => !tanpa.includes(k));
  }
  return bekukanDalam<Ruleset>({
    versi: 1,
    sesi: opts.sesi || "sesi_" + Date.now().toString(36),
    kapabilitas: kapabilitas.slice().sort(), // sorted → stable hash
    gas: opts.gas || null, // phase 3
    catatan: "genesis Fase 1 — admission + rantai, tanpa penegakan tambahan",
  });
}

/**
 * Admission: PURE, deny-by-default. Touches no I/O and never throws.
 *
 * @param ruleset no ruleset means refuse, never allow
 */
function periksa(
  ruleset: Ruleset | null | undefined,
  capability: string,
): Vonis {
  if (!ruleset || !Array.isArray(ruleset.kapabilitas)) {
    return { allow: false, alasan: "no ruleset — deny-by-default" };
  }
  if (ruleset.kapabilitas.includes(capability)) {
    return { allow: true, alasan: null };
  }
  // The capability NAME stays in the message: tests/commandchain.test.js asserts
  // it appears, and a denial that does not name what was refused is useless.
  return {
    allow: false,
    alasan: `"${capability}" outside the genesis vocabulary [${ruleset.kapabilitas.join(", ")}]`,
  };
}

// Start a session: write genesis (entry 0) while the ledger is still empty, then
// return the frozen ruleset. If the ledger ALREADY has content, genesis can no
// longer be inserted — the ruleset is returned as-is without writing (a chain
// already in progress must not have its head rewritten).
function mulaiSesi(opts: OpsiRuleset = {}): Ruleset {
  const ruleset = buatRuleset(opts);
  audit.catatGenesis(ruleset); // no-op when the ledger is not empty
  return ruleset;
}

// The session ruleset in force, with genesis guaranteed to exist. Used by callers
// outside the broker (the bash tool, for one) that need to check admission
// against the SAME ruleset. Held in module memory so the whole process shares one
// session ruleset instead of building a new one per call.
let _ruleset: Ruleset | null = null;

function sesiRuleset(): Ruleset {
  if (!_ruleset) {
    // Declarative lockdown without a code change: WOLFSPACE_CC_TANPA=proc.raw
    // locks raw shell execution out of this session. Read ONCE, as genesis is
    // frozen — after that it cannot be loosened, which is exactly the principle.
    const tanpa = (process.env.WOLFSPACE_CC_TANPA || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // NOTE. proc.raw was once off by default here, then brought back. What was
    // asked for was not killing the shell but limiting its ACCESS: PowerShell
    // stays normal, and a command is blocked only when it leaves the workspace.
    //
    // Turning it off did close the escape — measured, all four cases refused.
    // But it also took away npm install and PowerShell, and that was a cost
    // nobody asked for. Lockdown remains available to whoever chooses it:
    // WOLFSPACE_CC_TANPA=proc.raw.

    // Plugin capabilities the user has ALREADY APPROVED are frozen into genesis
    // too. Read once here along with the rest of the vocabulary, so they behave
    // the same way: approving a plugin mid-session does NOT take effect until the
    // next session.
    //
    // That is deliberate, not a limitation. If an approval could enter a ruleset
    // that is already running, there would be a way to LOOSEN genesis after it
    // was frozen, and the whole point would be gone. What is unapproved is not
    // refused when called; it never has a tool to call in the first place.
    //
    // require inside the function rather than at the top of the file: plugins.ts
    // scans the disk, and this module is used on paths that must stay pure under
    // test.
    let kapPlugin: string[] = [];
    try {
      kapPlugin = require("../plugins.ts").kapabilitasDisetujui();
    } catch (_) {
      kapPlugin = []; // no plugin system = no plugin capabilities
    }

    _ruleset = mulaiSesi({
      tanpa,
      kapabilitas: KOSAKATA_DEFAULT.concat(kapPlugin),
    });
  }
  return _ruleset;
}

// Record one transaction into the chain. A thin passthrough to audit-log (which
// does the chaining), so callers have ONE CommandChain dependency instead of two.
function catat(entry: audit.EntriMasuk): void {
  return audit.catat(entry);
}

const verifikasiRantai = audit.verifikasiRantai;

export {
  KOSAKATA_DEFAULT,
  bekukanDalam,
  buatRuleset,
  periksa,
  mulaiSesi,
  sesiRuleset,
  catat,
  verifikasiRantai,
};
