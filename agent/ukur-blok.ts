// ukur-blok.ts — puts a NAME on a blocking stretch, safely, from anywhere.
//
// ROLE IN THE SYSTEM. agent/pemantau-blokir.ts measures how LONG the event loop
// was held; this is what tells it WHERE. The monitor can only name what is
// labelled, so before this, a twenty-second freeze reported its size and never
// its source: startup, snapshot, safe-edit and the transpile were labelled,
// while the entire tool-execution path — where every synchronous child process
// lives — was not.
//
// CONNECTS TO
//   imports  ./pemantau-blokir, lazily and defensively (see below)
//   used by  the paths that block: appcontainer-jail, bash-jail, wsl-jail,
//            broker/zone-process, platform/posix, platform/windows,
//            python-worker, server.ts
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
