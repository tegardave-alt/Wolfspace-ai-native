// A form the agent can raise, drawn by the app.
//
// WHY THIS SHAPE AND NOT "GENERATIVE UI". Systems like OpenUI let the MODEL
// pick components at runtime from a registry. That buys richness and costs two
// things this repo cannot spare:
//
//   1. The surface stops being the app's. A model choosing layout can
//      reintroduce exactly what was removed by hand this week — invented
//      figures, decorative chrome, rows that disagree with each other.
//   2. It cannot be pinned. Almost every guard in this repo reads the SOURCE
//      ("this button has no gradient", "this duration is not invented"). UI
//      born at runtime has no source to read.
//
// So the split is narrower and deliberate: the agent chooses WHAT to ask, the
// app decides HOW it is drawn. Four field types, fixed, laid out by components
// that live here — and everything the model can invent beyond them is refused
// or degraded before it is ever emitted. That refusal is the main thing this
// file tests, because it is the boundary the whole design rests on.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const T = require("../agent/tools/index.ts");

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

// The renderer's two pure helpers, run rather than restated.
globalThis.self = globalThis;
const Babel = require(path.join(AKAR, "public/vendor/babel.min.js"));
const R = new Function(
  "React",
  "AG_SVG",
  "window",
  Babel.transform(baca("public/app/AgentSteps.tsx"), {
    presets: ["react", "typescript"],
    filename: "/app/AgentSteps.tsx",
  }).code + "\n; return { jawabanForm, formKurang };",
)(
  {
    createElement: () => ({}),
    Fragment: null,
    useState: () => [{}, () => {}],
    useRef: () => ({}),
    useEffect: () => {},
    memo: (f: any) => f,
  },
  {},
  { addEventListener() {} },
);

describe("what the model is allowed to ask for", () => {
  test("a well-formed field survives intact", () => {
    const [f] = T._normalizeFields([
      { name: "db", label: "Database", type: "select", options: ["a", "b"] },
    ]);
    expect(f).toEqual({
      name: "db",
      label: "Database",
      type: "select",
      options: ["a", "b"],
      required: false,
      placeholder: "",
    });
  });

  test("a field with no name is DROPPED", () => {
    // No name means no key, which means no answer can be attributed to it.
    expect(T._normalizeFields([{ label: "tanpa nama" }])).toHaveLength(0);
    expect(T._normalizeFields([{ name: "   ", label: "kosong" }])).toHaveLength(
      0,
    );
  });

  test("a duplicate name is dropped, keeping the first", () => {
    // Two fields under one key means one answer silently overwrites the other.
    const out = T._normalizeFields([
      { name: "x", label: "pertama" },
      { name: "x", label: "kedua" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("pertama");
  });

  test("an invented type becomes a text box, it does not fail the form", () => {
    // A question that cannot be drawn is a run that stops for nothing.
    expect(T._normalizeFields([{ name: "a", type: "hologram" }])[0].type).toBe(
      "text",
    );
    expect(T._normalizeFields([{ name: "a" }])[0].type).toBe("text");
  });

  test("a select with nothing to select from is a text box", () => {
    // Otherwise it renders as a dropdown holding one empty entry.
    const out = T._normalizeFields([
      { name: "a", type: "select" },
      { name: "b", type: "select", options: [] },
    ]);
    expect(out.map((f: any) => f.type)).toEqual(["text", "text"]);
  });

  test("the form cannot grow without limit", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      name: "f" + i,
      label: "L",
    }));
    expect(T._normalizeFields(many).length).toBeLessThanOrEqual(8);
  });

  test("labels, options and placeholders are bounded", () => {
    const f = T._normalizeFields([
      {
        name: "a".repeat(200),
        label: "L".repeat(500),
        placeholder: "P".repeat(500),
        type: "select",
        options: Array.from({ length: 50 }, () => "o".repeat(300)),
      },
    ])[0];
    expect(f.name.length).toBeLessThanOrEqual(40);
    expect(f.label.length).toBeLessThanOrEqual(120);
    expect(f.placeholder.length).toBeLessThanOrEqual(80);
    expect(f.options.length).toBeLessThanOrEqual(12);
    expect(f.options[0].length).toBeLessThanOrEqual(80);
  });

  test("anything that is not a list of objects yields no form", () => {
    for (const junk of [null, undefined, "fields", 7, {}, [null, 3, "x"]])
      expect(T._normalizeFields(junk)).toEqual([]);
  });
});

describe("what comes back to the agent", () => {
  const fields = [
    { name: "nama", label: "Project name", type: "text", required: true },
    { name: "db", label: "Database", type: "select", options: ["pg"] },
    { name: "ci", label: "Set up CI", type: "boolean" },
  ];

  test("labelled lines, not JSON", () => {
    // The text lands in the conversation, where a person reads it too.
    // {"db":"pg"} says less to both of them than "Database: pg".
    const out = R.jawabanForm(fields, { nama: "wolf", db: "pg", ci: true });
    expect(out).toBe("Project name: wolf\nDatabase: pg\nSet up CI: yes");
  });

  test("an unanswered optional field is left OUT, not sent empty", () => {
    // "Database: " reads as an answer that is blank; leaving it out reads as
    // a question the user passed over. Those are different things.
    const out = R.jawabanForm(fields, { nama: "wolf", ci: false });
    expect(out).toBe("Project name: wolf\nSet up CI: no");
    expect(out).not.toMatch(/Database:/);
  });

  test("a checkbox always answers, because unchecked IS an answer", () => {
    expect(R.jawabanForm([fields[2]], {})).toBe("Set up CI: no");
  });

  test("whitespace alone is not an answer", () => {
    expect(R.jawabanForm([fields[0]], { nama: "   " })).toBe("");
  });
});

describe("it will not send an incomplete form", () => {
  const fields = [
    { name: "a", label: "Wajib", required: true },
    { name: "b", label: "Opsional" },
    { name: "c", label: "Centang", type: "boolean", required: true },
  ];

  test("a required field that is empty is reported by NAME", () => {
    // "Something is missing" makes the user hunt; the label says where.
    expect(R.formKurang(fields, {})).toEqual(["Wajib"]);
  });

  test("a required checkbox is never 'missing' — unchecked is an answer", () => {
    expect(R.formKurang(fields, { a: "x" })).toEqual([]);
  });

  test("whitespace does not satisfy a required field", () => {
    expect(R.formKurang(fields, { a: "  " })).toEqual(["Wajib"]);
  });

  test("the submit button is disabled while anything is missing", () => {
    const i = STEPS.indexOf("function HitlModal");
    const blok = STEPS.slice(i, i + 3000);
    expect(blok).toMatch(/disabled=\{kurang\.length > 0\}/);
    // And it LOOKS disabled, or people press it again and decide it is broken.
    expect(baca("public/styles.css")).toMatch(/\.hitl-btn-submit:disabled/);
  });
});

describe("the app draws it, not the model", () => {
  test("the field types are a fixed list in the tool layer", () => {
    const tools = tanpaKomentar(baca("agent/tools/index.ts"));
    expect(tools).toMatch(
      /FIELD_TYPES = \["text", "number", "select", "boolean"\]/,
    );
  });

  test("nothing about the layout comes over the wire", () => {
    // No class names, no styles, no component names in the schema — only what
    // is being asked.
    const kontrak = baca("packages/contracts/agent-events.ts");
    const i = kontrak.indexOf('t: "ask"');
    const blok = kontrak.slice(i, i + 700);
    expect(blok).toMatch(/fields\?:/);
    expect(blok).not.toMatch(/className|style|component|html/i);
  });

  test("the form is rendered by a component that lives here", () => {
    expect(STEPS).toMatch(/function AgentForm/);
    expect(STEPS).toMatch(/<AgentForm/);
  });

  test("it uses the browser's own controls", () => {
    // A real <select> and a real checkbox are keyboard-reachable and announced
    // by a screen reader with no extra code, and nothing here is special
    // enough to trade that away for appearance.
    const i = STEPS.indexOf("function AgentForm");
    const blok = STEPS.slice(i, i + 2500);
    expect(blok).toMatch(/<select/);
    expect(blok).toMatch(/type="checkbox"/);
    expect(blok).toMatch(/htmlFor=\{id\}/);
  });
});

describe("the wiring, end to end", () => {
  test("the tool advertises the schema to the model", () => {
    const def = baca("agent/tools/tool-definitions.ts");
    const i = def.indexOf('name: "question"');
    const blok = def.slice(i, i + 2600);
    expect(blok).toMatch(/fields:/);
    expect(blok).toMatch(/enum: \["text", "number", "select", "boolean"\]/);
  });

  test("the handler normalises before returning", () => {
    const tools = tanpaKomentar(baca("agent/tools/index.ts"));
    const i = tools.indexOf('name === "question"');
    expect(tools.slice(i, i + 600)).toMatch(/_normalizeFields\(/);
  });

  test("the ask event carries the fields, and the renderer passes them on", () => {
    const agent = fs.readFileSync(
      path.join(AKAR, "agent", "self_agent.ts"),
      "utf8",
    );
    expect(agent).toMatch(/t: "ask"[\s\S]{0,90}fields: r\.fields/);
    expect(tanpaKomentar(baca("public/app.tsx"))).toMatch(
      /fields: Array\.isArray\(j\.fields\) \? j\.fields : \[\]/,
    );
  });
});
