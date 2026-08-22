// WOLFSPACE preload — exposes a tiny, safe bridge so the React renderer can call
// the Node backend DIRECTLY via Electron IPC (no HTTP).
// contextIsolation keeps the renderer sandboxed: only window.WOLFSPACE is exposed.
//
// THIS FILE IS THE SOURCE. electron/preload.js next to it is GENERATED from it by
// scripts/build-preload.cjs — never edit that one by hand.
//
// Why a build step instead of the require("./scripts/ts-register.cjs") hook the
// server routes use: Electron loads a preload itself, and the script blocks the
// page until it finishes. Transpiling here costs ~154 ms per window (25 ms to
// load esbuild plus ~129 ms to spawn esbuild.exe on the first transform), paid
// again for every window. Measured against a startup budget the repo already cut
// from 1071 ms to 314 ms, that is not a trade worth making — so the cost moves to
// build time, where it is paid once.

import { contextBridge, ipcRenderer } from "electron";
import * as path from "path";
import type {
  InvokeChannel,
  InvokeChannelMap,
  StreamChannel,
  StreamChannelMap,
  TerminalListItem,
  TerminalOkResult,
  TerminalOpenResult,
  TerminalReadResult,
  WolfspaceBridge,
} from "../packages/contracts/ipc";

// EXTERNAL backend (e.g. a WOLFSPACE server running inside WSL).
// When WOLFSPACE_BACKEND holds a URL, IPC is DELIBERATELY not announced: app.jsx
// already has an HTTP path as a fallback (streamSelfAgent -> fetch("/self-agent")),
// so clearing this flag alone is enough to make the whole frontend talk to the
// origin it was loaded from — without changing any frontend code.
//
// Why this is needed: with `ipc: true` the frontend always uses the in-process
// core on Windows, so the UI would never reach the WSL backend even when its
// window is served from there. Zone network containment (unshare -n) only exists
// on Linux, so without this switch it would stay unused.
const EXTERNAL_BACKEND = !!process.env.WOLFSPACE_BACKEND;

function _probeRendererStop(): void {
  const CHECK_MS = 200;
  let last = performance.now();
  const tick = () => {
    const n = performance.now();
    const overshoot = n - last - CHECK_MS;
    last = n;
    if (overshoot > 500) {
      try {
        ipcRenderer.send("WOLFSPACE:probe", {
          t: "renderer-stop",
          overshoot,
        });
      } catch (_) {}
    }
    setTimeout(tick, CHECK_MS);
  };
  setTimeout(tick, CHECK_MS);
}
_probeRendererStop();

let seq = 0;

const bridge: WolfspaceBridge = {
  // True only when running inside Electron with this preload (lets app.jsx fall
  // back to HTTP fetch in a plain browser / during migration).
  ipc: !EXTERNAL_BACKEND,

  // Project root — DYNAMIC from __dirname (preload lives in <root>/electron/).
  // The frontend uses it as the default workspace and for comparisons, so the
  // code no longer hardcodes a path and the folder can be renamed freely.
  root: path.resolve(__dirname, ".."),

  // Request/response (e.g. ping, compile, export, saveFile).
  invoke: (<C extends InvokeChannel>(
    channel: C,
    payload: InvokeChannelMap[C]["payload"],
  ) =>
    ipcRenderer.invoke("WOLFSPACE:invoke", {
      channel,
      payload,
    })) as WolfspaceBridge["invoke"],

  // Realtime HMR listener.
  // Browser-panel state (a WebContentsView in the main process): load started,
  // finished, failed, navigated. Without this the panel has no way to know what
  // happened — its view lives in another process, not in the DOM.
  onBrowser: (callback: (message: unknown) => void) => {
    const h = (_e: unknown, m: unknown) => callback(m);
    ipcRenderer.on("WOLFSPACE:browser", h);
    return () => ipcRenderer.removeListener("WOLFSPACE:browser", h);
  },

  onHmr: (callback: (filename: string) => void) => {
    ipcRenderer.on("WOLFSPACE:hmr", (_e, filename: string) =>
      callback(filename),
    );
  },

  // Streaming (chat / self-agent). onChunk(event) is called per SSE-style event;
  // returns a cancel() function.
  stream: (<C extends StreamChannel>(
    channel: C,
    payload: unknown,
    onChunk: (data: StreamChannelMap[C]) => void,
    onDone?: () => void,
  ) => {
    const id = "qs_" + ++seq + "_" + Date.now();
    const handler = (_e: unknown, m: any) => {
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
  }) as WolfspaceBridge["stream"],

  // Terminal PTY methods (agent tools + xterm.js frontend)
  terminal: {
    open: (opts?: { cwd?: string; shell?: string }) =>
      ipcRenderer.invoke("WOLFSPACE:invoke", {
        channel: "terminal",
        payload: { action: "open", cwd: opts?.cwd, shell: opts?.shell },
      }) as Promise<TerminalOpenResult>,
    write: (id: string, data: string) =>
      ipcRenderer.invoke("WOLFSPACE:invoke", {
        channel: "terminal",
        payload: { action: "write", id, data },
      }) as Promise<TerminalOkResult>,
    read: (id: string, clear?: boolean) =>
      ipcRenderer.invoke("WOLFSPACE:invoke", {
        channel: "terminal",
        payload: { action: "read", id, clear },
      }) as Promise<TerminalReadResult>,
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.invoke("WOLFSPACE:invoke", {
        channel: "terminal",
        payload: { action: "resize", id, cols, rows },
      }) as Promise<TerminalOkResult>,
    close: (id: string) =>
      ipcRenderer.invoke("WOLFSPACE:invoke", {
        channel: "terminal",
        payload: { action: "close", id },
      }) as Promise<TerminalOkResult>,
    list: () =>
      ipcRenderer.invoke("WOLFSPACE:invoke", {
        channel: "terminal",
        payload: { action: "list" },
      }) as Promise<TerminalListItem[]>,
  },
};

contextBridge.exposeInMainWorld("WOLFSPACE", bridge);
