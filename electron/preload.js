// WOLFSPACE preload — exposes a tiny, safe bridge so the React renderer can call
// the Node backend DIRECTLY via Electron IPC (no HTTP).
// contextIsolation keeps the renderer sandboxed: only window.WOLFSPACE is exposed.
const { contextBridge, ipcRenderer } = require("electron");
const path = require("path");

// Backend EKSTERNAL (mis. server WOLFSPACE yang berjalan di dalam WSL).
// Saat WOLFSPACE_BACKEND diisi URL, IPC SENGAJA tidak diumumkan: app.jsx sudah
// punya jalur HTTP sebagai fallback (streamSelfAgent -> fetch("/self-agent")),
// jadi mematikan bendera ini saja sudah cukup membuat seluruh frontend bicara ke
// origin yang sedang dimuat — tanpa mengubah kode frontend sama sekali.
//
// Kenapa perlu: dengan `ipc: true`, frontend selalu memakai core in-process di
// Windows, sehingga UI tak akan pernah menyentuh backend WSL walau jendelanya
// dimuat dari sana. Pengurungan jaringan zona (unshare -n) hanya hidup di Linux,
// jadi tanpa saklar ini ia tetap tak terpakai.
const EXTERNAL_BACKEND = !!process.env.WOLFSPACE_BACKEND;

let seq = 0;
contextBridge.exposeInMainWorld("WOLFSPACE", {
  // True only when running inside Electron with this preload (lets app.jsx fall
  // back to HTTP fetch in a plain browser / during migration).
  ipc: !EXTERNAL_BACKEND,

  // Root folder proyek — DINAMIS dari __dirname (preload ada di <root>/electron/).
  // Frontend memakainya sebagai workspace default & pembanding, jadi kode tak lagi
  // hardcode "c:\\Users\\dave\\quantum" — folder bisa di-rename tanpa ubah kode.
  root: path.resolve(__dirname, ".."),

  // Request/response (e.g. ping, compile, export, saveFile).
  invoke: (channel, payload) =>
    ipcRenderer.invoke("WOLFSPACE:invoke", { channel, payload }),

  // Realtime HMR Listener
  onHmr: (callback) => {
    ipcRenderer.on("WOLFSPACE:hmr", (_e, filename) => callback(filename));
  },

  // Streaming (chat / self-agent). onChunk(event) is called per SSE-style event;
  // returns a cancel() function.
  stream: (channel, payload, onChunk, onDone) => {
    const id = "qs_" + ++seq + "_" + Date.now();
    const handler = (_e, m) => {
      if (m.id !== id) return;
      if (m.done || m.data?.done) {
        ipcRenderer.removeListener("WOLFSPACE:chunk", handler);
        if (onDone) onDone();
      } else onChunk(m.data);
    };
    ipcRenderer.on("WOLFSPACE:chunk", handler);
    ipcRenderer.send("WOLFSPACE:stream", { id, channel, payload });
    return () => {
      try {
        ipcRenderer.send("WOLFSPACE:cancel", { id });
      } catch (_) {}
      ipcRenderer.removeListener("WOLFSPACE:chunk", handler);
    };
  },

  // Terminal PTY methods (agent tools + xterm.js frontend)
  terminal: {
    open: (opts) =>
      ipcRenderer.invoke("WOLFSPACE:invoke", {
        channel: "terminal",
        payload: { action: "open", cwd: opts?.cwd, shell: opts?.shell },
      }),
    write: (id, data) =>
      ipcRenderer.invoke("WOLFSPACE:invoke", {
        channel: "terminal",
        payload: { action: "write", id, data },
      }),
    read: (id, clear) =>
      ipcRenderer.invoke("WOLFSPACE:invoke", {
        channel: "terminal",
        payload: { action: "read", id, clear },
      }),
    resize: (id, cols, rows) =>
      ipcRenderer.invoke("WOLFSPACE:invoke", {
        channel: "terminal",
        payload: { action: "resize", id, cols, rows },
      }),
    close: (id) =>
      ipcRenderer.invoke("WOLFSPACE:invoke", {
        channel: "terminal",
        payload: { action: "close", id },
      }),
    list: () =>
      ipcRenderer.invoke("WOLFSPACE:invoke", {
        channel: "terminal",
        payload: { action: "list" },
      }),
  },
});
