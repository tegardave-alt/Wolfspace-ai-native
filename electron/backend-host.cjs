// backend-host.cjs — the backend, running OFF the thread that draws the window.
//
// CONNECTS TO
//   imports  ../scripts/ts-register.cjs (so it can require .ts directly),
//            ../core.js and everything under agent/
//   spawned by electron/main.ts, which forwards renderer IPC to it
//   owns     the MCP client, deliberately — see the note further down
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
const { PassThrough, Writable } = require("stream");

// ── THE ONE PROCESS THAT WENT SILENT WAS THE ONE NOBODY WAS WATCHING ────────
//
// agent/pemantau-blokir.ts was started in electron/main.ts only. That was right
// when the backend still ran there, and it stopped being right the moment this
// file took the backend off that thread: the instrument stayed with the window
// and the work moved here.
//
// It cost a real diagnosis. A user's log said
//
//   [probe] backend-host gagal api: host backend tak menjawab dalam ...
//
// and the wording proves the process was ALIVE -- a host that had exited fails
// its waiters with "berhenti" instead -- so it was alive and not answering,
// which is exactly what a blocked event loop looks like from outside and
// exactly what this histogram measures. Nothing here was measuring it.
//
// Silent by design: it speaks only when one UNINTERRUPTED stretch crosses the
// budget's normal band. stdio is inherited from main, so what it prints lands
// in the same log the line above came from.
//
// Never fatal. Losing an instrument must not cost the app its backend.
try {
  const pb = require(path.join(__dirname, "..", "agent", "pemantau-blokir.ts"));
  pb.mulai(20);
  pb.pasangLaporan(
    (l) => console.log("[backend-host] BLOKIR " + pb.ringkas(l)),
    15000,
  );
} catch (e) {
  console.log(
    "[backend-host] blocking watchdog not active: " + ((e && e.message) || e),
  );
}

let _core = null;
// The agent runs inside this process, so it reaches main through the global
// rather than an import -- core.js is loaded lazily and must not pull electron
// internals in behind it.
globalThis.__wolfspaceMintaMain = (apa, args, batasMs) =>
  mintaMain(apa, args, batasMs);

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

// ── ASKING THE MAIN PROCESS FOR SOMETHING ────────────────────────────────────
//
// The message channel was one-directional in practice: main sent `invoke` and
// `stream`, this process only ever REPLIED. Everything the agent needed lived
// here or behind an HTTP route.
//
// The live browser does not. `<webview>` guests are WebContents, and
// WebContents exist only in the main process -- there is no handle to them from
// a utilityProcess at all. So this is the direction that had to be added: a
// request from here, answered there, matched by id the same way main matches
// ours.
//
// Deliberately NOT a general "run this in main" escape hatch: `apa` names one
// of a fixed set of operations main is willing to perform. A channel that
// forwarded arbitrary work would put the agent back on the window thread,
// which is the thing this whole split exists to prevent.
let _idMinta = 0;
const _mintaTertunda = new Map();

function mintaMain(apa, args, batasMs = 30000) {
  return new Promise((selesai, gagal) => {
    const id = "m" + ++_idMinta;
    const jam = setTimeout(() => {
      _mintaTertunda.delete(id);
      gagal(
        new Error("main did not answer " + apa + " within " + batasMs + "ms"),
      );
    }, batasMs);
    if (jam.unref) jam.unref();
    _mintaTertunda.set(id, { selesai, gagal, jam });
    kirim({ id, kind: "minta-main", apa, args });
  });
}

/**
 * Which api paths this process serves: EVERYTHING, unless listed otherwise.
 * Mirrors _jalurKeHost in electron/main.ts -- see the note there for why the
 * default is inverted.
 */
const _TETAP_DI_MAIN = [];
function _jalurKeHost(payload) {
  const jalur = String((payload && payload.path) || "");
  if (!jalur.startsWith("/")) return false;
  for (const p of _TETAP_DI_MAIN) {
    if (jalur === p || jalur.startsWith(p + "/")) return false;
  }
  return true;
}

/**
 * The same fake-req/res proxy main.ts uses, against THIS process's server.
 *
 * Written out rather than imported: apiCall lives in electron/main.ts, which
 * belongs to the other process and pulls in Electron itself.
 */
function apiHost({
  method = "GET",
  path: jalur = "/",
  body = null,
  headers = {},
} = {}) {
  return new Promise((resolve) => {
    let selesai = false;
    const req = new PassThrough();
    req.method = method;
    req.url = jalur;
    req.headers = Object.assign(
      { "content-type": "application/json" },
      headers,
    );
    const res = new Writable();
    res.statusCode = 200;
    res._h = {};
    res._chunks = [];
    res.setHeader = (k, v) => {
      res._h[String(k).toLowerCase()] = v;
    };
    res.getHeader = (k) => res._h[String(k).toLowerCase()];
    res.removeHeader = (k) => {
      delete res._h[String(k).toLowerCase()];
    };
    res.writeHead = (kode, h) => {
      res.statusCode = kode;
      if (h) for (const k in h) res._h[String(k).toLowerCase()] = h[k];
      return res;
    };
    res._write = (chunk, _enc, cb) => {
      res._chunks.push(Buffer.from(chunk));
      cb();
    };
    res.end = (chunk) => {
      if (selesai) return;
      if (chunk) res._chunks.push(Buffer.from(chunk));
      selesai = true;
      resolve({
        status: res.statusCode,
        headers: res._h,
        body: Buffer.concat(res._chunks).toString("utf8"),
      });
    };
    core().server.emit("request", req, res);
    if (body != null)
      req.end(typeof body === "string" ? body : JSON.stringify(body));
    else req.end();
  });
}

async function tanganiInvoke(channel, payload) {
  const c = core();
  if (channel === "ping") return { ok: true, pong: Date.now() };
  if (channel === "cloudKeys") return Object.keys(c.getCloudKeys());
  // `api` is deliberately NOT handled here. apiCall() lives in
  // electron/main.ts, where it builds a fake req/res against the in-process
  // HTTP handlers, so it was never part of core.js's exports. The first version
  // wrote it as `c.apiCall ? c.apiCall(payload) : null`, which returned NULL
  // with ok:true — main then forwarded that null to the renderer instead of
  // using the real apiCall, and saving an API key failed with "Cannot read
  // properties of null (reading 'body')".
  //
  // The lesson is not "add apiCall here": a channel this host cannot serve must
  // THROW, so main falls back to its in-process path rather than passing on a
  // null that looks like a valid answer.
  //
  // THE MCP PATH IS THE ONE EXCEPTION, and not for convenience.
  //
  // selfAgentStream runs HERE and calls mcpClient.getTools(), while
  // /mcp/connect used to be served through main's `api` channel. Two processes
  // mean two separate require("mcp-client.ts") and two separate this.servers
  // maps: the UI connected a server in main, the agent asked the instance here
  // which had none, and getTools() returned [] with NO error and not one log
  // line. Confirmed in the running app — the log said "MCP server github ready"
  // while the agent saw nothing.
  //
  // So MCP ownership moved here, to the process that runs the agent. Only the
  // /mcp path is taken; everything else still THROWS so main uses its own
  // apiCall.
  if (channel === "api" && _jalurKeHost(payload)) return apiHost(payload);
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
  // An answer to something WE asked for, not a request to serve.
  if (kind === "jawab-main") {
    const t = _mintaTertunda.get(id);
    if (!t) return;
    _mintaTertunda.delete(id);
    clearTimeout(t.jam);
    if (msg.ok) t.selesai(msg.value);
    else t.gagal(new Error(msg.error || "main refused"));
    return;
  }
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
