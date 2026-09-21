// AgentDiff.ts — the green and red marks showing what the agent just changed in
// the open file.
//
// ROLE IN THE SYSTEM. It closes the gap between the chat and the editor: a tool
// call scrolls past in the conversation, and this is what makes its effect
// visible in the code the user is actually looking at. The marks clear on the
// next click or Escape.
//
// One Monaco detail worth keeping: decorations are applied through
// model.deltaDecorations. createDecorationsCollection belongs to the EDITOR,
// not the model, and calling it on a model throws at run time — verified
// against the vendored Monaco bundle, after it shipped once.
//
// When the agent writes a file that is open, two things used to happen, and
// both were wrong:
//
//   1. NOTHING WAS SHOWN. The user watched a tool call scroll past in the chat
//      and had no way to see what it did to the code in front of them, short of
//      reading the whole file again.
//   2. THE EDITOR WENT STALE. Models are cached by path and nothing reloaded
//      them, so the buffer on screen still held the text from before the agent
//      touched it — and the next manual save would have written that stale text
//      back over the agent's work.
//
// So an agent write now reloads the file AND marks what moved: added lines in
// green, a red bar in the gutter where lines were removed. The same convention
// Cursor and Copilot's agent mode use, and the same one this app's own chat
// already uses for a diff.
//
// ── WHY THE HIGHLIGHT CLEARS ON THE NEXT KEYSTROKE ──
//
// There is no accept/reject here, deliberately: the agent has already written
// to disk, and offering a "reject" that does not revert would be a lie. The
// marks are a REPORT, not a prompt — so they stay until the user touches the
// file themselves, which is the moment they stop being about the agent's edit.

/** Hunks are reported in NEW-file line numbers, 1-based, as Monaco counts. */
const DIFF_MAX_LINES = 1200;

/**
 * Which lines changed between two versions of a file.
 *
 * Common prefix and suffix are trimmed first, which is what makes this cheap in
 * the case that actually happens: an agent edit touches a few lines in the
 * middle of a file, so the quadratic part runs over those few rather than over
 * the whole thing.
 *
 * Beyond DIFF_MAX_LINES of genuinely-differing middle the table is skipped and
 * one coarse hunk is reported instead. A precise diff of a 5,000-line rewrite
 * costs 25 million cells to tell the user something they can already see.
 */
function diffLines(before: any, after: any) {
  const a = String(before == null ? "" : before).split("\n");
  const b = String(after == null ? "" : after).split("\n");
  let s = 0;
  while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length;
  let eb = b.length;
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) {
    ea--;
    eb--;
  }
  const na = ea - s;
  const nb = eb - s;
  if (na === 0 && nb === 0) return [];
  if (na > DIFF_MAX_LINES || nb > DIFF_MAX_LINES)
    return [{ startLine: s + 1, endLine: eb, added: nb, removed: na }];

  // Longest common subsequence over the differing middle only.
  const t = new Uint32Array((na + 1) * (nb + 1));
  // `sel` rather than plain indexing: noUncheckedIndexedAccess types every
  // array read as possibly-undefined, and a typed array cannot be.
  const sel = (i: number, j: number) => t[i * (nb + 1) + j] as number;
  const set = (i: number, j: number, v: number) => {
    t[i * (nb + 1) + j] = v;
  };
  const sama = (i: number, j: number) => a[s + i] === b[s + j];
  for (let i = na - 1; i >= 0; i--)
    for (let j = nb - 1; j >= 0; j--)
      set(
        i,
        j,
        sama(i, j)
          ? sel(i + 1, j + 1) + 1
          : Math.max(sel(i + 1, j), sel(i, j + 1)),
      );

  const hunks: any[] = [];
  let i = 0;
  let j = 0;
  let cur: any = null;
  const tutup = () => {
    if (cur) hunks.push(cur);
    cur = null;
  };
  while (i < na && j < nb) {
    if (sama(i, j)) {
      tutup();
      i++;
      j++;
    } else if (sel(i + 1, j) >= sel(i, j + 1)) {
      // A line present only in the OLD file: a removal. It is recorded against
      // the line it sat in front of, because the new file has nowhere to put it.
      cur = cur || {
        startLine: s + j + 1,
        endLine: s + j,
        added: 0,
        removed: 0,
      };
      cur.removed++;
      i++;
    } else {
      cur = cur || {
        startLine: s + j + 1,
        endLine: s + j,
        added: 0,
        removed: 0,
      };
      cur.added++;
      cur.endLine = s + j + 1;
      j++;
    }
  }
  while (i < na) {
    cur = cur || { startLine: s + j + 1, endLine: s + j, added: 0, removed: 0 };
    cur.removed++;
    i++;
  }
  while (j < nb) {
    cur = cur || { startLine: s + j + 1, endLine: s + j, added: 0, removed: 0 };
    cur.added++;
    cur.endLine = s + j + 1;
    j++;
  }
  tutup();
  // EVERY REPORTED LINE MUST EXIST IN THE NEW FILE, and one case breaks that on
  // its own: deleting everything after the common prefix leaves the removal
  // recorded one line past the end. Found by the invariant test rather than by
  // reading — `applyAgentHighlights` clamps too, but a rule that only holds
  // because its one caller repairs it is not a rule.
  const akhirBaru = Math.max(1, b.length);
  for (const h of hunks) {
    h.startLine = Math.max(1, Math.min(h.startLine, akhirBaru));
    h.endLine = Math.max(
      h.added > 0 ? h.startLine : 0,
      Math.min(h.endLine, akhirBaru),
    );
  }
  return hunks;
}

/**
 * Which open buffer does a path from the agent refer to?
 *
 * The agent reports paths in whatever shape its tool used — absolute, relative,
 * with either separator — while Monaco holds a URI path like `/c:/a/b.py`. An
 * exact match is tried first; failing that, the unique buffer whose path ENDS
 * with the reported one. Ambiguity answers with nothing rather than guessing:
 * decorating the wrong file is worse than decorating none.
 */
function pickModelPath(uriPaths: any, reported: any) {
  const norm = (x: any) =>
    String(x || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .toLowerCase();
  const target = norm(reported);
  if (!target) return "";
  const daftar = (uriPaths || []).filter(Boolean);
  for (const u of daftar) if (norm(u) === target) return u;
  const cocok = daftar.filter((u: any) => norm(u).endsWith("/" + target));
  return cocok.length === 1 ? cocok[0] : "";
}

// ── The Monaco half ─────────────────────────────────────────────────────────

/**
 * Live highlight per model URI, so a second edit replaces the first.
 *
 * ── deltaDecorations, NOT createDecorationsCollection ────────────────────────
 *
 * The first version called `model.createDecorationsCollection(...)` and it
 * CRASHED in the running app:
 *
 *     TypeError: model.createDecorationsCollection is not a function
 *
 * That method belongs to the EDITOR, not to the text model — verified in the
 * vendored bundle, where Monaco's own code reads
 * `this.editor.createDecorationsCollection()` for the editor and
 * `this._model.deltaDecorations([], i)` for a model.
 *
 * The test did not catch it because its fake model was built to my belief about
 * the API rather than to the API, so it validated the mistake. The counter-
 * measure is in tests/agent-diff.test.ts: the method name is now checked
 * against the vendored Monaco itself.
 *
 * Decorating the MODEL is also the better of the two: the same file can be open
 * in both split panes, and a model decoration shows in every editor displaying
 * it, while an editor collection shows in one.
 */
const _agentMarks = new Map();

function clearAgentMarks(model: any) {
  if (!model) return;
  const uri = String(model.uri);
  const ids = _agentMarks.get(uri);
  _agentMarks.delete(uri);
  if (!ids || !ids.length) return;
  try {
    if (!model.isDisposed()) model.deltaDecorations(ids, []);
  } catch (_) {}
}

/** Paint the hunks. Returns how many decorations were applied. */
function applyAgentHighlights(monaco: any, model: any, hunks: any) {
  if (!monaco || !model || model.isDisposed()) return 0;
  clearAgentMarks(model);
  if (!hunks || !hunks.length) return 0;
  const total = model.getLineCount();
  const dec: any[] = [];
  for (const h of hunks) {
    if (h.added > 0) {
      // Clamped: a hunk computed against text that has since changed would
      // otherwise ask Monaco for a line that does not exist.
      const awal = Math.max(1, Math.min(h.startLine, total));
      const akhir = Math.max(awal, Math.min(h.endLine, total));
      dec.push({
        range: new monaco.Range(awal, 1, akhir, 1),
        options: {
          isWholeLine: true,
          className: "agen-baris-tambah",
          linesDecorationsClassName: "agen-gutter-tambah",
          overviewRuler: {
            color: "rgba(63,185,80,0.7)",
            position: monaco.editor.OverviewRulerLane.Left,
          },
        },
      });
    }
    if (h.removed > 0) {
      // A removal has no line of its own in the new file, so it is marked in
      // the gutter beside the line that took its place. Without this, deleting
      // code would leave no trace at all.
      const baris = Math.max(1, Math.min(h.startLine, total));
      dec.push({
        range: new monaco.Range(baris, 1, baris, 1),
        options: {
          linesDecorationsClassName: "agen-gutter-hapus",
          overviewRuler: {
            color: "rgba(248,81,73,0.7)",
            position: monaco.editor.OverviewRulerLane.Left,
          },
        },
      });
    }
  }
  if (!dec.length) return 0;
  _agentMarks.set(String(model.uri), model.deltaDecorations([], dec));
  return dec.length;
}

/**
 * Reload one file the agent wrote, and mark what moved.
 *
 * The buffer is only replaced when the text on disk actually differs, so an
 * agent tool that reported a write without changing anything does not push an
 * undo entry into the user's history for nothing.
 */
async function refreshAfterAgentEdit(monaco: any, reported: any) {
  if (!monaco || !monaco.editor) return null;
  const models = monaco.editor.getModels().filter((m: any) => {
    try {
      return m.uri.scheme === "file" && !m.isDisposed();
    } catch (_) {
      return false;
    }
  });
  const pilih = pickModelPath(
    models.map((m: any) => m.uri.path),
    reported,
  );
  if (!pilih) return null;
  const model = models.find((m: any) => m.uri.path === pilih);
  if (!model) return null;
  const abs = uriToLocalPath(model.uri.toString());
  let teks = "";
  try {
    const r = await fetch(
      "/preview-file?raw=1&path=" + encodeURIComponent(abs),
    );
    if (!r.ok) return null;
    teks = await r.text();
  } catch (_) {
    return null;
  }
  const sebelum = model.getValue();
  if (sebelum === teks) return null;
  const hunks = diffLines(sebelum, teks);
  // setValue rather than an edit operation: the whole file came back, and
  // pushEditOperations with one full-range edit is the same undo entry anyway.
  model.setValue(teks);
  const n = applyAgentHighlights(monaco, model, hunks);
  // The marks are about the agent's edit. The moment the user types, they are
  // about something else — so they go.
  const lepas = model.onDidChangeContent(() => {
    clearAgentMarks(model);
    try {
      lepas.dispose();
    } catch (_) {}
  });
  return { hunks, applied: n };
}

/** Listen for the agent's writes. Installed once, beside the LSP providers. */
/**
 * ── A CLICK DISMISSES THE MARKS ──
 *
 * The first version only cleared them when the user TYPED, and that turned out
 * to be the wrong moment: reading the change is the whole point of the marks,
 * and having read it the natural gesture is to click — not to edit. So the
 * highlight sat there with no way to put it away short of typing something.
 *
 * Three ways out now, and they are the three things a person actually does when
 * they are finished looking: click in the file, press Escape, or start editing.
 * All of them are per-model, so dismissing one file leaves another file's marks
 * alone.
 */
const _diawasi = new WeakSet();
function watchEditorForDismiss(monaco: any, ed: any) {
  if (!ed || _diawasi.has(ed)) return;
  _diawasi.add(ed);
  try {
    ed.onMouseDown(() => clearAgentMarks(ed.getModel()));
    ed.onKeyDown((e: any) => {
      if (e && e.keyCode === monaco.KeyCode.Escape)
        clearAgentMarks(ed.getModel());
    });
  } catch (_) {
    // An editor that refuses a listener is not a reason to lose the feature —
    // typing still clears, and that path lives on the model.
  }
}

let _agentDiffInstalled = false;
function installAgentDiff(monaco: any) {
  if (_agentDiffInstalled || !monaco) return;
  _agentDiffInstalled = true;
  // Editors that exist now, and every one made later. The panes are created and
  // destroyed as the user splits the view, so subscribing once to the ones
  // present would leave a fresh pane unable to dismiss anything.
  try {
    if (typeof monaco.editor.getEditors === "function")
      for (const ed of monaco.editor.getEditors())
        watchEditorForDismiss(monaco, ed);
    if (typeof monaco.editor.onDidCreateEditor === "function")
      monaco.editor.onDidCreateEditor((ed: any) =>
        watchEditorForDismiss(monaco, ed),
      );
  } catch (_) {}
  window.addEventListener("wolfspace_agent_act", (e: any) => {
    const d = (e && e.detail) || {};
    // The same filter the INFO panel and the preview use, and for the same
    // reason: only the tools that CHANGE a file are worth reacting to.
    if (!/write|edit|create|apply|save/i.test(String(d.kind || ""))) return;
    if (d.ok === false) return;
    const p = String(d.path || "");
    if (!p) return;
    refreshAfterAgentEdit(monaco, p);
  });
}
