// INFO — problems across the whole workspace.
//
// WHAT IT ADDS. A fourth tab beside TERMINAL / DEBUG / OUTPUT holding the
// project's TypeScript diagnostics, with a VERTICAL severity rail as its second
// layer: the tab strip says which panel you are in, the rail says which
// severity you are filtered to.
//
// WHY tsc AND NOT MONACO MARKERS. Monaco only has markers for models it has
// open, so a file nobody opened reports clean however broken it is. A panel
// that answers "no problems" on an unopened tree is worse than no panel, so the
// scan runs the compiler over the whole project instead.
//
// NOT VERIFIED IN A RUNNING WINDOW. The UI assertions below read source. The
// parser tests are real: they run the shipped function over real tsc output.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const baca = (p) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");

// Assertions must never read a comment that merely NAMES the thing being
// asserted — that has passed against absent code in this repo before.
const tanpaKomentar = (t) =>
  t
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((b) => !/^\s*\/\//.test(b))
    .join("\n");

const LAYAR = tanpaKomentar(baca("public/app/Screens.tsx"));
const SERVER = tanpaKomentar(baca("server.ts"));
const { uraiTsc: _uraiTsc } = require("../scripts/urai-tsc.ts");

describe("INFO diagnostics parser", () => {
  const akar = path.resolve("/proyek");

  test("reads file, position, severity, code and message out of one line", () => {
    const baris =
      path.join(akar, "src", "a.ts") +
      "(12,5): error TS2322: Type 'string' is not assignable to type 'number'.";
    const [d] = _uraiTsc(baris, akar);
    expect(d.file).toBe("src/a.ts");
    expect(d.line).toBe(12);
    expect(d.col).toBe(5);
    expect(d.severity).toBe("error");
    expect(d.code).toBe("TS2322");
    expect(d.message).toBe("Type 'string' is not assignable to type 'number'.");
  });

  test("warnings are kept as warnings, not folded into errors", () => {
    // The rail files them on separate rows, so the severity word is read from
    // the output rather than assumed to be "error".
    const baris = path.join(akar, "b.ts") + "(1,1): warning TS6133: unused.";
    expect(_uraiTsc(baris, akar)[0].severity).toBe("warning");
  });

  test("paths come back workspace-relative with forward slashes", () => {
    // The panel prints these; a backslash path and an absolute path are both
    // unreadable in a narrow docked column.
    const baris =
      path.join(akar, "deep", "nested", "c.tsx") +
      "(3,9): error TS1005: ';' expected.";
    expect(_uraiTsc(baris, akar)[0].file).toBe("deep/nested/c.tsx");
    expect(_uraiTsc(baris, akar)[0].file).not.toContain("\\");
  });

  test("non-diagnostic output is dropped, not turned into empty rows", () => {
    const keluaran = [
      "",
      "Found 2 errors in 1 file.",
      "  src/a.ts:12",
      path.join(akar, "a.ts") + "(1,1): error TS1: real.",
    ].join("\n");
    const hasil = _uraiTsc(keluaran, akar);
    expect(hasil).toHaveLength(1);
    expect(hasil[0].message).toBe("real.");
  });

  test("python codes are read by the same parser as typescript", () => {
    // pindai-python.py prints the tsc shape on purpose, so neither compiler
    // needs a parser of its own.
    const baris =
      path.join(akar, "uk.py") + "(1,7): error PY001: invalid syntax";
    const [d] = _uraiTsc(baris, akar);
    expect(d.code).toBe("PY001");
    expect(d.file).toBe("uk.py");
    expect(d.message).toBe("invalid syntax");
  });

  test("empty and null input yield an empty list, never a throw", () => {
    expect(_uraiTsc("", akar)).toEqual([]);
    expect(_uraiTsc(null, akar)).toEqual([]);
  });
});

describe("INFO endpoint", () => {
  test("the route exists and answers POST", () => {
    expect(SERVER).toMatch(
      /_path === "\/info\/diagnostics" && req\.method === "POST"/,
    );
  });

  test("tsc runs as NODE, not as a second app window", () => {
    // process.execPath is electron.exe in this process. Without the flag the
    // spawn opens another Electron instance instead of running the compiler.
    expect(SERVER).toMatch(/ELECTRON_RUN_AS_NODE: "1"/);
  });

  test("concurrent callers share one scan instead of being refused", () => {
    // The file tree and the terminal tab can ask at the same moment. A "busy"
    // answer to whichever asked second would make it look broken for a result
    // the first is already computing.
    expect(SERVER).toMatch(/const berjalan = _infoJalan\.get\(akar\)/);
    expect(SERVER).toMatch(/if \(berjalan\) return berjalan/);
  });

  test("a failed scan does not pin a rejected promise on the root", () => {
    // Without the clear, one failure would replay itself for every later scan
    // of that workspace.
    expect(SERVER).toMatch(/_infoJalan\.delete\(akar\)/);
  });

  test("an unchosen workspace is not an error", () => {
    // The panel scans on mount, before a workspace may exist. Answering 400
    // there made the browser log a failed request on every launch -- caught by
    // tests/render-hidup.test.ts, which watches the console.
    expect(SERVER).toMatch(/note: "no workspace to scan"/);
    // Scoped to the INFO route. It used to read the whole file, which was
    // fine until another endpoint had an honest reason to reject a bad root
    // with that same message -- /ww/impor does, and the rule here was never
    // about the phrase existing anywhere in server.ts.
    const blok = SERVER.match(
      /_path === "\/info\/diagnostics"[\s\S]*?\n    return;\n  \}/,
    );
    expect(blok).toBeTruthy();
    expect(blok![0]).not.toMatch(/error: "root is not a directory"/);
  });

  test("python is scanned as well as typescript", () => {
    expect(SERVER).toMatch(/pindai-python\.py/);
    expect(SERVER).toMatch(/findPythonAsync\(\)/);
  });

  test("a project without tsconfig is still scanned for python", () => {
    // The note says TypeScript was skipped; it must not abandon the whole scan.
    expect(SERVER).toMatch(/no tsconfig\.json, so TypeScript was not checked/);
  });

  test("a non-zero exit is not treated as failure", () => {
    // A compiler exits non-zero whenever it found anything at all, which is the
    // ordinary case here. The error is ignored by name and what it PRINTED is
    // taken as the result.
    expect(SERVER).toMatch(/\(_err: any, stdout: any, stderr: any\)/);
    expect(SERVER).toMatch(
      /resolve\(String\(stdout \|\| ""\) \+ String\(stderr \|\| ""\)\)/,
    );
  });
});

describe("INFO panel", () => {
  test("INFO is a fourth tab in the terminal tab group", () => {
    expect(LAYAR).toMatch(/setActiveTab\("INFO"\)/);
    expect(LAYAR).toMatch(/<span>INFO<\/span>/);
  });

  test("severity tiers are ordered worst first", () => {
    const m = LAYAR.match(/const TINGKAT_INFO = \[([\s\S]*?)\];/);
    expect(m).toBeTruthy();
    const urutan = [...m[1].matchAll(/kunci: "(\w+)"/g)].map((x) => x[1]);
    expect(urutan).toEqual(["error", "warning", "info"]);
  });

  test("the rail is the second layer and it is vertical", () => {
    const m = LAYAR.match(
      /display: activeTab === "INFO" \? "flex" : "none",[\s\S]*?TINGKAT_INFO\.map/,
    );
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/flexDirection: "column"/);
    expect(m[0]).toMatch(/borderRight/);
  });

  test("clicking the lit tier clears the filter rather than stranding it", () => {
    expect(LAYAR).toMatch(/setInfoSaring\(aktif \? "all" : t\.kunci\)/);
  });

  test("an unscanned panel never claims the workspace is clean", () => {
    expect(LAYAR).toMatch(/infoPernah && !infoSibuk && infoDiag\.length === 0/);
  });

  test("the scan is not continuous", () => {
    // Once on first open, then on request. tsc on every keystroke is how a
    // problems panel becomes the reason the app stutters.
    expect(LAYAR).toMatch(/activeTab === "INFO" && !infoPernah && !infoSibuk/);
    const blok = LAYAR.match(/async function pindaiInfo\(\)[\s\S]*?\n  \}/);
    expect(blok).toBeTruthy();
    expect(blok[0]).not.toMatch(/setInterval/);
  });

  test("the workspace root is derived in ONE place", () => {
    // The MCP command resolution drifted between Components and Screens by
    // being written twice; this rule is written once.
    expect(LAYAR).toMatch(/function akarProyek\(proyek: any\)/);
    expect(LAYAR).toMatch(/akarProyek\(selectedProject\)/);
  });
});

describe("file tree marks", () => {
  const APP = tanpaKomentar(baca("public/app.tsx"));

  test("the tree is handed a tally, not the raw list", () => {
    // Hundreds of rows each filtering the whole diagnostics array turns one
    // pass into a quadratic one.
    expect(APP).toMatch(/const tandaBerkas = useMemo\(/);
    expect(APP).toMatch(/tanda=\{tandaBerkas\}/);
  });

  test("worst severity wins and only one mark is shown", () => {
    const m = APP.match(
      /function tandaBaris\(tanda: any, rel: any\)[\s\S]*?\n\}/,
    );
    expect(m).toBeTruthy();
    const urutan = [...m[0].matchAll(/if \(t\.(\w+)\)/g)].map((x) => x[1]);
    expect(urutan).toEqual(["error", "warning", "info"]);
  });

  test("a row with no diagnostics keeps its own colour", () => {
    // `undefined` rather than a default, so an unmarked row is untouched.
    expect(APP).toMatch(/color: tk \? tk\.warna : undefined/);
  });

  test("the mark is looked up once per row", () => {
    expect(APP).toMatch(/const tk = tandaBaris\(tanda, n\.rel\)/);
  });

  test("a write re-scans; the workspace alone is not enough", () => {
    // Tying the scan to the workspace meant breaking a file on purpose
    // produced nothing at all until reload -- which is exactly how the panel
    // was first reported as dead.
    expect(APP).toMatch(/wolfspace_berkas_tersimpan/);
    expect(APP).toMatch(
      /window\.addEventListener\("wolfspace_agent_act", onAgent\)/,
    );
  });

  test("a burst of writes collapses into one scan", () => {
    // The agent writes in bursts; one compiler run per file is how this panel
    // would become the reason the app stutters.
    const m = APP.match(/const jadwalkan = \(\) => \{[\s\S]*?\};/);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/clearTimeout\(jam\)/);
    expect(m[0]).toMatch(/setTimeout\(\(\) => pindaiDiagnostik\(\), \d+\)/);
  });

  test("the editor announces its saves", () => {
    // INFO lives in another component entirely; nothing else would tell it.
    expect(APP).toMatch(/new CustomEvent\("wolfspace_berkas_tersimpan"/);
  });

  test("marks come from the compilers, not from Monaco", () => {
    // Monaco has markers only for models it has open, which would leave every
    // unopened file looking clean however broken it is.
    expect(APP).toMatch(/fetch\("\/info\/diagnostics"/);
  });
});

describe("python scanner", () => {
  const { execFileSync } = require("child_process");
  const os = require("os");

  const jalankan = (isi) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "info-py-"));
    fs.writeFileSync(path.join(dir, "uk.py"), isi, "utf8");
    try {
      return execFileSync(
        "python",
        [path.join(AKAR, "scripts", "pindai-python.py"), dir],
        { encoding: "utf8", timeout: 30000 },
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  test("a syntax error is reported in the tsc line shape", () => {
    const keluaran = jalankan("def f(:\n    return 1\n");
    expect(keluaran).toMatch(/uk\.py\(1,\d+\): error PY001: /);
  });

  test("a file that parses cleanly reports nothing", () => {
    // Silence here means "parsed", NOT "checked" -- there is no linter on this
    // machine and compile() sees syntax only.
    expect(jalankan("def g():\n    return 1\n").trim()).toBe("");
  });

  test("the output feeds straight into the shared parser", () => {
    const keluaran = jalankan("def f(:\n    return 1\n");
    const d = _uraiTsc(keluaran, AKAR);
    expect(d).toHaveLength(1);
    expect(d[0].severity).toBe("error");
    expect(d[0].code).toBe("PY001");
  });
});
