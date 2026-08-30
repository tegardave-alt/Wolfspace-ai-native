// The backend, running OFF the thread that draws the window.
//
// WHY THIS FILE EXISTS. core.js and everything under agent/ used to be required
// straight into the Electron MAIN process. That process owns the window, so its
// event loop is the one Windows watches: a stretch of 5000 ms without the
// message queue draining is what "Not Responding" means. Every synchronous call
// in the backend -- and there are seventeen that spawn a child process, seven of
// them with timeouts ABOVE that threshold -- was therefore a potential freeze of
// the UI, not merely of the work.
//
// Measured before the move: peak block 1219 ms under real agent load, against a
// 5000 ms budget. Nothing crossed it, but the margin was luck rather than
// design: one slow WSL start inside execFileSync would have held the window for
// as long as its timeout allowed.
//
// This is not a new pattern in this repo. MCP servers, the Python LangGraph
// worker, the Jedi worker, the sandbox and the WSL zone all run in their own
// processes already. The backend was the last thing still sharing a thread with
// the window.
//
// PROTOCOL. One message in, one or more out, correlated by `id`:
//
//   in   { id, kind: "invoke", channel, payload }
//   out  { id, kind: "result", ok, value }        |  { id, kind: "result", ok: false, error }
//
// Deliberately the same {channel, payload} shape the renderer already speaks, so
// the router in main.ts forwards rather than translates.
"use strict";

// MUST come first: core.js reaches .ts modules transitively, and CI runs Node 20
// which cannot load TypeScript at all.
require("../scripts/ts-register.cjs");

const path = require("path");

let _core = null;
function core() {
  if (!_core) _core = require(path.join(__dirname, "..", "core.js"));
  return _core;
}

function kirim(msg) {
  try {
    process.parentPort.postMessage(msg);
  } catch (e) {
    // The parent is gone; there is nobody left to tell.
  }
}

async function tanganiInvoke(channel, payload) {
  const c = core();
  if (channel === "ping") return { ok: true, pong: Date.now() };
  if (channel === "cloudKeys") return Object.keys(c.getCloudKeys());
  if (channel === "api") return c.apiCall ? c.apiCall(payload) : null;
  throw new Error("unknown invoke channel: " + channel);
}

// ── Streaming ──
//
// The contract the main process already uses is fn(payload, emit, ctl), so it is
// kept verbatim rather than redesigned; only the transport changes. emit() now
// posts a chunk up the parent port instead of straight to the renderer, and
// main.ts forwards it unchanged.
//
// ctl.setCurReq stays HERE. It holds the in-flight HTTP request so a cancel can
// abort it, and that request belongs to this process — sending it across the
// port would be meaningless even if it could be serialised.
/** One place that knows the SSE frame shape, so the escape is written once. */
function bingkaiGalat(pesan) {
  return "data: " + JSON.stringify({ t: "err", m: pesan }) + "\n\n";
}

const _aliran = new Map();

function tanganiStream(id, channel, payload) {
  const c = core();
  const fn =
    channel === "chat"
      ? c.chatStream
      : channel === "self-agent"
        ? c.selfAgentStream
        : null;
  if (!fn) {
    kirim({
      id,
      kind: "chunk",
      data: bingkaiGalat("unknown stream channel: " + channel),
    });
    kirim({ id, kind: "end" });
    return;
  }
  const st = { batal: false, req: null };
  _aliran.set(id, st);
  const emit = (msg) => {
    if (st.batal) return;
    kirim({ id, kind: "chunk", data: msg });
  };
  const selesai = () => {
    _aliran.delete(id);
    kirim({ id, kind: "end" });
  };
  const ctl = {
    isCancelled: () => st.batal,
    setCurReq: (r) => {
      st.req = r;
    },
  };
  Promise.resolve()
    .then(() => fn(payload, emit, ctl))
    .then(selesai, (err) => {
      emit({ t: "err", m: (err && err.message) || String(err) });
      selesai();
    });
}

function batalkan(id) {
  const st = _aliran.get(id);
  if (!st) return;
  st.batal = true;
  // The same two-step the main process used: ask the request to abort, then let
  // the stream's own end path run.
  try {
    if (st.req && typeof st.req.destroy === "function") st.req.destroy();
    else if (st.req && typeof st.req.abort === "function") st.req.abort();
  } catch (_) {}
}

process.parentPort.on("message", (e) => {
  const msg = e.data || {};
  const { id, kind } = msg;
  if (kind === "invoke") {
    Promise.resolve()
      .then(() => tanganiInvoke(msg.channel, msg.payload))
      .then(
        (value) => kirim({ id, kind: "result", ok: true, value }),
        (err) =>
          kirim({
            id,
            kind: "result",
            ok: false,
            error: (err && err.message) || String(err),
          }),
      );
    return;
  }
  if (kind === "stream") {
    try {
      tanganiStream(id, msg.channel, msg.payload);
    } catch (err) {
      kirim({
        id,
        kind: "chunk",
        data: bingkaiGalat((err && err.message) || String(err)),
      });
      kirim({ id, kind: "end" });
    }
    return;
  }
  if (kind === "cancel") {
    batalkan(id);
    return;
  }
  if (kind === "siap") {
    // Load core eagerly so the first real call does not pay for it.
    let galat = null;
    try {
      core();
    } catch (e) {
      galat = (e && e.message) || String(e);
    }
    kirim({
      id,
      kind: "result",
      ok: !galat,
      value: { siap: !galat },
      error: galat,
    });
  }
});

// A rejection nobody handles ends the process on Node 15 and later. Here that
// would take the backend down and leave the window alive but answerless, which
// is harder to diagnose than a reported error.
process.on("unhandledRejection", (r) => {
  console.error("[backend-host] unhandled rejection:", (r && r.message) || r);
});
