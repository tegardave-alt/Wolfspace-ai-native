// core/agent/state.cjs
const { randomUUID } = require('crypto');
function initState({ runId, history = [], cloud = null } = {}) {
  return {
    runId: runId || randomUUID(),
    messages: [],
    plan: null,
    pendingAction: null,
    lastResult: null,
    verified: false,
    retries: 0,
    callCounts: {},
    cloud,
    meta: { startedAt: Date.now(), status: 'running' },
  };
}
function reduceState(current, patch) {
  const out = { ...current };
  for (const k of Object.keys(patch)) {
    const v = patch[k];
    if (v === undefined) continue;
    if (k === 'messages' && Array.isArray(v)) {
      out.messages = (current.messages || []).concat(v);
    } else if (k === 'callCounts' && v && typeof v === 'object') {
      out.callCounts = { ...(current.callCounts || {}), ...v };
    } else {
      out[k] = v;
    }
  }
  return out;
}
function finalize(state, { status = 'done', summary = '' } = {}) {
  return reduceState(state, {
    meta: { ...(state.meta || {}), status, finishedAt: Date.now(), summary },
  });
}
module.exports = { initState, reduceState, finalize };