// core.js — WOLFSPACE's logic surface with no transport attached: no req, no
// res, no port.
//
// ROLE IN THE SYSTEM. Two very different callers need the same operations — the
// HTTP server for the browser, and the Electron IPC layer for the desktop app.
// Anything exported here can be called by either without one having to fake the
// other's request objects.
//
// CONNECTS TO
//   imports  ./server.cjs — as a MODULE, which does not open a port:
//            server.cjs only calls listen() when it is the main module
//   used by  electron/backend-host.cjs

const backend = require("./server.cjs");

module.exports = {
  // re-export the pure logic surface from the backend
  ...backend,

  // ── Higher-level operations (to be extracted from the HTTP handlers next) ──
  // These wrap the existing logic into callback/promise APIs the IPC layer calls
  // directly. Added incrementally so each can be verified against the HTTP path.
  //
  //   chatStream(payload, { onToken, onDone, onError, signal })   // SSE chat/web-dev
  //   selfAgentStream(payload, { onEvent, signal })               // agent loop
  //   compileFlutter(source) -> Promise<{ url } | { error }>
  //   exportWeb(spec) / exportApp(spec) / saveFile({ path, data })
  //
  // Until extracted, the HTTP handlers in server.cjs remain the single source of
  // truth and IPC can call the re-exported primitives above (askCloudStream, etc.).
};
