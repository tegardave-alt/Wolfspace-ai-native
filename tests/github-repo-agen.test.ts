// Whether the agent can actually SEE the repository the user linked.
//
// ── THE GAP THIS CLOSES ──────────────────────────────────────────────────────
//
// Reported by the user: "the agent does not recognise the connected repo, it
// only knows where it is now". That was exactly right, and checking it found
// three separate reasons, all of them structural:
//
//   1. agent/github.ts was required by ONE file — server/routes/github.ts, the
//      panel's own routes. Nothing under agent/ referenced it, so the link was
//      unreachable from the side that needed it.
//   2. There was no tool. agent/tools/tool-definitions.ts had no github entry
//      at all, so even a model that knew about the link had no way to read it.
//   3. The system prompt never mentioned it. The prompt is SELF_FC_SYS +
//      SELF_FC_PRINCIPLES + the effort block + the history digest; the only
//      place the agent was ever told where anything is was the workspace
//      confinement notice — hence "it only knows where it is now".
//
// So linking a repository wrote a line into github.json and changed nothing
// about what the agent could do. These tests pin all three.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));

const GH = require(path.join(AKAR, "agent", "github.ts"));
const ALAT = require(path.join(AKAR, "agent", "tools", "index.ts"));
const SUMBER_AGEN = fs.readFileSync(
  path.join(AKAR, "agent", "self_agent.ts"),
  "utf8",
);
const SUMBER_GH = fs.readFileSync(
  path.join(AKAR, "agent", "github.ts"),
  "utf8",
);

const def = () =>
  (ALAT.SELF_TOOLS || []).find(
    (t: any) => t.function && t.function.name === "github_repo",
  );

describe("alat github_repo ada dan sampai ke model", () => {
  test("it is in the tool set", () => {
    expect(def()).toBeTruthy();
  });

  test("getToolDefs carries it, which is what the model is sent", () => {
    // SELF_TOOLS alone proves nothing: getToolDefs is what the run uses, and it
    // is async — a test that forgot to await it would pass on a Promise.
    return ALAT.getToolDefs().then((d: any[]) => {
      expect(Array.isArray(d)).toBe(true);
      expect(
        d.some((t: any) => t.function && t.function.name === "github_repo"),
      ).toBe(true);
    });
  });

  test("its description says it is NOT the workspace", () => {
    // The whole failure was the agent treating one place as the only place. A
    // description that just said "read a GitHub repo" would leave the model to
    // guess which of the two it is looking at.
    const d = def().function.description;
    expect(d).toMatch(/NOT the local workspace/);
    expect(d).toMatch(/read\/grep\/glob\/list/);
    expect(d).toMatch(/READ ONLY/);
  });

  test("it cannot be pointed at another repository", () => {
    // owner/repo/branch come from github.json, never from the model. Accepting
    // them as parameters would turn a linked-repo reader into a general GitHub
    // reader for any repo the token can reach.
    const p = def().function.parameters.properties;
    expect(Object.keys(p).sort()).toEqual(
      ["batas", "jalur", "kueri", "operasi"].sort(),
    );
    expect(p).not.toHaveProperty("owner");
    expect(p).not.toHaveProperty("repo");
    expect(p).not.toHaveProperty("branch");
  });

  test("it counts as read-only, so it needs no action plan", () => {
    const blok = SUMBER_AGEN.slice(SUMBER_AGEN.indexOf("READ_ONLY_TOOLS = ["));
    expect(blok.slice(0, blok.indexOf("]"))).toContain('"github_repo"');
  });
});

describe("prompt sistem menyebut repo yang tertaut", () => {
  test("the link is named, and only when there is one", () => {
    // A tool the model is never told about is a tool it does not reach for.
    const i = SUMBER_AGEN.indexOf("[LINKED GITHUB REPOSITORY]");
    expect(i).toBeGreaterThan(0);
    const sekitar = SUMBER_AGEN.slice(i - 900, i + 700);
    expect(sekitar).toMatch(/_tautGh\.tersambung && _tautGh\.taut/);
    expect(sekitar).toMatch(/github_repo/);
  });

  test("a missing link never breaks a run", () => {
    // No credentials file at all is the normal state for a fresh install.
    const i = SUMBER_AGEN.indexOf("[LINKED GITHUB REPOSITORY]");
    expect(SUMBER_AGEN.slice(i, i + 1400)).toMatch(/catch \(_\)/);
  });
});

describe("dispatcher menjalankan ketiga operasi", () => {
  // Only meaningful with a real connection; a unit test must not invent one.
  const tersambung = GH.keadaan().tersambung && GH.keadaan().taut;

  test("an unknown operation is refused by name", async () => {
    const r = await ALAT.runSelfTool("github_repo", { operasi: "ngawur" });
    expect(JSON.stringify(r)).toMatch(/unknown github_repo operation/);
  });

  test("pohon lists the linked repository", async () => {
    if (!tersambung) return;
    const r: any = await ALAT.runSelfTool("github_repo", {
      operasi: "pohon",
      batas: 5,
    });
    expect(r.repo).toBe(GH.keadaan().taut.owner + "/" + GH.keadaan().taut.repo);
    expect(r.branch).toBe(GH.keadaan().taut.branch);
    expect(Array.isArray(r.berkas)).toBe(true);
  });

  test("baca returns file text from that repository", async () => {
    if (!tersambung) return;
    const t: any = await ALAT.runSelfTool("github_repo", {
      operasi: "pohon",
      batas: 50,
    });
    const teks = (t.berkas || []).find((f: any) =>
      /\.(md|txt|json|ts|js|py)$/i.test(f.jalur),
    );
    if (!teks) return;
    const r: any = await ALAT.runSelfTool("github_repo", {
      operasi: "baca",
      jalur: teks.jalur,
    });
    expect(r.jalur).toBe(teks.jalur);
    expect(typeof r.isi).toBe("string");
  });
});

describe("menolak dengan jelas saat tak ada tautan", () => {
  test("it says what the user has to do, in a clean install", () => {
    // Run in a CHILD process with the keys directory pointed at an empty temp
    // folder. Doing this in-process would mean reading — or worse, writing —
    // the developer's real github.json.
    const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "gh-uji-"));
    const skrip =
      "require(" +
      JSON.stringify(path.join(AKAR, "scripts", "ts-register.cjs")) +
      ");" +
      "const G=require(" +
      JSON.stringify(path.join(AKAR, "agent", "github.ts")) +
      ");" +
      "G.daftarBerkas().then(()=>console.log('NO-ERROR'))" +
      ".catch(e=>console.log('ERR:'+e.message));";
    const keluar = execFileSync(process.execPath, ["-e", skrip], {
      env: { ...process.env, WOLFSPACE_KEYS_DIR: dir },
      encoding: "utf8",
      timeout: 60000,
    });
    expect(keluar).toMatch(/ERR:not connected/);
  });
});

describe("hanya membaca", () => {
  test("the reading functions write nothing", () => {
    // The panel's own functions still write github.json; the READING half must
    // not, or a question about the repo could change stored state.
    // Bounded at the first WRITER that follows. gantiNamaRepo and hapusRepo
    // were later added between these functions and the link recorder, and they
    // do call tulis() — by design. This test is about the READING half.
    const blok = SUMBER_GH.slice(
      SUMBER_GH.indexOf("function _tautWajib"),
      SUMBER_GH.indexOf("async function gantiNamaRepo"),
    );
    expect(blok).not.toMatch(/tulis\(/);
    expect(blok).not.toMatch(/writeFileSync/);
    // GET only: no method is passed, and panggil defaults to GET.
    expect(blok).not.toMatch(/metode: "(POST|PUT|PATCH|DELETE)"/);
  });

  test("a truncated tree is reported, not silently shortened", () => {
    // A partial listing presented as complete would have the agent conclude a
    // file does not exist when it simply did not fit in the response.
    const blok = SUMBER_GH.slice(
      SUMBER_GH.indexOf("async function daftarBerkas"),
    );
    expect(blok).toMatch(/dipotongGitHub: Boolean\(j\.truncated\)/);
    expect(blok).toMatch(/dipotongDiSini/);
  });

  test("an unreadable file is named rather than returned empty", () => {
    // GitHub answers over 1 MB with an EMPTY content field, not an error, so
    // the naive path returns "" and the agent reads it as a blank file.
    const blok = SUMBER_GH.slice(
      SUMBER_GH.indexOf("async function bacaBerkas"),
    );
    expect(blok).toMatch(/1 MB limit/);
    expect(blok).toMatch(/binary file/);
    expect(blok).toMatch(/is a directory/);
  });
});
