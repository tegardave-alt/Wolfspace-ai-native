// MCP moved to the process that runs the agent.
//
// THE BUG, and it was silent in every direction. The UI connected a server and
// said "connected". The log said "MCP server github ready." The agent saw no
// tools at all, with no error and no log line anywhere.
//
// Two processes, two clients. selfAgentStream runs in backend-host and calls
// mcpClient.getTools(); /mcp/connect was served through the `api` channel in
// MAIN. Each process has its own require("mcp-client.ts") and therefore its own
// this.servers map. The UI connected a server in one, the agent asked the other,
// and getTools() returned [] -- correctly, because in THAT process there really
// were none.
//
// It came from two fixes meeting: f159a3d moved self-agent streaming off the
// window thread, and 6eede69 kept `api` in main after the null-body regression.
// Each was right on its own.
//
// VERIFIED IN A RUNNING WINDOW: POST /mcp/connect returned {ok:true} and
// /mcp/status then reported running=true ready=true, served by the host.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const baca = (p: string) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");

const tanpaKomentar = (t: string) =>
  t
    .split("\n")
    .filter((b: string) => !/^\s*\/\//.test(b))
    .join("\n");

const HOST = tanpaKomentar(baca("electron/backend-host.cjs"));
const MAIN = tanpaKomentar(baca("electron/main.ts"));

describe("host memiliki MCP", () => {
  test("the host serves the MCP routes", () => {
    expect(HOST).toMatch(
      /if \(channel === "api" && _jalurKeHost\(payload\)\) return apiHost\(payload\)/,
    );
  });

  test("every other api path still THROWS, so main falls back", () => {
    // The lesson from the null-body regression: a channel the host cannot serve
    // must throw. Returning null gave the renderer a null that looked like a
    // valid answer.
    expect(HOST).toMatch(
      /throw new Error\("unknown invoke channel: " \+ channel\)/,
    );
    const m = HOST.match(/if \(channel === "api" && _jalurKeHost[\s\S]*?\n\}/);
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/throw new Error/);
  });

  test("the host has its own proxy rather than importing main's", () => {
    // apiCall lives in electron/main.ts, which belongs to the other process and
    // pulls in Electron itself.
    expect(HOST).toMatch(/function apiHost\(/);
    expect(HOST).toMatch(/core\(\)\.server\.emit\("request", req, res\)/);
    expect(HOST).toMatch(
      /const \{ PassThrough, Writable \} = require\("stream"\)/,
    );
  });
});

describe("main hanya mengalihkan /mcp", () => {
  test("MCP paths are tried on the host first", () => {
    expect(MAIN).toMatch(
      /if \(channel === "api" && _jalurKeHost\(payload\)\) \{/,
    );
  });

  test("a host that cannot answer still falls through, never returns null", () => {
    const m = MAIN.match(
      /if \(channel === "api" && _jalurKeHost\(payload\)\) \{[\s\S]*?\n      \}/,
    );
    expect(m).toBeTruthy();
    expect(m![0]).toMatch(/lewatHost\.ok && lewatHost\.value != null/);
    // The unconditional in-process path is still there, after the diversion.
    expect(MAIN).toMatch(/if \(channel === "api"\) return apiCall\(payload\);/);
  });

  test("the DEFAULT is the host, with an explicit list of exceptions", () => {
    // Routes were moved one prefix at a time -- /mcp, then /ww -- and each move
    // followed a freeze the user had already hit. Naming the exceptions instead
    // means a NEW route is off the window thread the moment it is written, and
    // putting one back in main is something somebody has to decide.
    for (const src of [HOST, MAIN]) {
      const m = src.match(/function _jalurKeHost\([\s\S]*?\n\}/);
      expect(m).toBeTruthy();
      expect(m![0]).toMatch(/for \(const p of _TETAP_DI_MAIN\)/);
      expect(m![0]).toMatch(/return true;/);
      // A payload with no path must not be swept along with the rest.
      expect(m![0]).toMatch(/if \(!jalur\.startsWith\("\/"\)\) return false;/);
    }
  });

  test("both processes carry the same exception list", () => {
    // They disagree and a route is served twice, or by nobody.
    const ambil = (src: string) => {
      const m = src.match(/const _TETAP_DI_MAIN[^=]*= \[([\s\S]*?)\]/);
      expect(m).toBeTruthy();
      return (m![1].match(/"[^"]+"/g) || []).sort().join(",");
    };
    expect(ambil(HOST)).toBe(ambil(MAIN));
  });

  test("the workspace routes moved because they BLOCK, not for tidiness", () => {
    // scripts/ww.ts drives git through execFileSync. Served from the process
    // that owns the window, a commit ran a synchronous child process on the
    // thread Windows watches -- the same freeze the folder import caused.
    const ww = fs.readFileSync(path.join(AKAR, "scripts", "ww.ts"), "utf8");
    expect(ww).toMatch(/execFileSync\("git"/);
  });

  test("moving them is safe because none of it is Electron-bound", () => {
    // These handlers must behave identically in either process.
    for (const f of ["server.ts", "scripts/ww.ts"]) {
      const isi = fs.readFileSync(path.join(AKAR, f), "utf8");
      expect(isi).not.toMatch(/require\("electron"\)/);
    }
  });
});
