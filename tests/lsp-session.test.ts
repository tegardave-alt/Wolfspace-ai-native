// Which server runs, how a file is named to it, and what it says back.
//
// TWO HALVES, AND THE FIRST ONE IS WHY THIS FILE EXISTS.
//
// The rules here are pure functions on purpose — path→URI, URI→path, "is this
// binary installed" — because a rule that can only be checked by starting a
// real language server would never be checked at all, and these are exactly the
// rules that fail SILENTLY. A server given `file:///c%3A/...` when it indexed
// `file:///c:/...` accepts every message, answers every request with null, and
// nothing anywhere reports a mismatch.
//
// The second half starts a real process through the real discovery path: a
// fake server dropped into `node_modules/.bin`, found the way any project's own
// tooling is found, then opened, asked and read back.

const fs = require("fs");
const os = require("os");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const S = require("../core/lsp-session.ts");

jest.setTimeout(60000);

describe("naming a file to a language server", () => {
  const win = process.platform === "win32";

  test("a path survives the round trip", () => {
    const p = path.resolve(
      win ? "C:/Users/dave/proyek/a.ts" : "/home/dave/a.ts",
    );
    expect(S.uriToPath(S.pathToUri(p))).toBe(p);
  });

  test("the drive letter stays a drive letter", () => {
    // encodeURIComponent turns "C:" into "C%3A". Some servers match that against
    // their own index and find nothing, with no error either way.
    const uri = S.pathToUri("C:/Users/dave/a.ts");
    if (win) {
      expect(uri).toBe("file:///C:/Users/dave/a.ts");
      expect(uri).not.toMatch(/%3A/i);
    }
    // Read back the way VS Code writes it, which IS percent-encoded.
    expect(S.uriToPath("file:///c%3A/Users/dave/a.ts").toLowerCase()).toContain(
      "users",
    );
  });

  test("spaces and '#' are encoded, or the URI is not a URI", () => {
    const uri = S.pathToUri(
      win ? "C:/my folder/a#b.ts" : "/home/my folder/a#b.ts",
    );
    expect(uri).toContain("my%20folder");
    expect(uri).toContain("a%23b.ts");
    expect(S.uriToPath(uri)).toContain("my folder");
  });

  test("non-ASCII paths round trip", () => {
    const p = path.resolve(win ? "C:/proyék/日本語.ts" : "/proyék/日本語.ts");
    expect(S.uriToPath(S.pathToUri(p))).toBe(p);
  });

  test("something that is not a file URI is not a path", () => {
    expect(S.uriToPath("http://example.com/a.ts")).toBe("");
    expect(S.uriToPath("")).toBe("");
    expect(S.uriToPath(null)).toBe("");
  });
});

describe("finding a server that is installed", () => {
  test("node itself is found, because it is on PATH", () => {
    // A real positive: whatever runs this test is on PATH by definition.
    expect(S.findExecutable("node")).toBeTruthy();
  });

  test("a name nobody has is not found", () => {
    expect(S.findExecutable("wolfspace-tidak-ada-xyz")).toBe(null);
    expect(S.findExecutable("")).toBe(null);
  });

  test("PATHEXT is honoured on Windows", () => {
    // The reason this matters: an npm-installed server is `gopls.cmd`, and a
    // check for a file literally named `gopls` reports "not installed" for a
    // server that is installed and works. Verified by planting one.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uji-path-"));
    const ext = process.platform === "win32" ? ".CMD" : "";
    fs.writeFileSync(path.join(dir, "palsu-server" + ext), "echo hi");
    expect(S.findExecutable("palsu-server", [dir])).toBeTruthy();
  });

  test("a project's own node_modules/.bin comes before PATH", () => {
    const dirs = S.localBinDirs(path.resolve("C:/a/b/c"));
    expect(dirs[0]).toContain(path.join("c", "node_modules", ".bin"));
    // It walks upward, because a monorepo package's tools live at the top.
    expect(
      dirs.some((d: string) => d.includes(path.join("a", "node_modules"))),
    ).toBe(true);
  });

  test("the project's VIRTUAL ENVIRONMENT is searched, or Python never works", () => {
    // The reason Python looked unsupported: `pip install basedpyright` puts the
    // binary in .venv/Scripts, and PATH knows nothing about it unless the
    // environment was activated in the shell that launched the app — which,
    // started from a desktop icon, it never is.
    const bin = process.platform === "win32" ? "Scripts" : "bin";
    const dirs = S.localBinDirs(path.resolve("C:/a/b/c"));
    for (const venv of [".venv", "venv", "env"])
      expect(dirs).toContain(path.join(path.resolve("C:/a/b/c"), venv, bin));
    // And upward too: a venv at the repo root serves a package inside it.
    expect(dirs).toContain(path.join(path.resolve("C:/a"), ".venv", bin));
  });

  test("per-user install directories are searched, because PATH misses them", () => {
    // `pip install --user`, `go install` and `cargo install` all write somewhere
    // no installer adds to PATH on Windows, and the result is "but I installed
    // it" — the most misleading answer this panel could give.
    const dirs = S.userToolDirs();
    const joined = dirs.join("|");
    expect(joined).toContain(path.join(".local", "bin"));
    expect(joined).toContain(path.join("go", "bin"));
    expect(joined).toContain(path.join(".cargo", "bin"));
  });

  test("a venv binary IS found through the project search", () => {
    // Planted, not assumed: a real file in a real .venv layout.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uji-venv-"));
    const bin = path.join(
      dir,
      ".venv",
      process.platform === "win32" ? "Scripts" : "bin",
    );
    fs.mkdirSync(bin, { recursive: true });
    const ext = process.platform === "win32" ? ".EXE" : "";
    fs.writeFileSync(path.join(bin, "basedpyright-langserver" + ext), "x");
    if (!ext) fs.chmodSync(path.join(bin, "basedpyright-langserver"), 0o755);
    const found = S.resolveCommand(S.entryForLanguage("python"), dir);
    expect(found).toBeTruthy();
    expect(found.cmd).toBe("basedpyright-langserver");
    expect(
      S.availability(dir).find((r: any) => r.id === "python").available,
    ).toBe(true);
  });
});

describe("the Python entry", () => {
  const py = S.REGISTRY.find((e: any) => e.id === "python");

  test("it offers several servers, best first", () => {
    const names = py.commands.map((c: any) => c.cmd);
    expect(names[0]).toBe("basedpyright-langserver");
    expect(names).toContain("pylsp");
    // jedi-language-server is the natural upgrade from the built-in Jedi worker:
    // same engine, but speaking LSP, so it gains references and diagnostics.
    expect(names).toContain("jedi-language-server");
  });

  test("ruff is NOT offered as the Python server", () => {
    // `ruff server` has no hover, no definition, no completion. Picking it would
    // silently take three features away in exchange for faster diagnostics.
    expect(py.commands.map((c: any) => c.cmd).join(" ")).not.toMatch(/ruff/);
  });

  test("the install hint is one command a user can actually run", () => {
    expect(py.install).toBe("pip install basedpyright");
  });
});

describe("where the project starts", () => {
  // MEASURED, and it is the reason this exists: basedpyright rooted at a large
  // scratch folder logged "No include entries specified; assuming <folder>" and
  // then published NOTHING for four minutes, while hover and definition kept
  // answering in about a second. Only diagnostics need the whole program, and
  // the whole program never finished.
  let ws = "";
  const tulis = (rel: string, isi = "x") => {
    const p = path.join(ws, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, isi);
    return p;
  };
  const py = () => S.entryForLanguage("python");

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "uji-akar-"));
  });

  test("the nearest project marker above the file wins", () => {
    tulis("paket/pyproject.toml");
    const f = tulis("paket/src/a.py");
    expect(S.projectRootFor(ws, f, py())).toBe(path.join(ws, "paket"));
  });

  test("with no marker at all, the workspace root stands", () => {
    const f = tulis("a.py");
    expect(S.projectRootFor(ws, f, py())).toBe(path.resolve(ws));
  });

  test("'.git' is NOT a marker", () => {
    // A repository may hold fifty unrelated projects. Treating .git as a project
    // root is exactly what produced the four-minute silence.
    fs.mkdirSync(path.join(ws, "sub", ".git"), { recursive: true });
    const f = tulis("sub/a.py");
    expect(S.projectRootFor(ws, f, py())).toBe(path.resolve(ws));
  });

  test("the search never climbs above the workspace", () => {
    // A pyproject.toml in the parent belongs to someone else, and reading it
    // would take the server outside the folder the user opened.
    const luar = path.dirname(ws);
    const penanda = path.join(luar, "pyproject.toml");
    let dibuat = false;
    if (!fs.existsSync(penanda)) {
      fs.writeFileSync(penanda, "x");
      dibuat = true;
    }
    try {
      const f = tulis("a.py");
      expect(S.projectRootFor(ws, f, py())).toBe(path.resolve(ws));
    } finally {
      if (dibuat) fs.unlinkSync(penanda);
    }
  });

  test("each language looks for its OWN marker", () => {
    // A package.json does not make a directory a Python project, and a
    // pyproject.toml does not make it a Go module.
    tulis("paket/package.json");
    const f = tulis("paket/a.py");
    expect(S.projectRootFor(ws, f, py())).toBe(path.resolve(ws));
    expect(
      S.projectRootFor(
        ws,
        tulis("paket/a.ts"),
        S.entryForLanguage("typescript"),
      ),
    ).toBe(path.join(ws, "paket"));
  });

  test("a language with no markers always uses the workspace root", () => {
    const f = tulis("a.yaml");
    expect(S.projectRootFor(ws, f, S.entryForLanguage("yaml"))).toBe(
      path.resolve(ws),
    );
  });
});

describe("the registry", () => {
  test("Monaco language ids map to a server", () => {
    expect(S.entryForLanguage("python").id).toBe("python");
    expect(S.entryForLanguage("typescriptreact").id).toBe("typescript");
    expect(S.entryForLanguage("rust").id).toBe("rust");
    expect(S.entryForLanguage("COBOL")).toBe(null);
  });

  test("every entry can tell the user how to get it", () => {
    // A panel that says "not installed" and stops is a dead end.
    for (const e of S.REGISTRY) {
      expect(e.install).toMatch(/\S/);
      expect(e.commands.length).toBeGreaterThan(0);
      for (const c of e.commands) expect(typeof c.cmd).toBe("string");
    }
  });

  test("availability reports the missing ones too", () => {
    const a = S.availability(AKAR);
    expect(a.length).toBe(S.REGISTRY.length);
    for (const row of a) {
      expect(typeof row.available).toBe("boolean");
      expect(row.install).toMatch(/\S/);
    }
  });
});

// ── The live half ───────────────────────────────────────────────────────────

const FAKE = `
"use strict";
let rest = Buffer.alloc(0);
function send(m) {
  const b = Buffer.from(JSON.stringify(m), "utf8");
  process.stdout.write("Content-Length: " + b.length + "\\r\\n\\r\\n");
  process.stdout.write(b);
}
let lastUri = null;
process.stdin.on("data", (chunk) => {
  rest = Buffer.concat([rest, chunk]);
  for (;;) {
    const edge = rest.indexOf("\\r\\n\\r\\n");
    if (edge < 0) return;
    const head = rest.slice(0, edge).toString("ascii");
    const len = Number(/Content-Length:\\s*(\\d+)/i.exec(head)[1]);
    const start = edge + 4;
    if (rest.length < start + len) return;
    const msg = JSON.parse(rest.slice(start, start + len).toString("utf8"));
    rest = rest.slice(start + len);
    go(msg);
  }
});
function go(msg) {
  if (msg.method === "initialize") {
    send({ jsonrpc: "2.0", id: msg.id, result: { capabilities: {
      hoverProvider: true, definitionProvider: true, textDocumentSync: 2,
    } } });
    return;
  }
  if (msg.method === "textDocument/didOpen") {
    lastUri = msg.params.textDocument.uri;
    // PUBLISHED UNDER A DIFFERENT SPELLING OF THE SAME FILE — because that is
    // what a real typescript-language-server does. Measured: we open
    //   file:///C:/Users/dave/proyek/a.ts
    // and diagnostics come back against
    //   file:///c%3A/Users/dave/proyek/a.ts
    // Keying a Map on the raw URI stored them where nothing looked, and the
    // file simply never showed a squiggle — no error, no log, everything else
    // working. The '/./' does the same job on platforms with no drive letter.
    var alt = lastUri
      .replace(/^file:\\/\\/\\/([A-Za-z]):/, function (_m, d) {
        return "file:///" + d.toLowerCase() + "%3A";
      })
      .replace(/\\/([^/]+)$/, "/./$1");
    send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: {
      uri: alt,
      diagnostics: [{ range: { start: { line: 0, character: 0 },
                               end: { line: 0, character: 3 } },
                      severity: 2, message: "dari server palsu" }],
    } });
    return;
  }
  if (msg.method === "textDocument/didChange") {
    send({ jsonrpc: "2.0", method: "textDocument/publishDiagnostics", params: {
      uri: msg.params.textDocument.uri,
      diagnostics: [{ range: { start: { line: 0, character: 0 },
                               end: { line: 0, character: 1 } },
                      severity: 1,
                      message: "versi " + msg.params.textDocument.version +
                               " len " + msg.params.contentChanges[0].text.length }],
    } });
    return;
  }
  if (msg.method === "textDocument/hover") {
    send({ jsonrpc: "2.0", id: msg.id, result: { contents: {
      kind: "plaintext",
      value: "uri=" + msg.params.textDocument.uri +
             " line=" + msg.params.position.line } } });
    return;
  }
  if (msg.method === "textDocument/references") {
    send({ jsonrpc: "2.0", id: msg.id,
           error: { code: -32601, message: "not offered" } });
    return;
  }
  if (msg.method === "shutdown") { send({ jsonrpc: "2.0", id: msg.id, result: null }); return; }
  if (msg.method === "exit") process.exit(0);
}
`;

describe("a server found the way a real one would be", () => {
  let root = "";
  let file = "";

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "uji-lsp-root-"));
    const bin = path.join(root, "node_modules", ".bin");
    fs.mkdirSync(bin, { recursive: true });
    const fake = path.join(root, "fake-server.cjs");
    fs.writeFileSync(fake, FAKE);
    // A shim named exactly what the registry looks for, planted where a project
    // keeps its own tools. Nothing about the lookup is bypassed.
    if (process.platform === "win32") {
      fs.writeFileSync(
        path.join(bin, "gopls.CMD"),
        '@echo off\r\nnode "' + fake + '" %*\r\n',
      );
    } else {
      const p = path.join(bin, "gopls");
      fs.writeFileSync(p, '#!/bin/sh\nexec node "' + fake + '" "$@"\n');
      fs.chmodSync(p, 0o755);
    }
    file = path.join(root, "main.go");
    fs.writeFileSync(file, "package main\n");
  });

  afterAll(async () => {
    await S.stopAll();
  });

  test("it is discovered from node_modules/.bin", () => {
    const entry = S.entryForLanguage("go");
    expect(S.resolveCommand(entry, root)).toBeTruthy();
    const row = S.availability(root).find((r: any) => r.id === "go");
    expect(row.available).toBe(true);
  });

  test("opening a file publishes diagnostics for THAT file", async () => {
    const state = await S.sync(root, file, "go", "package main\n");
    expect(state).toBeTruthy();
    // publishDiagnostics is a notification: give it a moment to land.
    await new Promise((r: any) => setTimeout(r, 300));
    const d = S.diagnostics(root, file, "go");
    expect(d).toBeTruthy();
    expect(d[0].message).toBe("dari server palsu");
  });

  test("the server is told the same path we asked about", async () => {
    // The end-to-end version of the URI tests above: the answer carries the URI
    // the server actually received.
    const r = await S.ask({
      root,
      file,
      languageId: "go",
      kind: "hover",
      line: 4,
      character: 2,
      text: "package main\n",
    });
    expect(r.ok).toBe(true);
    expect(S.uriToPath(r.result.contents.value.split(" ")[0].slice(4))).toBe(
      path.resolve(file),
    );
    expect(r.result.contents.value).toContain("line=4");
  });

  test("a second sync is a change, not a second open", async () => {
    await S.sync(root, file, "go", "package main\nfunc a(){}\n");
    await new Promise((r: any) => setTimeout(r, 300));
    const d = S.diagnostics(root, file, "go");
    // The fake reports the version and the length it was given: version 3 or
    // more proves didChange rather than a repeated didOpen, and the length
    // proves the FULL text went across.
    expect(d[0].message).toMatch(/^versi [2-9]\d* len 24$/);
  });

  test("a capability the server never offered is not sent to it", async () => {
    // Some servers close the connection on an unoffered request. Refusing here
    // keeps that from ever reaching the wire.
    const r = await S.ask({
      root,
      file,
      languageId: "go",
      kind: "references",
      line: 0,
      character: 0,
      text: "package main\n",
    });
    expect(r.ok).toBe(false);
    expect(r.err).toMatch(/referencesProvider not offered/);
  });

  test("the process is REUSED for a second file in the same root", async () => {
    const before = S._servers.size;
    const other = path.join(root, "lain.go");
    fs.writeFileSync(other, "package main\n");
    await S.sync(root, other, "go", "package main\n");
    expect(S._servers.size).toBe(before);
  });

  test("closing forgets the document and its diagnostics", async () => {
    await S.close(root, file, "go");
    expect(S.diagnostics(root, file, "go")).toEqual([]);
  });
});

describe("no server installed is an ordinary answer, not an error", () => {
  test("an unknown language just has none", async () => {
    const r = await S.ask({
      root: AKAR,
      file: path.join(AKAR, "a.cobol"),
      languageId: "cobol",
      kind: "hover",
      line: 0,
      character: 0,
      text: "",
    });
    expect(r.ok).toBe(false);
    expect(r.missing).toBe(true);
  });

  test("sync returns null rather than throwing", async () => {
    await expect(
      S.sync(AKAR, path.join(AKAR, "a.cobol"), "cobol", ""),
    ).resolves.toBe(null);
  });
});
