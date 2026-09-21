// The "still working" heartbeat, and the three copies it replaced.
//
// ── WHY IT EXISTS ────────────────────────────────────────────────────────────
//
// self_agent.ts recorded the reason itself: one run sat silent for 60.3 seconds
// while two MCP servers timed out, with nothing on screen to say the agent was
// alive. Two heartbeats were written by hand for that — MCP setup, and waiting
// for the model — and a third was about to be written for TOOLS, which is the
// longest silence of the three: unlike a model call there is not even a token
// trickling in to prove something is happening.
//
// Three copies of one pattern is how this repo has produced bugs before, and
// the two originals sat inside a 3000-line function that cannot be required
// without starting a whole agent run — so they could only ever be checked by
// matching their own source. As a module it can be RUN, which is what the
// timing tests below do.

const path = require("path");
const fs = require("fs");
const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const { mulaiDetak } = require(path.join(AKAR, "agent", "detak.ts"));

const AGEN = fs.readFileSync(path.join(AKAR, "agent", "self_agent.ts"), "utf8");

describe("detak berbunyi hanya saat memang lama", () => {
  test("it says nothing before the first interval", async () => {
    // A heartbeat that fired immediately would put a line on screen for every
    // fast tool call. The point is to break silence, not to narrate.
    const pesan: any[] = [];
    const stop = mulaiDetak((p: any) => pesan.push(p), "bash", { jeda: 60 });
    await new Promise((r) => setTimeout(r, 30));
    expect(pesan).toHaveLength(0);
    stop();
  });

  test("it beats once per interval, naming the thing and the seconds", async () => {
    const pesan: any[] = [];
    // A fake clock, so the SECONDS in the message are asserted exactly rather
    // than "about right" — a real clock makes this test flaky by design.
    let jam = 100000;
    const stop = mulaiDetak((p: any) => pesan.push(p), "bash", {
      jeda: 25,
      sekarang: () => jam,
    });
    jam += 7000;
    await new Promise((r) => setTimeout(r, 40));
    stop();
    expect(pesan.length).toBeGreaterThanOrEqual(1);
    expect(pesan[0].t).toBe("model_wait");
    expect(pesan[0].m).toBe("bash still running (7s)…");
  });

  test("stopping it really stops it", async () => {
    // An interval that outlives its work keeps emitting into a run that has
    // moved on, and the user watches a tool "still running" that finished a
    // minute ago.
    const pesan: any[] = [];
    const stop = mulaiDetak((p: any) => pesan.push(p), "bash", { jeda: 20 });
    await new Promise((r) => setTimeout(r, 50));
    const sejauhIni = pesan.length;
    expect(sejauhIni).toBeGreaterThan(0);
    stop();
    await new Promise((r) => setTimeout(r, 70));
    expect(pesan).toHaveLength(sejauhIni);
  });

  test("stopping twice is not a second event", async () => {
    // A caller that stops in both a catch and a finally is ordinary.
    const stop = mulaiDetak(() => {}, "bash", { jeda: 20 });
    expect(() => {
      stop();
      stop();
    }).not.toThrow();
  });

  test("ctxChars rides along only when the caller has one", () => {
    const a: any[] = [];
    const b: any[] = [];
    let jam = 0;
    const s1 = mulaiDetak((p: any) => a.push(p), "x", {
      jeda: 1,
      sekarang: () => (jam += 1000),
    });
    const s2 = mulaiDetak((p: any) => b.push(p), "y", {
      jeda: 1,
      ctxChars: 4242,
      sekarang: () => (jam += 1000),
    });
    return new Promise((r) => setTimeout(r, 25)).then(() => {
      s1();
      s2();
      expect(a[0]).not.toHaveProperty("ctxChars");
      expect(b[0].ctxChars).toBe(4242);
    });
  });

  test("it cannot hold the process open", () => {
    // A stray interval must never be the reason node refuses to exit; the stop
    // function is what ends it, this is the backstop.
    const src = fs.readFileSync(path.join(AKAR, "agent", "detak.ts"), "utf8");
    expect(src).toMatch(/unref/);
  });
});

describe("satu sumber, bukan tiga salinan", () => {
  test("all three waits use the shared helper", () => {
    expect(AGEN).toMatch(/mulaiDetak\(emit, "MCP setup"/);
    expect(AGEN).toMatch(/mulaiDetak\(emit, "The model"/);
    expect(AGEN).toMatch(/mulaiDetak\(emit, tc\.function\.name/);
  });

  test("no hand-written heartbeat interval is left", () => {
    // The shape that was duplicated: setInterval emitting model_wait.
    const KODE = AGEN.replace(/\/\*[\s\S]*?\*\//g, "").replace(
      /^\s*\/\/.*$/gm,
      "",
    );
    expect(KODE).not.toMatch(/setInterval\(\(\) => \{\s*emit\(\{/);
  });

  test("the tool heartbeat is stopped in a finally", () => {
    // Not after the await: a tool that throws would leave the interval running
    // for the rest of the session.
    const i = AGEN.indexOf("const hentikanDetak = mulaiDetak(");
    const blok = AGEN.slice(i, i + 400);
    expect(blok).toMatch(
      /try \{[\s\S]*runSelfTool[\s\S]*\} finally \{[\s\S]*hentikanDetak\(\)/,
    );
  });

  test("it reuses the event the frontend already renders", () => {
    // model_wait, not a new type: no contract change, no new branch in
    // AgentSteps, nothing to keep in sync.
    const src = fs.readFileSync(path.join(AKAR, "agent", "detak.ts"), "utf8");
    expect(src).toMatch(/t: "model_wait"/);
    const kontrak = fs.readFileSync(
      path.join(AKAR, "packages", "contracts", "agent-events.ts"),
      "utf8",
    );
    expect(kontrak).toMatch(/t: "model_wait"/);
  });
});
