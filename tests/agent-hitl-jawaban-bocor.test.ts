// After a HITL pause+resume in a long run, does tool OUTPUT leak into the
// ANSWER bubble -- the place meant for the model's final text?
//
// THE USER'S REPORT. "A long task, repeated actions, a HITL, then it
// continues -- but the info shows up in the answer text, e.g. 2× grep, 10×
// bash." So: is tool activity being rendered where the final answer should be?
//
// WHAT THIS PROVES. On the real graph with a scripted model and a real
// workspace: two greps, then a bash (execution -> HITL), approve, then a
// plain-text final answer. The answer that reaches the bubble (the LAST
// adone.summary) must be the model's own final text -- NOT a tool output and
// NOT tool-call accounting. Tool results belong on the timeline (act events).

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
      content: s.content || "",
      tool_calls: s.calls.map((c: any, k: number) => ({
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
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-hitl-"));
  ws = path.join(tmp, "ws");
  fs.mkdirSync(ws);
  fs.writeFileSync(
    path.join(ws, "config.js"),
    "const PORT = 3000;\n// TODO fix\n",
  );
});
afterEach(() => {
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (_) {}
});

async function jalankan(tujuan: string, langkah: any[], extra: any = {}) {
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
      thread_id: extra.thread_id || "hitl_" + Date.now(),
      ...extra,
    },
    (e: any) => events.push(e),
    { isCancelled: () => false, setCurReq: () => {}, depth: 0 },
  );
  return events;
}

describe("HITL resume: the answer bubble holds the answer, not tool output", () => {
  test("two greps, a bash held for approval, resume, final text -- the answer is the model's text", async () => {
    const thread_id = "hitl_bocor_" + Date.now();
    // Turn 1: grep, grep, bash (execution -> HITL). The final string is the
    // model's answer, reached only after approval.
    const ev1 = await jalankan(
      "Find the port and run a check.",
      [
        { calls: [{ name: "grep", args: { pattern: "PORT", path: "." } }] },
        { calls: [{ name: "grep", args: { pattern: "TODO", path: "." } }] },
        { calls: [{ name: "bash", args: { command: "echo checking" } }] },
        "The port is 3000; the check passed.",
      ],
      { thread_id },
    );

    // It paused for approval, and did NOT close the answer bubble yet.
    const paused = ev1.find(
      (e) => (e.t === "adone" && e.hitlPending) || e.t === "hitl",
    );
    expect(paused).toBeTruthy();
    const closedBeforeApproval = ev1.find(
      (e) => e.t === "adone" && !e.hitlPending && e.summary,
    );
    // The only adone before approval is the hitlPending one (no final answer).
    expect(closedBeforeApproval).toBeFalsy();

    // Approve and resume on the same thread.
    const ev2 = await jalankan("", ["The port is 3000; the check passed."], {
      thread_id,
      hitl_response: true,
    });

    // The bash ran on the TIMELINE (an act event), where tool output belongs.
    const bashAct = ev2.find((e) => e.t === "act" && e.kind === "bash");
    expect(bashAct).toBeTruthy();

    // The ANSWER bubble = the last adone.summary. It must be the model's final
    // text -- not tool output, not "grep×2, bash×10" accounting.
    const adone = ev2.filter((e) => e.t === "adone");
    expect(adone.length).toBeGreaterThan(0);
    const answer = String(adone[adone.length - 1].summary || "");
    expect(answer).toContain("The port is 3000");
    expect(answer).not.toMatch(/grep|bash|×|panggilan tool|command\(s\)/i);
  });

  test("the step-limit checkpoint keeps its tool accounting OUT of the answer bubble", () => {
    // The other pause -- the "Continue" checkpoint when the step budget runs
    // out -- carries an activity report ("N tool calls (bash×10, grep×2)…").
    // That is a diagnostic for the Continue panel, not an answer. The frontend
    // must NOT write j.summary into the answer bubble for a continuable pause;
    // it belongs only in the panel's `code`.
    const app = fs.readFileSync(path.join(AKAR, "public", "app.tsx"), "utf8");
    const i = app.indexOf("if (j.continuable && j.thread_id) {");
    expect(i).toBeGreaterThan(-1);
    // Just the continuable branch: up to its own `return;`.
    const blok = app.slice(i, app.indexOf("return;", i) + 7);
    // The bubble summary is the neutral note, not the accounting. (English UI
    // string, per the teks-ui-inggris guard — a short pause note, never j.summary.)
    expect(blok).toMatch(/summary:\s*\n?\s*"Paused at the step limit/);
    // The answer-bubble upd() in THIS branch does not carry j.summary.
    const updBlok = blok.slice(
      blok.indexOf("upd({"),
      blok.indexOf("});", blok.indexOf("upd({")),
    );
    expect(updBlok).not.toMatch(/summary: j\.summary/);
    // The full report still reaches the Continue panel.
    expect(blok).toMatch(/kind: "continue"[\s\S]*?code: j\.summary \|\| ""/);
  });
});
