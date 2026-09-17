// MCP over HTTP (remote transport), plus transport auto-detection.
//
// WOLFSPACE's MCP client was stdio-only: it spawned a local command and spoke
// JSON-RPC over its pipes; a remote server given as a URL could not connect.
// Following OpenCode's config (opencode.ai/docs: "type": "local" vs "remote"),
// the client now also speaks Streamable HTTP -- POST the JSON-RPC message, read
// the reply as JSON or an SSE stream, echo the Mcp-Session-Id, send auth via
// headers. The message layer, handshake and tools/list|call are shared with
// stdio; only _send differs.

const http = require("http");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const mcp = require(path.join(AKAR, "agent", "mcp-client.ts"));

describe("transport auto-detection (_normalKonfig)", () => {
  test("explicit type wins", () => {
    expect(
      mcp._normalKonfig({ type: "remote", url: "https://x" }).transport,
    ).toBe("remote");
    expect(
      mcp._normalKonfig({ type: "local", command: "node" }).transport,
    ).toBe("local");
  });

  test("inferred: url -> remote, command -> local", () => {
    expect(mcp._normalKonfig({ url: "https://x" }).transport).toBe("remote");
    expect(mcp._normalKonfig({ command: "node" }).transport).toBe("local");
  });

  test("OpenCode's command array becomes command + args", () => {
    const n = mcp._normalKonfig({ command: ["npx", "-y", "some-mcp"] });
    expect(n.transport).toBe("local");
    expect(n.command).toBe("npx");
    expect(n.args).toEqual(["-y", "some-mcp"]);
  });

  test("environment/enabled aliases are honored", () => {
    const n = mcp._normalKonfig({
      command: "node",
      environment: { K: "v" },
      enabled: false,
    });
    expect(n.env).toEqual({ K: "v" });
    expect(n.disabled).toBe(true);
    expect(
      mcp._normalKonfig({ command: "node", disabled: true }).disabled,
    ).toBe(true);
  });

  test("remote carries url + headers", () => {
    const n = mcp._normalKonfig({
      type: "remote",
      url: "https://s/mcp",
      headers: { Authorization: "Bearer K" },
    });
    expect(n.url).toBe("https://s/mcp");
    expect(n.headers).toEqual({ Authorization: "Bearer K" });
  });
});

// A mock Streamable-HTTP MCP server. `sse` switches the reply encoding so both
// paths of _kirimHttp are exercised.
function mockServer(opts: { sse?: boolean } = {}) {
  return http.createServer((req: any, res: any) => {
    if (req.method === "DELETE") {
      res.writeHead(200);
      res.end();
      return;
    }
    let body = "";
    req.on("data", (c: any) => (body += c));
    req.on("end", () => {
      let msg: any = {};
      try {
        msg = JSON.parse(body);
      } catch (_) {}
      // Auth is required from the very first request.
      if (req.headers["authorization"] !== "Bearer SECRET") {
        res.writeHead(401);
        res.end("unauthorized");
        return;
      }
      if (msg.method === "notifications/initialized") {
        res.writeHead(202);
        res.end();
        return;
      }
      let result: any = {};
      const hdr: any = { "Content-Type": "application/json" };
      if (msg.method === "initialize") {
        result = {
          protocolVersion: "2024-11-05",
          capabilities: {},
          serverInfo: { name: "mock" },
        };
        hdr["Mcp-Session-Id"] = "sess-xyz";
      } else if (msg.method === "tools/list") {
        // Every non-initialize request must echo the session id.
        if (req.headers["mcp-session-id"] !== "sess-xyz") {
          res.writeHead(400);
          res.end("missing session id");
          return;
        }
        result = {
          tools: [
            {
              name: "echo",
              description: "echo text back",
              inputSchema: {
                type: "object",
                properties: { text: { type: "string" } },
              },
            },
          ],
        };
      } else if (msg.method === "tools/call") {
        if (req.headers["mcp-session-id"] !== "sess-xyz") {
          res.writeHead(400);
          res.end("missing session id");
          return;
        }
        const t =
          (msg.params && msg.params.arguments && msg.params.arguments.text) ||
          "";
        result = { content: [{ type: "text", text: "ECHO:" + t }] };
      }
      const payload = JSON.stringify({ jsonrpc: "2.0", id: msg.id, result });
      if (opts.sse) {
        // A real server still returns the session id header on initialize even
        // when the body is an SSE stream.
        res.writeHead(200, { ...hdr, "Content-Type": "text/event-stream" });
        res.end("event: message\ndata: " + payload + "\n\n");
      } else {
        res.writeHead(200, hdr);
        res.end(payload);
      }
    });
  });
}

async function withServer(opts: any, fn: (url: string) => Promise<void>) {
  const srv = mockServer(opts);
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const url = "http://127.0.0.1:" + srv.address().port + "/mcp";
  try {
    await fn(url);
  } finally {
    srv.close();
  }
}

describe("remote MCP over HTTP", () => {
  afterEach(() => {
    try {
      mcp.stopServer("ujiremote");
    } catch (_) {}
  });

  test("connect, list tools, call a tool (JSON reply) — with auth + session id", async () => {
    await withServer({}, async (url) => {
      const r = await mcp._mulaiServer(
        "ujiremote",
        { type: "remote", url, headers: { Authorization: "Bearer SECRET" } },
        true,
      );
      expect(r.ok).toBe(true);

      const tools = await mcp.getTools();
      const echo = tools.find(
        (t: any) => t.function.name === "mcp_ujiremote_echo",
      );
      expect(echo).toBeTruthy();
      expect(echo.function.description).toMatch(/echo text back/);

      const out = await mcp.callTool("mcp_ujiremote_echo", { text: "hi" });
      expect(out.ok).toBe(true);
      expect(out.output).toContain("ECHO:hi");
    });
  }, 30000);

  test("an SSE reply is parsed too", async () => {
    await withServer({ sse: true }, async (url) => {
      const r = await mcp._mulaiServer(
        "ujiremote",
        { type: "remote", url, headers: { Authorization: "Bearer SECRET" } },
        true,
      );
      expect(r.ok).toBe(true);
      const out = await mcp.callTool("mcp_ujiremote_echo", { text: "sse" });
      expect(out.ok).toBe(true);
      expect(out.output).toContain("ECHO:sse");
    });
  }, 30000);

  test("a wrong/absent auth header fails the handshake with the server's reason", async () => {
    await withServer({}, async (url) => {
      const r = await mcp._mulaiServer(
        "ujiremote",
        { type: "remote", url, headers: { Authorization: "Bearer WRONG" } },
        true,
      );
      expect(r.ok).toBe(false);
    });
  }, 30000);
});
