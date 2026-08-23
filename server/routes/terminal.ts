// Terminal API: HTTP routes for PTY sessions.
// Ported from the former server/routes/terminal.cjs; behavior is unchanged.
// All state (terminalSessions) and the PTY helpers stay in server.cjs and are
// injected via deps — this module holds routing logic only.
//
// Electron does not use these routes: the desktop path reaches the same helpers
// through the "terminal" IPC channel (see packages/contracts/ipc.ts). This is
// the HTTP surface for `npm start` and the WSL backend.

import type { IncomingMessage, ServerResponse } from "node:http";

/** A live PTY session as stored in server.cjs's terminalSessions map. */
export interface TerminalSession {
  shell: string;
  cwd: string;
  createdAt: number;
  /** Ring-trimmed at TERM_OUTPUT_MAX by the PTY data handler in server.cjs. */
  outputBuffer: string;
  listeners: unknown;
}

export interface OpenTerminalResult {
  id: string;
  shell: string;
  cwd: string;
}

export interface TerminalRouteDeps {
  terminalSessions: Map<string, TerminalSession>;
  /** Throws with code "PTY_UNAVAILABLE" when node-pty failed to load. */
  openTerminalSession(cwd?: string, shell?: string): OpenTerminalResult;
  writeToTerminal(id: string, data: string): void;
  resizeTerminal(id: string, cols: number, rows: number): void;
  closeTerminalSession(id: string): void;
}

export function handle(
  req: IncomingMessage,
  res: ServerResponse,
  deps: TerminalRouteDeps,
): boolean {
  // split() always yields at least one element; the ?? keeps that in the type.
  const urlPath = (req.url || "/").split("?")[0] ?? "/";
  const {
    terminalSessions,
    openTerminalSession,
    writeToTerminal,
    resizeTerminal,
    closeTerminalSession,
  } = deps;

  // Collects the request body, then runs fn with 400 + {error} on any throw.
  //
  // allowEmpty mirrors a distinction the original routes made and that callers
  // may rely on: open/read tolerate an empty body (every field is optional),
  // while write/resize/close parse it strictly, so a body-less request fails
  // with 400 instead of reaching a helper with undefined arguments.
  const withJsonBody = (
    fn: (parsed: any) => void,
    allowEmpty = false,
  ): true => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        fn(JSON.parse(allowEmpty ? body || "{}" : body));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
    });
    return true;
  };

  if (req.method === "POST" && urlPath === "/api/terminal/open") {
    return withJsonBody(({ cwd, shell }) => {
      const r = openTerminalSession(cwd || undefined, shell || undefined);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(r));
    }, true);
  }

  if (req.method === "POST" && urlPath === "/api/terminal/write") {
    return withJsonBody(({ id, data }) => {
      writeToTerminal(id, data);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  }

  if (req.method === "POST" && urlPath === "/api/terminal/resize") {
    return withJsonBody(({ id, cols, rows }) => {
      resizeTerminal(id, cols, rows);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  }

  if (req.method === "POST" && urlPath === "/api/terminal/read") {
    return withJsonBody(({ id, clear }) => {
      const session = terminalSessions.get(id);
      if (!session) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "session not found" }));
        return;
      }
      const output = session.outputBuffer || "";
      if (clear) session.outputBuffer = "";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ output }));
    }, true);
  }

  if (req.method === "POST" && urlPath === "/api/terminal/close") {
    return withJsonBody(({ id }) => {
      closeTerminalSession(id);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
  }

  if (req.method === "GET" && urlPath === "/api/terminal/list") {
    const out = Array.from(terminalSessions.entries()).map(([id, s]) => ({
      id,
      shell: s.shell,
      cwd: s.cwd,
      createdAt: s.createdAt,
    }));
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(out));
    return true;
  }

  return false;
}
