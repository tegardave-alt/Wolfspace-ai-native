// core.js — WOLFSPACE's pure business logic, callable by BOTH the HTTP server and
// the Electron IPC layer (no req/res, no port). See docs/A2UI-DESIGN.md (step 1).
//
// Requiring server.cjs does NOT open a port: server.cjs only calls server.listen()
// when run as the main module (require.main === module). Here we require it as a
// module, so we get the logic surface without starting HTTP.

const backend = require('./server.cjs');

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

