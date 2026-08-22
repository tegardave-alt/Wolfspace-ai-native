// GENERATED FILE — DO NOT EDIT.
// Built from electron/preload.ts by scripts/build-preload.cjs.
// Run `npm run build:preload` after changing the source.
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/preload.ts
var import_electron = require("electron");
var path = __toESM(require("path"));
var EXTERNAL_BACKEND = !!process.env.WOLFSPACE_BACKEND;
function _probeRendererStop() {
  const CHECK_MS = 200;
  let last = performance.now();
  const tick = () => {
    const n = performance.now();
    const overshoot = n - last - CHECK_MS;
    last = n;
    if (overshoot > 500) {
      try {
        import_electron.ipcRenderer.send("WOLFSPACE:probe", {
          t: "renderer-stop",
          overshoot
        });
      } catch (_) {
      }
    }
    setTimeout(tick, CHECK_MS);
  };
  setTimeout(tick, CHECK_MS);
}
_probeRendererStop();
var seq = 0;
var bridge = {
  // True only when running inside Electron with this preload (lets app.jsx fall
  // back to HTTP fetch in a plain browser / during migration).
  ipc: !EXTERNAL_BACKEND,
  // Project root — DYNAMIC from __dirname (preload lives in <root>/electron/).
  // The frontend uses it as the default workspace and for comparisons, so the
  // code no longer hardcodes a path and the folder can be renamed freely.
  root: path.resolve(__dirname, ".."),
  // Request/response (e.g. ping, compile, export, saveFile).
  invoke: ((channel, payload) => import_electron.ipcRenderer.invoke("WOLFSPACE:invoke", {
    channel,
    payload
  })),
  // Realtime HMR listener.
  // Browser-panel state (a WebContentsView in the main process): load started,
  // finished, failed, navigated. Without this the panel has no way to know what
  // happened — its view lives in another process, not in the DOM.
  onBrowser: (callback) => {
    const h = (_e, m) => callback(m);
    import_electron.ipcRenderer.on("WOLFSPACE:browser", h);
    return () => import_electron.ipcRenderer.removeListener("WOLFSPACE:browser", h);
  },
  onHmr: (callback) => {
    import_electron.ipcRenderer.on(
      "WOLFSPACE:hmr",
      (_e, filename) => callback(filename)
    );
  },
  // Streaming (chat / self-agent). onChunk(event) is called per SSE-style event;
  // returns a cancel() function.
  stream: ((channel, payload, onChunk, onDone) => {
    const id = "qs_" + ++seq + "_" + Date.now();
    const handler = (_e, m) => {
      if (m.id !== id) return;
      if (m.done || m.data?.done) {
        import_electron.ipcRenderer.removeListener("WOLFSPACE:chunk", handler);
        if (onDone) onDone();
      } else onChunk(m.data);
    };
    import_electron.ipcRenderer.on("WOLFSPACE:chunk", handler);
    import_electron.ipcRenderer.send("WOLFSPACE:stream", { id, channel, payload });
    return () => {
      try {
        import_electron.ipcRenderer.send("WOLFSPACE:cancel", { id });
      } catch (_) {
      }
      import_electron.ipcRenderer.removeListener("WOLFSPACE:chunk", handler);
    };
  }),
  // Terminal PTY methods (agent tools + xterm.js frontend)
  terminal: {
    open: (opts) => import_electron.ipcRenderer.invoke("WOLFSPACE:invoke", {
      channel: "terminal",
      payload: { action: "open", cwd: opts?.cwd, shell: opts?.shell }
    }),
    write: (id, data) => import_electron.ipcRenderer.invoke("WOLFSPACE:invoke", {
      channel: "terminal",
      payload: { action: "write", id, data }
    }),
    read: (id, clear) => import_electron.ipcRenderer.invoke("WOLFSPACE:invoke", {
      channel: "terminal",
      payload: { action: "read", id, clear }
    }),
    resize: (id, cols, rows) => import_electron.ipcRenderer.invoke("WOLFSPACE:invoke", {
      channel: "terminal",
      payload: { action: "resize", id, cols, rows }
    }),
    close: (id) => import_electron.ipcRenderer.invoke("WOLFSPACE:invoke", {
      channel: "terminal",
      payload: { action: "close", id }
    }),
    list: () => import_electron.ipcRenderer.invoke("WOLFSPACE:invoke", {
      channel: "terminal",
      payload: { action: "list" }
    })
  }
};
import_electron.contextBridge.exposeInMainWorld("WOLFSPACE", bridge);
