// Types for the electron/preload.js -> window.WOLFSPACE bridge and the
// electron/main.js ipcMain handlers behind it ("WOLFSPACE:invoke" /
// "WOLFSPACE:stream" / "WOLFSPACE:chunk"). Mirrors the existing runtime
// contract as-is; migrating preload.js/main.js onto these types is Phase 3.

import type { ChatStreamEvent, SelfAgentStreamEvent } from "./agent-events";

// ---------------------------------------------------------------------------
// "terminal" invoke channel (electron/main.js, channel === "terminal")
// ---------------------------------------------------------------------------

export interface TerminalOpenResult {
  ok: true;
  id: string;
  shell: string;
  cwd: string;
}

export interface TerminalOkResult {
  ok: true;
}

export type TerminalReadResult =
  { ok: true; output: string } | { ok: false; error: string };

export interface TerminalListItem {
  id: string;
  shell: string;
  cwd: string;
  createdAt: number;
}

export type TerminalInvokePayload =
  | { action: "open"; cwd?: string; shell?: string }
  | { action: "write"; id: string; data: string }
  | { action: "read"; id: string; clear?: boolean }
  | { action: "resize"; id: string; cols: number; rows: number }
  | { action: "close"; id: string }
  | { action: "list" };

export type TerminalInvokeResult =
  | TerminalOpenResult
  | TerminalOkResult
  | TerminalReadResult
  | TerminalListItem[];

// ---------------------------------------------------------------------------
// "WOLFSPACE:invoke" channels (electron/main.js, ipcMain.handle)
// ---------------------------------------------------------------------------

export interface PingResult {
  ok: true;
  pong: number;
}

export type SelectFolderResult = { canceled: true } | { path: string };

export interface ReloadCoreResult {
  ok: boolean;
  at?: number;
  error?: string;
}

/** Payload/result pair for every channel accepted by ipcMain.handle("WOLFSPACE:invoke"). */
export type InvokeChannelMap = {
  ping: { payload: undefined; result: PingResult };
  selectFolder: { payload: undefined; result: SelectFolderResult };
  reloadCore: { payload: undefined; result: ReloadCoreResult };
  // browserAksi() in electron/main.js — payload/result depend on its own action field.
  browser: { payload: unknown; result: unknown };
  // apiCall() in electron/main.js — generic in-process HTTP-handler proxy.
  api: { payload: unknown; result: unknown };
  // Provider names only (agent/cloud key registry) — never secret values.
  cloudKeys: { payload: undefined; result: string[] };
  terminal: { payload: TerminalInvokePayload; result: TerminalInvokeResult };
};

export type InvokeChannel = keyof InvokeChannelMap;

// ---------------------------------------------------------------------------
// "WOLFSPACE:stream" channels (electron/main.js, ipcMain.on)
// ---------------------------------------------------------------------------

export type StreamChannelMap = {
  chat: ChatStreamEvent;
  "self-agent": SelfAgentStreamEvent;
  // apiStream() proxies an arbitrary in-process HTTP handler's SSE body as-is.
  api: unknown;
};

export type StreamChannel = keyof StreamChannelMap;

/** Envelope electron/main.js sends over "WOLFSPACE:chunk" for a given stream id. */
export type StreamChunkMessage<T = unknown> =
  { id: string; done: true } | { id: string; data: T };

// ---------------------------------------------------------------------------
// window.WOLFSPACE bridge (electron/preload.js)
// ---------------------------------------------------------------------------

export interface WolfspaceBridge {
  /** True only inside Electron with this preload; false forces the app.jsx HTTP fallback. */
  readonly ipc: boolean;
  /** Project root, resolved from preload.js's own __dirname. */
  readonly root: string;

  invoke<C extends InvokeChannel>(
    channel: C,
    payload: InvokeChannelMap[C]["payload"],
  ): Promise<InvokeChannelMap[C]["result"]>;

  onBrowser(callback: (message: unknown) => void): () => void;
  onHmr(callback: (filename: string) => void): void;

  /** Returns a cancel() function; onDone fires once the stream closes. */
  stream<C extends StreamChannel>(
    channel: C,
    payload: unknown,
    onChunk: (data: StreamChannelMap[C]) => void,
    onDone?: () => void,
  ): () => void;

  terminal: {
    open(opts?: { cwd?: string; shell?: string }): Promise<TerminalOpenResult>;
    write(id: string, data: string): Promise<TerminalOkResult>;
    read(id: string, clear?: boolean): Promise<TerminalReadResult>;
    resize(id: string, cols: number, rows: number): Promise<TerminalOkResult>;
    close(id: string): Promise<TerminalOkResult>;
    list(): Promise<TerminalListItem[]>;
  };
}

declare global {
  interface Window {
    WOLFSPACE?: WolfspaceBridge;
  }
}
