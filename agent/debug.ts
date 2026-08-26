// Debug bus — a single event log wired through ALL of WOLFSPACE's logic.
// Every meaningful step (model call, execution, retry, cloud request, error)
// emits a structured event. Events live in a ring buffer, stream live to any
// /debug viewer, and append to a log file. Toggle with config.debug = false.

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
const CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8"),
);

const DEBUG_ON = CONFIG.debug !== false;
const VERBOSE = CONFIG.verbose === true;
const LOG_FILE = path.join(os.tmpdir(), "WOLFSPACE-debug.log");
const LOG_RING: any[] = []; // recent events, in memory
const LOG_MAX = 800;
const debugSubs = new Set<(line: string) => void>(); // live SSE writers

// ── Log file rotation ──
// LOG_RING was bounded at 800 entries from the start, but the FILE was not
// bounded at all. Measured on this machine: 0.99 GB over 23.8 days (~4 million
// events, ~43 MB/day) — growing until the disk filled. In a container it eats
// the same /data volume as cloud-keys.json.
//
// The size also weighs on writing itself: appending to an empty file took
// 0.476 ms, to a 0.99 GB file 0.787 ms — 65% more expensive, and appendFileSync
// is SYNCHRONOUS on a path called at every agent step. So the problem made
// itself worse over time.
//
// The threshold is deliberately generous (50 MB, roughly a week of use) so the
// trail for tracing a bug stays long; one old file is kept, so the ceiling is
// ~100 MB rather than unbounded.
const LOG_MAX_BYTES = 50 * 1024 * 1024;
const LOG_PREV = LOG_FILE + ".1";

// The size is tracked in memory, NOT with a statSync per write: a statSync on
// this hot path would add a syscall to every event. It is measured once from the
// real size when the module loads, then increased by each line's length.
let _logBytes = 0;
try {
  _logBytes = fs.statSync(LOG_FILE).size;
} catch (_) {}

function _rotateIfNeeded() {
  if (_logBytes < LOG_MAX_BYTES) return;
  try {
    try {
      fs.unlinkSync(LOG_PREV);
    } catch (_) {}
    fs.renameSync(LOG_FILE, LOG_PREV);
    _logBytes = 0;
  } catch (_) {
    // Rotation failed (file locked, permissions, and so on) — do NOT let that
    // stop the application. Reset the counter so it does not retry on every write.
    _logBytes = 0;
  }
}

let _evSeq = 0;
function dlog(cat, level, msg, data) {
  const e = {
    seq: ++_evSeq,
    t: Date.now(),
    cat,
    level,
    msg,
    data: data === undefined ? null : data,
  };
  LOG_RING.push(e);
  if (LOG_RING.length > LOG_MAX) LOG_RING.shift();
  const line = "data: " + JSON.stringify(e) + "\n\n";
  for (const w of debugSubs) {
    try {
      w(line);
    } catch (_) {}
  }
  // File writing now RESPECTS DEBUG_ON. It did not before: appendFileSync ran
  // unconditionally, so `config.debug = false` only silenced the console while
  // the file kept growing at 43 MB/day — turning debug off did not actually turn
  // off the thing consuming the disk.
  if (DEBUG_ON) {
    try {
      const rec = JSON.stringify(e) + "\n";
      _rotateIfNeeded();
      fs.appendFileSync(LOG_FILE, rec);
      _logBytes += Buffer.byteLength(rec);
    } catch (_) {}
  }
  const _ws = (fn, ...a) => {
    try {
      fn(...a);
    } catch (_) {}
  };
  // Two defects lived here, and the same pair lived in server.ts's copy of dlog:
  //
  //   1. A "console" event was ALREADY printed by the console.log that produced
  //      it, so echoing it again prints every line twice.
  //   2. `${msg} ${text}` appends a space even when text is empty. That trailing
  //      space is what let each re-emission grow by one character — which is the
  //      only reason the amplification was identifiable at all.
  //
  // Measured in the running app before this fix: 65 genuine block events had
  // produced 86,040 log lines (1,323x) and 11 genuine STOP events 138,694
  // (12,608x) — a 40 MB log grown out of 76 events.
  const _ekor = (v: any) => (v ? " " + v : "");
  if (VERBOSE && cat !== "console") {
    const prefix = `[WOLFSPACE:${cat}]`;
    const text = data ? JSON.stringify(data, null, 0) : "";
    if (level === "error")
      _ws(
        process.stderr.write.bind(process.stderr),
        `${prefix} ${msg}${_ekor(data && data.error ? data.error : "")}\n`,
      );
    else
      _ws(
        process.stdout.write.bind(process.stdout),
        `${prefix} ${msg}${_ekor(text)}\n`,
      );
  } else if (DEBUG_ON && level === "error" && cat !== "console") {
    _ws(
      process.stderr.write.bind(process.stderr),
      `[WOLFSPACE:${cat}] ${msg}${_ekor(data && data.error ? data.error : "")}\n`,
    );
  }
  return e;
}

// One module.exports only. There used to be TWO in a row, and the second
// overwrote the first — so VERBOSE was never actually exported despite being
// listed.
module.exports = {
  DEBUG_ON,
  VERBOSE,
  LOG_FILE,
  LOG_PREV,
  LOG_RING,
  LOG_MAX,
  LOG_MAX_BYTES,
  debugSubs,
  dlog,
};
