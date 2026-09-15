// The agent can propose a small native panel instead of guessing values in
// text -- and nothing it sends can reach the screen unchecked.
//
// WHAT THIS IS. Visual Draw gives the agent a place ("this element"); the
// ui_propose tool is the reply: a declarative panel (A2UI shape: components
// + data model + anchor) that the app draws from a CLOSED catalog with its
// own controls, previews live, and answers with one machine-shaped line.
//
// PROVEN HERE, on the real graph with a scripted model:
//   1. a valid proposal is emitted as t:"a2ui" and the run PAUSES for the
//      user, the way a question does;
//   2. an invalid one -- unknown component, markup, url() in the preview,
//      no cancel button -- never reaches the screen: the model gets the
//      reason and nothing is emitted;
//   3. the validator's limits are what the tool description promises.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
jest.setTimeout(120000);

const git = (cwd: string, a: string[]) =>
  execFileSync("git", a, { cwd, stdio: "pipe", encoding: "utf8" }).trim();

const TUJUAN = "Make the Commit button in src/panel.css less cramped.";

const USULAN_SAH = {
  anchor: ".seg-btn",
  components: [
    {
      id: "root",
      type: "Card",
      props: { title: "Commit button spacing" },
      children: ["pad", "aksi"],
    },
    {
      id: "pad",
      type: "Slider",
      props: { label: "padding-x", min: 4, max: 20, unit: "px" },
      bind: "padX",
    },
    { id: "aksi", type: "Actions", children: ["apply", "cancel"] },
    {
      id: "apply",
      type: "Button",
      props: { label: "Apply", primary: true },
      action: "apply",
    },
    {
      id: "cancel",
      type: "Button",
      props: { label: "Cancel" },
      action: "cancel",
    },
  ],
  dataModel: { padX: 10 },
  preview: { selector: ".seg-btn", css: { padding: "0 {padX}px" } },
};

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
        function: { name: c.name, arguments: JSON.stringify(c.args) },
      })),
    };
  };
}

let ws = "";
beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-a2ui-"));
  fs.mkdirSync(path.join(ws, "src"));
  fs.writeFileSync(
    path.join(ws, "src", "panel.css"),
    ".seg-btn{padding:0 6px}\n",
  );
  git(ws, ["init", "-q", "-b", "main"]);
  git(ws, ["config", "user.email", "a@b.c"]);
  git(ws, ["config", "user.name", "uji"]);
  git(ws, ["add", "."]);
  git(ws, ["commit", "-qm", "awal"]);
});
afterEach(() => {
  try {
    fs.rmSync(ws, { recursive: true, force: true });
  } catch (_) {}
});

async function jalankan(langkah: any[]) {
  jest.resetModules();
  const cloud = require(path.join(AKAR, "agent", "cloud.ts"));
  cloud.askCloudTools = modelSkrip(langkah);
  const perencana = require(path.join(AKAR, "agent", "perencana-agent.ts"));
  perencana.rencanakan = async (c: any) => ({ cloud: c, checklist: [] });
  const sa = require(path.join(AKAR, "agent", "self_agent.ts"));
  const events: any[] = [];
  await sa.selfAgentStream(
    {
      history: [{ role: "user", content: TUJUAN }],
      cloud: { provider: "uji", model: "uji", key: "x" },
      workspace_root: ws,
      thread_id: "a2ui_" + Date.now(),
    },
    (e: any) => events.push(e),
    { isCancelled: () => false, setCurReq: () => {}, depth: 0 },
  );
  return events;
}

describe("a valid proposal", () => {
  test("is emitted as a panel and pauses the run for the user", async () => {
    const ev = await jalankan([
      [{ name: "ui_propose", args: USULAN_SAH }],
      "Should not be reached before the user answers.",
    ]);
    const a2ui = ev.find((e) => e.t === "a2ui");
    expect(a2ui).toBeTruthy();
    expect(a2ui.proposal.anchor).toBe(".seg-btn");
    expect(a2ui.proposal.components.map((c: any) => c.id)).toEqual([
      "root",
      "pad",
      "aksi",
      "apply",
      "cancel",
    ]);
    expect(a2ui.proposal.dataModel).toEqual({ padX: 10 });
    // Paused: the run ended waiting, and no question modal was raised.
    const adone = ev.find((e) => e.t === "adone");
    expect(adone).toBeTruthy();
    expect(ev.find((e) => e.t === "ask")).toBeUndefined();
    // And the source was not touched: the edit waits for Apply.
    expect(fs.readFileSync(path.join(ws, "src", "panel.css"), "utf8")).toBe(
      ".seg-btn{padding:0 6px}\n",
    );
  });
});

describe("an invalid proposal never reaches the screen", () => {
  const kasus: [string, any, RegExp][] = [
    [
      "unknown component type",
      { ...USULAN_SAH, components: [{ id: "x", type: "Iframe" }] },
      /unknown component type: Iframe/,
    ],
    [
      "markup in text",
      {
        ...USULAN_SAH,
        components: [
          { id: "t", type: "Text", props: { text: "<img onerror=1>" } },
          { id: "c", type: "Button", action: "cancel" },
        ],
      },
      /has markup/,
    ],
    [
      "url() in the preview",
      {
        ...USULAN_SAH,
        preview: { selector: ".seg-btn", css: { background: "url(http://x)" } },
      },
      /not a plain CSS value/,
    ],
    [
      "no way out",
      {
        ...USULAN_SAH,
        // Drop the button AND its slot, or the missing-child check fires first.
        components: USULAN_SAH.components
          .filter((c) => c.id !== "cancel")
          .map((c) => (c.id === "aksi" ? { ...c, children: ["apply"] } : c)),
      },
      /Button with action "cancel"/,
    ],
    [
      "a bind without a value",
      { ...USULAN_SAH, dataModel: {} },
      /binds padX, which is not in dataModel/,
    ],
  ];

  test.each(kasus)(
    "%s: rejected with the reason, nothing emitted",
    async (_n, usulan, sebab) => {
      const ev = await jalankan([
        [{ name: "ui_propose", args: usulan }],
        "Understood.",
      ]);
      expect(ev.find((e) => e.t === "a2ui")).toBeUndefined();
      const act = ev.find((e) => e.t === "act" && e.kind === "ui_propose");
      expect(act).toBeTruthy();
      expect(act.ok).toBe(false);
      expect(String(act.output)).toMatch(sebab);
    },
  );
});

describe("the contract", () => {
  const A = require(path.join(AKAR, "agent", "a2ui.ts"));

  test("the catalog the validator accepts is the one the renderer draws", () => {
    const R = fs.readFileSync(
      path.join(AKAR, "public", "app", "A2UI.tsx"),
      "utf8",
    );
    for (const tipe of Object.keys(A.KATALOG)) {
      expect(R).toMatch(new RegExp('case "' + tipe + '":'));
    }
  });

  test("the user's answer is one machine-shaped line", () => {
    expect(A.ringkasAksi("apply", { padX: 8 })).toBe('[a2ui:apply] {"padX":8}');
    const APP = fs.readFileSync(path.join(AKAR, "public", "app.tsx"), "utf8");
    // Whitespace-insensitive: prettier breaks the expression across lines.
    expect(APP.replace(/\s+/g, " ")).toMatch(
      /"\[a2ui:" \+ aksi \+ "\] " \+ JSON\.stringify\(data \|\| \{\}\)/,
    );
  });

  test("the panel is wired: event, state, render, load order", () => {
    const APP = fs.readFileSync(path.join(AKAR, "public", "app.tsx"), "utf8");
    expect(APP).toMatch(/j\.t === "a2ui"/);
    expect(APP).toMatch(/setA2ui\(j\.proposal \|\| null\)/);
    expect(APP).toMatch(/<A2UIPanel/);
    const HTML = fs.readFileSync(
      path.join(AKAR, "public", "index.html"),
      "utf8",
    );
    expect(HTML).toMatch(/"\/app\/A2UI\.tsx"/);
  });
});
