// trace.ts — a STUB. Every function here returns empty, on purpose and for now.
//
// READ THIS BEFORE DEBUGGING SOMETHING THAT USES IT. listRuns() returns [],
// getRunTimeline() returns [], and exportBundle() returns { empty: true }. The
// /debug run-history endpoints in server/routes/debug.ts call straight into
// these, so that part of the debug view is permanently blank — it is not
// broken, it was never implemented. The live event log that DOES work is
// agent/debug.ts.
//
// CONNECTS TO
//   imports  nothing
//   used by  server.ts, which passes it to server/routes/debug.ts
//
// The three constants below are dead: nothing reads them, and LOG_FILE names a
// path on one particular machine. They are kept only as a record of the shape
// the real implementation was meant to take, and none of them should be
// trusted as describing behaviour.
const LOG_FILE = "C:\\Users\\dave\\WOLFSPACE\\logs\\trace.jsonl";
const LOG_MAX = 500;
const LOG_RING = [];

function listRuns(limit = 30) {
  return [];
}
function getRunTimeline(runId) {
  return [];
}
function exportBundle(runId, opts) {
  return { runId, empty: true };
}

module.exports = { listRuns, getRunTimeline, exportBundle };
