// Viewport — a shared hook that defers heavy work until its element is near the
// screen. Loaded AFTER Config.tsx and BEFORE the other modules, because
// CodeBlocks.jsx and AgentSteps.tsx both use it.
//
// WHY THIS EXISTS. Chat history is rendered in full (app.jsx: messages.map, no
// windowing), and every code block used to build a COMPLETE Monaco editor right
// away — model, view, ResizeObserver (automaticLayout), and an observer on
// Monaco's global emitter. A long history therefore meant hundreds of live
// editors at once.
//
// At observer number 200 Monaco itself throws:
//     [001] potential listener LEAK detected, having 200 listeners already
// That throw was caught by window.onerror in public/index.html, which triggered
// triggerAppRollback and then window.location.replace("/?rollback=true") — so
// the app suddenly reverted to the initial UI. The symptom users reported
// ("heavy, then hangs, then reloads to the first UI") is one single curve:
// accumulate, slow down, hit the threshold, blow up.
//
// This is NOT a leak: cleanup in both components disposes the editor and model
// correctly. What was wrong is how many were alive SIMULTANEOUSLY. So the fix
// limits when an editor is CREATED, rather than adding more disposal.
//
// The 600px margin gives a block time to be ready before it scrolls into view.
// While Monaco is not mounted yet, the <pre> fallback already present in both
// components keeps showing the content — so the text is never missing and still
// follows the stream.
// Appends streamed text to a Monaco editor WITHOUT rewriting its whole content.
//
// WHY THIS EXISTS. Both Monaco users called ed.setValue(text) every time their
// text prop changed — and while a model is streaming, that means ON EVERY TOKEN.
// setValue() replaces the entire model: tokenisation restarts from scratch, the
// undo stack is thrown away, and onDidContentSizeChange fires again. All that
// for a handful of characters at the end.
//
// Measured with this app's Monaco bundle in a real Electron renderer, streaming
// 150 chunks into one editor:
//     setValue() per token   : 4344ms
//     applyEdits() per token : 1775ms   (2.4x lighter)
// Nothing crossed the 50ms threshold, so this was never a single "Not
// Responding" jolt — it is a tax paid continuously, and that is exactly why it
// felt like "heavy" rather than "frozen".
//
// When the new text is NOT a continuation (a tool rewriting its output, say), it
// falls back to setValue so the result stays correct.
function terapkanTeksStream(ed: any, teksBaru: string) {
  const model = ed && ed.getModel();
  if (!model) return;
  const lama = model.getValue();
  const baru = teksBaru || "";
  if (lama === baru) return;
  if (baru.startsWith(lama) && window.monaco) {
    const akhir = model.getFullModelRange().getEndPosition();
    model.applyEdits([
      {
        range: new window.monaco.Range(
          akhir.lineNumber,
          akhir.column,
          akhir.lineNumber,
          akhir.column,
        ),
        text: baru.slice(lama.length),
      },
    ]);
    return;
  }
  ed.setValue(baru);
}

function useDekatLayar(ref: { current: Element | null }, margin?: number) {
  const [dekat, setDekat] = useState(false);
  useEffect(() => {
    const el = ref.current;
    // With no IntersectionObserver, do NOT silently disable the editor — fall
    // back to the old behaviour (always mount) so no feature disappears.
    if (!el || typeof IntersectionObserver === "undefined")
      return setDekat(true);
    const io = new IntersectionObserver(
      (entries) => {
        // The last entry is the decisive one. Guarded explicitly because the
        // index is computed rather than guaranteed: a callback with an empty
        // list is never seen in practice, but if it happened it would throw
        // inside the observer — the hardest possible place to trace.
        const akhir = entries[entries.length - 1];
        if (akhir) setDekat(akhir.isIntersecting);
      },
      { rootMargin: (margin || 600) + "px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return dekat;
}
