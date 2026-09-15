// A2UI.tsx — the agent's proposed panel, drawn with WOLFSPACE's own controls.
//
// ROLE IN THE SYSTEM. The agent's ui_propose tool (agent/a2ui.ts validates
// it) emits t:"a2ui" with a flat component list, a data model and an
// anchor. This renders that list from a CLOSED catalog -- the same names
// the validator accepts, nothing else -- anchored to the element Visual
// Draw pointed at. While the user adjusts, `preview` CSS is applied inline
// to the target so the change is seen before it is made; Apply or Cancel
// sends one line back to the agent as the next user message, and the
// preview is removed either way.
//
// Concatenated BEFORE app.tsx (see APP_MODULES in index.html); function
// declarations hoist, so App() can render <A2UIPanel/> by name.

/** The element a selector names, in WOLFSPACE or in the Live Browser. */
function a2uiCariElemen(selector: string, getFrameDoc?: () => Document | null) {
  const cari = (doc: Document | null) => {
    if (!doc) return null;
    try {
      return doc.querySelector(selector);
    } catch (_) {
      return null; // an invalid selector is a no-op, not an exception
    }
  };
  const fd = getFrameDoc ? getFrameDoc() : null;
  return cari(fd) || cari(document);
}

/** "{padX}" placeholders replaced from the data model. */
function a2uiIsiTemplat(val: string, data: Record<string, any>) {
  return String(val).replace(/\{([a-zA-Z][a-zA-Z0-9_-]*)\}/g, (_m, k) =>
    k in data ? String(data[k]) : "",
  );
}

function A2UIPanel({
  proposal,
  getFrameDoc,
  onSelesai,
}: {
  proposal: any;
  getFrameDoc?: () => Document | null;
  /** (action, data) — the caller turns it into the next user message. */
  onSelesai: (aksi: string, data: Record<string, any>) => void;
}) {
  const [data, setData] = React.useState<Record<string, any>>(() => ({
    ...(proposal.dataModel || {}),
  }));
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(
    null,
  );
  // The target's inline style before the preview touched it, restored on
  // cancel and on unmount. Only the properties the preview writes.
  const asliRef = React.useRef<{
    el: HTMLElement;
    asli: Record<string, string>;
  } | null>(null);

  const byId = React.useMemo(() => {
    const m: Record<string, any> = {};
    for (const c of proposal.components || []) m[c.id] = c;
    return m;
  }, [proposal]);
  // Roots: components no one lists as a child.
  const akar = React.useMemo(() => {
    const anak = new Set<string>();
    for (const c of proposal.components || [])
      for (const ch of c.children || []) anak.add(ch);
    return (proposal.components || []).filter((c: any) => !anak.has(c.id));
  }, [proposal]);

  // Anchor: below the target, clamped into the viewport. Recomputed on
  // resize; the target is looked up each time so a re-render of the page
  // does not strand the panel.
  React.useEffect(() => {
    const letak = () => {
      const el = a2uiCariElemen(
        proposal.anchor,
        getFrameDoc,
      ) as HTMLElement | null;
      if (!el) {
        setPos({ top: 80, left: Math.max(16, window.innerWidth - 336) });
        return;
      }
      const r = el.getBoundingClientRect();
      // Inside the Live Browser the rect is relative to the iframe; add its
      // offset in WOLFSPACE's own viewport.
      let dx = 0;
      let dy = 0;
      const fd = getFrameDoc ? getFrameDoc() : null;
      if (
        fd &&
        el.ownerDocument === fd &&
        fd.defaultView &&
        fd.defaultView.frameElement
      ) {
        const fr = fd.defaultView.frameElement.getBoundingClientRect();
        dx = fr.left;
        dy = fr.top;
      }
      const lebar = 320;
      const left = Math.min(
        Math.max(16, r.left + dx),
        window.innerWidth - lebar - 16,
      );
      const top = Math.min(r.bottom + dy + 8, window.innerHeight - 240);
      setPos({ top, left });
    };
    letak();
    window.addEventListener("resize", letak);
    return () => window.removeEventListener("resize", letak);
  }, [proposal, getFrameDoc]);

  // Live preview: every change writes the templated CSS to the target.
  React.useEffect(() => {
    const p = proposal.preview;
    if (!p) return;
    const el = a2uiCariElemen(p.selector, getFrameDoc) as HTMLElement | null;
    if (!el) return;
    if (!asliRef.current) {
      const asli: Record<string, string> = {};
      for (const prop of Object.keys(p.css || {}))
        asli[prop] = el.style.getPropertyValue(prop);
      asliRef.current = { el, asli };
    }
    for (const [prop, val] of Object.entries(p.css || {})) {
      el.style.setProperty(prop, a2uiIsiTemplat(val as string, data));
    }
  }, [data, proposal, getFrameDoc]);

  const pulihkan = React.useCallback(() => {
    const s = asliRef.current;
    if (!s) return;
    for (const [prop, val] of Object.entries(s.asli)) {
      if (val) s.el.style.setProperty(prop, val);
      else s.el.style.removeProperty(prop);
    }
    asliRef.current = null;
  }, []);
  React.useEffect(() => pulihkan, [pulihkan]);

  const selesai = (aksi: string) => {
    // Apply keeps the preview on screen until the agent's edit lands and the
    // page reloads; cancel puts things back now.
    if (aksi !== "apply") pulihkan();
    onSelesai(aksi, { ...data });
  };

  const ubah = (k: string, v: any) => setData((d) => ({ ...d, [k]: v }));

  const render = (c: any): any => {
    if (!c) return null;
    const p = c.props || {};
    const anak = (c.children || []).map((id: string) => render(byId[id]));
    switch (c.type) {
      case "Card":
        return (
          <div key={c.id} className="a2ui-card">
            {p.title && <div className="a2ui-judul">{p.title}</div>}
            {p.description && <div className="a2ui-ket">{p.description}</div>}
            {anak}
          </div>
        );
      case "Text":
        return (
          <div key={c.id} className={"a2ui-teks" + (p.muted ? " redup" : "")}>
            {p.text}
          </div>
        );
      case "Slider": {
        const v = Number(data[c.bind] ?? p.min ?? 0);
        return (
          <label key={c.id} className="a2ui-baris">
            <span className="a2ui-label">{p.label}</span>
            <input
              type="range"
              min={p.min ?? 0}
              max={p.max ?? 100}
              step={p.step ?? 1}
              value={v}
              onChange={(e: any) => ubah(c.bind, Number(e.target.value))}
            />
            <span className="a2ui-nilai">
              {v}
              {p.unit || ""}
            </span>
          </label>
        );
      }
      case "Select":
        return (
          <label key={c.id} className="a2ui-baris">
            <span className="a2ui-label">{p.label}</span>
            <select
              value={String(data[c.bind] ?? "")}
              onChange={(e: any) => ubah(c.bind, e.target.value)}
            >
              {(p.options || []).map((o: string) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        );
      case "Toggle":
        return (
          <label key={c.id} className="a2ui-baris">
            <span className="a2ui-label">{p.label}</span>
            <input
              type="checkbox"
              checked={!!data[c.bind]}
              onChange={(e: any) => ubah(c.bind, !!e.target.checked)}
            />
          </label>
        );
      case "Actions":
        return (
          <div key={c.id} className="a2ui-aksi">
            {anak}
          </div>
        );
      case "Button":
        return (
          <button
            key={c.id}
            type="button"
            className={
              "btn-reset a2ui-btn" +
              (p.primary ? " utama" : "") +
              (p.danger ? " bahaya" : "")
            }
            onClick={() => selesai(c.action || "choose")}
          >
            {p.label || c.action}
          </button>
        );
      default:
        // The validator never lets an unknown type through; if one arrives,
        // draw nothing rather than guess.
        return null;
    }
  };

  if (!pos) return null;
  return (
    <div
      className="a2ui-panel"
      role="dialog"
      aria-label="Proposal from the agent"
      style={{ top: pos.top, left: pos.left }}
    >
      {akar.map((c: any) => render(c))}
    </div>
  );
}

// The bundle is one IIFE, so nothing here is reachable from outside it. This
// one handle exists for the headless render check (tests mount the panel
// with a real payload and read what it answers); the app itself renders it
// by name from App().
if (typeof window !== "undefined") {
  (window as any).__wolfspaceA2UIPanel = A2UIPanel;
}
