// Install the .ts hook FIRST: modules below require TypeScript files, and
// this file can itself be an entry point — tests require it directly, and
// `node -e` subprocesses load it without ever going through server.cjs.
require("./ts-register.cjs");
// mcp-http-bridge.cjs — bridges a REMOTE MCP server onto stdio.
//
// ROLE IN THE SYSTEM. WOLFSPACE's MCP client (agent/mcp-client.ts) speaks stdio
// and only stdio: it spawns a child process, writes JSON-RPC to its stdin and
// reads from its stdout — there is not one fetch in it. This file IS that child
// process, and translates stdio to the network and back.
//
// WHY IT REPLACED sse-bridge.cjs. The predecessor spoke only the OLD SSE
// transport: GET with Accept: text/event-stream, wait for an `endpoint` event,
// then POST there. The MCP specification now uses Streamable HTTP — ONE endpoint
// that accepts POST and answers with application/json OR text/event-stream, with
// the session carried in an Mcp-Session-Id header.
//
// Bahwa keduanya memang hidup berdampingan terbukti di log run nyata:
//   [INFO] StreamableHTTP endpoint available at http://127.0.0.1:3333/mcp
//   [INFO] StreamableHTTP endpoint available at http://127.0.0.1:3333/sse (backward compat)
// A server offering ONLY /mcp would never connect through the old bridge, and
// the failure is silent — just "failed to initialise MCP server ...".
//
// The order used here: try Streamable HTTP first; if the server refuses it
// (405/404, or an answer that is neither JSON nor SSE), fall back to the legacy
// SSE transport. New AND old servers therefore both work without the user
// needing to know which is which.

const readline = require("readline");

const URL_AWAL = process.argv[2];
if (!URL_AWAL) {
  console.error("Pemakaian: node mcp-http-bridge.cjs <url>");
  process.exit(1);
}

// Extra headers come from the environment, so a token never has to sit in argv
// — argv is visible in the process list and ends up in logs.
let HEADER_EKSTRA = {};
try {
  if (process.env.MCP_HEADERS)
    HEADER_EKSTRA = JSON.parse(process.env.MCP_HEADERS);
} catch (_) {}

const keluar = (s) => process.stdout.write(s.replace(/\r?\n/g, " ") + "\n");
const catat = (s) => console.error("[mcp-bridge] " + s);

// ── Transport 1: Streamable HTTP ──────────────────────────────────────────
//
// One URL. Every client message is POSTed. The answer can be:
//   - application/json      -> a single response, forwarded as is
//   - text/event-stream     -> a stream; each `data:` forwarded until it closes
//   - 202 with no body      -> notification accepted, no reply
// The session, when the server issues one, travels in the Mcp-Session-Id
// header.
let sesiId = null;

function headerPost() {
  const h = {
    "Content-Type": "application/json",
    // BOTH are required: the server chooses its response format from this.
    Accept: "application/json, text/event-stream",
    ...HEADER_EKSTRA,
  };
  if (sesiId) h["Mcp-Session-Id"] = sesiId;
  return h;
}

async function teruskanSSE(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let data = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    const baris = buf.split("\n");
    buf = baris.pop();
    for (let l of baris) {
      if (l.endsWith("\r")) l = l.slice(0, -1);
      if (l === "") {
        if (data) keluar(data);
        data = "";
      } else if (l.startsWith("data:")) {
        const d = l.slice(5);
        data += (data ? "\n" : "") + (d.startsWith(" ") ? d.slice(1) : d);
      }
      // `event:` and `id:` lines are ignored: on Streamable HTTP the JSON-RPC
      // payload is always in `data:`.
    }
  }
}

async function kirimStreamable(pesan) {
  const res = await fetch(URL_AWAL, {
    method: "POST",
    headers: headerPost(),
    body: pesan,
  });

  const sid = res.headers.get("mcp-session-id");
  if (sid) sesiId = sid;

  if (res.status === 202) return true; // notifikasi, tak ada balasan
  if (!res.ok) {
    const teks = await res.text().catch(() => "");
    catat(
      "POST failed " +
        res.status +
        " " +
        res.statusText +
        " " +
        teks.slice(0, 200),
    );
    return false;
  }

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("text/event-stream")) {
    // Do NOT await this.
    //
    // Streamable HTTP PERMITS a server to hold the stream open after replying,
    // for follow-up messages it starts itself. Waiting for `done` means waiting
    // for the server to close it — and a server that never closes would wedge
    // the queue below for good.
    //
    // Measured against @penpot/mcp: `initialize` was answered and passed, then
    // `tools/list` hung until the 60-second timeout. Penpot was not at fault —
    // the same request over curl answered immediately.
    //
    // The old worry that replies would overtake each other on stdout does not
    // apply: JSON-RPC carries an `id`, the client matches replies by it, and
    // keluar() writes one whole line at a time.
    teruskanSSE(res).catch((e) => catat("aliran SSE putus: " + e.message));
    return true;
  }
  if (ct.includes("application/json")) {
    const teks = await res.text();
    if (teks.trim()) keluar(teks.trim());
    return true;
  }
  catat("unknown content-type: " + ct);
  return false;
}

// ── Transport 2: the legacy SSE path (fallback) ──────────────────────────────
//
// GET opens the stream; the server sends an `endpoint` event carrying the POST
// URL, then `message` events carrying the JSON-RPC replies.
let endpointPost = null;

async function mulaiSSELama() {
  const res = await fetch(URL_AWAL, {
    headers: { Accept: "text/event-stream", ...HEADER_EKSTRA },
  });
  if (!res.ok) {
    catat("legacy SSE failed too: " + res.status + " " + res.statusText);
    process.exit(1);
  }
  catat("memakai transport SSE lama");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let ev = null;
  let data = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      catat("aliran SSE ditutup server");
      process.exit(0);
    }
    buf += dec.decode(value, { stream: true });
    const baris = buf.split("\n");
    buf = baris.pop();
    for (let l of baris) {
      if (l.endsWith("\r")) l = l.slice(0, -1);
      if (l === "") {
        if (ev === "endpoint" && data)
          endpointPost = new URL(data, URL_AWAL).href;
        else if (ev === "message" && data) keluar(data);
        ev = null;
        data = "";
      } else if (l.startsWith("event:")) ev = l.slice(6).trim();
      else if (l.startsWith("data:")) {
        const d = l.slice(5);
        data += (data ? "\n" : "") + (d.startsWith(" ") ? d.slice(1) : d);
      }
    }
  }
}

async function kirimSSELama(pesan) {
  if (!endpointPost) {
    catat("no POST endpoint received yet — message dropped");
    return;
  }
  try {
    const r = await fetch(endpointPost, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...HEADER_EKSTRA },
      body: pesan,
    });
    if (!r.ok) catat("POST failed: " + r.status + " " + r.statusText);
  } catch (e) {
    catat("failed to send: " + e.message);
  }
}

// ── Jalur utama ───────────────────────────────────────────────────────────
let mode = null; // "streamable" | "sse"
const antre = [];
let sibuk = false;

// Messages are processed IN ORDER. Streamable HTTP may answer with an SSE
// stream that is read to the end, and sending the next message before that
// finishes would let the replies overtake each other on stdout.
async function proses() {
  if (sibuk) return;
  sibuk = true;
  while (antre.length) {
    const pesan = antre.shift();
    try {
      if (mode === "streamable") {
        const ok = await kirimStreamable(pesan);
        if (!ok && !endpointPost) {
          // Streamable was refused on the FIRST message -> try the old transport.
          catat("Streamable HTTP refused, falling back to legacy SSE");
          mode = "sse";
          mulaiSSELama().catch((e) => {
            catat("fatal: " + e.message);
            process.exit(1);
          });
          antre.unshift(pesan);
          // beri waktu event `endpoint` datang sebelum mencoba lagi
          await new Promise((r) => setTimeout(r, 1500));
        }
      } else {
        await kirimSSELama(pesan);
      }
    } catch (e) {
      catat("failed to process message: " + e.message);
    }
  }
  sibuk = false;
}

readline
  .createInterface({ input: process.stdin, terminal: false })
  .on("line", (l) => {
    if (!l.trim()) return;
    antre.push(l);
    proses();
  });

mode = "streamable";
catat("mencoba Streamable HTTP: " + URL_AWAL.replace(/\?.*$/, "?***"));
