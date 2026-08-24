// The findings journal on the Python path.
//
// Half of this was already shared and nobody had noticed: the WRITES happen
// inside runSelfTool (agent/tools/index.ts), the function BOTH orchestrators
// call, so the Python path had been filling the journal all along. It simply
// never read it back — the knowledge went in and never came out.
//
// What the journal carries is what the checklist cannot: memory across a process
// RESTART. The checklist's checkpoint uses MemorySaver, which dies with the
// process; the journal is on disk. Measured in a real run ledger (pid 12932):
// 246 actions for 22 unique commands, index.html read 13 times — not a loop, but
// history slicing discarding `read` results and leaving the agent unaware it had
// read them.

const fs = require("fs");
const os = require("os");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));

const A = require(path.join(AKAR, "agent", "python-agent.ts"));
const T = require(path.join(AKAR, "agent", "tools.cjs"));
const cloudMod = require(path.join(AKAR, "agent", "cloud.ts"));
const perencana = require(path.join(AKAR, "agent", "perencana-agent.ts"));
const temuan = require(path.join(AKAR, "agent", "temuan.ts"));
const W = require(path.join(AKAR, "agent", "python-worker.ts"));

// The worker is long-lived on purpose (a per-run spawn would drop the
// checkpointer HITL resume depends on), so it has to be stopped explicitly or
// `jest --detectOpenHandles` waits on it and the whole suite hangs.
afterAll(() => W.stopWorker());

const PY_SRC = fs.readFileSync(
  path.join(AKAR, "agent", "python-agent.ts"),
  "utf8",
);

describe("jurnal temuan: jalur Python akhirnya MEMBACANYA", () => {
  test("dimuat sekali per run, dan disuntik ke system message", () => {
    // Comments are stripped: the comment explaining the fix names the very
    // functions being asserted, so raw source would match its own explanation.
    const kode = PY_SRC.replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((b) => !b.trim().startsWith("//"))
      .join("\n");
    expect(kode).toMatch(/t\.muat\(t\.kunciWs\(wsRoot\)\)/);
    expect(kode).toMatch(/t\.blokPrompt\(t\.kunciWs\(wsRoot \?\? null\)\)/);
  });

  test("blok temuan BENAR-BENAR sampai ke pesan yang dikirim ke model", async () => {
    // The property that matters, checked end to end against the real worker:
    // something written to the journal comes back in the system message of the
    // next run. Reading the source could not prove that.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "temuan-py-"));
    const kunci = temuan.kunciWs(dir);
    const PENANDA = "PENANDA_TEMUAN_" + Date.now();
    temuan.catat(kunci, "catatan/uji.txt", PENANDA, { alat: "read" });

    const runAsli = T.runSelfTool;
    const askAsli = cloudMod.askCloudTools;
    const rencanaAsli = perencana.rencanakan;

    let sistemTerlihat = "";
    perencana.rencanakan = async (cloud) => ({
      checklist: ["kerjakan"],
      cloud,
      dicoba: [],
    });
    T.runSelfTool = async () => ({ ok: true, output: "" });
    cloudMod.askCloudTools = async (_cloud, messages) => {
      if (!sistemTerlihat && messages && messages.length)
        sistemTerlihat = String(messages[0].content || "");
      return { content: "sudah selesai", tool_calls: [] };
    };

    try {
      await A.selfAgentStreamPython(
        {
          history: [
            { role: "system", content: "SISTEM DASAR" },
            { role: "user", content: "apa yang sudah kamu tahu?" },
          ],
          cloud: {},
          workspace_root: dir,
          thread_id: "temuan-py",
        },
        () => {},
      );
    } finally {
      T.runSelfTool = runAsli;
      cloudMod.askCloudTools = askAsli;
      perencana.rencanakan = rencanaAsli;
      try {
        temuan.bersihkan(kunci);
      } catch (_) {}
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {}
    }

    // The original system message survives, with the journal appended to it —
    // not replaced by it, and not added as a separate message that history
    // slicing would drop.
    expect(sistemTerlihat).toContain("SISTEM DASAR");
    expect(sistemTerlihat).toContain(PENANDA);
  }, 180000);

  test("jurnal kosong TIDAK mengubah pesan sistem", async () => {
    // No findings must mean no change at all: a stray header or blank block
    // would be paid for in tokens on every single model call.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "temuan-py-kosong-"));
    const runAsli = T.runSelfTool;
    const askAsli = cloudMod.askCloudTools;
    const rencanaAsli = perencana.rencanakan;

    let sistemTerlihat = null;
    perencana.rencanakan = async (cloud) => ({
      checklist: ["kerjakan"],
      cloud,
      dicoba: [],
    });
    T.runSelfTool = async () => ({ ok: true, output: "" });
    cloudMod.askCloudTools = async (_cloud, messages) => {
      if (sistemTerlihat === null && messages && messages.length)
        sistemTerlihat = String(messages[0].content || "");
      return { content: "selesai", tool_calls: [] };
    };

    try {
      await A.selfAgentStreamPython(
        {
          history: [
            { role: "system", content: "SISTEM DASAR" },
            { role: "user", content: "halo" },
          ],
          cloud: {},
          workspace_root: dir,
          thread_id: "temuan-py-kosong",
        },
        () => {},
      );
    } finally {
      T.runSelfTool = runAsli;
      cloudMod.askCloudTools = askAsli;
      perencana.rencanakan = rencanaAsli;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (_) {}
    }

    expect(sistemTerlihat).toBe("SISTEM DASAR");
  }, 180000);
});
