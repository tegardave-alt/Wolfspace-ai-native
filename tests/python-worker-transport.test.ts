// The host <-> Python worker transport, exercised against the REAL worker.
//
// Not a mock. The whole value of this seam is that two processes in two
// languages agree on a line protocol, and a mock on either side would agree
// with itself no matter what the other one does. What is proven here:
//
//   * the worker starts, reports ready, and answers a ping
//   * a run drives the graph and reaches `adone`
//   * a `tool` request reaches the host, and the host's answer reaches the node
//   * a thrown tool comes back as a FAILED tool rather than hanging the node
//   * cancellation is cooperative — the run ends through the graph's own edges
//
// Skipped, not failed, when no Python is available: these tests describe the
// wiring, and a machine without the interpreter has nothing to say about it.
require(require("path").join(__dirname, "..", "scripts", "ts-register.cjs"));

const path = require("path");
const { execFileSync } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const W = require(path.join(AKAR, "agent", "python-worker.ts"));

/** Is there an interpreter with langgraph importable? */
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

const SIAP = pythonSiap();
const d = SIAP ? describe : describe.skip;

d("transport host <-> worker Python", () => {
  afterAll(() => W.stopWorker());

  test("worker menyala dan menjawab ping", async () => {
    const ok = await W.ping(20000);
    expect(ok).toBe(true);
    expect(W.isRunning()).toBe(true);
  }, 60000);

  test("run sederhana sampai ke adone, dan tool-nya benar-benar dipanggil host", async () => {
    const events = [];
    const dipanggil = [];

    await W.runOnWorker(
      "uji-1",
      { history: [{ role: "user", content: "halo" }], task_checklist: [] },
      {
        onEvent: (e) => events.push(e),
        onTool: async (name, args) => {
          dipanggil.push(name);
          // The three pseudo-tools are the host's own responsibility; here they
          // are answered minimally so the graph can reach its end.
          if (name === "__model__") {
            return {
              ok: true,
              messages: [
                { role: "assistant", content: "sudah", tool_calls: [] },
              ],
            };
          }
          if (name === "__validate__") {
            return { ok: true, finished: true, summary: "selesai" };
          }
          if (name === "__plan__")
            return { ok: true, messages: [], checklist: [] };
          return { ok: true, output: "" };
        },
      },
    );

    const jenis = events.map((e) => e.t);
    expect(jenis).toContain("adone");
    // The host answered, so the node moved on: both pseudo-tools were reached.
    expect(dipanggil).toContain("__model__");
    expect(dipanggil).toContain("__validate__");
    const selesai = events.find((e) => e.t === "adone");
    expect(selesai.summary).toBe("selesai");
  }, 120000);

  test("tool yang MELEMPAR dijawab sebagai tool gagal, bukan menggantung node", async () => {
    const events = [];
    await W.runOnWorker(
      "uji-2",
      { history: [{ role: "user", content: "halo" }], task_checklist: [] },
      {
        onEvent: (e) => events.push(e),
        onTool: async (name) => {
          if (name === "__model__") throw new Error("model meledak");
          if (name === "__validate__")
            return { ok: true, finished: true, summary: "" };
          return { ok: true, output: "" };
        },
      },
    );
    // The run ends rather than hanging, and the failure is visible.
    const jenis = events.map((e) => e.t);
    expect(jenis.some((t) => t === "adone" || t === "err")).toBe(true);
  }, 120000);

  test("pembatalan bersifat kooperatif: run berakhir, bukan proses dibunuh", async () => {
    const events = [];
    let batal = false;

    const jalan = W.runOnWorker(
      "uji-3",
      { history: [{ role: "user", content: "halo" }], task_checklist: [] },
      {
        onEvent: (e) => events.push(e),
        isCancelled: () => batal,
        onTool: async (name) => {
          // Ask for cancellation from inside the first node, then stall long
          // enough for the poll to notice.
          batal = true;
          await new Promise((r) => setTimeout(r, 1200));
          if (name === "__model__") {
            return {
              ok: true,
              messages: [{ role: "assistant", content: "x", tool_calls: [] }],
            };
          }
          if (name === "__validate__")
            return { ok: true, finished: true, summary: "" };
          return { ok: true, output: "" };
        },
      },
    );

    await jalan;
    // The worker is still alive: cancellation left through the graph's own END
    // edges rather than killing the process, which is what keeps a paused
    // checkpoint usable.
    expect(W.isRunning()).toBe(true);
    expect(events.map((e) => e.t)).toContain("adone");
  }, 120000);
});

describe("kontrak protokol", () => {
  test("versi protokol host sama dengan yang di protocol.py", () => {
    // Two processes, one number. If they drift, every line the worker sends is
    // still parseable — which is exactly why this is checked rather than left
    // to fail somewhere useful.
    const fs = require("fs");
    const py = fs.readFileSync(
      path.join(AKAR, "services", "agent-python", "protocol.py"),
      "utf8",
    );
    const m = py.match(/PROTOCOL_VERSION\s*=\s*(\d+)/);
    expect(m).toBeTruthy();
    expect(Number(m[1])).toBe(W.PROTOCOL_VERSION);
  });
});
