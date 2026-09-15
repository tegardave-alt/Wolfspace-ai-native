// A run resumed after an approval must keep the steps it showed before it.
//
// WHAT WENT WRONG. Approving a bash command sends the run on as a second
// stream into the SAME agent bubble -- but doSend started its event list
// empty on every call, and every upd({ events }) replaces the bubble's list
// with it. The first event after Allow was the bash itself, and it wiped
// every step before it. The timeline read "bash" and nothing else, and at
// the end of the run only the steps after the pause were there.
//
// A source test, because the only way to drive this end to end is a model
// that asks for bash; the defect is in three lines of wiring and reads
// back exactly.

const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(
  path.join(__dirname, "..", "public", "app.tsx"),
  "utf8",
);

function doSendBody(): string {
  const a = APP.indexOf("const doSend = async (");
  expect(a).toBeGreaterThan(-1);
  return APP.slice(a, a + 20000);
}

describe("resuming after HITL keeps the timeline", () => {
  test("the event list is seeded from the paused bubble on resume", () => {
    const b = doSendBody();
    expect(b).toMatch(
      /const lanjutan = hitlData \? messages\[messages\.length - 1\] : null;/,
    );
    expect(b).toMatch(
      /const evlist: any\[\] = agenLama \? \[\.\.\.\(agenLama\.events \|\| \[\]\)\] : \[\];/,
    );
    // The defect, verbatim, must be gone: an unconditional empty list.
    expect(b).not.toMatch(/const evlist: any\[\] = \[\];/);
  });

  test("a resumed run keeps its original start time", () => {
    const b = doSendBody();
    expect(b).toMatch(
      /const mulaiMs = \(agenLama && agenLama\.mulaiMs\) \|\| Date\.now\(\);/,
    );
  });

  test("a fresh run still starts clean and makes a new bubble", () => {
    const b = doSendBody();
    // The non-resume path is unchanged: a user message plus a new agent
    // bubble with an empty timeline.
    expect(b).toMatch(
      /\{ role: "agent", agent: \{ events: \[\], busy: true \} \}/,
    );
  });
});
