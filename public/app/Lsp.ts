// Lsp.ts — Monaco's side of the Language Server Protocol.
//
// ROLE IN THE SYSTEM. The protocol lives in Node (core/lsp.ts, driven by
// core/lsp-session.ts and exposed at /lsp/*). This is the thin half: it turns
// Monaco's questions into requests on those routes, and the answers back into
// the shapes Monaco expects.
//
// The two sides count differently, and every conversion here exists because of
// it: Monaco lines are 1-based and LSP lines are 0-based, and the severity and
// completion-kind enumerations do not merely differ, they run in opposite
// directions (LSP Error = 1, Monaco Hint = 1).
//
// WHY IT IS SPLIT THAT WAY. index.html concatenates these modules into ONE
// global scope and compiles them with esbuild's transform(), never a bundler —
// there is no import graph for `monaco-languageclient` to live in, and giving
// each file its own scope would break the app at first render. So the renderer
// gets no npm dependency at all; it gets four fetches.
//
// ── THE COORDINATE BUG THAT WOULD NEVER SHOW ITSELF ──
//
// Monaco counts lines and columns from ONE. LSP counts from ZERO. Every
// position crossing this boundary has to be converted, in both directions, and
// getting it wrong does not throw: hover simply answers about the character
// before the one under the cursor, go-to-definition lands a line early, and a
// diagnostic underlines the wrong word. Nothing anywhere reports a mismatch.
// That is why the conversions below are separate, named functions rather than
// arithmetic inline at each call site — they are the rules, and they are
// checked in tests/lsp-renderer.test.ts.

/** The workspace root every request is confined to. Set by the editor panel. */
let _lspRoot = "";
/** Language ids the backend has a server entry for. Filled from /lsp/status. */
let _lspLanguages: string[] = [];
let _lspInstalled = false;

// ── Pure conversions ────────────────────────────────────────────────────────

/** Monaco position (1-based) -> LSP position (0-based). */
function toLspPosition(position: any) {
  return {
    line: Math.max(0, (Number(position && position.lineNumber) || 1) - 1),
    character: Math.max(0, (Number(position && position.column) || 1) - 1),
  };
}

/** LSP range (0-based) -> the four 1-based numbers Monaco wants. */
function toMonacoRange(range: any) {
  const s = (range && range.start) || { line: 0, character: 0 };
  const e = (range && range.end) || s;
  return {
    startLineNumber: (Number(s.line) || 0) + 1,
    startColumn: (Number(s.character) || 0) + 1,
    endLineNumber: (Number(e.line) || 0) + 1,
    endColumn: (Number(e.character) || 0) + 1,
  };
}

/**
 * LSP DiagnosticSeverity -> the NAME of a Monaco MarkerSeverity.
 *
 * A name rather than a number on purpose: the two scales do not merely differ,
 * they run opposite ways round. LSP has Error=1 and Hint=4; Monaco has Hint=1
 * and Error=8. Passing one through as the other turns every error into a hint —
 * which renders as nothing at all.
 */
function severityName(severity: any) {
  const n = Number(severity);
  if (n === 1) return "Error";
  if (n === 2) return "Warning";
  if (n === 3) return "Info";
  if (n === 4) return "Hint";
  return "Error"; // absent severity means error, per the specification
}

/**
 * LSP CompletionItemKind -> the NAME of a Monaco CompletionItemKind.
 *
 * Same trap, worse: both are integer enums starting at 1 with overlapping
 * names in a DIFFERENT order. LSP 3 is Function; Monaco 3 is Field. Passing the
 * number through gives every completion a plausible, wrong icon.
 */
const COMPLETION_KINDS = [
  "Text",
  "Method",
  "Function",
  "Constructor",
  "Field",
  "Variable",
  "Class",
  "Interface",
  "Module",
  "Property",
  "Unit",
  "Value",
  "Enum",
  "Keyword",
  "Snippet",
  "Color",
  "File",
  "Reference",
  "Folder",
  "EnumMember",
  "Constant",
  "Struct",
  "Event",
  "Operator",
  "TypeParameter",
];
function completionKindName(kind: any) {
  const n = Number(kind);
  return COMPLETION_KINDS[n - 1] || "Text";
}

/**
 * Hover contents -> one markdown string.
 *
 * Four shapes are legal and servers use all of them: a plain string, a
 * `{language, value}` pair, an array of either, and a `{kind, value}`
 * MarkupContent. gopls sends the last, older servers the second.
 */
function hoverToMarkdown(contents: any): string {
  if (contents == null) return "";
  if (typeof contents === "string") return contents;
  if (Array.isArray(contents))
    return contents.map(hoverToMarkdown).filter(Boolean).join("\n\n---\n\n");
  if (typeof contents.value === "string")
    return contents.language
      ? "```" + contents.language + "\n" + contents.value + "\n```"
      : contents.value;
  return "";
}

/**
 * Definition/references results -> a flat list of { uri, range }.
 *
 * Three shapes again: a single Location, an array of them, or an array of
 * LocationLink (which names its fields `targetUri`/`targetSelectionRange`).
 * rust-analyzer and gopls answer with the third when the client asks for it,
 * and with the first when it does not.
 */
function toLocationList(result: any): any[] {
  if (!result) return [];
  const list = Array.isArray(result) ? result : [result];
  const out: any[] = [];
  for (const item of list) {
    if (!item) continue;
    const uri = item.uri || item.targetUri;
    const range =
      item.range || item.targetSelectionRange || item.targetRange || null;
    if (uri && range) out.push({ uri, range });
  }
  return out;
}

/** `file:///C:/x/a.ts` -> `C:\x\a.ts`. The inverse lives in core/lsp-session.ts. */
function uriToLocalPath(uri: any) {
  let s = String(uri || "");
  if (!s.startsWith("file://")) return "";
  s = s.slice(7);
  try {
    s = decodeURIComponent(s);
  } catch (_) {}
  if (/^\/[a-zA-Z]:/.test(s)) s = s.slice(1);
  return s;
}

// ── Talking to the backend ──────────────────────────────────────────────────

async function lspPost(path: string, body: any) {
  try {
    return await wwApi(path, { method: "POST", body });
  } catch (_) {
    return null;
  }
}

function lspFileOf(model: any) {
  // Only real files. Chat code blocks and diff previews live on `inmemory:`
  // models, and a language server asked about those would index nothing and
  // answer null for ever.
  if (!model || !model.uri || model.uri.scheme !== "file") return "";
  return uriToLocalPath(model.uri.toString());
}

async function lspAsk(model: any, kind: string, position: any) {
  const file = lspFileOf(model);
  if (!_lspRoot || !file) return null;
  const r = await lspPost("/lsp/ask", {
    root: _lspRoot,
    path: file,
    languageId: model.getLanguageId(),
    kind,
    text: model.getValue(),
    ...(position ? toLspPosition(position) : { line: 0, character: 0 }),
  });
  return r && r.ok ? r.result : null;
}

// ── Document synchronisation and diagnostics ────────────────────────────────

const _lspTimers = new Map();
const LSP_DEBOUNCE_MS = 400;

/**
 * Push the file's current text, then read back what the server thinks of it.
 *
 * DEBOUNCED, because this runs on every keystroke otherwise: a language server
 * re-analyses on each didChange, and typing a line would queue a dozen of them
 * behind each other. 400ms is roughly a pause between words.
 */
function lspScheduleSync(monaco: any, model: any) {
  const file = lspFileOf(model);
  if (!_lspRoot || !file) return;
  const key = model.uri.toString();
  clearTimeout(_lspTimers.get(key));
  _lspTimers.set(
    key,
    setTimeout(async () => {
      _lspTimers.delete(key);
      if (model.isDisposed && model.isDisposed()) return;
      const languageId = model.getLanguageId();
      const sync = await lspPost("/lsp/sync", {
        root: _lspRoot,
        path: file,
        languageId,
        text: model.getValue(),
      });
      if (!sync || !sync.ok || sync.missing) return;
      // Diagnostics are PUSHED by the server, so this reads what has already
      // arrived rather than waiting for something that may never come.
      const d = await wwApi(
        "/lsp/diagnostics?root=" +
          encodeURIComponent(_lspRoot) +
          "&path=" +
          encodeURIComponent(file) +
          "&language=" +
          encodeURIComponent(languageId),
      ).catch(() => null);
      if (!d || !d.ok || !d.hasServer) return;
      if (model.isDisposed && model.isDisposed()) return;
      // OWNER "lsp", and that matters: Monaco's own TypeScript worker owns
      // "typescript". Writing over its markers would delete the diagnostics the
      // editor already had.
      monaco.editor.setModelMarkers(
        model,
        "lsp",
        (d.diagnostics || []).map((x: any) => ({
          ...toMonacoRange(x.range),
          message: String(x.message || ""),
          severity: monaco.MarkerSeverity[severityName(x.severity)],
          source: x.source || "lsp",
          code: x.code == null ? undefined : String(x.code),
        })),
      );
    }, LSP_DEBOUNCE_MS),
  );
}

// ── Installation ────────────────────────────────────────────────────────────

/**
 * Register the providers, once.
 *
 * THE LANGUAGE LIST COMES FROM THE BACKEND, deliberately. The registry of which
 * server serves which language lives in core/lsp-session.ts, and a second copy
 * here is exactly how this repo has produced bugs before. Providers are
 * registered for every language the registry KNOWS, not only the ones installed
 * right now — so installing gopls does not require restarting the app.
 */
async function installLsp(monaco: any) {
  if (_lspInstalled || !monaco) return;
  _lspInstalled = true;
  let status: any = null;
  try {
    status = await wwApi("/lsp/status?root=" + encodeURIComponent(_lspRoot));
  } catch (_) {}
  if (!status || !status.ok) return;
  const langs = new Set<string>();
  for (const s of status.servers || [])
    for (const l of s.languages || []) langs.add(l);
  _lspLanguages = [...langs];
  if (!_lspLanguages.length) return;

  // WHICH LANGUAGES A REAL SERVER NOW OWNS. index.html's Jedi providers read
  // this and stand down for Python when pyright is installed — otherwise both
  // answer and Monaco shows the same symbol described twice, once by the weaker
  // of the two. Only languages actually INSTALLED count here; the providers
  // above are registered for every known language, because a server can appear
  // later.
  const ambilAlih = new Set<string>();
  for (const s of status.servers || [])
    if (s.available) for (const l of s.languages || []) ambilAlih.add(l);
  (window as any).__lspAmbilAlih = ambilAlih;

  monaco.languages.registerHoverProvider(_lspLanguages, {
    provideHover: async (model: any, position: any) => {
      const h = await lspAsk(model, "hover", position);
      const text = h && hoverToMarkdown(h.contents);
      if (!text) return null;
      return {
        contents: [{ value: text }],
        range: h.range ? toMonacoRange(h.range) : undefined,
      };
    },
  });

  monaco.languages.registerDefinitionProvider(_lspLanguages, {
    provideDefinition: async (model: any, position: any) => {
      const list = toLocationList(await lspAsk(model, "definition", position));
      return list.map((l) => ({
        uri: monaco.Uri.parse(l.uri),
        range: toMonacoRange(l.range),
      }));
    },
  });

  monaco.languages.registerReferenceProvider(_lspLanguages, {
    provideReferences: async (model: any, position: any) => {
      const list = toLocationList(await lspAsk(model, "references", position));
      return list.map((l) => ({
        uri: monaco.Uri.parse(l.uri),
        range: toMonacoRange(l.range),
      }));
    },
  });

  monaco.languages.registerCompletionItemProvider(_lspLanguages, {
    triggerCharacters: [".", ":", ">", "/", '"', "'"],
    provideCompletionItems: async (model: any, position: any) => {
      const r = await lspAsk(model, "completion", position);
      const items = Array.isArray(r) ? r : (r && r.items) || [];
      if (!items.length) return { suggestions: [] };
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      return {
        suggestions: items.slice(0, 400).map((it: any) => ({
          label: String(it.label || ""),
          kind: monaco.languages.CompletionItemKind[
            completionKindName(it.kind)
          ],
          detail: it.detail || undefined,
          documentation: it.documentation
            ? { value: hoverToMarkdown(it.documentation) }
            : undefined,
          // insertText only — no snippet syntax is requested from the server
          // (see CLIENT_CAPABILITIES) and none is expanded here.
          insertText: String(it.insertText || it.label || ""),
          sortText: it.sortText || undefined,
          filterText: it.filterText || undefined,
          range,
        })),
      };
    },
  });

  // Every file model, however it was opened, is kept in step. Hooking the
  // models rather than the file-opening code means nothing has to remember to
  // call this.
  monaco.editor.onDidCreateModel((model: any) => {
    if (!lspFileOf(model)) return;
    lspScheduleSync(monaco, model);
    model.onDidChangeContent(() => lspScheduleSync(monaco, model));
  });
  monaco.editor.onWillDisposeModel((model: any) => {
    const file = lspFileOf(model);
    if (!file || !_lspRoot) return;
    clearTimeout(_lspTimers.get(model.uri.toString()));
    lspPost("/lsp/close", {
      root: _lspRoot,
      path: file,
      languageId: model.getLanguageId(),
    });
  });
  for (const model of monaco.editor.getModels()) {
    if (!lspFileOf(model)) continue;
    lspScheduleSync(monaco, model);
    model.onDidChangeContent(() => lspScheduleSync(monaco, model));
  }
}
