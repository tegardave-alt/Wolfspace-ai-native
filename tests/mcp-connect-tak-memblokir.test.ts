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
// Readiness was never the missing information: status() reported it all along.
// The waiting was the bug.
//
// BUT THE OTHER HALF WAS MISSING FOR A WHILE, and this file used to assert it
// was not — it said "the UI already polls it", and so did the comment on
// _mulaiServer. Neither list polled. Both refreshed once, immediately after
// connect returned, saw starting:true, and were never told again. The user saw
// it before any test did: the log said "MCP server <name> ready." while the
// badge still read "Connecting...". The tests at the bottom of this file cover
// that half now.

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

// ── AND THE UI HAS TO ASK AGAIN ─────────────────────────────────────────────
//
// Returning early is only half a design. Something has to notice when the
// handshake finishes, and connect's own response cannot — it has already gone.
//
// Measured shape of the gap, from the code paths above:
//   t=0     connect resolves { status: "starting" }; the list refreshes and
//           shows "Connecting..." — correct, and the last thing it is told
//   t~4.3s  the handshake resolves: _mulai[name] is deleted, ready = true, and
//           dlog prints "MCP server <name> ready."
//   after   no event, no interval, no refresh. The badge never changes.

const HOOK = fs.readFileSync(
  path.join(AKAR, "public", "app", "Config.tsx"),
  "utf8",
);
const KOMPOSER = fs.readFileSync(
  path.join(AKAR, "public", "app", "Components.tsx"),
  "utf8",
);
const PICKER = fs.readFileSync(
  path.join(AKAR, "public", "app", "Screens.tsx"),
  "utf8",
);
const BUNDEL = fs.readFileSync(
  path.join(AKAR, "public", "app.build.js"),
  "utf8",
);

// The pure half, taken from the source and run rather than described.
globalThis.self = globalThis;
const Babel = require(path.join(AKAR, "public/vendor/babel.min.js"));
const C = new Function(
  "React",
  "window",
  "localStorage",
  Babel.transform(HOOK, {
    presets: ["react", "typescript"],
    filename: "/app/Config.tsx",
  }).code + "\n; return { adaMcpMulai, MCP_POLL_MS, MCP_POLL_MAKS_MS };",
)(
  { useEffect() {} },
  { WOLFSPACE: null },
  { getItem: () => null, setItem() {} },
);

describe("the badge is told again when the handshake ends", () => {
  test("a server still shaking hands is recognised", () => {
    expect(C.adaMcpMulai([{ status: { starting: true } }])).toBe(true);
    expect(
      C.adaMcpMulai([
        { status: { starting: false, ready: true } },
        { status: { starting: true } },
      ]),
    ).toBe(true);
  });

  test("nothing starting means nothing to poll for", () => {
    // An idle app must make no requests at all.
    expect(C.adaMcpMulai([{ status: { starting: false, ready: true } }])).toBe(
      false,
    );
    expect(C.adaMcpMulai([])).toBe(false);
    for (const rusak of [
      null,
      undefined,
      "x",
      [null],
      [{}],
      [{ status: null }],
    ])
      expect(C.adaMcpMulai(rusak)).toBe(false);
  });

  test("the interval is short enough to feel immediate, and it is bounded", () => {
    // A request loop with no exit would be worse than a stale badge.
    expect(C.MCP_POLL_MS).toBeLessThanOrEqual(2000);
    expect(C.MCP_POLL_MAKS_MS).toBeGreaterThan(60000); // past the handshake ceiling
    expect(C.MCP_POLL_MAKS_MS).toBeLessThanOrEqual(300000);
  });

  test("BOTH lists use it, and neither carries its own copy", () => {
    // Two implementations of one decision is the drift this repo has paid for
    // repeatedly, and the copy is always the one that goes stale.
    expect(KOMPOSER).toMatch(/useMcpMenunggu\(mcpServers, loadMcpServers\)/);
    expect(PICKER).toMatch(/useMcpMenunggu\(pickerMcp, loadPickerMcp\)/);
    expect(KOMPOSER).not.toMatch(/function useMcpMenunggu/);
    expect(PICKER).not.toMatch(/function useMcpMenunggu/);
    expect(HOOK).toMatch(/function useMcpMenunggu/);
  });

  test("and it ships", () => {
    expect(BUNDEL).toMatch(/useMcpMenunggu/);
  });

  test("the source no longer claims the UI polls when it might not", () => {
    // This exact sentence sent three readers, including its own test, past the
    // missing half. It may only claim polling while the polling exists.
    const MC = fs.readFileSync(
      path.join(AKAR, "agent", "mcp-client.ts"),
      "utf8",
    );
    expect(MC).not.toMatch(/which the UI already polls/);
    expect(MC).toMatch(/useMcpMenunggu/);
  });
});
