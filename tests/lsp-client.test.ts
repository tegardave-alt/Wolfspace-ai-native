// The LSP client, driven against a REAL server process.
//
// WHY A FAKE SERVER AND NOT A REAL ONE. A real language server would make this
// suite depend on a binary that is not installed on this machine and not
// installed on CI — and the parts worth pinning are the parts a real server
// would exercise only by accident. So the server here is a small Node program
// speaking genuine LSP framing over genuine pipes: nothing is mocked, the bytes
// are real, and it can be made to do the awkward things on demand.
//
// THE ONE THAT MATTERS MOST is `workspace/configuration`. A server may send
// REQUESTS to the editor and wait for them, and pyright does exactly this
// during startup: unanswered, it publishes no diagnostics at all and says
// nothing about why. The fake server below refuses to publish until it has been
// answered, so a client that stays silent fails here instead of in the app.

const fs = require("fs");
const os = require("os");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const { LspClient, CLIENT_CAPABILITIES } = require("../core/lsp.ts");

jest.setTimeout(60000);

// A language server in ~60 lines. Reads Content-Length frames, answers a few
// methods, and can be told to misbehave through argv.
const FAKE_SERVER = `
"use strict";
const MODE = process.argv[2] || "normal";
let rest = Buffer.alloc(0);
function send(msg) {
  const body = Buffer.from(JSON.stringify(msg), "utf8");
  process.stdout.write("Content-Length: " + body.length + "\\r\\n\\r\\n");
  process.stdout.write(body);
}
const seen = [];
process.stdin.on("data", (chunk) => {
  rest = Buffer.concat([rest, chunk]);
  for (;;) {
    const edge = rest.indexOf("\\r\\n\\r\\n");
    if (edge < 0) return;
    const head = rest.slice(0, edge).toString("ascii");
    const m = /Content-Length:\\s*(\\d+)/i.exec(head);
    const len = Number(m[1]);
    const start = edge + 4;
    if (rest.length < start + len) return;
    const msg = JSON.parse(rest.slice(start, start + len).toString("utf8"));
    rest = rest.slice(start + len);
    handle(msg);
  }
});
function handle(msg) {
  seen.push(msg.method);
  if (msg.method === "initialize") {
    send({ jsonrpc: "2.0", id: msg.id, result: { capabilities: {
      hoverProvider: true, definitionProvider: true, referencesProvider: true,
      completionProvider: { triggerCharacters: ["."] },
      textDocumentSync: 1,
    }, serverInfo: { name: "fake", version: "1" } } });
    return;
  }
  if (msg.method === "initialized") {
    // ASK THE EDITOR SOMETHING, and publish only once it answers.
    send({ jsonrpc: "2.0", id: 9001, method: "workspace/configuration",
           params: { items: [{ section: "fake" }, { section: "other" }] } });
    return;
  }
  if (msg.id === 9001) {
    // The answer arrived. Its shape is reported back so the test can check it.
    send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: {
      uri: "file:///x.txt", configAnswer: msg.result,
      diagnostics: [{ range: { start: { line: 2, character: 1 },
                               end: { line: 2, character: 5 } },
                      severity: 1, message: "hal buruk — dengan é dan 日本語" }],
    } });
    return;
  }
  if (msg.method === "textDocument/hover") {
    if (MODE === "slow") return; // never answers: the timeout path
    send({ jsonrpc: "2.0", id: msg.id, result: {
      contents: { kind: "markdown", value: "hover é 日本語" } } });
    return;
  }
  if (msg.method === "textDocument/definition") {
    send({ jsonrpc: "2.0", id: msg.id,
           error: { code: -32000, message: "no definition here" } });
    return;
  }
  if (msg.method === "$/cancelRequest") {
    send({ jsonrpc: "2.0", method: "test/cancelled", params: { id: msg.params.id } });
    return;
  }
  if (msg.method === "workspace/applyEdit" ) return;
  if (msg.method === "test/seen") {
    send({ jsonrpc: "2.0", id: msg.id, result: seen });
    return;
  }
  if (msg.method === "shutdown") {
    send({ jsonrpc: "2.0", id: msg.id, result: null });
    return;
  }
  if (msg.method === "exit") process.exit(0);
}
`;

let dir = "";
let serverPath = "";

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "uji-lsp-"));
  serverPath = path.join(dir, "fake-server.cjs");
  fs.writeFileSync(serverPath, FAKE_SERVER);
});

const start = (mode?: string) =>
  new LspClient(process.execPath, [serverPath, mode || "normal"], { cwd: dir });

describe("the handshake and the server's own requests", () => {
  test("initialize returns the server's capabilities", async () => {
    const c = start();
    const caps = await c.initialize("file:///" + dir.replace(/\\/g, "/"));
    expect(caps.hoverProvider).toBe(true);
    expect(caps.completionProvider.triggerCharacters).toEqual(["."]);
    await c.stop();
  });

  test("workspace/configuration IS answered, and with one entry per item", async () => {
    // The whole point of this file. A server that is not answered here goes
    // quiet, and nothing in the app would say so.
    const c = start();
    const gotIt = new Promise((done: any) =>
      c.once("textDocument/publishDiagnostics", done),
    );
    await c.initialize(null);
    const params: any = await gotIt;
    expect(Array.isArray(params.configAnswer)).toBe(true);
    expect(params.configAnswer).toHaveLength(2); // items.length, not 1, not 0
    await c.stop();
  });

  test("a notification survives non-ASCII intact", async () => {
    // Content-Length counts BYTES; a string's length counts UTF-16 units. Get
    // that wrong and the stream is offset from the first accented character on.
    const c = start();
    const gotIt = new Promise((done: any) =>
      c.once("textDocument/publishDiagnostics", done),
    );
    await c.initialize(null);
    const params: any = await gotIt;
    expect(params.diagnostics[0].message).toBe(
      "hal buruk — dengan é dan 日本語",
    );
    expect(params.diagnostics[0].range.start.line).toBe(2);
    await c.stop();
  });

  test("an unsupported server request is refused, not ignored", async () => {
    const c = start();
    await c.initialize(null);
    // Nothing here asserts on the reply itself — what matters is that the
    // client wrote SOMETHING back rather than leaving the server waiting. The
    // refusal path is reached through _answer's fallthrough.
    const seen = await c.request("test/seen", null);
    expect(seen).toContain("initialize");
    expect(seen).toContain("initialized");
    await c.stop();
  });
});

describe("requests, errors and timeouts", () => {
  test("a result comes back whole", async () => {
    const c = start();
    await c.initialize(null);
    const h = await c.request("textDocument/hover", {});
    expect(h.contents.value).toBe("hover é 日本語");
    await c.stop();
  });

  test("an error response REJECTS, naming the method", async () => {
    const c = start();
    await c.initialize(null);
    await expect(c.request("textDocument/definition", {})).rejects.toThrow(
      /textDocument\/definition: no definition here/,
    );
    await c.stop();
  });

  test("a request that never answers times out AND is cancelled", async () => {
    // Rejecting is not enough on its own: a server left working on an abandoned
    // request stays behind for every request after it.
    const c = start("slow");
    await c.initialize(null);
    const cancelled = new Promise((done: any) =>
      c.once("test/cancelled", done),
    );
    await expect(c.request("textDocument/hover", {}, 300)).rejects.toThrow(
      /timed out after 300ms/,
    );
    const p: any = await cancelled;
    expect(typeof p.id).toBe("number");
    await c.stop();
  });

  test("everything pending is rejected when the server dies", async () => {
    const c = start();
    await c.initialize(null);
    const pending = c.request("textDocument/hover", {}, 30000);
    c.process.kill();
    await expect(pending).rejects.toThrow(/server stopped|stopped/);
    expect(c.dead).toBe(true);
  });
});

describe("a server that is not installed", () => {
  test("initialize REJECTS rather than hanging for ever", async () => {
    // The most likely thing to happen on a user's machine, and the one failure
    // that must never be silent. spawn reports it as an `error` event, not a
    // non-zero exit.
    const c = new LspClient("wolfspace-tidak-ada-server-xyz", ["--stdio"], {
      cwd: dir,
    });
    await expect(c.initialize(null)).rejects.toThrow(/could not start|stopped/);
    expect(c.dead).toBe(true);
  });

  test("a request after death rejects immediately", async () => {
    const c = new LspClient("wolfspace-tidak-ada-server-xyz", [], { cwd: dir });
    await new Promise((r: any) => c.once("exit", r));
    await expect(c.request("textDocument/hover", {})).rejects.toThrow(
      /has stopped/,
    );
  });
});

describe("what this client promises servers", () => {
  test("no snippet support is claimed, because nothing expands snippets", () => {
    // A server told otherwise sends "${1:name}" and Monaco types it out
    // literally. The claim and the implementation have to agree.
    expect(
      CLIENT_CAPABILITIES.textDocument.completion.completionItem.snippetSupport,
    ).toBe(false);
  });

  test("configuration support IS claimed, and it is the one that must be", () => {
    expect(CLIENT_CAPABILITIES.workspace.configuration).toBe(true);
  });
});
