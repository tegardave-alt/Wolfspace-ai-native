// packages/contracts/agent-events.ts is only useful if something HOLDS IT TO IT.
//
// Without this file the contract is just a document: it could be wrong for
// months with nothing to show for it, because no code imports it (app.tsx and
// self_agent.cjs are both not TypeScript). And it WAS wrong — its first version
// listed "phase", "retry" and "run", three events no live code emits. This test
// is what found that.
//
// It checks BOTH directions, and that is the point:
//   backend -> contract : a new backend event cannot land unnoticed
//   contract -> backend : the contract cannot promise events that do not exist
//
// The UI side of the same loop is guarded by rollback-dan-tanda-hidup.test.js
// ("TAK ADA event backend yang tersisa tanpa penanganan UI").

const fs = require("fs");

const read = (p) =>
  fs.readFileSync(require.resolve("../" + p), "utf8").replace(/\r\n/g, "\n");

const CONTRACT = read("packages/contracts/agent-events.ts");

/** Strip // and block comments so what is checked is CODE, not prose. */
const withoutComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Event names inside one `export type X = ...` union in the contract. */
function eventsInUnion(name) {
  const i = CONTRACT.indexOf("export type " + name);
  if (i < 0) throw new Error("union not found in contract: " + name);
  // The union ends at the next `export`; the file's shape is consistent.
  const j = CONTRACT.indexOf("\nexport ", i + 1);
  const block = CONTRACT.slice(i, j < 0 ? undefined : j);
  return new Set([...block.matchAll(/t:\s*"([a-z_]+)"/g)].map((m) => m[1]));
}

/** Event names a backend file actually emits. */
function eventsEmitted(...files) {
  const src = files.map(read).join("\n");
  return new Set(
    [...src.matchAll(/\b(?:emit|ev)\(\s*\{\s*t:\s*"([a-z_]+)"/g)].map(
      (m) => m[1],
    ),
  );
}

const difference = (a, b) => [...a].filter((x) => !b.has(x)).sort();

describe("agent-events contract matches what the backend emits", () => {
  test("chat: contract == what agent/chat.cjs emits, exactly", () => {
    const emitted = eventsEmitted("agent/chat.cjs");
    const contract = eventsInUnion("ChatStreamEvent");
    expect(emitted.size).toBeGreaterThan(0); // if zero, this test tests nothing
    expect(difference(emitted, contract)).toEqual([]); // emitted but undeclared
    expect(difference(contract, emitted)).toEqual([]); // declared but never sent
  });

  test("self-agent: every emitted event IS in the contract", () => {
    const emitted = eventsEmitted(
      "agent/self_agent.cjs",
      "agent/tools/index.ts",
    );
    const contract = eventsInUnion("SelfAgentStreamEvent");
    expect(emitted.size).toBeGreaterThan(0);
    expect(difference(emitted, contract)).toEqual([]);
  });

  test("self-agent: the contract promises no event that is never emitted", () => {
    // This is the direction that caught the first version of this contract.
    const emitted = eventsEmitted(
      "agent/self_agent.cjs",
      "agent/tools/index.ts",
    );
    const contract = eventsInUnion("SelfAgentStreamEvent");
    expect(difference(contract, emitted)).toEqual([]);
  });
});

describe("the UI handles no event that can never arrive", () => {
  // The third direction, born from a real mistake: app.tsx used to have
  // branches for "phase", "retry" and "run" — three events no live code emits.
  // A branch like that never fails loudly; it just sits there making people
  // believe the feature still exists.
  //
  // rollback-dan-tanda-hidup.test.js guards the opposite direction (every
  // emitted event MUST be handled). Together the two pin the sets equal.
  const emitted = eventsEmitted(
    "agent/chat.cjs",
    "agent/self_agent.cjs",
    "agent/tools/index.ts",
  );

  test("every j.t branch in app.tsx has an emitter in the backend", () => {
    const ui = read("public/app.tsx");
    const handled = new Set(
      [...ui.matchAll(/j\.t === "([a-z_]+)"/g)].map((m) => m[1]),
    );
    expect(handled.size).toBeGreaterThan(0);
    expect(difference(handled, emitted)).toEqual([]);
  });

  test("those three dead events really are gone from the UI", () => {
    // Named one by one rather than read from a list in the contract: what is
    // guarded is that they do not QUIETLY come back, and a guard that takes its
    // list from the same file it inspects would go green if both were wrong
    // together.
    //
    // COMMENTS ARE STRIPPED FIRST. What is guarded is CODE: the historical note
    // in app.tsx names these very events precisely to explain why they are gone,
    // and a test that goes red over prose like that punishes good documentation.
    const ui = withoutComments(read("public/app.tsx"));
    for (const t of ["phase", "retry", "run"]) {
      expect(ui).not.toContain('j.t === "' + t + '"');
    }
    expect(ui).not.toContain("phaseNodes");
  });
});
