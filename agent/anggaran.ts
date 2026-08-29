/**
 * The performance budget, in one place, with where each number came from.
 *
 * WHY THIS FILE EXISTS. The limits were already here — ten of them, spread over
 * eight files, none aware of the others. That is workable until you ask the
 * question this file answers: how much load is WOLFSPACE allowed to take before
 * the window freezes? You cannot answer that from scattered constants, because
 * the thing they all spend from is one shared resource — the main thread.
 *
 * THE ONE NUMBER EVERYTHING DERIVES FROM. Windows marks a window "Not
 * Responding" after 5000 ms without the message queue being drained. That is
 * not quoted from documentation; it was measured on this machine three times
 * (5011 / 5028 / 5034 ms, sampled at 20 ms) by blocking a real window's UI
 * thread and polling IsHungAppWindow until it flipped, with the ghost window's
 * "(Not Responding)" title captured verbatim as confirmation.
 *
 * Two properties of that budget decide everything below:
 *
 *   It is CONSECUTIVE, not cumulative. The count resets every time the queue
 *   drains, so thirty 150 ms edits never freeze anything. Only one unbroken
 *   stretch does.
 *
 *   It is spent by the BACKEND. In desktop mode the backend runs in-process in
 *   Electron's main process (electron/main.ts), so synchronous work in agent/
 *   holds the same thread that draws the window. A component blocking for N ms
 *   freezes the UI for N ms.
 *
 * WHAT IS DELIBERATELY NOT HERE. Limits that bound a DOMAIN rather than the
 * time budget stay where they are, because moving them would add churn without
 * making anything safer. They are listed so the next reader does not conclude
 * they were forgotten:
 *
 *   agent/code-quality.ts   NEW_FILE_MAX_LINES 800, NEW_FILE_MAX_INDENT 24
 *   agent/rag.ts            MAX_RECORDS 2000
 *   agent/snapshot.ts       MAX_SNAPS 50, MAX_AGE_MS 7 days
 *   agent/debug.ts          LOG_MAX 800, LOG_MAX_BYTES 50 MB
 *   core/terminal.ts        OUTPUT_MAX 4096
 *   agent/tools/bash-jail.ts  MAX_PROC/MAX_VMEM_KB/MAX_CPU_SEC (Linux jail)
 *
 * The RAG one is worth singling out. A load curve run against agent/rag.ts
 * reached 1296 ms at one million vectors — but MAX_RECORDS caps the store at
 * 2000, where the same measurement is about 6 ms. The cap makes that component
 * structurally incapable of costing anything, which is why no budget entry for
 * it appears below.
 */

/** Windows' hang threshold. Measured, not quoted. Everything else is a
 *  fraction of this. */
export const AMBANG_HANG_MS = 5000;

/** Bands used to classify one uninterrupted block. NORMAL is not aspirational:
 *  the running app's message-pump latency was measured at p99 = 1 ms, worst
 *  44 ms over 2840 samples, so anything past 100 ms is already unusual. */
export const BLOKIR_NORMAL_MS = 100;
export const BLOKIR_WASPADA_MS = 1000;

/**
 * Largest payload allowed to cross the IPC boundary in one message.
 *
 * Derived from a measured curve of JSON.stringify + JSON.parse, which is what
 * an IPC message costs on the main thread:
 *
 *     1 MB ->    18 ms
 *    10 MB ->   194 ms
 *    50 MB ->  1241 ms
 *   200 MB ->  4486 ms      <- 90% of the whole budget, in ONE message
 *
 * That is ~22 ms per MB, so the freeze threshold sits near 220 MB. 32 MB keeps
 * a single message under ~720 ms — inside BLOKIR_WASPADA_MS with room for the
 * rest of a turn's work to share the same stretch.
 *
 * Heap matters as much as time: the 200 MB payload grew the heap by 643 MB, an
 * amplification of about 3.2x. Against V8's measured 4288 MB ceiling on this
 * machine, that puts the OOM point near a 1.3 GB payload — far enough away that
 * time, not memory, is the binding constraint here.
 */
export const IPC_PAYLOAD_MAKS = 32 * 1024 * 1024;

/**
 * Ceiling on how deep the payload sizer walks before giving up.
 *
 * Measuring an object's real size means serialising it, which is the exact cost
 * the cap exists to avoid — so the guard estimates instead, walking only the
 * shapes that can realistically carry tens of megabytes (strings, buffers, and
 * the arrays/objects holding them) and stopping the moment it is over budget.
 */
export const IPC_SIZER_KEDALAMAN = 4;

/**
 * Buffer ceiling for a command's captured output.
 *
 * The old value was 200 KB, and reaching it FAILED the whole command with
 * "stdout maxBuffer length exceeded". Measured on the boundary: 200 KB passed,
 * 210 KB failed. An ordinary `git log` or `npm ls` clears 200 KB, so the most
 * likely limit to be hit in daily use was also the one that discarded work
 * already done successfully.
 *
 * 8 MB matches what the AppContainer path already used
 * (agent/tools/appcontainer-jail.ts), so a command behaves the same whichever
 * route runs it. This is a BUFFER, not a payload crossing IPC — what is handed
 * on is truncated separately, and IPC_PAYLOAD_MAKS still applies beyond it.
 */
export const EXEC_MAKS_BUFFER = 8 * 1024 * 1024;

/**
 * Resource ceilings applied to commands the agent runs on Windows.
 *
 * The Linux path already had these — agent/tools/bash-jail.ts caps processes,
 * virtual memory and CPU seconds through the namespace jail. The Windows path
 * (AppContainer) had NO equivalent: a command could take all the RAM and CPU it
 * wanted. These values mirror the Linux ones so a command behaves the same way
 * on both, and are enforced by a Job Object in scripts/appcontainer/AcLaunch.cs.
 *
 * MAX_VMEM_KB there is 512 MB and MAX_CPU_SEC is 60, so these match rather than
 * invent. ActiveProcessLimit is 256, the same as MAX_PROC.
 */
export const JOB_MEM_MB = 512;
export const JOB_MAKS_PROSES = 256;
export const JOB_CPU_DETIK = 60;

/** Environment variables AcLaunch.exe reads the limits from. Passing them as
 *  arguments would collide with the pass-through argv it forwards to the
 *  command, which is positional. */
export const JOB_ENV = {
  mem: "WOLFSPACE_JOB_MEM_MB",
  proses: "WOLFSPACE_JOB_MAXPROC",
  cpu: "WOLFSPACE_JOB_CPU_SEC",
} as const;

/** Classify one uninterrupted block against the budget. Used by callers that
 *  report or log; kept here so the bands cannot drift apart. */
export function vonisBlokir(
  ms: number,
): "normal" | "naik" | "waspada" | "over" {
  if (ms >= AMBANG_HANG_MS) return "over";
  if (ms >= BLOKIR_WASPADA_MS) return "waspada";
  if (ms >= BLOKIR_NORMAL_MS) return "naik";
  return "normal";
}

/**
 * Approximate byte size of an IPC value, abandoning the walk once over budget.
 *
 * Serialising it to find out would cost exactly what the cap exists to prevent,
 * so this visits only the shapes that can realistically carry tens of megabytes
 * and stops the moment the total is already too large.
 *
 * Strings count 2 bytes per char because V8 holds most of ours as UTF-16. For
 * plain ASCII that over-estimates by 2x, and that direction is deliberate: the
 * cheap mistake is refusing something borderline, the expensive one is freezing
 * the window.
 *
 * It lives here rather than in electron/main.ts so it can be tested against
 * real values. A guard that can only be checked by pattern-matching its own
 * source has already gone wrong in this repo once — passing while the hook it
 * described sat on a dead branch.
 */
export function ukuranKasar(v: any, batas: number, sisa: number): number {
  if (v == null) return 0;
  const t = typeof v;
  if (t === "string") return v.length * 2;
  if (t === "number" || t === "boolean") return 8;
  if (v instanceof ArrayBuffer) return v.byteLength;
  if (ArrayBuffer.isView(v)) return (v as any).byteLength;
  if (sisa <= 0) return 0; // deeper than we walk; assumed small
  let n = 0;
  if (Array.isArray(v)) {
    for (const x of v) {
      n += ukuranKasar(x, batas, sisa - 1);
      if (n > batas) return n; // already over — finishing proves nothing
    }
    return n;
  }
  if (t === "object") {
    for (const k of Object.keys(v)) {
      n += k.length * 2 + ukuranKasar(v[k], batas, sisa - 1);
      if (n > batas) return n;
    }
  }
  return n;
}

/** Message explaining the refusal, or null when the value is within budget. */
export function lewatBatasIpc(v: any, arah: string): string | null {
  const n = ukuranKasar(v, IPC_PAYLOAD_MAKS, IPC_SIZER_KEDALAMAN);
  if (n <= IPC_PAYLOAD_MAKS) return null;
  const mb = (x: number) => (x / 1048576).toFixed(1);
  return (
    "IPC " +
    arah +
    " ditolak: ~" +
    mb(n) +
    " MB melewati batas " +
    mb(IPC_PAYLOAD_MAKS) +
    " MB. A message that size blocks the thread that draws the " +
    "window — measured at 4486 ms for 200 MB, and Windows marks a window Not " +
    "Responding at 5000 ms. Send it in chunks, not in one go."
  );
}

/* ── Conversation compaction ───────────────────────────────────────────────
 *
 * WHY THIS EXISTS. The agent's message array has two different size behaviours,
 * pulling in opposite directions, and both were unbounded in their own way:
 *
 *   across turns   agent/self_agent.ts:1185  history.slice(-effortMaxTurns)
 *                  A BLIND tail trim at 6/16/40 messages. What it drops first
 *                  is whatever is longest, which is `read` results — so the
 *                  agent forgot what it already knew. Measured in a real run
 *                  ledger (pid 12932, 88 min): 246 actions for 22 unique
 *                  commands, index.html read 13x, app.js 12x, longest
 *                  consecutive repeat only 4. Not a loop — amnesia.
 *                  agent/temuan.ts was built to answer that half.
 *
 *   within a run   agent/self_agent.ts:1471  [...state.messages]
 *                  No trim at all. The array grows for the whole run, and
 *                  agent/cloud.ts has NO handler for a context-length refusal,
 *                  so a long run walks into a provider 400 and dies there.
 *
 * This budget governs the SECOND one.
 *
 * PROVENANCE, stated plainly because it differs from the other numbers in this
 * file: 5000 ms was measured, 8 MB was matched to an existing limit. This
 * number is CHOSEN, not measured — reproducing a real context overflow needs a
 * long live run against a real provider, which has not been done here. It is
 * set below the smallest context window this repo's providers commonly offer
 * (128k tokens), with wide margin, and above anything a short run produces so
 * it does not fire spuriously. Override and re-measure rather than trusting it.
 */
export const PADAT_AMBANG_CHAR = Number(
  process.env.WOLFSPACE_PADAT_AMBANG || 200_000,
);

/**
 * Characters per token, for turning a measured character count into a token
 * estimate. A heuristic, not a tokenizer: ~4 is the usual figure for mixed
 * English and code. It is only ever used to REPORT an estimate — every decision
 * in agent/pemadatan.ts is made on the character count, which is exact.
 */
export const PADAT_CHAR_PER_TOKEN = 4;

/**
 * How many of the most recent messages survive compaction verbatim.
 *
 * The tail is where the work actually is: the last tool results, the error just
 * hit, the half-finished edit. 12 is deliberately larger than the 6 of LOW
 * effort so compaction never leaves a run with less recent context than the
 * blind trim would have.
 *
 * The real boundary is moved EARLIER than this when it would land on a tool
 * result, so the true count is 12 or more, never fewer — see _awalAman().
 */
export const PADAT_SISA_EKOR = 12;

/** Longest digest injected into the system message. Beyond this the digest
 *  starts costing more context than the messages it replaced, which would
 *  defeat the point. */
export const PADAT_BLOK_MAKS = 2000;
