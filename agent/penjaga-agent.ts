// penjaga-agent.ts — the agent's guards: which tools need a human to approve
// them, and what must be refused outright.
//
// ROLE IN THE SYSTEM. WOLFSPACE has TWO orchestrators — the JS loop in
// agent/self_agent.ts and the Python graph driven by agent/python-agent.ts. A
// guard living on only one is worse than no guard, because the same request
// then behaves differently depending on which one handled it. This repo has
// been bitten by that "two surfaces" pattern repeatedly (the MCP list rendered
// twice with separate state, attachments handled in two places, findings
// recorded in one of two `read` branches), and every time the copy is what
// drifted. So the guards are copied into neither loop: extracted here, called
// from both.
//
// Everything here is a PURE function of its arguments — no filesystem, no
// model, no process — which is what makes it both shareable and testable
// without running an agent.
//
// CONNECTS TO
//   imports  agent/tools/git-tool.ts
//   used by  agent/self_agent.ts, agent/python-agent.ts, agent/perencana-agent.ts

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

// ── Scope: is this call still the user's task? ──────────────────────────────
//
// WHAT WENT WRONG. The agent has done work nobody asked for: sent to fix one
// thing, it edited files the task never mentioned. Nothing in the loop could
// object, because nothing in the loop KNEW the task: the user's request was
// one message among dozens of tool results, and history compaction folds old
// messages into a counted digest -- the goal included. todowrite could also
// replace the checklist wholesale, so the agent could re-plan itself onto a
// different job and every later step would look on-task against the new list.
//
// WHAT THIS IS. A deterministic test of a WRITE against the task, with no
// model in the loop: a write is in scope when its target is named by the goal
// or the plan, sits under a directory they name, or was READ during this run
// (the agent looked before it changed). Anything else is not refused -- it is
// handed to the human, the same way `bash` already is. The person who gave
// the task decides whether the task grew.
//
// It is strict on purpose about being a pure function: no filesystem, so it
// cannot be fooled by what exists on disk, only by what the task said.

/** Tools that change the workspace. A read never leaves the task's scope. */
export const WRITE_TOOLS: readonly string[] = [
  "edit",
  "write",
  "replace_file_content",
];

/** The tools whose `path` argument means "the agent has now seen this file". */
export const READ_TOOLS: readonly string[] = ["read"];

function _normPath(p: any): string {
  return String(p || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .toLowerCase();
}

function _basename(p: string): string {
  const i = p.lastIndexOf("/");
  return i < 0 ? p : p.slice(i + 1);
}

/**
 * Every path-like token the goal or the plan mentions, normalised.
 * "src/app.ts", `public/styles.css`, "the Sidebar.tsx file" all count.
 */
export function jalurDisebut(teks: string): string[] {
  const out = new Set<string>();
  const re =
    /[A-Za-z0-9_./\\-]+\.[A-Za-z0-9]{1,8}|[A-Za-z0-9_.-]+(?:[\/\\][A-Za-z0-9_.-]+)+/g;
  for (const m of String(teks || "").matchAll(re)) {
    const t = _normPath(m[0]).replace(/^[./]+/, "");
    if (t && !/^\d+(\.\d+)*$/.test(t)) out.add(t);
  }
  return [...out];
}

export interface KonteksLingkup {
  /** The user's request that started the run. Immutable for the run. */
  tujuan: string;
  /** The checklist as it stands (planner lines, possibly with status). */
  checklist?: readonly string[];
  /** The planner's ORIGINAL lines, before any todowrite. */
  rencanaAwal?: readonly string[];
  /** Paths the agent has read this run, normalised. */
  dibaca?: Iterable<string>;
  /**
   * The request is to BUILD something new. Then a write to a file the task
   * does not name is the task itself, not drift: the goal "make a landing
   * page" names no file, and index.html has to come from somewhere. Only
   * edits to files that already exist and were not read are still measured.
   */
  membuat?: boolean;
  /** Paths that exist in the workspace, for the create-mode distinction. */
  ada?: (path: string) => boolean;
}

export interface PutusanLingkup {
  luar: boolean;
  /** Why, in one sentence a person can act on. */
  sebab?: string;
  berkas?: string;
}

/**
 * Is this write outside the task? Pure; never throws.
 *
 * Reads always pass. Unparseable arguments on a write tool are OUT of scope:
 * fail toward asking, the same rule perluPersetujuan uses.
 */
export function diLuarLingkup(
  tc: PanggilanTool,
  ctx: KonteksLingkup,
): PutusanLingkup {
  const nama = namaTool(tc);
  if (nama === "todowrite") return _todowriteMenggantiTugas(tc, ctx);
  if (!WRITE_TOOLS.includes(nama)) return { luar: false };
  const a = argsTool(tc);
  if (a === null) {
    return { luar: true, sebab: "arguments could not be parsed" };
  }
  const target = _normPath(a.path);
  if (!target) return { luar: true, sebab: "write without a path" };
  // Create mode: a NEW file is the deliverable. Measured before this
  // existed: "Buatkan halaman web" -> write index.html -> held as outside the
  // task, because nothing was named. An existing file still has to be read
  // or named, so create mode cannot become a licence to rewrite the project.
  if (ctx.membuat && !(ctx.ada && ctx.ada(target))) return { luar: false };

  const disebut = new Set(
    jalurDisebut(
      [ctx.tujuan, ...(ctx.checklist || []), ...(ctx.rencanaAwal || [])].join(
        "\n",
      ),
    ),
  );
  const base = _basename(target);
  // Named outright, by full path or by file name.
  for (const d of disebut) {
    if (target === d || target.endsWith("/" + d) || base === _basename(d)) {
      return { luar: false };
    }
    // Under a directory the task names ("everything in server/").
    if (!/\.[a-z0-9]{1,8}$/i.test(d) && target.startsWith(d + "/")) {
      return { luar: false };
    }
  }
  // Read first, then written: the agent looked before it changed. The read
  // was itself on the agent's initiative, but a write to something it has
  // inspected is investigation reaching its conclusion, not a new job.
  for (const r of ctx.dibaca || []) {
    if (_normPath(r) === target) return { luar: false };
  }
  return {
    luar: true,
    berkas: target,
    sebab:
      '"' +
      target +
      '" is not named by the task or its plan, and was not read during this run',
  };
}

/**
 * A todowrite that keeps none of the planner's original items is the agent
 * re-planning itself onto a different job. Marking items done, adding sub-steps
 * or reordering all keep at least one original line, so they pass.
 */
function _todowriteMenggantiTugas(
  tc: PanggilanTool,
  ctx: KonteksLingkup,
): PutusanLingkup {
  // Measured against the plan as it STANDS -- the planner's lines and the
  // items added since. A status update for a sub-step the model itself added
  // a step ago is bookkeeping, not re-planning; only a list that matches
  // nothing already there is.
  const awal = [...(ctx.rencanaAwal || []), ...(ctx.checklist || [])]
    .map(_intiBaris)
    .filter(Boolean);
  if (awal.length === 0) return { luar: false };
  const a = argsTool(tc);
  if (a === null) return { luar: true, sebab: "arguments could not be parsed" };
  const baru = Array.isArray(a.todos) ? a.todos : [];
  const isiBaru = baru
    .map((t: any) =>
      _intiBaris(
        typeof t === "string"
          ? t
          : String(t?.content ?? t?.text ?? t?.todo ?? ""),
      ),
    )
    .filter(Boolean);
  if (isiBaru.length === 0) return { luar: false }; // clearing is not re-planning
  const bertahan = awal.some((x) =>
    isiBaru.some((y) => y === x || y.includes(x) || x.includes(y)),
  );
  return bertahan
    ? { luar: false }
    : {
        luar: true,
        sebab:
          "the new checklist keeps none of the original plan's items - this replaces the task rather than tracking it",
      };
}

/** A checklist line without its status marker, bullet, or case. */
function _intiBaris(s: string): string {
  return String(s || "")
    .replace(/^\s*(?:\[[x→\-! ]\]|[-*•])\s*/i, "")
    .trim()
    .toLowerCase();
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
  WRITE_TOOLS,
  READ_TOOLS,
  jalurDisebut,
  diLuarLingkup,
};
