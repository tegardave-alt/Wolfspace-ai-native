// The checkpoint row in the agent timeline.
//
// WHY IT EXISTS AT ALL. The snapshot engine, `GET /api/snapshots` and
// `POST /api/rollback` have been live and mounted the whole time, and the run
// state already stored the backup path the agent emitted. A search of the whole
// renderer found ZERO callers of either endpoint: the capability was being paid
// for on every edit and shown to nobody.
//
// WHAT IS PINNED HERE is the part that can hurt. Rollback OVERWRITES files and
// cannot be undone from the UI, so the button must ask before it acts, must say
// how many files it is about to overwrite, and must not report success it did
// not get. Those are the assertions below; the geometry of the row is not.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");

/** Line-wise, so a "/*" inside a line comment cannot eat the code under test. */
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
const RUTE = baca("server/routes/snapshots.ts");
const CSS = baca("public/styles.css");

describe("the RIGHT backup mechanism, of the two in this repo", () => {
  const TOOLS = tanpaKomentar(baca("agent/tools/index.ts"));

  test("the restorable one is the one that emits a checkpoint", () => {
    // MEASURED, and it is why this test exists. Two mechanisms:
    //   qBackup()       -> _agent_backups/bak-<iso>/, emits t:"backup"
    //   createSnapshot()-> .wolfspace/snapshots/<id>/, restorable
    // POST /api/rollback answers "Snapshot 'bak-...' tidak ditemukan" for the
    // first. Offering Restore on it would be a button that always fails.
    expect(TOOLS).toMatch(/_emitCheckpoint\(/);
    const i = TOOLS.indexOf("function _emitCheckpoint");
    expect(i).toBeGreaterThan(-1);
    expect(TOOLS.slice(i, i + 500)).toMatch(/t: "checkpoint"/);
    expect(TOOLS.slice(i, i + 500)).toMatch(/hasil\.id/);
  });

  test("every createSnapshot in the tool layer reports itself", () => {
    // Three call sites: edit, edit-adv, write. One that stayed silent would be
    // a checkpoint the user never sees and cannot go back to.
    const panggilan = [...TOOLS.matchAll(/createSnapshot\(\[dest\]/g)];
    expect(panggilan).toHaveLength(3);
    // ASSERTED BY POSITION, not by line shape. The first version required that
    // no line START with createSnapshot([dest] — and prettier then wrapped the
    // wrapped call across lines, putting it exactly there. The test went red
    // for formatting while the rule it guards was intact.
    for (const m of panggilan)
      expect(TOOLS.slice(Math.max(0, m.index - 140), m.index)).toMatch(
        /_emitCheckpoint\($/m,
      );
  });

  test("t:'backup' is left as the plain path it always was", () => {
    // It carries a directory from a store rollback cannot read. Deriving an id
    // from it produced a Restore button that answered "not found" every time.
    const i = APP.indexOf('j.t === "backup"');
    expect(i).toBeGreaterThan(-1);
    expect(APP.slice(i, i + 120)).toMatch(/upd\(\{ backup: j\.dir \}\)/);
  });

  test("the checkpoint event becomes a timeline row", () => {
    const i = APP.indexOf('j.t === "checkpoint"');
    expect(i).toBeGreaterThan(-1);
    const blok = APP.slice(i, i + 400);
    expect(blok).toMatch(/evlist\.push\(\{/);
    expect(blok).toMatch(/type: "checkpoint"/);
    expect(blok).toMatch(/events: \[\.\.\.evlist\]/);
  });

  test("the contract lists it, because the backend emits it", () => {
    const kontrak = baca("packages/contracts/agent-events.ts");
    expect(kontrak).toMatch(/t: "checkpoint"/);
  });

  test("the timeline lets checkpoint events through its filter", () => {
    // allActs used to keep act/err/thought only, so a checkpoint event would
    // have been dropped before it could be rendered.
    const i = STEPS.indexOf("const allActs");
    expect(i).toBeGreaterThan(-1);
    expect(STEPS.slice(i, i + 300)).toMatch(/type === "checkpoint"/);
  });

  test("and renders them with their own row", () => {
    expect(STEPS).toMatch(/<CheckpointRow/);
    expect(STEPS).toMatch(/function CheckpointRow/);
  });
});

describe("restoring asks first, because it overwrites", () => {
  const i = STEPS.indexOf("function CheckpointRow");
  const badan = STEPS.slice(i, i + 4200);

  test("the button does not roll back on the first click", () => {
    // One click inside a scrolling log is too easy to hit by accident, and this
    // is not undoable from here.
    expect(badan).toMatch(/setTahap\("tanya"\)/);
    // The call itself hangs off the confirmation, not off the first button.
    const j = badan.indexOf("/api/rollback");
    expect(j).toBeGreaterThan(-1);
    expect(badan.slice(0, j)).toMatch(/const pulihkan = async/);
  });

  test("the question names how many files it will overwrite", () => {
    // "Restore" with no idea of the blast radius is a guess, not a decision.
    expect(badan).toMatch(/Overwrite \{/);
    expect(badan).toMatch(/jml/);
  });

  test("it reports what the server ACTUALLY restored", () => {
    // Not the number it hoped for: rollback skips files whose stored copy is
    // missing, and saying "restored 3" when it restored 1 is the exact class of
    // lie the snapshot fix was about.
    expect(badan).toMatch(/r\.restored \|\| \[\]/);
    expect(badan).toMatch(/r\.error/);
  });

  test("a failure is shown, not swallowed", () => {
    expect(badan).toMatch(/catch \(err: any\)/);
    expect(badan).toMatch(/setPesan/);
  });

  test("the editor is refreshed after a restore", () => {
    // The open buffer holds the pre-rollback text at that moment, and a manual
    // save would put it straight back. The same event the agent's own writes
    // fire brings every open model up to date.
    expect(badan).toMatch(/wolfspace_agent_act/);
    expect(badan).toMatch(/kind: "restore"/);
  });

  test("the destructive confirmation is coloured as a warning", () => {
    expect(badan).toMatch(/cp-btn cp-ya/);
    expect(CSS).toMatch(/\.cp-btn\.cp-ya \{/);
  });
});

describe("what it speaks to, and what it reads", () => {
  test("rollback is the endpoint the server already publishes", () => {
    expect(RUTE).toMatch(/urlPath === "\/api\/rollback"/);
    expect(STEPS).toMatch(/"\/api\/rollback"/);
  });

  test("the row reads its OWN event — there is nothing to look up", () => {
    // The first version fetched GET /api/snapshots and matched by id. That is
    // one more thing that can silently fail to match, and the event already
    // carries everything the row shows.
    const i = STEPS.indexOf("function CheckpointRow");
    const badan = STEPS.slice(i, i + 4200);
    expect(badan).toMatch(/e\.files/);
    expect(badan).toMatch(/e\.label/);
    expect(badan).toMatch(/id: e\.id/);
    expect(STEPS).not.toMatch(/wwApi\("\/api\/snapshots"\)/);
  });
});
