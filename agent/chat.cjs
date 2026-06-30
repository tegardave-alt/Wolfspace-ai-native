// Chat streaming and reply handling (extracted from server.cjs)
// Dependencies – same as original server.cjs
const http = require('http');
const https = require('https');
const { dlog } = require('./debug.cjs');
const { pickSystem } = require('./prompts.cjs');
const { runByLang, detectLang, extractCode, askModelStream } = require('./runners.cjs');
const { runSelfTool, SELF_TOOLS } = require('./tools.cjs');
const { askCloudStream } = require('./cloud.cjs');

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
  // Choose system prompt based on history and mode – prompts module handles.
  const sys = pickSystem(history);

  const messages = [{ role: 'system', content: sys }, ...(history || [])];
  console.log('[chat] chatStream started', { historyLen: (history || []).length, useCloud: !!(cloud && cloud.key), port });
  const onToken = token => {
    console.log('[chat] token:', token);
    emit({ t: 'tok', c: token });
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


      return runReply(full, history, emit);
    })
    .catch(onError);
}

/**
 * Process the assistant's full reply: detect code blocks, execute if requested,
 * and handle function‑calling style tool invocations.
 * @param {string} reply - full text from the model.
 * @param {Array} history - chat history (may be used for context).
 */
async function runReply(reply, history, emit) {
  const toolMatch = reply.match(/"name"\s*:\s*"(\w+)"[\s\S]*?"arguments"\s*:\s*({[\s\S]*?})/);
  if (toolMatch) {
    try {
      const name = toolMatch[1];
      const args = JSON.parse(toolMatch[2]);
      const res = await runSelfTool(name, args, emit);
      return res;
    } catch (e) {
      dlog('chat', 'error', 'tool parsing error', { error: e.message });
    }
  }

  // If no tool call, attempt to extract executable code.
  const codeObj = extractCode(reply);
  if (!codeObj) {
    return { ok: true, info: 'no code to run' };
  }

  const { lang, code } = codeObj;
  const dispLang = detectLang(lang, code);
  dlog('chat', 'info', 'executing extracted code', { lang: dispLang });
  const result = await runByLang(dispLang, code);
  return result;
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
