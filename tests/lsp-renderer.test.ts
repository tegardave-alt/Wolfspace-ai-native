// The renderer's half of LSP: the conversions between Monaco and the protocol.
//
// WHY THESE ARE TESTED AND NOT JUST WRITTEN. Every rule here fails SILENTLY
// when it is wrong, which is the worst kind of wrong an editor can have:
//
//   • Monaco counts lines and columns from ONE, LSP counts from ZERO. Off by
//     one and hover answers about the character before the cursor, definition
//     lands a line early, and a diagnostic underlines the wrong word. Nothing
//     throws, nothing logs.
//   • DiagnosticSeverity runs the OPPOSITE WAY in the two systems: LSP has
//     Error=1 and Hint=4, Monaco has Hint=1 and Error=8. Passing the number
//     straight through turns every error into a hint — which renders as
//     nothing at all.
//   • CompletionItemKind is a different order again: LSP 3 is Function, Monaco
//     3 is Field. Every completion gets a plausible, wrong icon.
//
// The functions are taken FROM THE SOURCE and run through the same Babel
// transform index.html uses, rather than restated here according to my reading
// of them — so editing Lsp.ts changes what this file measures.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const S = require("../core/lsp-session.ts");

globalThis.self = globalThis;
const Babel = require(path.join(AKAR, "public/vendor/babel.min.js"));
const kode = Babel.transform(
  fs.readFileSync(path.join(AKAR, "public/app/Lsp.ts"), "utf8"),
  { presets: ["typescript"], filename: "/app/Lsp.ts" },
).code;

const L = new Function(
  "wwApi",
  kode +
    "\n; return { toLspPosition, toMonacoRange, severityName," +
    " completionKindName, hoverToMarkdown, toLocationList, uriToLocalPath," +
    " COMPLETION_KINDS };",
)(async () => null);

describe("counting from one, counting from zero", () => {
  test("a Monaco position loses one from each number", () => {
    expect(L.toLspPosition({ lineNumber: 1, column: 1 })).toEqual({
      line: 0,
      character: 0,
    });
    expect(L.toLspPosition({ lineNumber: 12, column: 5 })).toEqual({
      line: 11,
      character: 4,
    });
  });

  test("an LSP range gains one on each number", () => {
    expect(
      L.toMonacoRange({
        start: { line: 0, character: 0 },
        end: { line: 2, character: 7 },
      }),
    ).toEqual({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 3,
      endColumn: 8,
    });
  });

  test("the two are inverses", () => {
    for (const [line, column] of [
      [1, 1],
      [3, 17],
      [400, 2],
    ]) {
      const lsp = L.toLspPosition({ lineNumber: line, column });
      const back = L.toMonacoRange({ start: lsp, end: lsp });
      expect([back.startLineNumber, back.startColumn]).toEqual([line, column]);
    }
  });

  test("nothing goes negative, whatever arrives", () => {
    // Monaco has handed 0 to a provider before now; a negative LSP position is
    // a protocol error some servers answer by closing the connection.
    expect(L.toLspPosition({ lineNumber: 0, column: 0 })).toEqual({
      line: 0,
      character: 0,
    });
    expect(L.toLspPosition(null)).toEqual({ line: 0, character: 0 });
    expect(L.toLspPosition({})).toEqual({ line: 0, character: 0 });
  });

  test("a missing range does not become NaN", () => {
    const r = L.toMonacoRange(null);
    for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("severity, which runs the opposite way", () => {
  test("LSP 1 is an Error, not a Hint", () => {
    // The bug this exists for: Monaco's 1 IS Hint.
    expect(L.severityName(1)).toBe("Error");
    expect(L.severityName(2)).toBe("Warning");
    expect(L.severityName(3)).toBe("Info");
    expect(L.severityName(4)).toBe("Hint");
  });

  test("an absent severity is an error, as the specification says", () => {
    // "If omitted it is up to the client to interpret diagnostics as error,
    // warning, info or hint" — and the safe reading is the loudest one.
    expect(L.severityName(undefined)).toBe("Error");
    expect(L.severityName(null)).toBe("Error");
    expect(L.severityName(99)).toBe("Error");
  });
});

describe("completion kinds, which are a different order", () => {
  test("LSP 3 is a Function, whatever Monaco's 3 is", () => {
    expect(L.completionKindName(3)).toBe("Function");
    expect(L.completionKindName(1)).toBe("Text");
    expect(L.completionKindName(5)).toBe("Field");
    expect(L.completionKindName(25)).toBe("TypeParameter");
  });

  test("the table is the LSP table, complete and in order", () => {
    // 25 kinds, 1..25. A gap would shift every kind after it.
    expect(L.COMPLETION_KINDS).toHaveLength(25);
    expect(L.COMPLETION_KINDS[0]).toBe("Text");
    expect(L.COMPLETION_KINDS[24]).toBe("TypeParameter");
    expect(new Set(L.COMPLETION_KINDS).size).toBe(25); // no duplicates
  });

  test("an unknown kind is Text, not undefined", () => {
    // `monaco.languages.CompletionItemKind[undefined]` is undefined, and Monaco
    // draws no icon at all for it.
    expect(L.completionKindName(0)).toBe("Text");
    expect(L.completionKindName(99)).toBe("Text");
    expect(L.completionKindName(null)).toBe("Text");
  });
});

describe("hover contents, in all four legal shapes", () => {
  test("a plain string", () => {
    expect(L.hoverToMarkdown("halo")).toBe("halo");
  });

  test("MarkupContent, which is what modern servers send", () => {
    expect(L.hoverToMarkdown({ kind: "markdown", value: "**a**" })).toBe(
      "**a**",
    );
  });

  test("a language/value pair becomes a fenced block", () => {
    // Otherwise the code is rendered as prose, unformatted.
    expect(L.hoverToMarkdown({ language: "go", value: "func a()" })).toBe(
      "```go\nfunc a()\n```",
    );
  });

  test("an array is joined with a rule between the parts", () => {
    const out = L.hoverToMarkdown(["satu", { language: "go", value: "b" }]);
    expect(out).toContain("satu");
    expect(out).toContain("```go");
    expect(out).toContain("---");
  });

  test("nothing at all is an empty string, never 'undefined'", () => {
    expect(L.hoverToMarkdown(null)).toBe("");
    expect(L.hoverToMarkdown(undefined)).toBe("");
    expect(L.hoverToMarkdown({})).toBe("");
  });
});

describe("definition results, in all three legal shapes", () => {
  const range = {
    start: { line: 1, character: 2 },
    end: { line: 1, character: 5 },
  };

  test("a single Location", () => {
    expect(L.toLocationList({ uri: "file:///a.go", range })).toEqual([
      { uri: "file:///a.go", range },
    ]);
  });

  test("an array of Locations", () => {
    expect(
      L.toLocationList([
        { uri: "file:///a.go", range },
        { uri: "file:///b.go", range },
      ]),
    ).toHaveLength(2);
  });

  test("LocationLink, which names its fields differently", () => {
    // rust-analyzer and gopls answer with this shape. Reading `uri`/`range` on
    // it gives undefined, and the jump silently does nothing.
    const out = L.toLocationList([
      {
        targetUri: "file:///a.rs",
        targetRange: range,
        targetSelectionRange: range,
      },
    ]);
    expect(out).toEqual([{ uri: "file:///a.rs", range }]);
  });

  test("null, and entries missing half of themselves, are dropped", () => {
    expect(L.toLocationList(null)).toEqual([]);
    expect(L.toLocationList([null, { uri: "file:///a" }, { range }])).toEqual(
      [],
    );
  });
});

describe("the two halves must agree about what a file is called", () => {
  test("the renderer's uriToLocalPath inverts the backend's pathToUri", () => {
    // The backend builds the URI, the renderer reads it back to open the file a
    // go-to-definition landed in. Two implementations of one rule, on opposite
    // sides of an IPC boundary — so they are driven over the same inputs here.
    const win = process.platform === "win32";
    const cases = win
      ? ["C:/Users/dave/a.ts", "C:/my folder/a#b.go", "C:/proyék/日本語.rs"]
      : ["/home/dave/a.ts", "/home/my folder/a#b.go", "/proyék/日本語.rs"];
    for (const c of cases) {
      const abs = path.resolve(c);
      const uri = S.pathToUri(abs);
      // The renderer answers with forward slashes; compare on those terms.
      expect(L.uriToLocalPath(uri).replace(/\\/g, "/")).toBe(
        abs.replace(/\\/g, "/"),
      );
    }
  });

  test("something that is not a file URI yields nothing", () => {
    expect(L.uriToLocalPath("inmemory://model/1")).toBe("");
    expect(L.uriToLocalPath("")).toBe("");
  });
});

describe("installing the providers", () => {
  /** A Monaco stand-in that records what was registered against it. */
  function fakeMonaco() {
    const reg: any = {
      hover: [],
      definition: [],
      references: [],
      completion: [],
    };
    return {
      _reg: reg,
      languages: {
        registerHoverProvider: (l: any) => reg.hover.push(l),
        registerDefinitionProvider: (l: any) => reg.definition.push(l),
        registerReferenceProvider: (l: any) => reg.references.push(l),
        registerCompletionItemProvider: (l: any) => reg.completion.push(l),
        CompletionItemKind: { Text: 18, Function: 1 },
      },
      editor: {
        onDidCreateModel: () => {},
        onWillDisposeModel: () => {},
        getModels: () => [],
        setModelMarkers: () => {},
      },
      MarkerSeverity: { Error: 8, Warning: 4, Info: 2, Hint: 1 },
    };
  }

  /** A fresh copy of the module, with wwApi and window supplied. */
  function freshModule(status: any) {
    const win: any = {};
    const mod = new Function(
      "wwApi",
      "window",
      kode + "\n; return { installLsp };",
    )(async () => status, win);
    return { mod, win };
  }

  const STATUS = {
    ok: true,
    servers: [
      { id: "python", languages: ["python"], available: true, install: "x" },
      { id: "go", languages: ["go"], available: false, install: "y" },
    ],
  };

  test("providers are registered for KNOWN languages, installed or not", async () => {
    // Registering only for the installed ones would mean installing gopls does
    // nothing until the app is restarted.
    const { mod } = freshModule(STATUS);
    const monaco = fakeMonaco();
    await mod.installLsp(monaco);
    for (const kind of ["hover", "definition", "references", "completion"])
      expect(monaco._reg[kind][0].sort()).toEqual(["go", "python"]);
  });

  test("only INSTALLED languages are taken over from the built-in providers", async () => {
    // index.html's Jedi providers read this and stand down. Marking `go` here
    // would silence nothing, but marking a language whose server is missing
    // would silence a provider that still works.
    const { mod, win } = freshModule(STATUS);
    await mod.installLsp(fakeMonaco());
    expect([...win.__lspAmbilAlih]).toEqual(["python"]);
  });

  test("a backend that answers nothing registers nothing", async () => {
    const { mod, win } = freshModule(null);
    const monaco = fakeMonaco();
    await mod.installLsp(monaco);
    expect(monaco._reg.hover).toHaveLength(0);
    expect(win.__lspAmbilAlih).toBeUndefined();
  });
});

describe("the built-in Python providers stand down for a real server", () => {
  const html = fs
    .readFileSync(path.join(AKAR, "public", "index.html"), "utf8")
    .split("\n")
    .filter((b: string) => !b.trim().startsWith("//"))
    .join("\n");

  test("pyMinta checks the takeover flag before asking Jedi", () => {
    const i = html.indexOf("function pyMinta(");
    expect(i).toBeGreaterThan(-1);
    // Inside pyMinta, so all three providers are covered by one check.
    expect(html.slice(i, i + 400)).toMatch(
      /__lspAmbilAlih[\s\S]{0,60}has\("python"\)/,
    );
  });
});

describe("the language-server strip in the INFO panel", () => {
  // Line-wise, because a naive block-comment strip eats code: a "/*" inside a
  // line comment opens a phantom comment. That exact mistake cost 18 red tests
  // in this repo today.
  const src = (() => {
    const raw = fs.readFileSync(
      path.join(AKAR, "public", "app", "Screens.tsx"),
      "utf8",
    );
    const out: string[] = [];
    let inBlock = false;
    for (const line of raw.split("\n")) {
      const t = line.trim();
      const closes = t.endsWith("*/") || t.endsWith("*/}");
      if (inBlock) {
        if (closes) inBlock = false;
        continue;
      }
      if (t.startsWith("//")) continue;
      if (t.startsWith("/*") || t.startsWith("{/*")) {
        if (!closes) inBlock = true;
        continue;
      }
      out.push(line);
    }
    return out.join("\n");
  })();

  test("the strip is rendered inside the INFO panel", () => {
    // Without this the whole registry is invisible, which is the bug it exists
    // for: nine languages supported, and no way to see that any of them were.
    expect(src).toMatch(
      /<LanguageServerBar akar=\{akarProyek\(selectedProject\)\} \/>/,
    );
  });

  test("it reads the backend's registry rather than listing languages itself", () => {
    const i = src.indexOf("function LanguageServerBar");
    expect(i).toBeGreaterThan(-1);
    const body = src.slice(i, i + 3000);
    expect(body).toMatch(/wwApi\(\s*"\/lsp\/status\?root="/);
    // A second copy of the language list here is exactly how this repo has
    // produced drift before.
    expect(body).not.toMatch(/"python"|"typescript"|"rust"/);
  });

  test("a missing server shows the command that installs it", () => {
    // A panel that reports "not installed" and stops is a dead end.
    const i = src.indexOf("function LanguageServerBar");
    const body = src.slice(i, i + 4000);
    expect(body).toMatch(/r\.install/);
    expect(body).toMatch(/clipboard\.writeText/);
  });

  test("opening it re-reads, so a fresh install shows without a restart", () => {
    const i = src.indexOf("function LanguageServerBar");
    const body = src.slice(i, i + 2500);
    expect(body).toMatch(/if \(!open\) muat\(\)/);
  });
});
