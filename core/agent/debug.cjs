// Debug bus — a single event log wired through ALL of WOLFSPACE's logic.
// Every meaningful step (model call, execution, retry, cloud request, error)
// emits a structured event. Events live in a ring buffer, stream live to any
// /debug viewer, and append to a log file. Toggle with config.debug = false.

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));

const DEBUG_ON  = CONFIG.debug !== false;
const VERBOSE   = CONFIG.verbose === true;
const LOG_FILE  = path.join(os.tmpdir(), 'WOLFSPACE-debug.log');
const LOG_RING  = [];                 // recent events, in memory
const LOG_MAX   = 800;
const debugSubs = new Set();          // live SSE writers
let _evSeq = 0;
function dlog(cat, level, msg, data) {
  const e = { seq: ++_evSeq, t: Date.now(), cat, level, msg, data: data === undefined ? null : data };
  LOG_RING.push(e);
  if (LOG_RING.length > LOG_MAX) LOG_RING.shift();
  const line = 'data: ' + JSON.stringify(e) + '\n\n';
  for (const w of debugSubs) { try { w(line); } catch (_) {} }
  try { fs.appendFileSync(LOG_FILE, JSON.stringify(e) + '\n'); } catch (_) {}
  if (VERBOSE) {
    const prefix = `[WOLFSPACE:${cat}]`;
    const text = data ? JSON.stringify(data, null, 0) : '';
    if (level === 'error') process.stderr.write(`${prefix} ${msg} ${data && data.error ? data.error : ''}\n`);
    else process.stdout.write(`${prefix} ${msg} ${text}\n`);
  } else if (DEBUG_ON && level === 'error') {
    process.stderr.write(`[WOLFSPACE:${cat}] ${msg} ${data && data.error ? data.error : ''}\n`);
  }
  return e;
}

module.exports = { DEBUG_ON, VERBOSE, LOG_FILE, LOG_RING, LOG_MAX, debugSubs, dlog };

module.exports = { DEBUG_ON, LOG_FILE, LOG_RING, LOG_MAX, debugSubs, dlog };

