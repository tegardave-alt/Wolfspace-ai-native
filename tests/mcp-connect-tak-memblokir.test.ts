// Connecting an MCP server must return before the handshake finishes.
//
// WHAT WENT WRONG. The handshake is allowed 60 seconds, and that width is
// deliberate: `npx` cold starts contend over the npm cache, and a 25-second
// attempt was measured producing 24 / 0 / 24 / 24 tools out of 50. The mistake
// was not the timeout — it was awaiting it all the way up the call chain:
//
//   _startServer -> connectServer -> /mcp route -> backend host -> main
//
// The backend host answers requests on that path, so pressing Connect stopped
// it answering ANY of them. The probe said so in the user's own log:
//
//   [probe] backend-host gagal api: host backend tak menjawab dalam 30000 ms
//
// Nothing was broken. A connection that was merely slow made the whole app look
// hung, and the only evidence the user had was a window that stopped painting.
//
// Readiness was never the missing information — status() already reported it,
// and the UI already polls it. The waiting was the bug.

const path = require("path");
const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const fs = require("fs");
const mcp = require(path.join(AKAR, "agent", "mcp-client.ts"));

const SRC = fs.readFileSync(path.join(AKAR, "agent", "mcp-client.ts"), "utf8");

/** A process that starts fine and simply never speaks MCP. */
const DIAM = {
  command: process.execPath,
  args: ["-e", "setTimeout(function () {}, 30000)"],
};

const NAMA = "uji-diam";

afterEach(() => {
  try {
    mcp.stopServer(NAMA);
  } catch (_) {}
  delete mcp._mulai[NAMA];
  delete mcp._galatMulai[NAMA];
});

describe("connect kembali sebelum handshake selesai", () => {
  test("it returns in milliseconds, not in tens of seconds", () => {
    // The server below never answers `initialize`, so the OLD code would have
    // sat here for the full 60 seconds.
    const t0 = Date.now();
    const r: any = mcp._mulaiServer(NAMA, DIAM, false);
    const ms = Date.now() - t0;

    expect(r.ok).toBe(true);
    expect(r.status).toBe("starting");
    expect(ms).toBeLessThan(1000);
  });

  test("the process really was spawned — this is not a fake answer", () => {
    // Returning early is only honest if the work actually started. An answer of
    // "starting" with nothing running would be worse than blocking.
    mcp._mulaiServer(NAMA, DIAM, false);
    expect(mcp.servers[NAMA]).toBeTruthy();
    expect(mcp.servers[NAMA].proc.pid).toBeGreaterThan(0);
    expect(mcp.servers[NAMA].ready).toBe(false);
  });

  test("status() reports `starting`, so the UI can tell the three states apart", () => {
    mcp._mulaiServer(NAMA, DIAM, false);
    // status() reads the config file, which this fixture is not in — so the
    // in-flight map is asserted directly. That map IS what status() reads.
    expect(mcp._mulai[NAMA]).toBeTruthy();
    expect(SRC).toMatch(/starting: !!this\._mulai\[name\]/);
  });

  test("a failed start keeps its reason after the record is gone", async () => {
    // stopServer() deletes this.servers[name] on failure, so a reason stored on
    // that record would die with the thing that needed to explain itself.
    const gagal = {
      command: process.execPath,
      args: ["-e", "process.exit(1)"],
    };
    const selesai: any = await mcp._mulaiServer("uji-gagal", gagal, true);
    expect(selesai.ok).toBe(false);
    expect(typeof mcp._galatMulai["uji-gagal"]).toBe("string");
    delete mcp._galatMulai["uji-gagal"];
  }, 20000);
});

describe("bentuk kodenya", () => {
  test("connectServer no longer awaits the handshake", () => {
    // Source-level, because the defect is invisible from the outside: the old
    // code returned the same shape, just much later.
    const blok = SRC.slice(
      SRC.indexOf("async connectServer"),
      SRC.indexOf("_mulaiServer(name, conf, tunggu)"),
    );
    expect(blok).not.toMatch(/await this\._startServer/);
    expect(blok).toMatch(/return this\._mulaiServer\(/);
  });

  test("addServer does not block either", () => {
    // The POST /mcp path held the host for exactly the same reason.
    const blok = SRC.slice(
      SRC.indexOf("async addServer"),
      SRC.indexOf("removeServer(name)"),
    );
    expect(blok).not.toMatch(/await this\._startServer/);
    expect(blok).toMatch(/this\._mulaiServer\(name, conf, false\)/);
  });

  test("the 60-second handshake budget is untouched", () => {
    // The timeout was never the problem, and shrinking it was measured to be
    // actively harmful. Nothing here should have moved it.
    expect(SRC).toMatch(/HANDSHAKE_TIMEOUT_MS = 60000/);
  });

  test("connecting is still driven by the user, not by getTools()", () => {
    // Guard kept from the lazy-transport work: if init() ever starts servers
    // again, the 60-second cold start returns at the worst possible moment.
    const initBody = SRC.slice(
      SRC.indexOf("async init()"),
      SRC.indexOf("async connectServer"),
    );
    expect(initBody).not.toMatch(/_startServer|connectAll/);
  });
});
