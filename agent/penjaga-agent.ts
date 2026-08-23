// ── Agent guards, shared by BOTH orchestrators ──
//
// WHY THIS FILE EXISTS. These checks used to live inside a closure in
// agent/self_agent.ts, which was fine while there was one agent loop. There are
// now two — the JS loop and the Python graph in services/agent-python driven by
// agent/python-agent.ts — and a guard that exists on only one of them is worse
// than no guard: it makes the SAME request behave differently depending on which
// orchestrator happened to handle it.
//
// That is not hypothetical. This repo has been bitten by the "two surfaces"
// pattern repeatedly — the MCP list rendered by two components with separate
// state, attachment handling duplicated across Composer and the picker screen,
// findings recorded in only one of two `read` branches. Each time, the fix that
// held was one implementation with two callers, and each time the version that
// drifted was the one that had been copied.
//
// So: copied into neither. Extracted here, called from both.
//
// Everything in this file is a PURE function of its arguments. No filesystem, no
// model, no process. That is what makes it shareable and what makes it testable
// without an agent run.

/**
 * Tools that run unprotected and therefore need a human to approve them.
 *
 * `bash` runs PowerShell directly on the host: no broker (that is capability_exec
 * only) and no sandbox (that is sandbox_run only). edit/write stay approval-free
 * because auto-snapshot plus rollback already covers them.
 */
export const EXECUTION_TOOLS: readonly string[] = ["bash"];

/** The shape a tool call arrives in, from either orchestrator. */
export interface PanggilanTool {
  /** OpenAI function-calling shape, used by the JS loop. */
  function?: { name?: string; arguments?: string };
  /** The flat shape the Python worker sends. */
  name?: string;
  args?: any;
}

/** The tool name, whichever call shape it arrived in. */
export function namaTool(tc: PanggilanTool): string {
  return String(tc?.function?.name || tc?.name || "");
}

/** The tool arguments as an object, whichever shape they arrived in. */
export function argsTool(tc: PanggilanTool): any {
  if (tc?.args && typeof tc.args === "object") return tc.args;
  try {
    return JSON.parse(tc?.function?.arguments || "{}");
  } catch (_) {
    return null; // unparseable: the caller decides, and perluPersetujuan fails closed
  }
}

/**
 * Does this call need human approval before it runs?
 *
 * `git` is gated PER OPERATION rather than by name. Before the git tool existed,
 * git could only be reached through `bash`, so it inherited that approval. Letting
 * the new tool through unguarded would hand the model a way to run `commit` —
 * which executes the repo's hooks OUTSIDE the containment — with no approval at
 * all. But putting "git" in EXECUTION_TOOLS would gate `status` and `log` too,
 * and an approval prompt asked for something trivial is an approval prompt people
 * stop reading.
 *
 * So what decides is whether the OPERATION writes. Arguments that cannot be
 * parsed are treated as writing: fail toward asking permission, never toward
 * skipping it.
 */
export function perluPersetujuan(tc: PanggilanTool): boolean {
  const nama = namaTool(tc);
  if (EXECUTION_TOOLS.includes(nama)) return true;
  if (nama !== "git") return false;
  const a = argsTool(tc);
  if (a === null) return true; // unparseable -> ask
  try {
    const op = require("./tools/git-tool.ts").OPERASI[a.operasi];
    return !op || op.tulis === true;
  } catch (_) {
    return true;
  }
}

/**
 * Output that carries no evidence.
 *
 * An empty result, or one that only says it found nothing, must NOT count as
 * evidence. Counting it would make the answer-validation below demand that the
 * model "cite" that absence, and for a general-knowledge question the model then
 * evades ("please ask me to create a file...") instead of answering from what it
 * knows.
 *
 * Both language families are listed because tool output in this repo is written
 * in both, and the classifier has to see the same thing whichever produced it.
 */
const _POLA_TAK_SUBSTANTIF =
  /^\(?\s*(ok|tidak ada|not found|no match|nothing|kosong|empty|no matching|0\s+(hasil|match|file|baris))/i;

export function takSubstantif(output: unknown): boolean {
  const s = String(output ?? "").trim();
  return !s || _POLA_TAK_SUBSTANTIF.test(s);
}

/**
 * Is the answer grounded in the evidence the tools actually produced?
 *
 * This does NOT force the agent to copy tool output back out. Naming a file path
 * from the evidence, or reusing a distinctive term from it, is enough — the point
 * is to catch an answer invented wholesale, not to demand quotation.
 *
 * No tools ran means nothing to be grounded in, so it passes: a question the
 * model answered from its own knowledge is a legitimate answer.
 */
export function buktiSahih(
  summary: string,
  evidence: Iterable<string>,
): boolean {
  const set = Array.from(evidence || []);
  if (set.length === 0) return true;
  const sum = String(summary || "").toLowerCase();
  for (const ev of set) {
    const evLower = String(ev || "").toLowerCase();
    const paths =
      evLower.match(
        /[a-z]:\\[^\s]+|(?:\.\.\/|\/|[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_.-]+/g,
      ) || [];
    for (const p of paths) {
      if (p.length > 3 && sum.includes(p)) return true;
    }
    const terms = evLower.split(/\s+/).filter((w) => w.length >= 8);
    for (const term of terms) {
      if (sum.includes(term)) return true;
    }
  }
  return false;
}

/**
 * Is this model failure worth retrying on another provider?
 *
 * Transport-shaped failures are; a refusal or a bad request is not, and retrying
 * one only burns the budget on the same answer.
 */
const _POLA_SEMENTARA =
  /ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|timeout|EAI_AGAIN|network|ECONNREFUSED|ENOTFOUND|503|502|429|too busy|Service Unavailable|service_unavailable|<!DOCTYPE/i;

export function galatSementara(e: unknown): boolean {
  const m = (e as any)?.message ?? e ?? "";
  return _POLA_SEMENTARA.test(String(m));
}

/**
 * A stable key for "the same call again".
 *
 * Name plus arguments, because the same tool with different arguments is
 * progress while the same tool with identical arguments is not.
 */
export function kunciPanggilan(tc: PanggilanTool): string {
  const a = argsTool(tc);
  let argStr: string;
  try {
    argStr = JSON.stringify(a ?? {});
  } catch (_) {
    argStr = String(a);
  }
  return namaTool(tc) + ":" + argStr;
}

/**
 * The absolute backstop against an endless loop.
 *
 * The principle is to punish STALLING, not volume: a legitimate multi-step task
 * can run six different bash commands, or `npm test` four times around an
 * edit/test cycle, and stopping those was a real regression. So this is not the
 * primary check — it is the last resort for a loop whose output keeps changing
 * (a timestamp, say) and therefore slips past stall detection entirely.
 */
export const BATAS_PANGGILAN_IDENTIK = 8;

export function melewatiBatasUlang(hitungan: number): boolean {
  return hitungan > BATAS_PANGGILAN_IDENTIK;
}

module.exports = {
  EXECUTION_TOOLS,
  namaTool,
  argsTool,
  perluPersetujuan,
  takSubstantif,
  buktiSahih,
  galatSementara,
  kunciPanggilan,
  BATAS_PANGGILAN_IDENTIK,
  melewatiBatasUlang,
};
