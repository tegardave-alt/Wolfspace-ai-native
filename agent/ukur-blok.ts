// One safe way to put a NAME on a blocking stretch.
//
// WHY IT EXISTS. agent/pemantau-blokir.ts measures how long the event loop is
// held in one unbroken stretch, and in desktop mode that loop belongs to the
// thread that draws the window — so a long stretch IS the "Not Responding"
// state. But the monitor can only name what is labelled, and its own docstring
// says so: an empty contributor list means the block came from somewhere with
// no instrument on it.
//
// Everything that had a label was startup, snapshot, safe-edit and the
// TypeScript transpile. The whole tool-execution path — where every synchronous
// child process lives — had none. So a twenty-second freeze reported its size
// and never its source, and there was nothing to do with the report but guess.
//
// WHY A WRAPPER AND NOT A DIRECT require(). Losing the instrument must never
// cost the operation. These call sites run in the main process, in worker
// processes, and inside a zone where agent/ may not be resolvable at all; a
// throw from the require would turn a measurement into an outage. The fallback
// is the plain call.
"use strict";

/**
 * Run `fn` and attribute however long it blocked to `label`.
 *
 * Returns exactly what `fn` returns, so wrapping a call never changes control
 * flow. Stretches under pemantau-blokir's CATAT_MIN_MS (5 ms) are dropped by
 * the monitor itself, so labelling a fast call costs nothing and adds no noise.
 */
function ukurBlok(label, fn) {
  try {
    return require("./pemantau-blokir.ts").ukur(label, fn);
  } catch (_) {
    return fn();
  }
}

module.exports = { ukurBlok };
