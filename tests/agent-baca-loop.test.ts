// The per-file read cap breaks the re-reading loop.
//
// WHAT WENT WRONG (measured in a real run). Asked to convert code.html to
// React, the agent read code.html and DESIGN.md in ~250 tiny overlapping
// ranges and never wrote anything -- ~1M input tokens. The cause: every step
// the transcript crossed the 200 KB history-fold threshold, so the content it
// had just read was folded into a digest that keeps only "read x12, target:
// code.html" (not the bytes). With the content gone, the model re-read the
// file (a different range), folding it away again. No guard stopped it: the
// stagnation guard keys on exact arguments, so a different range never matched;
// readFileCount was advisory and reset on file-switch.
//
// The cap here counts reads PER PATH across the whole run, does not reset on a
// file switch, refuses re-reads past a soft cap WITHOUT re-sending the file
// (stopping the token bleed), and ends the run past a hard cap.

const fs = require("fs");
const os = require("os");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
jest.setTimeout(120000);

function modelSkrip(langkah: any[]) {
  let i = 0;
  return async () => {
    const s = langkah[Math.min(i, langkah.length - 1)];
    i++;
    if (typeof s === "string") return { role: "assistant", content: s };
    return {
      role: "assistant",
      content: "",
      tool_calls: s.map((c: any, k: number) => ({
        id: "call_" + i + "_" + k,
        type: "function",
        function: { name: c.name, arguments: JSON.stringify(c.args || {}) },
      })),
    };
  };
}

let tmp = "";
let ws = "";

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-baca-"));
  ws = path.join(tmp, "ws");
  fs.mkdirSync(ws);
  // A file with enough lines that a model could plausibly "chunk" it.
  fs.writeFileSync(
    path.join(ws, "code.html"),
    Array.from({ length: 300 }, (_, i) => "<div>line " + i + "</div>").join(
      "\n",
    ),
  );
});
afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (_) {}
});

async function jalankan(tujuan: string, langkah: any[]) {
  jest.resetModules();
  const cloud = require(path.join(AKAR, "agent", "cloud.ts"));
  cloud.askCloudTools = modelSkrip(langkah);
  const perencana = require(path.join(AKAR, "agent", "perencana-agent.ts"));
  perencana.rencanakan = async (c: any) => ({ cloud: c, checklist: [] });
  const sa = require(path.join(AKAR, "agent", "self_agent.ts"));
  const events: any[] = [];
  await sa.selfAgentStream(
    {
      history: [{ role: "user", content: tujuan }],
      cloud: { provider: "uji", model: "uji", key: "x" },
      workspace_root: ws,
      thread_id: "baca_" + Date.now() + "_" + Math.random(),
    },
    (e: any) => events.push(e),
    { isCancelled: () => false, setCurReq: () => {}, depth: 0 },
  );
  return events;
}

describe("per-file read cap", () => {
  test("re-reading the SAME file in different ranges is capped, then stops the run", async () => {
    // The model reads code.html forever, each time a slightly different range
    // (as the real run did) -- the pattern the old guards missed.
    const langkah = Array.from({ length: 40 }, (_, i) => [
      { name: "read", args: { path: "code.html", offset: i, limit: 40 } },
    ]);
    const ev = await jalankan("Convert code.html to React.", langkah);

    const reads = ev.filter((e) => e.t === "act" && e.kind === "read");
    // Real reads (with content) are only the first few; the rest are refusals
    // or the stop -- NOT 40 full reads.
    const refusals = reads.filter((r) =>
      /already read .* earlier in this run/.test(String(r.output || "")),
    );
    const stopRead = reads.filter((r) =>
      /re-reading loop|read .* times in this run/.test(String(r.output || "")),
    );
    expect(refusals.length).toBeGreaterThan(0); // the soft cap fired
    expect(stopRead.length).toBeGreaterThan(0); // the hard cap fired
    // The run did NOT run all 40 steps of reading: total read acts are bounded
    // well under 40 (a handful of real reads + refusals up to the hard cap).
    expect(reads.length).toBeLessThanOrEqual(11);

    // And it ended (an adone was emitted) rather than looping to the ceiling.
    expect(ev.some((e) => e.t === "adone")).toBe(true);
  });

  test("the cap is per PATH and survives switching between two files", async () => {
    fs.writeFileSync(path.join(ws, "DESIGN.md"), "# Design\n".repeat(50));
    // Alternate the two files, different ranges each time -- exactly what
    // reset readFileCount before. Each path must still be capped on its own.
    const langkah: any[] = [];
    for (let i = 0; i < 30; i++) {
      langkah.push([
        {
          name: "read",
          args: {
            path: i % 2 === 0 ? "code.html" : "DESIGN.md",
            offset: i,
            limit: 30,
          },
        },
      ]);
    }
    const ev = await jalankan("Read both files.", langkah);
    const reads = ev.filter((e) => e.t === "act" && e.kind === "read");
    // The soft cap fired for BOTH paths despite the alternation -- the exact
    // case that reset the old readFileCount. That is what stops the token
    // bleed (a refused read re-sends nothing).
    const refusedFor = (p: string) =>
      reads.some(
        (r) =>
          r.arg === p &&
          /already read .* earlier in this run/.test(String(r.output || "")),
      );
    expect(refusedFor("code.html")).toBe(true);
    expect(refusedFor("DESIGN.md")).toBe(true);
    // Reads are bounded, not 30 (real reads are capped at the soft cap per path).
    expect(reads.length).toBeLessThan(24);
    expect(ev.some((e) => e.t === "adone")).toBe(true);
  });

  test("a few honest reads of a file are NOT capped", async () => {
    // Reading the same file 3 times (under the soft cap) then answering must
    // work untouched -- the fix must not punish normal use.
    const ev = await jalankan("Look at code.html then answer.", [
      [{ name: "read", args: { path: "code.html", offset: 0, limit: 40 } }],
      [{ name: "read", args: { path: "code.html", offset: 40, limit: 40 } }],
      [{ name: "read", args: { path: "code.html", offset: 80, limit: 40 } }],
      "code.html has 300 lines of div elements.",
    ]);
    const reads = ev.filter((e) => e.t === "act" && e.kind === "read");
    // All three ran for real (no refusal text).
    expect(reads.length).toBe(3);
    expect(
      reads.every(
        (r) => !/already read|re-reading loop/.test(String(r.output || "")),
      ),
    ).toBe(true);
  });
});
