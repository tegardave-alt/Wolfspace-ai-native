"use strict";
/**
 * lsp.ts — a Language Server Protocol client: the EDITOR side.
 *
 * ROLE IN THE SYSTEM. It starts a language server process, speaks JSON-RPC 2.0
 * to it over stdio, and turns its messages into promises and events. It knows
 * nothing about which server to run or when — that is core/lsp-session.ts.
 *
 * The wire format is identical to DAP (JSON-RPC over stdio, Content-Length
 * framing), so core/dap.ts is the same shape for debuggers.
 *
 * CONNECTS TO
 *   imports  ./win-spawn, because a language server on Windows is usually a
 *            .cmd and Node refuses to spawn those directly
 *   used by  core/lsp-session.ts
 *
 * WHY IT EXISTS. Until now this editor had exactly two sources of language
 * intelligence: Monaco's own TypeScript worker, and a hand-written Jedi worker
 * for Python speaking a protocol invented here (one JSON object per line, a
 * queue matching answers to questions by ARRIVAL ORDER). Both work, and neither
 * generalises: every new language would need another worker and another
 * protocol. LSP is the protocol that already exists, with 500+ servers written
 * against it.
 *
 * THE WIRE FORMAT is the same as DAP — a `Content-Length` header, a blank line,
 * then a JSON body:
 *
 *     Content-Length: 92\r\n
 *     \r\n
 *     {"jsonrpc":"2.0","id":1,"method":"initialize","params":{…}}
 *
 * so the framing here is deliberately the same code as core/dap.ts, including
 * the Buffer-based split. What differs is JSON-RPC's message shapes:
 *
 *   response      has `id`, and `result` or `error`, and NO `method`
 *   request       has `id` AND `method`         (either direction)
 *   notification  has `method` and NO `id`      (either direction)
 *
 * ── THE PART THAT IS EASY TO GET WRONG ──
 *
 * A language server may send REQUESTS to the editor, and it WAITS for them.
 * `workspace/configuration` is the common one, and a server that never gets its
 * answer simply stops: no error, no diagnostics, no completions, nothing to say
 * why. So every server-to-client request is answered here — properly where the
 * answer matters, and with a plain "method not found" otherwise, which is a
 * valid JSON-RPC reply rather than silence.
 */

import { EventEmitter } from "events";
// NOT child_process.spawn directly: on Windows every npm-installed language
// server is a .cmd shim, and Node refuses to spawn those. See core/win-spawn.ts.
const { spawnPortable } = require("./win-spawn.ts");

const SEPARATOR = "\r\n\r\n";
const DEFAULT_TIMEOUT_MS = 20000;

/** JSON-RPC's own code for "I do not implement that". */
const METHOD_NOT_FOUND = -32601;

class LspClient extends EventEmitter {
  _id: number;
  _pending: Map<
    number,
    { resolve: (v: any) => void; reject: (e: any) => void; method: string }
  >;
  _rest: Buffer;
  _dead: boolean;
  _stderr: string;
  process: any;
  serverCapabilities: any;
  command: string;

  /**
   * @param {string} command  the server binary ("pyright-langserver", "gopls")
   * @param {string[]} args   its arguments (["--stdio"])
   * @param {object} options  { cwd, env }
   */
  constructor(command: any, args: any, options: any = {}) {
    super();
    this._id = 1;
    this._pending = new Map();
    this._rest = Buffer.alloc(0);
    this._dead = false;
    // The server's stderr is kept because it is usually the ONLY place a
    // misconfigured server explains itself, and "nothing happened" is the least
    // useful thing an editor can report.
    this._stderr = "";
    this.serverCapabilities = null;
    this.command = String(command);

    this.process = spawnPortable(command, args || [], {
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...(options.env || {}) },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    // A CHILD THAT DIES MID-WRITE MUST NOT KILL THIS PROCESS.
    //
    // REPRODUCED, not guessed: queue a large write into a child's stdin, let the
    // child exit while that write is still in flight, and Node raises
    //
    //     Error: write EOF   errno -4095  syscall 'write'
    //       at WriteWrap.onWriteComplete
    //     Emitted 'error' event on Socket instance
    //
    // On Windows a stdio pipe IS a Socket, which is what that line names. With no
    // 'error' listener it is an uncaught exception, and server.ts rethrows every one
    // of those — so one dying child takes the whole backend down. It was seen exactly
    // that way: the agent was running, and the process simply stopped.
    //
    // Writing after the child has ALREADY gone is harmless — the stream is destroyed
    // and the write is dropped. The dangerous window is the write that gets accepted
    // and then fails, which is why a listener is needed rather than a check.
    //
    // agent/mcp-client.ts has had this guard for a while; it was never applied here.
    this.process.stdin.on("error", (e: any) => {
      // Recorded the way stderr is, so a server dying mid-request is visible
      // rather than silent — but it must never be thrown.
      this._stderr = (
        this._stderr +
        "\n[stdin] " +
        ((e && e.message) || e)
      ).slice(-8000);
    });
    this.process.stdout.on("data", (b: any) => this._receive(b));
    this.process.stderr.on("data", (b: any) => {
      const s = b.toString("utf8");
      // Bounded: a chatty server must not grow this without limit over a long
      // session.
      this._stderr = (this._stderr + s).slice(-8000);
      this.emit("server-error", s);
    });
    this.process.on("exit", (code: any) =>
      this._die("server stopped (code " + code + ")"),
    );
    // THE COMMON CASE, and it is not an exotic failure: the server is simply not
    // installed. spawn reports that as an `error` event, not a non-zero exit, so
    // without this handler the initialize promise would hang for ever on a
    // machine that never had the binary.
    this.process.on("error", (e: any) => {
      this._stderr += String((e && e.message) || e);
      this._die("could not start '" + this.command + "': " + (e && e.message));
    });
  }

  /** Everything still waiting is REJECTED — nobody is left hanging. */
  _die(reason: any) {
    if (this._dead) return;
    this._dead = true;
    const err = new Error(reason);
    for (const { reject } of this._pending.values()) reject(err);
    this._pending.clear();
    this.emit("exit", reason);
  }

  get dead() {
    return this._dead;
  }

  get stderr() {
    return this._stderr;
  }

  // ── Reading a byte stream into whole messages ──
  //
  // Split with a Buffer, not a string: Content-Length counts BYTES, while a
  // JavaScript string's length counts UTF-16 units. One non-ASCII character in a
  // path or a hover's contents is enough to make the two differ, and after that
  // the whole stream is offset.
  _receive(chunk: any) {
    this._rest = Buffer.concat([this._rest, chunk]);
    for (;;) {
      const edge = this._rest.indexOf(SEPARATOR);
      if (edge < 0) return;
      const head = this._rest.slice(0, edge).toString("ascii");
      const m = /Content-Length:\s*(\d+)/i.exec(head);
      if (!m) {
        // A header with no length cannot be recovered — discard up to the next
        // separator rather than reading the remainder as a body.
        this._rest = this._rest.slice(edge + SEPARATOR.length);
        continue;
      }
      const length = Number(m[1]);
      const start = edge + SEPARATOR.length;
      if (this._rest.length < start + length) return; // not whole yet, wait
      const body = this._rest.slice(start, start + length).toString("utf8");
      this._rest = this._rest.slice(start + length);
      let msg: any;
      try {
        msg = JSON.parse(body);
      } catch (_) {
        this.emit("server-error", "body is not JSON: " + body.slice(0, 120));
        continue;
      }
      this._dispatch(msg);
    }
  }

  _dispatch(msg: any) {
    const hasId = msg && msg.id !== undefined && msg.id !== null;
    // A RESPONSE carries an id and no method. Checking `method` is what keeps a
    // server-to-client REQUEST (which has both) from being mistaken for the
    // answer to one of ours.
    if (hasId && !msg.method) {
      const waiting = this._pending.get(msg.id);
      if (!waiting) return;
      this._pending.delete(msg.id);
      if (msg.error)
        waiting.reject(
          new Error(
            waiting.method +
              ": " +
              (msg.error.message || JSON.stringify(msg.error)),
          ),
        );
      else waiting.resolve(msg.result);
      return;
    }
    if (hasId && msg.method) return this._answer(msg);
    if (msg && msg.method) {
      this.emit("notify", msg.method, msg.params);
      this.emit(msg.method, msg.params);
    }
  }

  /**
   * Answer a request the SERVER made of us.
   *
   * Silence here is the failure that looks like a broken feature rather than a
   * broken connection: pyright asks `workspace/configuration` during startup and
   * publishes nothing at all until it is answered.
   */
  _answer(msg: any) {
    const method = String(msg.method || "");
    if (method === "workspace/configuration") {
      // The reply MUST be an array as long as `items`; a shorter one makes some
      // servers throw inside their own handler, where the error is invisible.
      const items = (msg.params && msg.params.items) || [];
      return this._reply(
        msg.id,
        items.map(() => ({})),
      );
    }
    if (
      method === "client/registerCapability" ||
      method === "client/unregisterCapability" ||
      method === "window/workDoneProgress/create"
    )
      return this._reply(msg.id, null);
    if (method === "workspace/applyEdit")
      // Honest refusal: this client does not apply server-driven edits yet, and
      // claiming it did would silently lose a rename or a code action.
      return this._reply(msg.id, { applied: false });
    this._write({
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: METHOD_NOT_FOUND, message: "unsupported: " + method },
    });
    this.emit("server-request", msg);
  }

  _reply(id: any, result: any) {
    this._write({ jsonrpc: "2.0", id, result });
  }

  _write(msg: any) {
    if (this._dead || !this.process.stdin || !this.process.stdin.writable)
      return;
    const body = Buffer.from(JSON.stringify(msg), "utf8");
    try {
      this.process.stdin.write(
        "Content-Length: " + body.length + SEPARATOR,
        "ascii",
      );
      this.process.stdin.write(body);
    } catch (e: any) {
      this._die("write failed: " + ((e && e.message) || e));
    }
  }

  /** Send a request; get a promise for its result. */
  request(
    method: any,
    params: any,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<any> {
    if (this._dead)
      return Promise.reject(new Error("the language server has stopped"));
    const id = this._id++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this._pending.has(id)) return;
        this._pending.delete(id);
        // Tell the server to stop working on it. Without this a slow request
        // keeps a server busy long after nobody is waiting for the answer, and
        // on a large project that is how a server ends up permanently behind.
        this.notify("$/cancelRequest", { id });
        reject(new Error(method + " timed out after " + timeoutMs + "ms"));
      }, timeoutMs);
      const done = (fn: any) => (v: any) => {
        clearTimeout(timer);
        fn(v);
      };
      this._pending.set(id, {
        resolve: done(resolve),
        reject: done(reject),
        method: String(method),
      });
      this._write({ jsonrpc: "2.0", id, method, params });
    });
  }

  /** Send a notification. There is no answer to wait for, by design. */
  notify(method: any, params: any) {
    if (this._dead) return;
    this._write({ jsonrpc: "2.0", method, params });
  }

  /**
   * The handshake. Returns the server's advertised capabilities, which decide
   * what may be asked of it afterwards — a server that does not offer
   * `referencesProvider` must not be sent `textDocument/references`.
   */
  async initialize(rootUri: any, options: any = {}) {
    const result = await this.request(
      "initialize",
      {
        processId: process.pid,
        clientInfo: { name: "WOLFSPACE", version: "1" },
        rootUri: rootUri || null,
        workspaceFolders: rootUri
          ? [{ uri: rootUri, name: "workspace" }]
          : null,
        capabilities: CLIENT_CAPABILITIES,
        initializationOptions: options.initializationOptions || undefined,
      },
      options.timeoutMs || 30000,
    );
    this.serverCapabilities = (result && result.capabilities) || {};
    this.notify("initialized", {});
    return this.serverCapabilities;
  }

  /**
   * Shut down politely, then make sure it is actually gone.
   *
   * The specification's sequence is `shutdown` (a request) then `exit` (a
   * notification). A server that ignores either is still killed: an orphaned
   * language server holds a whole project's index in memory, and this editor has
   * already had to hunt orphaned MCP processes once.
   */
  async stop(graceMs = 2000) {
    if (this._dead) return;
    try {
      await this.request("shutdown", null, graceMs);
    } catch (_) {}
    try {
      this.notify("exit", null);
    } catch (_) {}
    const proc = this.process;
    await new Promise((done: any) => {
      const timer = setTimeout(() => {
        try {
          proc.kill();
        } catch (_) {}
        done(null);
      }, graceMs);
      proc.once("exit", () => {
        clearTimeout(timer);
        done(null);
      });
    });
    this._die("stopped by request");
  }
}

/**
 * What this client tells servers it can do.
 *
 * DELIBERATELY MODEST. Every capability claimed here is a promise about what the
 * editor will handle, and a server takes them at their word: claim
 * `workspace/applyEdit` and a rename arrives that nothing applies; claim
 * snippet support and completions come back full of `${1:placeholder}` text that
 * is inserted literally. So this lists what is genuinely wired up, and grows
 * only when the other half exists.
 */
const CLIENT_CAPABILITIES = {
  general: { positionEncodings: ["utf-16"] },
  textDocument: {
    synchronization: { dynamicRegistration: false, didSave: false },
    hover: { contentFormat: ["markdown", "plaintext"] },
    definition: { linkSupport: false },
    references: {},
    documentSymbol: { hierarchicalDocumentSymbolSupport: true },
    completion: {
      completionItem: {
        // No snippetSupport: Monaco is given plain text here, and a server told
        // otherwise sends snippet syntax that would be typed out verbatim.
        snippetSupport: false,
        documentationFormat: ["markdown", "plaintext"],
      },
      contextSupport: true,
    },
    publishDiagnostics: { relatedInformation: false },
  },
  workspace: {
    workspaceFolders: true,
    configuration: true,
  },
};

module.exports = { LspClient, CLIENT_CAPABILITIES };

// Marks this file as a MODULE rather than a global script, so its top-level
// names do not share one scope with the other .ts files in this project.
export {};
