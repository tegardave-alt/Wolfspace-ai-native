// Chat streaming and reply handling (extracted from server.cjs)
// Dependencies – same as original server.cjs
const http = require('http');
const https = require('https');
const { dlog } = require('./debug.cjs');
const { pickSystem } = require('./prompts.cjs');
const { runByLang, detectLang, extractCode, askModelStream } = require('./runners.cjs');
const { runSelfTool, SELF_TOOLS } = require('./tools.cjs');
const { askCloudStream } = require('./cloud.cjs');
const { createPseudoTagStreamFilter } = require('./pseudo-tag-filter.cjs');

/**
 * Stream a chat completion to the client.
 * @param {Object} opts - {history, port, cloud}
 *   - history: array of {role, content}
 *   - port: local model port (if using local model)
 *   - cloud: optional cloud config {key, provider?, model?, system?, baseUrl?}
 * @param {function(string):void} emit - SSE writer (writes "data: ...\n\n").
 * @param {Object} ctl - control object, currently unused but kept for compatibility.
 */
async function chatStream({ history, port, cloud }, emit, ctl) {
  // Guard: pastikan history selalu berupa array, bukan null/undefined
  const safeHistory = Array.isArray(history) ? history : [];

  // Choose system prompt based on history and mode – prompts module handles.
  const sys = pickSystem(safeHistory);

  // Batasi (slice) riwayat pesan sesuai batas konteks token di masing-masing mode effort
  const effortLevel = (cloud && typeof cloud.effort !== 'undefined') ? Number(cloud.effort) : (arguments[0].effort !== undefined ? Number(arguments[0].effort) : 1);
  const effortMaxTurns = effortLevel === 0 ? 6 : (effortLevel === 2 ? 40 : 16);
  const slicedHistory = safeHistory.slice(-effortMaxTurns);

  const messages = [{ role: 'system', content: sys }, ...slicedHistory];
  console.log('[chat] chatStream started', { historyLen: safeHistory.length, useCloud: !!(cloud && cloud.key), port });
  // Plain chat has no tool-execution loop, so a pseudo tool-call tag from a weak/local
  // model can never be a real call here — it only ever needs to be kept off the screen.
  const tagFilter = createPseudoTagStreamFilter(safe => emit({ t: 'tok', c: safe }));
  const onToken = token => {
    console.log('[chat] token:', token);
    tagFilter.feed(token);
  };
  const onError = err => {
    console.error('[chat] stream error:', err.message || err);
    dlog('chat', 'error', 'stream error', { err: err.message || err });
    emit({ t: 'err', m: err.message || String(err) });
  };

  // Decide whether to use cloud or local model.
  // If cloud is specified but has no key, fall back to local model.
  if (cloud && !cloud.key) {
    console.warn('[chat] Cloud selected but no API key — falling back to local model');
  }
  const streamPromise = cloud && cloud.key
    ? askCloudStream(cloud, messages, onToken, null)
    : askModelStream(port, messages, onToken, null);

  return streamPromise
    .then(full => {
      dlog('chat', 'info', 'stream completed', { length: full.length });
      tagFilter.flush(); // release any held-back tail (e.g. text that merely started with "<f")

      return runReply(full, safeHistory, emit);
    })
    .catch(onError);
}

/**
 * Determine whether the most recent user message explicitly requests code execution.
 * Guards against auto-executing code blocks in greetings or explanations.
 * @param {Array} history - chat history
 * @returns {boolean} true if the latest user message explicitly requests execution.
 */
function _isExecutionRequested(history) {
  // Guard: jika history bukan array, langsung kembalikan false
  if (!Array.isArray(history) || history.length === 0) return false;
  // Find the latest user message
  let latestUser = null;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') {
      latestUser = history[i].content || '';
      break;
    }
  }
  if (!latestUser) return false;

  // Explicit execution keywords: run, execute, test, jalankan, cobakan, eksekusi, try it, run it, execute it, etc.
  const explicitExec = /\b(run|execute|test|jalankan|cobakan|eksekusi|try it|run it|execute it|test it|execute this|run this|test this|compile this)\b/gi;
  return explicitExec.test(latestUser);
}

/**
 * Process the assistant's full reply: detect code blocks, execute if requested,
 * and handle function‑calling style tool invocations.
 * @param {string} reply - full text from the model.
 * @param {Array} history - chat history (may be used for context).
 */
async function runReply(reply, history, emit) {
  // Fitur auto-run dimatikan agar chat biasa tidak secara agresif
  // menjalankan regex tool atau mengeksekusi blok kode.
  // Eksekusi hanya dilakukan di mode Agent Runner (/self-agent).
  return { ok: true, info: 'auto-run disabled in normal chat', reply };
}

/**
 * Helper to parse a pseudo‑action line like "!run python ..." – not used currently
 * but kept for compatibility with older code.
 */
function parseAction(line) {
  const m = line.match(/^!([a-zA-Z]+)\s+(.*)$/);
  if (!m) return null;
  return { verb: m[1], args: m[2] };
}

module.exports = {
  chatStream,
  runReply,
  parseAction,
  SELF_TOOLS,
};
