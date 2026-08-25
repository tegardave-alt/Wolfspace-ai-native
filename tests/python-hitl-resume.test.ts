// HITL on the Python path: the run PAUSES for a human, and their answer resumes
// it. Against the REAL worker — a mocked graph would prove only that the mock
// agrees with itself.
//
// This was the last hard parity gap. The gate already fired, but it answered
// "REFUSED: … cannot collect one yet", which told the model something it could
// not act on. The same request therefore behaved differently depending on which
// orchestrator picked it up — and for `bash`, which runs PowerShell on the host
// with neither broker nor sandbox, that difference is a security boundary.

const path = require("path");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));

const A = require(path.join(AKAR, "agent", "python-agent.ts"));
const T = require(path.join(AKAR, "agent", "tools.cjs"));
const cloudMod = require(path.join(AKAR, "agent", "cloud.ts"));
const perencana = require(path.join(AKAR, "agent", "perencana-agent.ts"));
const W = require(path.join(AKAR, "agent", "python-worker.ts"));

// The worker is LONG-LIVED on purpose — spawning one per run would drop the
// checkpointer HITL resume depends on. That means it does not exit by itself,
// and `jest --detectOpenHandles` (what `npm test` uses) waits rather than
// force-exiting. Leaving it running does not fail this file; it hangs the whole
// suite, which is a far more confusing way to find out.
afterAll(() => W.stopWorker());

/** Run one turn with the model stubbed to ask for `bash` once, then finish. */
async function jalankan(payload) {
  const runAsli = T.runSelfTool;
  const askAsli = cloudMod.askCloudTools;
  const rencanaAsli = perencana.rencanakan;

  const dijalankan = [];
  const peristiwa = [];
  let giliran = 0;

  T.runSelfTool = async (name, args) => {
    dijalankan.push(name);
    return { ok: true, output: "dijalankan: " + name };
  };
  // The planner would otherwise make a real network call.
  perencana.rencanakan = async (cloud) => ({
    checklist: ["kerjakan"],
    cloud,
    dicoba: [],
  });
  cloudMod.askCloudTools = async () => {
    giliran++;
    if (giliran === 1)
      return {
        content: "",
        tool_calls: [{ name: "bash", args: { command: "echo halo" } }],
      };
    return { content: "sudah selesai", tool_calls: [] };
  };

  try {
    await A.selfAgentStreamPython(payload, (ev) => peristiwa.push(ev));
  } finally {
    T.runSelfTool = runAsli;
    cloudMod.askCloudTools = askAsli;
    perencana.rencanakan = rencanaAsli;
  }
  return { dijalankan, peristiwa };
}

// CI installs npm dependencies and nothing else, so langgraph is absent there
// and the worker cannot start. These tests are only meaningful against the
// REAL worker — a version that passed without one would prove nothing — so the
// whole block is skipped rather than softened.
//
// Same guard as tests/python-agent-orkestrasi.test.js. pythonBin() probes each
// candidate interpreter with `import langgraph`, so this asks the question the
// worker itself would ask.
function pythonSiap() {
  try {
    require("child_process").execFileSync(
      W.pythonBin(),
      ["-c", "import langgraph"],
      {
        stdio: "ignore",
        timeout: 30000,
      },
    );
    return true;
  } catch (_) {
    return false;
  }
}

const d = pythonSiap() ? describe : describe.skip;
d("HITL jalur Python: menjeda, lalu dilanjutkan", () => {
  test("tanpa persetujuan: bash TIDAK dijalankan, run BERHENTI menunggu", async () => {
    const { dijalankan, peristiwa } = await jalankan({
      history: [{ role: "user", content: "jalankan sesuatu" }],
      cloud: {},
      thread_id: "hitl-jeda",
    });

    // The boundary itself: the tool never ran.
    expect(dijalankan).not.toContain("bash");

    // The user is asked, through the event the UI already handles.
    const minta = peristiwa.filter((e) => e && e.t === "hitl");
    expect(minta.length).toBeGreaterThan(0);
    expect(minta[0].kind).toBe("bash");

    // And the run ENDS waiting, rather than carrying on as if refused. The
    // summary counts commands instead of saying "HITL", which means nothing to
    // the user.
    const adone = peristiwa.filter((e) => e && e.t === "adone").pop();
    expect(adone).toBeTruthy();
    expect(String(adone.summary)).toMatch(/perlu persetujuan Anda/);
  }, 180000);

  test("dengan hitl_response: bash BENAR-BENAR dijalankan", async () => {
    // Approval arrives as a new request carrying hitl_response — the same field
    // public/app.tsx sends and the JS loop reads. A resume must not depend on
    // which orchestrator handled the original request.
    const { dijalankan, peristiwa } = await jalankan({
      history: [{ role: "user", content: "jalankan sesuatu" }],
      cloud: {},
      thread_id: "hitl-lanjut",
      hitl_response: true,
    });

    expect(dijalankan).toContain("bash");
    // No second ask: once approved, the flag holds for the turn rather than
    // asking again for every command in the same batch.
    expect(peristiwa.filter((e) => e && e.t === "hitl")).toHaveLength(0);
  }, 180000);

  test("persetujuan TIDAK melebar ke permintaan berikutnya", async () => {
    // Approval is granted for the work that was shown, not permanently. A fresh
    // request without hitl_response must be gated again.
    const { dijalankan } = await jalankan({
      history: [{ role: "user", content: "jalankan lagi" }],
      cloud: {},
      thread_id: "hitl-tak-melebar",
    });
    expect(dijalankan).not.toContain("bash");
  }, 180000);
});
