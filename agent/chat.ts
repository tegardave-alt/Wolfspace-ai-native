// Chat streaming and reply handling (extracted from server.cjs)
// Dependencies – same as original server.cjs
import * as http from "http";
import * as https from "https";
const { dlog } = require("./debug.ts");
const { pickSystem } = require("./prompts.ts");
// runners.cjs was REMOVED along with runByLang/detectLang/extractCode: all
// three were imported here but NEVER called — each appeared exactly once, on
// that import line. Code execution goes through the agent tools (sandbox_run /
// capability_exec), not through a language dispatcher.
const { runSelfTool, SELF_TOOLS } = require("./tools.ts");
const {
  askCloudStream,
  fillCloudKey,
  loadCloudKeys,
  CLOUD_KEYS,
} = require("./cloud.ts");
const { createPseudoTagStreamFilter } = require("./pseudo-tag-filter.ts");

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
  // Guard: make sure history is always an array, never null/undefined.
  const safeHistory = Array.isArray(history) ? history : [];

  // Choose system prompt based on history and mode – prompts module handles.
  const sys = pickSystem(safeHistory);

  // Batasi (slice) riwayat pesan sesuai batas konteks token di masing-masing mode effort
  const effortLevel =
    cloud && typeof cloud.effort !== "undefined"
      ? Number(cloud.effort)
      : arguments[0].effort !== undefined
        ? Number(arguments[0].effort)
        : 1;
  const effortMaxTurns = effortLevel === 0 ? 6 : effortLevel === 2 ? 40 : 16;
  const slicedHistory = safeHistory.slice(-effortMaxTurns);

  const messages = [{ role: "system", content: sys }, ...slicedHistory];
  console.log("[chat] chatStream started", {
    historyLen: safeHistory.length,
    useCloud: !!(cloud && cloud.key),
    port,
  });
  // Plain chat has no tool-execution loop, so a pseudo tool-call tag from a weak/local
  // model can never be a real call here — it only ever needs to be kept off the screen.
  const tagFilter = createPseudoTagStreamFilter((safe) =>
    emit({ t: "tok", c: safe }),
  );
  const onToken = (token) => {
    console.log("[chat] token:", token);
    tagFilter.feed(token);
  };
  const onError = (err) => {
    console.error("[chat] stream error:", err.message || err);
    dlog("chat", "error", "stream error", { err: err.message || err });
    emit({ t: "err", m: err.message || String(err) });
  };

  // Cloud resolution done HERE (as selfAgentStream does). The Electron IPC path
  // does NOT go through the HTTP preprocessing (fillCloudKey), and Electron's
  // localStorage is separate and empty -> cloud can be null. Fill the key from
  // the key file; if it is still empty, pick the first provider that has one.
  // Without this, chat falls back to a LOCAL model that does not exist
  // (config.models is empty) -> "the model is silent" under Electron.
  loadCloudKeys();
  fillCloudKey(cloud);
  if (!(cloud && cloud.key)) {
    const prov = Object.keys(CLOUD_KEYS).find(
      (p) => CLOUD_KEYS[p] && CLOUD_KEYS[p].key,
    );
    if (prov)
      cloud = {
        provider: prov,
        key: CLOUD_KEYS[prov].key,
        model: CLOUD_KEYS[prov].model,
        baseUrl: CLOUD_KEYS[prov].baseUrl,
      };
  }

  // There is NO local-model fallback any more. The llama.cpp/GGUF path was
  // removed along with the Model Hub, so askModelStream() would certainly refuse
  // with "local model is not active — no port" — a message naming a PORT and a
  // FEATURE that both no longer exist. The user sees it as an HTTP 400 with no
  // hint about what to do.
  //
  // The real cause is always the same: no reachable cloud key. That is what
  // should be said, along with how to fix it. Note that `port` is still accepted
  // in the signature but no longer used to choose a model.
  if (!(cloud && cloud.key)) {
    dlog("chat", "info", "stop", { reason: "no_cloud_key" });
    // The message names the FILE rather than just saying "save an API key": when
    // the backend runs in WSL, saving through the UI only fills localStorage for
    // the origin http://<wsl-ip>:8090 — and the distro's IP changes on every
    // restart, so the key is lost again. A file in the backend's $HOME is immune
    // to that.
    const os = require("os");
    const berkas = require("path").join(
      os.homedir(),
      ".wolfspace",
      "cloud-keys.json",
    );
    const pesan =
      "No usable cloud API key yet.\n\n" +
      `Put the key in the backend file: ${berkas}\n` +
      '  contoh: { "opencode": { "key": "...", "model": "deepseek-v4-flash-free" } }\n\n' +
      "Saving through the API Key menu also works, but it only fills " +
      "localStorage for the origin currently in use — and if the backend runs " +
      "di WSL, IP distro berubah tiap restart sehingga originnya ikut berubah dan " +
      "that key is lost again. The file above is immune to that.\n\n" +
      "The local model (llama.cpp/GGUF) has been removed, so there is no fallback path " +
      "selain cloud.";
    emit({ t: "err", m: pesan });
    emit({ t: "done" });
    return { ok: false, error: "no_cloud_key" };
  }
  const streamPromise = askCloudStream(cloud, messages, onToken, null);

  return streamPromise
    .then((full) => {
      dlog("chat", "info", "stream completed", { length: full.length });
      tagFilter.flush(); // release any held-back tail (e.g. text that merely started with "<f")

      return { ok: true, reply: full };
    })
    .catch(onError);
}

/**
 * Determine whether the most recent user message explicitly requests code execution.
 * Guards against auto-executing code blocks in greetings or explanations.
 * @param {Array} history - chat history
 * @returns {boolean} true if the latest user message explicitly requests execution.
 */
// _isExecutionRequested() was REMOVED — zero callers anywhere in the repo.
// Detecting "the user asked for execution" moved to the tool-calling path in
// self_agent.ts.

// runReply() was REMOVED. Its docstring promised "detect code blocks, execute if
// requested", but its body had long since only returned
//     { ok: true, info: "auto-run disabled in normal chat", reply }
// without running anything. self_agent emitted that object as the `run` field of
// its adone event, so the UI received an ok:true that read like "execution
// succeeded" when there was no execution, plus a full copy of the summary text
// under the name `run`. Real verification happens in the agent tools.

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
  parseAction,
  SELF_TOOLS,
};
