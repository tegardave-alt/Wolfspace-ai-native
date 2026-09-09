// The agent timeline's header: how long it took, and what it did.
//
// THE BUG THIS FILE EXISTS FOR was on screen in every past run:
//
//     Worked for 1m
//
// on two different runs, for two different questions. It was not a measurement.
// `elapsed` is component-local state that ticks only while THIS component is
// mounted AND the run is busy, starting at zero — so a run reopened from
// history had zero, and the header fell through to a hardcoded "1m".
//
//     : elapsed > 0
//       ? formatTime(elapsed)
//       : "1m"            <- invented
//
// A duration the UI does not know must not be filled in with a plausible one.
// The run now carries mulaiMs and selesaiMs, and when neither is there the
// header reports what the component DOES know: the counts.
//
// Adapted from the Agent activity component in agents-kit (beUI), whose summary
// is derived the same way — "Ran 3 tools", "Thought for 12s" — rather than from
// a single figure that has to be right or invented. Its code could not be used
// as it stands: it needs lucide-react, motion/react and Tailwind, and this
// renderer is concatenated into one global scope with no bundler at all.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");

function tanpaKomentar(src: string) {
  const out: string[] = [];
  let dalam = false;
  for (const baris of src.split("\n")) {
    const t = baris.trim();
    const tutup = t.endsWith("*/") || t.endsWith("*/}");
    if (dalam) {
      if (tutup) dalam = false;
      continue;
    }
    if (t.startsWith("//") || t.startsWith("*")) continue;
    if (t.startsWith("/*") || t.startsWith("{/*")) {
      if (!tutup) dalam = true;
      continue;
    }
    out.push(baris);
  }
  return out.join("\n");
}

const baca = (rel: string) =>
  fs.readFileSync(path.join(AKAR, rel), "utf8").replace(/\r\n/g, "\n");
const STEPS = tanpaKomentar(baca("public/app/AgentSteps.tsx"));
const APP = tanpaKomentar(baca("public/app.tsx"));
const CSS = baca("public/styles.css");
const BUILD = baca("public/app.build.js");

describe("no invented duration", () => {
  test("the hardcoded '1m' is gone from the source", () => {
    const i = STEPS.indexOf("aal-code-highlight");
    expect(i).toBeGreaterThan(-1);
    const blok = STEPS.slice(i, i + 700);
    expect(blok).not.toMatch(/:\s*"1m"/);
    expect(blok).not.toMatch(/Worked for/);
  });

  test("and gone from what actually ships", () => {
    // public/app.build.js is the file the app loads; source alone proves
    // nothing about what the user sees.
    expect(BUILD).not.toMatch(/Worked for/);
  });

  test("a duration is only shown when it is derived from timestamps", () => {
    const i = STEPS.indexOf("const durasiDetik");
    expect(i).toBeGreaterThan(-1);
    const blok = STEPS.slice(i, i + 500);
    expect(blok).toMatch(/run\.mulaiMs/);
    expect(blok).toMatch(/run\.selesaiMs/);
    // Absent or unreadable answers null — not zero, and not a guess.
    expect(blok).toMatch(/return null/);
  });

  test("the clock stops when the run does", () => {
    // Without an end stamp the number keeps climbing after the run is over, so
    // reopening an old run would show a duration that grows as you look at it.
    const i = STEPS.indexOf("const durasiDetik");
    const blok = STEPS.slice(i, i + 500);
    expect(blok).toMatch(/selesai > 0 \? selesai : Date\.now\(\)/);
  });
});

describe("the run records when it happened", () => {
  test("a start stamp is written once, where the run begins", () => {
    const i = APP.indexOf("const mulaiMs = Date.now();");
    expect(i).toBeGreaterThan(-1);
    expect(APP.slice(i, i + 120)).toMatch(/upd\(\{ mulaiMs \}\)/);
    // Beside evlist, which is the run's own beginning.
    expect(APP.slice(Math.max(0, i - 300), i)).toMatch(/const evlist/);
  });

  test("an end stamp is written once, on the path every run takes", () => {
    // Four different branches call upd({ done: true }); stamping each would be
    // four chances to miss one. The stream's end runs for all of them.
    expect(APP).toMatch(/upd\(\{ selesaiMs: Date\.now\(\) \}\)/);
    const n = (APP.match(/selesaiMs: Date\.now\(\)/g) || []).length;
    expect(n).toBe(1);
  });
});

describe("what the header says instead", () => {
  test("it reports the counts, which the component always knows", () => {
    const i = STEPS.indexOf("const ringkasKerja");
    expect(i).toBeGreaterThan(-1);
    const blok = STEPS.slice(i, i + 700);
    expect(blok).toMatch(/acts\.filter/);
    expect(blok).toMatch(/thoughts\.length/);
    expect(blok).toMatch(/"no operations"/);
  });

  test("singular and plural are both handled", () => {
    // "1 tools" is the small tell that a number was pasted in rather than read.
    const i = STEPS.indexOf("const ringkasKerja");
    const blok = STEPS.slice(i, i + 700);
    expect(blok).toMatch(/=== 1 \? " tool" : " tools"/);
    expect(blok).toMatch(/=== 1 \? " thought" : " thoughts"/);
  });

  test("the duration is appended only when it exists", () => {
    const i = STEPS.indexOf("const ringkasKerja");
    const blok = STEPS.slice(i, i + 700);
    expect(blok).toMatch(/durasiDetik === null \? inti :/);
  });
});

describe("the header is reachable from the keyboard", () => {
  test("it is a button, not a div with onClick", () => {
    // A div with an onClick cannot be tabbed to and announces nothing about
    // being expandable — the same gap the icon-only Run/Save buttons had.
    // ANCHORED ON THE HEADER, not on the first .aal-row in the file. The first
    // version searched for `className="aal-row"` from the top — and once the
    // GROUPED rows started sharing that class (they had been laying themselves
    // out inline, which is why their columns never lined up), the search landed
    // on one of those instead. It went red for a change that did not touch the
    // rule it guards.
    const awal = STEPS.indexOf("function AgentSteps(");
    expect(awal).toBeGreaterThan(-1);
    const header = STEPS.slice(awal);
    const i = header.indexOf("aria-expanded={isTopOpen}");
    expect(i).toBeGreaterThan(-1);
    expect(header.slice(Math.max(0, i - 300), i)).toMatch(/<button/);
    expect(header.slice(Math.max(0, i - 300), i + 200)).toMatch(
      /className="aal-row"/,
    );
  });

  test("the button's own chrome is reset, and only for buttons", () => {
    // .aal-row is shared with the action rows; resetting it wholesale would
    // change every one of them.
    expect(CSS).toMatch(/button\.aal-row \{/);
    expect(CSS).toMatch(/button\.aal-row:focus-visible \{/);
  });
});

describe("it tidies itself away when the run ends", () => {
  const i = STEPS.indexOf("const sibukSebelumnya");

  test("the collapse happens on the TRANSITION, not whenever it is idle", () => {
    // Collapsing whenever `busy` is false would slam the panel shut every time
    // the user opened a finished run to look at it.
    expect(i).toBeGreaterThan(-1);
    const blok = STEPS.slice(i, i + 400);
    expect(blok).toMatch(/sibukSebelumnya\.current && !run\.busy/);
    expect(blok).toMatch(/top: false/);
    // And the previous value is written back, or the transition fires for ever.
    expect(blok).toMatch(/sibukSebelumnya\.current = run\.busy/);
  });

  test("it watches run.busy and nothing else", () => {
    const blok = STEPS.slice(i, i + 500);
    expect(blok).toMatch(/\}, \[run\.busy\]\);/);
  });
});

describe("the newest row stays in view while it streams", () => {
  const i = STEPS.indexOf("const alirRef");

  test("it scrolls only while the run is working", () => {
    expect(i).toBeGreaterThan(-1);
    const blok = STEPS.slice(i, i + 500);
    expect(blok).toMatch(/if \(!run\.busy\) return;/);
    expect(blok).toMatch(/scrollTop = el\.scrollHeight/);
  });

  test("a reader who has scrolled up KEEPS their place", () => {
    // Yanking the view back down while someone reads an earlier step is the
    // same discourtesy as clearing a highlight they were still looking at.
    const blok = STEPS.slice(i, i + 500);
    expect(blok).toMatch(/scrollHeight - el\.scrollTop - el\.clientHeight/);
    expect(blok).toMatch(/if \(jarak < 48\)/);
  });

  test("it runs when a row arrives, not on a timer", () => {
    const blok = STEPS.slice(i, i + 600);
    expect(blok).toMatch(/\}, \[allActs\.length, run\.busy\]\);/);
  });

  test("the scrolling window exists ONLY while working", () => {
    // A finished run is shown whole, not peered at through a small window.
    expect(STEPS).toMatch(/run\.busy \? " aal-mengalir" : ""/);
    expect(CSS).toMatch(/\.aal-mengalir \{/);
    expect(CSS).toMatch(/max-height/);
    expect(CSS).toMatch(/mask-image/);
  });

  test("smooth scrolling is switched off for reduced motion", () => {
    const j = CSS.indexOf(".aal-mengalir {");
    expect(j).toBeGreaterThan(-1);
    const blok = CSS.slice(j, j + 700);
    expect(blok).toMatch(/prefers-reduced-motion/);
    expect(blok).toMatch(/scroll-behavior: auto/);
  });
});
