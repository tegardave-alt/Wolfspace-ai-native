// The Python graph driving a run, with REAL tools on the other end.
//
// The transport test proved two processes agree on a protocol. This one proves
// the thing that matters for security: a tool asked for by the Python graph runs
// through runSelfTool — the same function, the same confinement, the same
// ledger as when the JS agent asks. An agent whose boundary depended on which
// orchestrator invoked it would be no boundary at all.
//
// The model is stubbed and nothing else is. Stubbing the model is not a
// shortcut: this test is about routing and confinement, and a real model would
// make the run non-deterministic without testing either.
require(require("path").join(__dirname, "..", "scripts", "ts-register.cjs"));

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const W = require(path.join(AKAR, "agent", "python-worker.ts"));

function pythonSiap() {
  try {
    execFileSync(W.pythonBin(), ["-c", "import langgraph"], {
      stdio: "ignore",
      timeout: 30000,
    });
    return true;
  } catch (_) {
    return false;
  }
}

const d = pythonSiap() ? describe : describe.skip;

d("orkestrasi Python menjalankan tool SUNGGUHAN", () => {
  let dir;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-pyagent-"));
    fs.writeFileSync(path.join(dir, "halo.txt"), "isi berkas uji\n", "utf8");
  });

  afterAll(() => {
    W.stopWorker();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch (_) {}
  });

  test("tool yang diminta graph dijalankan runSelfTool, di dalam workspace yang sama", async () => {
    const events = [];
    const dilihatRunSelfTool = [];

    // The model is replaced; runSelfTool is NOT. What it does with the call —
    // confinement, audit — is exactly what happens on the JS path.
    const A = require(path.join(AKAR, "agent", "python-agent.ts"));
    const T = require(path.join(AKAR, "agent", "tools.cjs"));
    const asli = T.runSelfTool;
    T.runSelfTool = async (name, args, emit, ctx) => {
      dilihatRunSelfTool.push({ name, ctx });
      return asli(name, args, emit, ctx);
    };

    // One turn: the model asks to read a file, then answers without tool calls.
    let giliran = 0;
    const cloudPalsu = {};
    const cloudMod = require(path.join(AKAR, "agent", "cloud.cjs"));
    const askAsli = cloudMod.askCloudTools;
    cloudMod.askCloudTools = async () => {
      giliran++;
      if (giliran === 1) {
        return {
          content: "",
          tool_calls: [
            {
              id: "c1",
              type: "function",
              function: {
                name: "read",
                arguments: JSON.stringify({ path: "halo.txt" }),
              },
              // The worker reads `name`/`args` off the call, so both shapes are
              // provided — this is the seam where the two conventions meet.
              name: "read",
              args: { path: "halo.txt" },
            },
          ],
        };
      }
      return { content: "sudah dibaca", tool_calls: [] };
    };

    try {
      await A.selfAgentStreamPython(
        {
          history: [{ role: "user", content: "baca halo.txt" }],
          cloud: cloudPalsu,
          workspace_root: dir,
          thread_id: "uji-orkestrasi",
        },
        (e) => events.push(e),
      );
    } finally {
      T.runSelfTool = asli;
      cloudMod.askCloudTools = askAsli;
    }

    // The tool really went through runSelfTool.
    expect(dilihatRunSelfTool.length).toBeGreaterThan(0);
    expect(dilihatRunSelfTool[0].name).toBe("read");

    // And it carried the SAME confinement the JS agent would have used: the
    // workspace root, resolved from the payload.
    expect(dilihatRunSelfTool[0].ctx.workspaceRoot).toBe(path.resolve(dir));

    // The run reached its end through the graph.
    expect(events.map((e) => e.t)).toContain("adone");
  }, 120000);

  test("workspace_root yang bukan direktori berarti TAK terkurung, bukan galat", async () => {
    // Parity with the JS agent, deliberately: the two orchestrators must resolve
    // the same request to the same security scope. A divergence here would be
    // the one difference that must never exist.
    const A = require(path.join(AKAR, "agent", "python-agent.ts"));
    const T = require(path.join(AKAR, "agent", "tools.cjs"));
    const cloudMod = require(path.join(AKAR, "agent", "cloud.cjs"));
    const asli = T.runSelfTool;
    const askAsli = cloudMod.askCloudTools;

    let ctxTerlihat = null;
    T.runSelfTool = async (name, args, emit, ctx) => {
      ctxTerlihat = ctx;
      return { ok: true, output: "" };
    };
    let giliran = 0;
    cloudMod.askCloudTools = async () => {
      giliran++;
      if (giliran === 1) {
        return {
          content: "",
          tool_calls: [{ name: "read", args: { path: "x" } }],
        };
      }
      return { content: "selesai", tool_calls: [] };
    };

    try {
      await A.selfAgentStreamPython(
        {
          history: [{ role: "user", content: "x" }],
          cloud: {},
          workspace_root: path.join(dir, "tidak-ada-folder-ini"),
          thread_id: "uji-tak-terkurung",
        },
        () => {},
      );
    } finally {
      T.runSelfTool = asli;
      cloudMod.askCloudTools = askAsli;
    }

    expect(ctxTerlihat).toBeTruthy();
    expect(ctxTerlihat.workspaceRoot).toBeNull();
  }, 120000);

  test("bash DITAHAN gerbang persetujuan, dan runSelfTool tak pernah dipanggil", async () => {
    // The most important parity gap between the two orchestrators. `bash` runs
    // PowerShell on the host with neither broker nor sandbox, so the JS loop
    // asks a human. A Python path that ran it anyway would not be a weaker
    // agent — it would be a removed boundary.
    const A = require(path.join(AKAR, "agent", "python-agent.ts"));
    const T = require(path.join(AKAR, "agent", "tools.cjs"));
    const cloudMod = require(path.join(AKAR, "agent", "cloud.cjs"));
    const asli = T.runSelfTool;
    const askAsli = cloudMod.askCloudTools;

    let toolDijalankan = 0;
    T.runSelfTool = async () => {
      toolDijalankan++;
      return { ok: true, output: "SEHARUSNYA TAK PERNAH SAMPAI SINI" };
    };
    let giliran = 0;
    cloudMod.askCloudTools = async () => {
      giliran++;
      if (giliran === 1) {
        return {
          content: "",
          tool_calls: [{ name: "bash", args: { command: "echo halo" } }],
        };
      }
      return { content: "selesai", tool_calls: [] };
    };

    const events = [];
    try {
      await A.selfAgentStreamPython(
        {
          history: [{ role: "user", content: "jalankan echo" }],
          cloud: {},
          thread_id: "uji-hitl",
        },
        (e) => events.push(e),
      );
    } finally {
      T.runSelfTool = asli;
      cloudMod.askCloudTools = askAsli;
    }

    // The gate held: the tool never executed.
    expect(toolDijalankan).toBe(0);
    // And the refusal is visible, not silent.
    expect(events.map((e) => e.t)).toContain("hitl");
    const act = events.find((e) => e.t === "act" && e.kind === "bash");
    expect(act).toBeTruthy();
    expect(act.ok).toBe(false);
    expect(String(act.output)).toMatch(/REFUSED/);
  }, 120000);
});

describe("pemilihan orkestrator", () => {
  test("jalur Python OPT-IN: bawaannya tetap agent JS", () => {
    // The honesty this file's header claims has to be checkable. The Python
    // graph is the loop's shape, not yet a replacement for the guards the JS
    // agent carries, so it must not become the default by accident.
    const A = require(path.join(AKAR, "agent", "python-agent.ts"));
    const sebelum = process.env.WOLFSPACE_AGENT_PY;
    try {
      delete process.env.WOLFSPACE_AGENT_PY;
      expect(A.pythonAgentEnabled()).toBe(false);
      process.env.WOLFSPACE_AGENT_PY = "1";
      expect(A.pythonAgentEnabled()).toBe(true);
      process.env.WOLFSPACE_AGENT_PY = "0";
      expect(A.pythonAgentEnabled()).toBe(false);
    } finally {
      if (sebelum === undefined) delete process.env.WOLFSPACE_AGENT_PY;
      else process.env.WOLFSPACE_AGENT_PY = sebelum;
    }
  });
});
