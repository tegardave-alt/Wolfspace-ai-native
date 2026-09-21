"use strict";
/**
 * lsp-session.ts — which language server runs, for which project, and what it
 * has said so far.
 *
 * ROLE IN THE SYSTEM. core/lsp.ts speaks the protocol; this file DECIDES —
 * which server a language gets, whether it is installed at all, where the
 * project root is, which documents it has been told about, and what diagnostics
 * it last reported.
 *
 * CONNECTS TO
 *   imports  ./lsp (the protocol client)
 *   used by  server/routes/lsp.ts, which exposes it to the renderer;
 *            public/app/Lsp.ts is the browser end
 *
 * ── NOTHING IS BUNDLED, AND NOTHING IS INSTALLED ──
 *
 * This is the deliberate part. A language server is a compiler-sized program:
 * rust-analyzer and gopls hold an entire project's index in memory, and pyright
 * pulls in its own copy of Node. Shipping any of them would multiply the
 * installer for a language most users will not open, and downloading one behind
 * the user's back is worse — it is a network call and a disk write nobody asked
 * for.
 *
 * So the registry below only knows how to FIND servers, and when one is missing
 * it says which command to run. The editor keeps working exactly as it did
 * before: Monaco's own TypeScript worker, and the panel simply reports that no
 * server is present for the language in front of you.
 *
 * ── WHY THE SERVER IS KEYED BY (ROOT, SERVER) ──
 *
 * A language server is scoped to a project, not to a file: it reads the
 * tsconfig, the go.mod, the Cargo.toml at the top and indexes downward. One
 * process per open file would index the same project many times over; one
 * process for everything would answer about the wrong project. So a server is
 * started once per workspace root per language, and shared by every file under
 * it.
 */

import * as fs from "fs";
import * as path from "path";
const { LspClient } = require("./lsp.ts");

/**
 * ── The registry ──
 *
 * `commands` is an ORDERED list of alternatives: the first one found on the
 * machine wins. That ordering carries an opinion (basedpyright before pyright,
 * ruff's server before neither) but never an installation.
 *
 * `languages` holds MONACO language ids, because that is what the editor knows
 * a file by, and `languageId` on the wire is the same string by design — LSP
 * and Monaco agree on "typescript", "python", "go", "rust".
 */
const REGISTRY = [
  {
    id: "typescript",
    label: "TypeScript / JavaScript",
    languages: [
      "typescript",
      "typescriptreact",
      "javascript",
      "javascriptreact",
    ],
    markers: ["tsconfig.json", "jsconfig.json", "package.json"],
    commands: [{ cmd: "typescript-language-server", args: ["--stdio"] }],
    install: "npm i -g typescript-language-server typescript",
    // Monaco's own worker already answers for these files. A real server adds
    // what the worker cannot: the whole project rather than the open models.
    note: "Monaco already covers open files; a server adds project-wide answers.",
  },
  {
    id: "python",
    label: "Python",
    languages: ["python"],
    // ORDERED BY WHAT THEY ACTUALLY GIVE YOU, best first:
    //   basedpyright  full type checking, pip-only (it bundles its own Node)
    //   pyright       the same engine, but the pip package downloads Node itself
    //   jedi-lsp      pure Python; the same Jedi this app already used, but
    //                 speaking LSP, so it gains references and diagnostics
    //   pylsp         pure Python, plugin-based, adds pyflakes/pycodestyle
    // ruff is deliberately absent: `ruff server` is superb at diagnostics and
    // formatting but offers NO hover, definition or completion, so picking it
    // here would silently take those away.
    commands: [
      { cmd: "basedpyright-langserver", args: ["--stdio"] },
      { cmd: "pyright-langserver", args: ["--stdio"] },
      { cmd: "jedi-language-server", args: [] },
      { cmd: "pylsp", args: [] },
    ],
    markers: [
      "pyrightconfig.json",
      "pyproject.toml",
      "setup.py",
      "setup.cfg",
      "Pipfile",
      "requirements.txt",
    ],
    install: "pip install basedpyright",
    note: "Replaces the built-in Jedi worker when present.",
  },
  {
    id: "go",
    label: "Go",
    languages: ["go"],
    markers: ["go.mod", "go.work"],
    commands: [{ cmd: "gopls", args: [] }],
    install: "go install golang.org/x/tools/gopls@latest",
  },
  {
    id: "rust",
    label: "Rust",
    languages: ["rust"],
    markers: ["Cargo.toml"],
    commands: [{ cmd: "rust-analyzer", args: [] }],
    install: "rustup component add rust-analyzer",
  },
  {
    id: "clangd",
    label: "C / C++",
    languages: ["c", "cpp", "objective-c"],
    markers: ["compile_commands.json", "CMakeLists.txt"],
    commands: [{ cmd: "clangd", args: [] }],
    install: "apt install clangd   (or: brew install llvm)",
  },
  {
    id: "lua",
    label: "Lua",
    languages: ["lua"],
    commands: [{ cmd: "lua-language-server", args: [] }],
    install: "brew install lua-language-server",
  },
  {
    id: "yaml",
    label: "YAML",
    languages: ["yaml"],
    commands: [{ cmd: "yaml-language-server", args: ["--stdio"] }],
    install: "npm i -g yaml-language-server",
  },
  {
    id: "bash",
    label: "Shell",
    languages: ["shell", "shellscript"],
    commands: [{ cmd: "bash-language-server", args: ["start"] }],
    install: "npm i -g bash-language-server",
  },
  {
    id: "php",
    label: "PHP",
    languages: ["php"],
    markers: ["composer.json"],
    commands: [{ cmd: "intelephense", args: ["--stdio"] }],
    install: "npm i -g intelephense",
  },
];

/**
 * Where a file's URI comes from, and why it is written by hand.
 *
 * WINDOWS IS THE WHOLE PROBLEM. `C:\Users\dave\a.ts` has to reach the server as
 * `file:///C:/Users/dave/a.ts` — three slashes, forward slashes, and a drive
 * letter that must NOT be percent-encoded away into something the server fails
 * to match against its own index. Get it wrong and the failure is the quiet
 * kind again: the server accepts didOpen, answers every request with null, and
 * nothing anywhere says the two sides are talking about different files.
 *
 * Every other segment IS encoded, because spaces and `#` in a path are ordinary
 * on this platform and both break a URI.
 */
function pathToUri(p: any) {
  const abs = path.resolve(String(p || "")).replace(/\\/g, "/");
  const drive = /^([a-zA-Z]):(\/.*)$/.exec(abs);
  const body = drive ? drive[2] : abs;
  const encoded = body
    .split("/")
    .map((s: string) => encodeURIComponent(s))
    .join("/");
  return drive ? "file:///" + drive[1] + ":" + encoded : "file://" + encoded;
}

/** The inverse. Tolerates `%3A` because that is what VS Code's own URIs use. */
function uriToPath(uri: any) {
  let s = String(uri || "");
  if (!s.startsWith("file://")) return "";
  s = s.slice("file://".length);
  try {
    s = decodeURIComponent(s);
  } catch (_) {}
  if (/^\/[a-zA-Z]:/.test(s)) s = s.slice(1); // "/C:/x" -> "C:/x"
  return process.platform === "win32" ? s.replace(/\//g, "\\") : s;
}

/**
 * ── ONE KEY FOR ONE FILE, WHOEVER SPELLED THE URI ──
 *
 * MEASURED against a real typescript-language-server. We open a file as
 *
 *     file:///C:/Users/dave/proyek/a.ts
 *
 * and its diagnostics come back published against
 *
 *     file:///c%3A/Users/dave/proyek/a.ts
 *
 * Same file. Different string. Both spellings are legal — VS Code itself writes
 * the second — and a Map keyed on the raw URI therefore stored the diagnostics
 * under a key nothing ever looked up. Everything else worked: hover answered,
 * definition answered, the server was plainly healthy, and the file simply
 * never showed a single squiggle. Nothing logged, nothing threw.
 *
 * So documents are keyed by the PATH, canonicalised — and on Windows lowercased
 * too, because that filesystem does not distinguish case and a server is free
 * to answer with either.
 */
function docKey(uriOrPath: any) {
  const raw = String(uriOrPath || "");
  const p = raw.startsWith("file://") ? uriToPath(raw) : raw;
  if (!p) return "";
  const abs = path.resolve(p);
  return process.platform === "win32" ? abs.toLowerCase() : abs;
}

/**
 * Is this command actually on the machine?
 *
 * PATHEXT is why this is not one line. On Windows a "binary" called `gopls` is
 * usually `gopls.exe`, and an npm-installed one is `gopls.cmd` — a shim that
 * `fs.existsSync("gopls")` will never find. Node's own spawn applies the same
 * rules, so a check that ignores them reports "not installed" for servers that
 * are installed and working.
 */
function findExecutable(cmd: any, extraDirs: any = []) {
  const name = String(cmd || "");
  if (!name) return null;
  // An explicit path is taken as given.
  if (name.includes("/") || name.includes("\\"))
    return fs.existsSync(name) ? name : null;
  const exts =
    process.platform === "win32"
      ? (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .filter(Boolean)
      : [""];
  const dirs = [
    ...extraDirs,
    ...String(process.env.PATH || "").split(path.delimiter),
  ].filter(Boolean);
  for (const dir of dirs) {
    for (const ext of exts) {
      const full = path.join(dir, name + ext);
      try {
        if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
      } catch (_) {}
    }
  }
  return null;
}

/** A project's own `node_modules/.bin` comes FIRST — a repo pins its own tools. */
function localBinDirs(root: any) {
  const win = process.platform === "win32";
  const binName = win ? "Scripts" : "bin";
  const out: string[] = [];
  let d = root ? path.resolve(String(root)) : "";
  for (let i = 0; d && i < 6; i++) {
    out.push(path.join(d, "node_modules", ".bin"));
    // ── THE VIRTUAL ENVIRONMENT, and it is not an afterthought ──
    //
    // Python tooling is almost never global. `pip install basedpyright` inside a
    // project puts the binary in .venv/Scripts (Windows) or .venv/bin, and PATH
    // knows nothing about it unless the environment happens to be activated in
    // the shell that launched this app — which, started from a desktop icon, it
    // never is. Without these four lines the panel reports "not installed" for a
    // server sitting in the project it is looking at.
    for (const venv of [".venv", "venv", "env", ".env"])
      out.push(path.join(d, venv, binName));
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  // An environment that WAS activated. Cheap, and it covers the terminal case.
  if (process.env.VIRTUAL_ENV)
    out.push(path.join(process.env.VIRTUAL_ENV, binName));
  out.push(...userToolDirs());
  return out;
}

/**
 * Where per-user tool installs land — which is frequently NOT on PATH.
 *
 * `pip install --user`, `go install` and `cargo install` all write into a
 * directory the installer never adds to PATH on Windows, and the resulting
 * "but I installed it" is one of the most common false negatives a tool like
 * this can produce. Looking in them costs one `existsSync` each.
 */
function userToolDirs() {
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const out: string[] = [];
  if (!home) return out;
  out.push(path.join(home, ".local", "bin")); // pip install --user, POSIX
  out.push(path.join(home, "go", "bin")); // go install
  out.push(path.join(home, ".cargo", "bin")); // cargo install / rustup
  // Windows: %APPDATA%\Python\Python311\Scripts — the version is in the name,
  // so the directory is listed rather than guessed.
  const appdata = process.env.APPDATA;
  if (appdata) {
    const pyRoot = path.join(appdata, "Python");
    try {
      for (const name of fs.readdirSync(pyRoot))
        out.push(path.join(pyRoot, name, "Scripts"));
    } catch (_) {}
  }
  return out;
}

/**
 * ── WHERE THE PROJECT ACTUALLY STARTS ──
 *
 * A language server is scoped to a project, and it reads EVERYTHING under the
 * root it is given. Handing it the folder the user happens to have open is
 * therefore not a neutral choice, and this was measured on a real workspace:
 *
 *   basedpyright, rooted at a large scratch folder, logged
 *     "No include entries specified; assuming <folder>"
 *   and then published NOTHING for four minutes — while hover, definition and
 *   completion all answered in about a second, because those are per-file. Only
 *   diagnostics need the whole program, and the whole program never finished.
 *   (`find` could not enumerate that folder in 120 seconds either.)
 *
 * So the root is the nearest directory AT OR ABOVE the file that looks like a
 * project of this language — go.mod for Go, Cargo.toml for Rust, pyproject.toml
 * for Python — and the search never climbs past the workspace, because outside
 * it is not ours to read.
 *
 * `.git` is deliberately NOT a marker. It marks a repository, which may hold
 * fifty unrelated projects, and using it would reproduce the exact failure
 * above.
 *
 * When nothing is found the workspace root stands, which is the old behaviour:
 * for a small project it is right, and for a large one the panel now says the
 * server is still indexing rather than showing nothing.
 */
function projectRootFor(workspaceRoot: any, file: any, entry: any) {
  const ws = path.resolve(String(workspaceRoot || "."));
  const markers = (entry && entry.markers) || [];
  if (!markers.length || !file) return ws;
  let d = path.dirname(path.resolve(String(file)));
  // Bounded by the workspace: a marker above it belongs to someone else.
  for (let i = 0; i < 24; i++) {
    const rel = path.relative(ws, d);
    if (rel.startsWith("..") || path.isAbsolute(rel)) break;
    for (const m of markers) if (fs.existsSync(path.join(d, m))) return d;
    if (d === ws) break;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return ws;
}

/** The registry entry that serves this Monaco language id, or null. */
function entryForLanguage(languageId: any) {
  const id = String(languageId || "").toLowerCase();
  return REGISTRY.find((e) => e.languages.includes(id)) || null;
}

/** The first installed alternative for an entry, or null when none is. */
function resolveCommand(entry: any, root: any) {
  const dirs = localBinDirs(root);
  for (const c of entry.commands) {
    const found = findExecutable(c.cmd, dirs);
    if (found) return { ...c, resolved: found };
  }
  return null;
}

/**
 * What is available on this machine, for the panel to show.
 * Reports the missing ones too — with the command that would install them.
 */
/** Any live server for this registry entry, whatever project root it took. */
function runningFor(id: any) {
  for (const s of servers.values())
    if (s.entry.id === id && !s.client.dead) return s;
  return null;
}

/**
 * A SERVER THAT IS RUNNING AND SILENT IS NOT THE SAME AS A SERVER THAT FOUND
 * NOTHING WRONG, and from the outside they look identical.
 *
 * Measured on a real workspace: basedpyright started in a second, answered
 * hover and definition, and published no diagnostics at all in four minutes
 * because the folder it was rooted at was too large to finish indexing. The
 * editor looked broken while everything in it was working. So the state is
 * reported: how long it has been up, and whether it has ever said anything.
 */
function availability(root: any) {
  return REGISTRY.map((e) => {
    const found = resolveCommand(e, root);
    const live = runningFor(e.id);
    return {
      id: e.id,
      label: e.label,
      languages: e.languages,
      available: !!found || !!live,
      command: found ? found.cmd : e.commands[0].cmd,
      install: e.install,
      note: (e as any).note || null,
      running: !!live,
      // Reported in seconds: the panel shows it, it does not compute with it.
      upSeconds: live ? Math.round((Date.now() - live.startedAt) / 1000) : 0,
      published: live ? live.publishedAt > 0 : false,
      projectRoot: live ? live.root : null,
    };
  });
}

// ── Live servers ────────────────────────────────────────────────────────────

const servers = new Map<string, any>();

function keyFor(root: any, id: any) {
  return path.resolve(String(root || ".")) + "|" + id;
}

/**
 * Start (or reuse) the server for this language under this root.
 *
 * Returns null when nothing is installed — NOT an exception. A missing server
 * is the ordinary case, not an error condition, and every caller here has a
 * perfectly good answer for it: leave the language to Monaco.
 */
async function serverFor(root: any, languageId: any) {
  const entry = entryForLanguage(languageId);
  if (!entry) return null;
  const key = keyFor(root, entry.id);
  const existing = servers.get(key);
  if (existing) {
    // A server that died since last time is replaced rather than reported as
    // present: crashes happen, and the second question should still work.
    if (!existing.client.dead) return existing.ready.then(() => existing);
    servers.delete(key);
  }
  const found = resolveCommand(entry, root);
  if (!found) return null;

  const client = new LspClient(found.resolved, found.args, { cwd: root });
  const state: any = {
    key,
    entry,
    root,
    startedAt: Date.now(),
    publishedAt: 0,
    client,
    docs: new Map(), // uri -> { version, languageId }
    diagnostics: new Map(), // uri -> Diagnostic[]
    ready: null,
  };
  client.on("textDocument/publishDiagnostics", (p: any) => {
    if (!p || !p.uri) return;
    // The first publish is the moment a server stops being a black box. Before
    // it, "no squiggles" and "still indexing" look identical from the outside.
    state.publishedAt = Date.now();
    // docKey, NOT p.uri — see the note on docKey. The server is free to spell
    // the URI differently from the way we sent it, and it does.
    state.diagnostics.set(docKey(p.uri), p.diagnostics || []);
  });
  client.on("exit", () => servers.delete(key));

  state.ready = client
    .initialize(pathToUri(root))
    .then(() => state)
    .catch((e: any) => {
      // The process failed to start or refused the handshake. Drop it so the
      // next question tries again rather than reusing a corpse.
      servers.delete(key);
      throw e;
    });
  servers.set(key, state);
  try {
    await state.ready;
  } catch (_) {
    return null;
  }
  return state;
}

function has(caps: any, name: string) {
  const v = caps && caps[name];
  return v !== undefined && v !== false && v !== null;
}

// ── Documents ───────────────────────────────────────────────────────────────

/**
 * Tell the server about a file, or about its new contents.
 *
 * ONE ENTRY POINT FOR BOTH, on purpose. The renderer cannot reliably know
 * whether this server has heard of this file before — the server may have been
 * started five seconds ago, or restarted after a crash — and a `didChange` for
 * a document never opened is silently dropped by most servers, which is another
 * "everything answers null" failure with nothing to read.
 */
async function sync(root: any, file: any, languageId: any, text: any) {
  // The server is rooted at the PROJECT, not at whatever folder is open — see
  // projectRootFor. Every other entry point resolves it the same way, or they
  // would look for the server under a different key than the one it was
  // started with.
  const entry0 = entryForLanguage(languageId);
  const state = await serverFor(projectRootFor(root, file, entry0), languageId);
  if (!state) return null;
  const uri = pathToUri(file);
  const known = state.docs.get(docKey(file));
  if (!known) {
    state.docs.set(docKey(file), { version: 1, languageId });
    state.client.notify("textDocument/didOpen", {
      textDocument: { uri, languageId, version: 1, text: String(text || "") },
    });
    return state;
  }
  known.version += 1;
  // A FULL replacement, always. The specification allows it whatever sync kind
  // the server advertised — a change with no `range` replaces the document —
  // and Monaco hands over the whole model text for nothing anyway. Incremental
  // sync would mean tracking edit deltas across an IPC boundary to save bytes
  // that were already in memory.
  state.client.notify("textDocument/didChange", {
    textDocument: { uri, version: known.version },
    contentChanges: [{ text: String(text || "") }],
  });
  return state;
}

async function close(root: any, file: any, languageId: any) {
  const entry = entryForLanguage(languageId);
  if (!entry) return;
  const state = servers.get(
    keyFor(projectRootFor(root, file, entry), entry.id),
  );
  if (!state || state.client.dead) return;
  const uri = pathToUri(file);
  if (!state.docs.delete(docKey(file))) return;
  state.client.notify("textDocument/didClose", { textDocument: { uri } });
  state.diagnostics.delete(docKey(file));
}

// ── Questions ───────────────────────────────────────────────────────────────

const KIND = {
  hover: { method: "textDocument/hover", cap: "hoverProvider" },
  definition: { method: "textDocument/definition", cap: "definitionProvider" },
  references: { method: "textDocument/references", cap: "referencesProvider" },
  completion: { method: "textDocument/completion", cap: "completionProvider" },
  symbols: {
    method: "textDocument/documentSymbol",
    cap: "documentSymbolProvider",
  },
};

/**
 * Ask one question about one position.
 *
 * The capability check is not politeness: sending `textDocument/references` to
 * a server that never offered it is a protocol error, and some servers answer
 * it by shutting the connection.
 */
async function ask(args: any) {
  const { root, file, languageId, kind, line, character, text } = args || {};
  const spec = (KIND as any)[String(kind)];
  if (!spec) return { ok: false, err: "unknown request: " + kind };
  const state = await sync(root, file, languageId, text);
  if (!state) return { ok: false, err: "no language server", missing: true };
  if (!has(state.client.serverCapabilities, spec.cap))
    return { ok: false, err: spec.cap + " not offered by this server" };
  const uri = pathToUri(file);
  const params: any = {
    textDocument: { uri },
    position: { line: Number(line) || 0, character: Number(character) || 0 },
  };
  if (kind === "references") params.context = { includeDeclaration: false };
  if (kind === "symbols") delete params.position;
  try {
    const result = await state.client.request(spec.method, params);
    return { ok: true, result, server: state.entry.id };
  } catch (e: any) {
    return { ok: false, err: (e && e.message) || String(e) };
  }
}

/**
 * The diagnostics the server last published for this file.
 *
 * PUSHED, NOT PULLED — so this only ever reads what already arrived. Waiting
 * here for a server that has nothing new to say would block the editor on a
 * message that is never coming.
 */
function diagnostics(root: any, file: any, languageId: any) {
  const entry = entryForLanguage(languageId);
  if (!entry) return null;
  const state = servers.get(
    keyFor(projectRootFor(root, file, entry), entry.id),
  );
  if (!state) return null;
  return state.diagnostics.get(docKey(file)) || [];
}

/**
 * Kill every server, synchronously.
 *
 * FOR `process.on("exit")` ONLY, where nothing asynchronous can run: the
 * handler returns and the process is gone. stopAll() below is the polite
 * version and it needs an event loop that will no longer turn.
 *
 * It has to exist because a language server is not reaped for free. On Windows
 * a child outlives its parent unless something kills it, and an abandoned
 * rust-analyzer or tsserver holds a whole project's index in memory — this repo
 * has already had to hunt orphaned MCP processes once.
 */
function killAll() {
  for (const s of servers.values()) {
    try {
      s.client.process.kill();
    } catch (_) {}
  }
  servers.clear();
}

/** Shut every server down politely. Called when the app closes normally. */
async function stopAll() {
  const all = [...servers.values()];
  servers.clear();
  await Promise.all(all.map((s) => s.client.stop().catch(() => {})));
}

module.exports = {
  REGISTRY,
  availability,
  serverFor,
  sync,
  close,
  ask,
  diagnostics,
  stopAll,
  killAll,
  // Exported for the tests: these are the rules, and a rule that can only be
  // checked by starting a language server would never be checked at all.
  pathToUri,
  uriToPath,
  docKey,
  findExecutable,
  entryForLanguage,
  projectRootFor,
  runningFor,
  resolveCommand,
  localBinDirs,
  userToolDirs,
  _servers: servers,
};

export {};
