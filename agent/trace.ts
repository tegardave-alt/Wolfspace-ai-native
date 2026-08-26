// Minimal trace system for debugging
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
