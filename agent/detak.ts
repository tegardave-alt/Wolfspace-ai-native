// Telling the user the agent is still alive while something slow happens.
//
// ── WHY THIS IS A MODULE AND NOT A THIRD setInterval ─────────────────────────
//
// self_agent.ts already carried two of these, written out by hand:
//
//   "Preparing MCP connection…"      then "Still setting up MCP (Ns)…"
//   "Waiting for the model…"         then "Still waiting for the model (Ns)…"
//
// Both exist for a measured reason recorded in that file: one run sat silent
// for 60.3 seconds while two MCP servers timed out, with no sign at all that
// the agent was alive. A third copy was about to be added for TOOLS — the
// longest silence of the three, because unlike a model call there is not even a
// token trickling in to prove something is happening.
//
// Three copies of one pattern is how this repo has produced bugs before. It is
// also untestable in place: the two existing ones live in the middle of a
// 3000-line function that cannot be required without starting a whole agent
// run. Here it can be run directly.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ─────────────────────────────────────────
//
// It does not call a model, does not decide anything, and does not speak unless
// the work has already outlasted the first interval. A heartbeat that fires
// immediately would put a line on screen for every fast tool call, and the
// point is to break silence, not to narrate.
"use strict";

/** The event shape the frontend already renders. No new contract. */
export interface PesanDetak {
  t: "model_wait";
  m: string;
  ctxChars?: number;
}

export interface OpsiDetak {
  /** Milliseconds between beats. */
  jeda?: number;
  /** Carried through to the frontend when the caller has a context size. */
  ctxChars?: number;
  /** Injectable for tests; defaults to the real clock. */
  sekarang?: () => number;
}

/**
 * Starts a heartbeat and returns the function that stops it.
 *
 * ALWAYS call the returned function in a `finally`. An interval that outlives
 * its work keeps emitting into a run that has moved on, and the user watches a
 * tool "still running" that finished a minute ago.
 *
 * @param emit    the run's event sink
 * @param apa     what is taking so long, in the user's words ("bash", "the model")
 * @param opsi    interval and extras
 */
export function mulaiDetak(
  emit: (p: PesanDetak) => void,
  apa: string,
  opsi: OpsiDetak = {},
): () => void {
  const jeda = opsi.jeda && opsi.jeda > 0 ? opsi.jeda : 5000;
  const jam = opsi.sekarang || (() => Date.now());
  const t0 = jam();
  const id = setInterval(() => {
    const detik = Math.round((jam() - t0) / 1000);
    const p: PesanDetak = {
      t: "model_wait",
      m: apa + " still running (" + detik + "s)…",
    };
    if (opsi.ctxChars !== undefined) p.ctxChars = opsi.ctxChars;
    emit(p);
  }, jeda);
  // A stray interval must never be the reason a process refuses to exit. The
  // stop function below is what actually ends it; this is the backstop.
  if (typeof (id as any).unref === "function") (id as any).unref();
  let berhenti = false;
  return () => {
    // Idempotent: a caller that stops in both a catch and a finally is normal,
    // and clearing an already-cleared interval must not be a second event.
    if (berhenti) return;
    berhenti = true;
    clearInterval(id);
  };
}

module.exports = { mulaiDetak };
