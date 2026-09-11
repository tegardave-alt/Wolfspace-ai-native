// The green and red marks the editor shows after the agent writes a file.
//
// TWO THINGS THIS FIXES, and the second one was a real hazard rather than a
// missing nicety:
//
//   1. Nothing was shown. A tool call scrolled past in the chat and the user had
//      no way to see what it did to the code in front of them.
//   2. THE BUFFER WENT STALE. Models are cached by path and nothing reloaded
//      them, so after an agent edit the editor still held the OLD text — and a
//      manual save afterwards would have written that stale text back over the
//      agent's work.
//
// The diff itself is a pure function and is tested as one, because every way it
// can be wrong is silent: an off-by-one paints the line above the one that
// changed, and a wrong hunk boundary paints half a function green. Nothing
// throws either way.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");

globalThis.self = globalThis;
const Babel = require(path.join(AKAR, "public/vendor/babel.min.js"));
const kode = Babel.transform(
  fs.readFileSync(path.join(AKAR, "public/app/AgentDiff.ts"), "utf8"),
  { presets: ["typescript"], filename: "/app/AgentDiff.ts" },
).code;

const D = new Function(
  "window",
  "fetch",
  "uriToLocalPath",
  kode +
    "\n; return { diffLines, pickModelPath, applyAgentHighlights," +
    " clearAgentMarks, watchEditorForDismiss, DIFF_MAX_LINES };",
)(
  { addEventListener() {} },
  async () => ({ ok: false }),
  (u: string) => u,
);

const teks = (...baris: string[]) => baris.join("\n");

describe("which lines changed", () => {
  test("identical files have no hunks at all", () => {
    // Not an empty hunk — none. An agent tool that reports a write without
    // changing anything must leave the editor untouched.
    expect(D.diffLines("a\nb\nc", "a\nb\nc")).toEqual([]);
    expect(D.diffLines("", "")).toEqual([]);
  });

  test("one line added in the middle", () => {
    const h = D.diffLines(teks("a", "b", "c"), teks("a", "BARU", "b", "c"));
    expect(h).toHaveLength(1);
    expect(h[0].added).toBe(1);
    expect(h[0].removed).toBe(0);
    // 1-BASED, as Monaco counts. Zero-based here would paint the line above.
    expect(h[0].startLine).toBe(2);
    expect(h[0].endLine).toBe(2);
  });

  test("one line removed leaves a mark where it used to be", () => {
    // A removal has no line of its own in the new file. Reporting nothing would
    // mean deleting code leaves no trace at all.
    const h = D.diffLines(teks("a", "b", "c"), teks("a", "c"));
    expect(h).toHaveLength(1);
    expect(h[0].removed).toBe(1);
    expect(h[0].added).toBe(0);
    expect(h[0].startLine).toBe(2);
  });

  test("a replaced line is both, in one hunk", () => {
    const h = D.diffLines(teks("a", "b", "c"), teks("a", "B", "c"));
    expect(h).toHaveLength(1);
    expect(h[0].added).toBe(1);
    expect(h[0].removed).toBe(1);
    expect(h[0].startLine).toBe(2);
    expect(h[0].endLine).toBe(2);
  });

  test("two separate edits are two hunks, not one big one", () => {
    // The prefix/suffix trim alone would report one hunk spanning both and
    // paint everything between them green.
    const h = D.diffLines(
      teks("a", "b", "c", "d", "e", "f", "g"),
      teks("a", "B", "c", "d", "e", "F", "g"),
    );
    expect(h).toHaveLength(2);
    expect(h[0].startLine).toBe(2);
    expect(h[1].startLine).toBe(6);
  });

  test("appending to the end", () => {
    const h = D.diffLines(teks("a", "b"), teks("a", "b", "c", "d"));
    expect(h).toHaveLength(1);
    expect(h[0].added).toBe(2);
    expect(h[0].startLine).toBe(3);
    expect(h[0].endLine).toBe(4);
  });

  test("prepending to the start", () => {
    const h = D.diffLines(teks("b", "c"), teks("a", "b", "c"));
    expect(h).toHaveLength(1);
    expect(h[0].added).toBe(1);
    expect(h[0].startLine).toBe(1);
  });

  test("a brand new file is all additions", () => {
    const h = D.diffLines("", teks("a", "b", "c"));
    expect(h).toHaveLength(1);
    expect(h[0].added).toBeGreaterThanOrEqual(3);
    expect(h[0].startLine).toBe(1);
  });

  test("emptying a file is all removals, and still marks line 1", () => {
    const h = D.diffLines(teks("a", "b", "c"), "");
    expect(h).toHaveLength(1);
    expect(h[0].removed).toBeGreaterThanOrEqual(3);
    expect(h[0].startLine).toBe(1);
  });

  test("every reported line actually exists in the new file", () => {
    // The invariant that keeps Monaco from being handed a line it does not
    // have. Checked over a spread of shapes rather than one.
    const kasus = [
      [teks("a", "b", "c"), teks("a")],
      [teks("a"), teks("a", "b", "c")],
      [teks("x", "y"), teks("y", "x")],
      [teks("a", "b", "c", "d"), teks("d", "c", "b", "a")],
      ["", "satu"],
      ["satu", ""],
    ];
    for (const [sebelum, sesudah] of kasus) {
      const total = String(sesudah).split("\n").length;
      for (const h of D.diffLines(sebelum, sesudah)) {
        expect(h.startLine).toBeGreaterThanOrEqual(1);
        expect(h.startLine).toBeLessThanOrEqual(total);
        if (h.added > 0) {
          expect(h.endLine).toBeLessThanOrEqual(total);
          expect(h.endLine).toBeGreaterThanOrEqual(h.startLine);
        }
      }
    }
  });

  test("a huge rewrite falls back to one coarse hunk instead of a huge table", () => {
    // A precise diff of a 5,000-line rewrite costs 25 million cells to say
    // something the user can already see.
    const besar = (n: number, p: string) =>
      Array.from({ length: n }, (_, i) => p + i).join("\n");
    const n = D.DIFF_MAX_LINES + 50;
    const t0 = Date.now();
    const h = D.diffLines(besar(n, "lama"), besar(n, "baru"));
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(h).toHaveLength(1);
    expect(h[0].startLine).toBe(1);
  });
});

describe("which open buffer the agent meant", () => {
  const uris = ["/c:/proj/src/a.py", "/c:/proj/b.ts", "/c:/lain/src/a.py"];

  test("an exact path matches", () => {
    expect(D.pickModelPath(uris, "/c:/proj/b.ts")).toBe("/c:/proj/b.ts");
  });

  test("a relative path matches the one buffer that ends with it", () => {
    expect(D.pickModelPath(uris, "b.ts")).toBe("/c:/proj/b.ts");
    expect(D.pickModelPath(uris, "proj/src/a.py")).toBe("/c:/proj/src/a.py");
  });

  test("Windows separators and case do not matter", () => {
    expect(D.pickModelPath(uris, "PROJ\\B.TS")).toBe("/c:/proj/b.ts");
  });

  test("an AMBIGUOUS path matches nothing", () => {
    // Two buffers end with src/a.py. Decorating the wrong file is worse than
    // decorating none, so it answers with nothing rather than guessing.
    expect(D.pickModelPath(uris, "src/a.py")).toBe("");
  });

  test("a path no buffer has matches nothing", () => {
    expect(D.pickModelPath(uris, "tidak-ada.py")).toBe("");
    expect(D.pickModelPath(uris, "")).toBe("");
    expect(D.pickModelPath([], "b.ts")).toBe("");
  });
});

describe("what gets painted", () => {
  /** A Monaco stand-in that records the decorations it was given. */
  function fakeMonaco() {
    const dibuat: any[] = [];
    return {
      _dibuat: dibuat,
      Range: function (a: number, b: number, c: number, d: number) {
        return {
          startLineNumber: a,
          startColumn: b,
          endLineNumber: c,
          endColumn: d,
        };
      } as any,
      editor: { OverviewRulerLane: { Left: 1 } },
    };
  }
  // THE FAKE HAS EXACTLY THE METHODS A MONACO TEXT MODEL HAS, and no more.
  //
  // The first version of this stub carried `createDecorationsCollection`,
  // because that is what I believed a model offered. It does not — that method
  // belongs to the editor — so the stub validated my mistake and the app
  // crashed with "model.createDecorationsCollection is not a function" the
  // first time the agent wrote a file. A stub built to a belief tests the
  // belief. The real API is asserted against the vendored bundle below.
  function fakeModel(lines: number) {
    const ids: string[] = [];
    return {
      uri: "file:///x.py",
      isDisposed: () => false,
      getLineCount: () => lines,
      deltaDecorations: (lama: any, baru: any) => {
        ids.length = 0;
        for (let i = 0; i < (baru || []).length; i++) ids.push("d" + i);
        return ids.slice();
      },
    };
  }

  test("an added hunk paints the lines AND the gutter", () => {
    const m = fakeMonaco();
    const model: any = fakeModel(10);
    let ditangkap: any = null;
    model.deltaDecorations = (_lama: any, d: any) => {
      ditangkap = d;
      return [];
    };
    D.applyAgentHighlights(m, model, [
      { startLine: 2, endLine: 3, added: 2, removed: 0 },
    ]);
    expect(ditangkap).toHaveLength(1);
    expect(ditangkap[0].options.className).toBe("agen-baris-tambah");
    expect(ditangkap[0].options.linesDecorationsClassName).toBe(
      "agen-gutter-tambah",
    );
    expect(ditangkap[0].options.isWholeLine).toBe(true);
  });

  test("a removal paints the gutter only — it has no line to fill", () => {
    const m = fakeMonaco();
    const model: any = fakeModel(10);
    let ditangkap: any = null;
    model.deltaDecorations = (_lama: any, d: any) => {
      ditangkap = d;
      return [];
    };
    D.applyAgentHighlights(m, model, [
      { startLine: 4, endLine: 3, added: 0, removed: 2 },
    ]);
    expect(ditangkap).toHaveLength(1);
    expect(ditangkap[0].options.linesDecorationsClassName).toBe(
      "agen-gutter-hapus",
    );
    expect(ditangkap[0].options.className).toBeUndefined();
  });

  test("a hunk past the end of the file is clamped, not passed through", () => {
    // The text can change between computing a hunk and painting it, and Monaco
    // throws on a line it does not have.
    const m = fakeMonaco();
    const model: any = fakeModel(3);
    let ditangkap: any = null;
    model.deltaDecorations = (_lama: any, d: any) => {
      ditangkap = d;
      return [];
    };
    D.applyAgentHighlights(m, model, [
      { startLine: 90, endLine: 99, added: 5, removed: 0 },
    ]);
    expect(ditangkap[0].range.startLineNumber).toBeLessThanOrEqual(3);
    expect(ditangkap[0].range.endLineNumber).toBeLessThanOrEqual(3);
  });

  test("no hunks paints nothing", () => {
    const m = fakeMonaco();
    const model: any = fakeModel(3);
    expect(D.applyAgentHighlights(m, model, [])).toBe(0);
    expect(D.applyAgentHighlights(m, model, null)).toBe(0);
  });

  test("a disposed model is left alone", () => {
    const m = fakeMonaco();
    const model: any = fakeModel(3);
    model.isDisposed = () => true;
    expect(
      D.applyAgentHighlights(m, model, [
        { startLine: 1, endLine: 1, added: 1, removed: 0 },
      ]),
    ).toBe(0);
  });
});

describe("the API is Monaco's, not my recollection of it", () => {
  // THE TEST THAT WOULD HAVE CAUGHT THE CRASH. Everything above runs against a
  // stub, and a stub can only be as right as the belief that built it. This one
  // reads the Monaco that actually ships in this app.
  const vs = path.join(AKAR, "public", "vendor", "monaco", "vs");
  const bundle = (() => {
    const nama = fs
      .readdirSync(vs)
      .filter((f: string) => /^editor-.*\.js$/.test(f));
    expect(nama.length).toBeGreaterThan(0);
    return fs.readFileSync(path.join(vs, nama[0]), "utf8");
  })();
  // COMMENTS STRIPPED, LINE-WISE. The note in AgentDiff.ts explains the crash
  // by quoting it — "model.createDecorationsCollection is not a function" —
  // and a test that matched the raw file would fail on the explanation of the
  // very bug it is pinning. This suite has now been bitten by both halves of
  // the same trap: a stub built to a belief, and an assertion reading prose.
  const src = (() => {
    const raw = fs.readFileSync(
      path.join(AKAR, "public", "app", "AgentDiff.ts"),
      "utf8",
    );
    const out: string[] = [];
    let dalam = false;
    for (const baris of raw.split("\n")) {
      const t = baris.trim();
      const tutup = t.endsWith("*/");
      if (dalam) {
        if (tutup) dalam = false;
        continue;
      }
      if (t.startsWith("//") || t.startsWith("*")) continue;
      if (t.startsWith("/*")) {
        if (!tutup) dalam = true;
        continue;
      }
      out.push(baris);
    }
    return out.join("\n");
  })();

  test("a TEXT MODEL is decorated with deltaDecorations", () => {
    // Monaco's own internals: `this._model.deltaDecorations([], i)`.
    expect(bundle).toMatch(/_model\.deltaDecorations\(/);
    expect(src).toMatch(/model\.deltaDecorations\(/);
  });

  test("createDecorationsCollection belongs to the EDITOR, and is not called on a model", () => {
    // The crash, pinned. In the bundle the method is reached through an editor.
    expect(bundle).toMatch(/editor\.createDecorationsCollection\(/);
    expect(src).not.toMatch(/model\.createDecorationsCollection/);
  });

  test("the marks are removed the way they were made", () => {
    // deltaDecorations(ids, []) — the same call, with nothing to add. A
    // `.clear()` on the returned value would be the collection API again.
    expect(src).toMatch(/deltaDecorations\(ids, \[\]\)/);
  });
});

describe("how it is wired", () => {
  const src = (() => {
    const raw = fs.readFileSync(
      path.join(AKAR, "public", "app", "AgentDiff.ts"),
      "utf8",
    );
    const out: string[] = [];
    let dalam = false;
    for (const baris of raw.split("\n")) {
      const t = baris.trim();
      const tutup = t.endsWith("*/") || t.endsWith("*/}");
      if (dalam) {
        if (tutup) dalam = false;
        continue;
      }
      if (t.startsWith("//")) continue;
      if (t.startsWith("/*")) {
        if (!tutup) dalam = true;
        continue;
      }
      out.push(baris);
    }
    return out.join("\n");
  })();

  test("it listens for the SAME event the rest of the app already uses", () => {
    // A second event for the same fact is how two surfaces drift apart.
    expect(src).toMatch(/addEventListener\("wolfspace_agent_act"/);
    expect(src).toMatch(/write\|edit\|create\|apply\|save/);
    expect(src).toMatch(/d\.ok === false/); // a failed write changed nothing
  });

  test("the buffer is only replaced when the text actually differs", () => {
    // Otherwise every reported write pushes an undo entry for nothing.
    expect(src).toMatch(/sebelum === teks/);
  });

  test("the marks clear when the user types", () => {
    expect(src).toMatch(/onDidChangeContent/);
    expect(src).toMatch(/clearAgentMarks/);
  });

  test("it is installed, and the styles exist", () => {
    const app = fs.readFileSync(path.join(AKAR, "public", "app.tsx"), "utf8");
    expect(app).toMatch(/installAgentDiff\(monaco\)/);
    const html = fs.readFileSync(
      path.join(AKAR, "public", "index.html"),
      "utf8",
    );
    expect(html).toContain('"/app/AgentDiff.ts"');
    const css = fs.readFileSync(
      path.join(AKAR, "public", "styles.css"),
      "utf8",
    );
    expect(css).toMatch(/\.agen-baris-tambah\s*\{/);
    expect(css).toMatch(/\.agen-gutter-hapus\s*\{/);
  });
});

describe("putting the marks away", () => {
  // WHY THIS EXISTS. The first version cleared the highlight only when the user
  // TYPED, and that is the wrong moment: reading the change is the point of the
  // marks, and having read it the natural gesture is to click, not to edit. The
  // highlight sat there with no way to dismiss it. Reported from the running
  // app: "tidak bisa hilang saat saya klik, seharusnya bisa".
  function modelPencatat() {
    const panggilan: any[] = [];
    return {
      panggilan,
      uri: "file:///x.py",
      isDisposed: () => false,
      getLineCount: () => 20,
      deltaDecorations: (lama: any, baru: any) => {
        panggilan.push({ lama, jumlahBaru: (baru || []).length });
        return (baru || []).map((_: any, i: number) => "d" + i);
      },
    };
  }
  const monacoPalsu = {
    Range: function (a: number, b: number, c: number, d: number) {
      return {
        startLineNumber: a,
        startColumn: b,
        endLineNumber: c,
        endColumn: d,
      };
    } as any,
    editor: { OverviewRulerLane: { Left: 1 } },
    KeyCode: { Escape: 9 },
  };
  const hunk = [{ startLine: 2, endLine: 3, added: 2, removed: 0 }];

  /** An editor stand-in that hands back the listeners it was given. */
  function editorPalsu(model: any) {
    const l: any = {};
    return {
      _l: l,
      getModel: () => model,
      onMouseDown: (f: any) => (l.mouse = f),
      onKeyDown: (f: any) => (l.key = f),
    };
  }

  test("a CLICK removes them", () => {
    const model = modelPencatat();
    const ed = editorPalsu(model);
    D.watchEditorForDismiss(monacoPalsu, ed);
    D.applyAgentHighlights(monacoPalsu, model, hunk);
    expect(model.panggilan).toHaveLength(1);
    ed._l.mouse();
    // Removed the way they were made: deltaDecorations(ids, []).
    const terakhir = model.panggilan[model.panggilan.length - 1];
    expect(terakhir.jumlahBaru).toBe(0);
    expect(terakhir.lama.length).toBeGreaterThan(0);
  });

  test("ESCAPE removes them too", () => {
    const model = modelPencatat();
    const ed = editorPalsu(model);
    D.watchEditorForDismiss(monacoPalsu, ed);
    D.applyAgentHighlights(monacoPalsu, model, hunk);
    ed._l.key({ keyCode: 9 });
    expect(model.panggilan[model.panggilan.length - 1].jumlahBaru).toBe(0);
  });

  test("any OTHER key leaves them alone", () => {
    // Scrolling with the arrow keys to read the change must not dismiss it.
    const model = modelPencatat();
    const ed = editorPalsu(model);
    D.watchEditorForDismiss(monacoPalsu, ed);
    D.applyAgentHighlights(monacoPalsu, model, hunk);
    ed._l.key({ keyCode: 18 });
    expect(model.panggilan).toHaveLength(1);
  });

  test("dismissing twice does not call through a second time", () => {
    const model = modelPencatat();
    const ed = editorPalsu(model);
    D.watchEditorForDismiss(monacoPalsu, ed);
    D.applyAgentHighlights(monacoPalsu, model, hunk);
    ed._l.mouse();
    const n = model.panggilan.length;
    ed._l.mouse();
    expect(model.panggilan).toHaveLength(n);
  });

  test("one editor is only ever watched once", () => {
    // installAgentDiff subscribes to the editors that exist AND to every one
    // created later; a pane that got two listeners would clear twice.
    const model = modelPencatat();
    const ed = editorPalsu(model);
    D.watchEditorForDismiss(monacoPalsu, ed);
    const pertama = ed._l.mouse;
    D.watchEditorForDismiss(monacoPalsu, ed);
    expect(ed._l.mouse).toBe(pertama);
  });

  test("clicking in one file leaves another file's marks alone", () => {
    const a = modelPencatat();
    const b = modelPencatat();
    b.uri = "file:///lain.py";
    const edA = editorPalsu(a);
    D.watchEditorForDismiss(monacoPalsu, edA);
    D.applyAgentHighlights(monacoPalsu, a, hunk);
    D.applyAgentHighlights(monacoPalsu, b, hunk);
    edA._l.mouse();
    expect(a.panggilan[a.panggilan.length - 1].jumlahBaru).toBe(0);
    expect(b.panggilan).toHaveLength(1); // untouched
  });
});
