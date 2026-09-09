// Whether the agent knows what was attached, instead of hunting for it on disk.
//
// ── THE FAILURE THIS CLOSES ──────────────────────────────────────────────────
//
// The word "attachment" appeared NOWHERE in agent/self_agent.ts or in
// config/prompts.json. Everything the model knew about an attached file came
// from one line inside the user's own message:
//
//     - [Terlampir] laporan.html (12 KB, text/html) — id: att_…
//
// A filename in a message reads like a filename anywhere else, so the agent
// called read / glob / grep against the workspace, found nothing, and searched
// harder. That search can never succeed: agent/attachment-bridge.ts keeps the
// contents in memory and NEVER receives a path, and an attached file usually
// did not come from the project folder in the first place.
//
// Two things changed, and both are tested here by running the real code:
//   1. the prompt now lists what is attached and says not to search for it;
//   2. a workspace miss whose name matches an attachment says so, and hands
//      over the id.
//
// WHAT DID NOT CHANGE, deliberately, because the user asked for it to stay:
// nothing anywhere learns where an attached file came from.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));

const esbuild = require(path.join(AKAR, "node_modules", "esbuild"));
const JEMBATAN = require(path.join(AKAR, "agent", "attachment-bridge.ts"));
const ALAT = require(path.join(AKAR, "agent", "tools", "index.ts"));

const SUMBER = fs.readFileSync(
  path.join(AKAR, "agent", "self_agent.ts"),
  "utf8",
);

/**
 * Runs the prompt block ITSELF, taken from self_agent.ts.
 *
 * Not a re-implementation: a copy here would keep passing while the real prompt
 * said something else. The bridge is stubbed so the test controls what is
 * "attached" without touching the session's real attachments.
 */
function bangunPrompt(lampiran: any[]) {
  const i = SUMBER.indexOf("// ── WHAT THE USER HAS ATTACHED");
  const j = SUMBER.indexOf("// ── THE LINKED GITHUB REPOSITORY");
  if (i < 0 || j < 0 || j < i) throw new Error("prompt block not found");
  const kode = esbuild.transformSync(SUMBER.slice(i, j), {
    loader: "ts",
  }).code;
  const messages = [{ role: "system", content: "BASE" }];
  const ctx: any = {
    messages,
    require: (m: string) =>
      m.includes("attachment-bridge") ? { daftar: () => lampiran } : require(m),
    Math,
    Array,
    String,
  };
  vm.createContext(ctx);
  vm.runInContext(kode, ctx);
  return messages[0].content;
}

const contoh = (n: number) =>
  Array.from({ length: n }, (_, k) => ({
    id: "att_" + k,
    nama: "berkas" + k + ".html",
    bytes: 4096,
    tipe: "text/html",
  }));

describe("prompt menyebut lampiran", () => {
  test("nothing is added when nothing is attached", () => {
    // The ordinary state. A standing paragraph about attachments that are not
    // there would be noise on every single run.
    expect(bangunPrompt([])).toBe("BASE");
  });

  test("it lists each attachment by NAME and id", () => {
    // The user refers to an attachment by its name; the tool needs its id. The
    // model has to be able to match the two without asking.
    const p = bangunPrompt(contoh(2));
    expect(p).toContain("berkas0.html");
    expect(p).toContain("att_0");
    expect(p).toContain("berkas1.html");
    expect(p).toContain("att_1");
    expect(p).toContain("4 KB");
    expect(p).toContain("text/html");
  });

  test("it says plainly not to search the workspace", () => {
    // This sentence IS the fix. Without it the model treats the name like any
    // other filename and starts looking.
    const p = bangunPrompt(contoh(1));
    expect(p).toMatch(/NOT on disk and NOT in your workspace/);
    expect(p).toMatch(/read, glob, grep and list will never find them/);
    expect(p).toMatch(/do NOT search the workspace/);
    expect(p).toMatch(/attachment_read/);
  });

  test("a long list is capped, and says how many it left out", () => {
    // 50 attachments are allowed per session. Printing all of them every turn
    // would spend the context on a list nobody asked for.
    const p = bangunPrompt(contoh(31));
    expect(p).toContain("31 in this session");
    expect(p).toContain("and 11 more");
    expect(p).toContain("attachment_list");
    expect(p).not.toContain("berkas25.html");
  });

  test("it never claims to know where a file came from", () => {
    // The bridge's whole design is that the address never arrives. The prompt
    // must not imply otherwise, or the agent will ask for a directory listing
    // that cannot exist.
    const p = bangunPrompt(contoh(1));
    expect(p).toMatch(/not recorded anywhere and cannot be looked up/);
    expect(p).toMatch(/ask the user to attach it/);
  });
});

describe("pencarian meleset menunjuk ke lampiran", () => {
  let id = "";
  beforeAll(() => {
    const r = JEMBATAN.serahkan({
      nama: "uji-lampiran-hanya-tes.html",
      isi: "<h1>hai</h1>",
      tipe: "text/html",
    });
    if (!r.ok) throw new Error("handover failed: " + r.error);
    id = r.id;
  });
  afterAll(() => {
    // Leave the session exactly as it was found.
    JEMBATAN.lupakan(id);
  });

  test("a failed read points at the attachment and its id", async () => {
    const r: any = await ALAT.runSelfTool(
      "read",
      { path: "uji-lampiran-hanya-tes.html" },
      () => {},
      {},
    );
    expect(r.output).toContain("is ATTACHED to this conversation");
    expect(r.output).toContain("attachment_read id=" + id);
  });

  test("it matches on the basename, not the whole path", async () => {
    // The agent guesses directories. Every guess is a different string, and
    // every one of them has to land on the same hint.
    const r: any = await ALAT.runSelfTool(
      "glob",
      { pattern: "src/deep/uji-lampiran-hanya-tes.html" },
      () => {},
      {},
    );
    expect(r.output).toContain("attachment_read id=" + id);
  });

  test("an unrelated miss is left alone", async () => {
    const r: any = await ALAT.runSelfTool(
      "read",
      { path: "berkas-yang-memang-tak-ada-xyz.txt" },
      () => {},
      {},
    );
    expect(r.output).not.toContain("NOTE:");
  });

  test("a SUCCESSFUL read is never annotated", async () => {
    // A note appended to every file the agent opens is noise, and noise on the
    // success path is worse than no note at all.
    const r: any = await ALAT.runSelfTool(
      "read",
      { path: "package.json" },
      () => {},
      {},
    );
    expect(String(r.output)).not.toContain("NOTE:");
  });

  test("the hint reveals no location", () => {
    // It matches a name the model already typed against a name the user
    // attached. Neither is an address, and none is invented.
    const blok = fs
      .readFileSync(path.join(AKAR, "agent", "tools", "index.ts"), "utf8")
      .slice(
        fs
          .readFileSync(path.join(AKAR, "agent", "tools", "index.ts"), "utf8")
          .indexOf("function _petunjukLampiran"),
      );
    const satu = blok.slice(0, blok.indexOf("\nasync function runSelfTool"));
    expect(satu).not.toMatch(/webkitRelativePath|dirname|resolve\(/);
  });
});

describe("jembatan tetap tanpa alamat", () => {
  test("the handover still takes contents and a name only", () => {
    // The user asked for this property to stay exactly as it is.
    const b = fs.readFileSync(
      path.join(AKAR, "agent", "attachment-bridge.ts"),
      "utf8",
    );
    // COMMENTS STRIPPED: the doc comments in this module exist precisely to say
    // "NOT a path" and "never touch any directory", so matching the raw source
    // would fail against the file's own statement of the property.
    const blok = b
      .slice(b.indexOf("function serahkan"), b.indexOf("function ambil"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "");
    expect(blok).not.toMatch(/\bpath\b|jalur|directory/i);
  });

  test("the composer still hands over the bare filename", () => {
    // webkitRelativePath carries directory structure when a FOLDER is picked.
    // It must not cross over, so the payload uses file.name.
    const ui = fs.readFileSync(
      path.join(AKAR, "public", "app", "Components.tsx"),
      "utf8",
    );
    const blok = ui.slice(ui.indexOf("const payload = {"));
    expect(blok.slice(0, blok.indexOf("};"))).toMatch(/name: file\.name/);
    expect(blok.slice(0, blok.indexOf("};"))).not.toMatch(/webkitRelativePath/);
  });
});
