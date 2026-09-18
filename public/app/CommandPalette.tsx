// CommandPalette.tsx — a VS Code-style command palette for the chat surface.
//
// UI STRUCTURE is taken from cmdk (github.com/pacocoursey/cmdk, the de-facto
// React command palette): an input on top, a scrolling list of grouped, fuzzy-
// ranked items, arrow-key navigation, Enter to run, Esc to close. It is
// reimplemented here in WOLFSPACE's global-React style (no bundler imports) and
// wears WOLFSPACE's own dark/light tokens instead of cmdk's CSS.
//
// ARCHITECTURE is taken from VS Code: the palette is a DUMB UI. Features do not
// know about it — they REGISTER commands into a central registry (usePerintah),
// and the palette only filters and runs them by id. That decoupling is why one
// component (the terminal, the MCP menu, git, the browser panel) can add its own
// commands without touching this file.
//
// CONNECTS TO
//   used by  public/app.tsx (mounts <CommandPalette/> + registers view commands)
//            and any feature component that calls usePerintah(...)
//   trigger  Ctrl/Cmd+Shift+P, and the ⌘ button in the top bar (TopBar)

// ── The registry ────────────────────────────────────────────────────────────
//
// A module-level Map keyed by OWNER (a component instance) so a component can
// replace its whole command set on every render-with-changed-deps and have it
// cleaned up on unmount. Kept OUTSIDE React state on purpose: registering must
// not re-render the registrar, only the open palette, which subscribes below.
const _regPerintah: Map<string, any[]> = new Map();
const _regDengar = new Set<() => void>();
let _regUrut = 0;

function _kabari() {
  for (const fn of _regDengar) {
    try {
      fn();
    } catch (_) {}
  }
}

/** Flatten every owner's commands into one list, registration order preserved. */
function semuaPerintah(): any[] {
  const keluar: any[] = [];
  for (const arr of _regPerintah.values())
    for (const c of arr) if (c && c.id) keluar.push(c);
  return keluar;
}

/**
 * Contribute commands to the palette for as long as this component is mounted.
 *
 * `bikin` returns the command list; it re-runs (and the registry is replaced for
 * this owner) whenever `deps` change, so a command's handler always closes over
 * fresh state. A command is:
 *   { id, judul, kategori?, kunci?, jalankan(), when?() , petunjuk? }
 * `when` (optional) hides the command when it returns false — VS Code's when-clause.
 */
function usePerintah(bikin: () => any[], deps: any[]) {
  const idRef = (React as any).useRef(null);
  if (idRef.current === null) idRef.current = "own" + ++_regUrut;
  (React as any).useEffect(() => {
    const cmds = (bikin() || []).filter(Boolean);
    _regPerintah.set(idRef.current, cmds);
    _kabari();
    return () => {
      _regPerintah.delete(idRef.current);
      _kabari();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ── Open/close, shared across the app via a tiny event ────────────────────────
//
// Any code can open the palette by dispatching "wolfspace_palette" — the top-bar
// button uses it, and so could a menu item — without a prop drilled through the
// whole tree. Ctrl/Cmd+Shift+P does the same.
function bukaPalette() {
  try {
    window.dispatchEvent(new CustomEvent("wolfspace_palette"));
  } catch (_) {}
}

// ── Fuzzy matching ────────────────────────────────────────────────────────────
//
// Subsequence scorer: every query char must appear in order. Consecutive matches
// and matches at a word boundary score higher, so "ot" ranks "Open Terminal"
// above "toggle bOTh". Returns null when the query does not match at all.
function _skor(teks: string, q: string): number | null {
  if (!q) return 0;
  const t = teks.toLowerCase();
  const query = q.toLowerCase();
  let ti = 0;
  let skor = 0;
  let beruntun = 0;
  for (let qi = 0; qi < query.length; qi++) {
    const c = query[qi];
    let found = -1;
    for (let j = ti; j < t.length; j++) {
      if (t[j] === c) {
        found = j;
        break;
      }
    }
    if (found === -1) return null;
    // Word-boundary bonus (start, or after a space/':'/'-').
    const sebelum = found === 0 ? " " : t.charAt(found - 1);
    if (/[\s:_-]/.test(sebelum)) skor += 8;
    beruntun = found === ti ? beruntun + 1 : 0;
    skor += 1 + beruntun * 3;
    ti = found + 1;
  }
  // Prefer shorter targets on ties (a tighter match).
  return skor - t.length * 0.05;
}

// The matched character indices of q within teks (greedy subsequence), used to
// bold the matched letters like VS Code. [] when q is empty or does not match.
function _posisiCocok(teks: string, q: string): number[] {
  if (!q) return [];
  const t = teks.toLowerCase();
  const query = q.toLowerCase();
  const pos: number[] = [];
  let ti = 0;
  for (let qi = 0; qi < query.length; qi++) {
    let found = -1;
    for (let j = ti; j < t.length; j++)
      if (t[j] === query[qi]) {
        found = j;
        break;
      }
    if (found === -1) return [];
    pos.push(found);
    ti = found + 1;
  }
  return pos;
}

// ── Most-recently-used, so a command you just ran floats to the top ──
const _MRU_KEY = "wolfspace_palette_mru";
function _mruBaca(): string[] {
  try {
    const a = JSON.parse(localStorage.getItem(_MRU_KEY) || "[]");
    return Array.isArray(a) ? a : [];
  } catch (_) {
    return [];
  }
}
function _mruTulis(id: string) {
  try {
    const a = _mruBaca().filter((x) => x !== id);
    a.unshift(id);
    localStorage.setItem(_MRU_KEY, JSON.stringify(a.slice(0, 20)));
  } catch (_) {}
}

function _cocok(cmds: any[], qMentah: string): any[] {
  // "?" is the help prefix (VS Code lists everything): treat it as empty.
  const q = qMentah.trim() === "?" ? "" : qMentah;
  const mru = _mruBaca();
  const mruIdx = (id: string) => {
    const i = mru.indexOf(id);
    return i === -1 ? 9999 : i;
  };
  const usable = cmds.filter((c) => {
    if (!c.when) return true;
    try {
      return c.when();
    } catch (_) {
      return true;
    }
  });
  if (!q) {
    // No query: most-recently-used first, then registration order.
    const withIdx = usable.map((c, i) => ({ c, i, judulPos: [] as number[] }));
    withIdx.sort(
      (a, b) => mruIdx(a.c.id) - mruIdx(b.c.id) || a.i - b.i,
    );
    return withIdx;
  }
  const dinilai = usable
    .map((c) => {
      const label = (c.kategori ? c.kategori + ": " : "") + (c.judul || c.id);
      return {
        c,
        skor: _skor(label, q),
        judulPos: _posisiCocok(c.judul || c.id, q),
      };
    })
    .filter((x) => x.skor !== null);
  dinilai.sort((a, b) => {
    // Score first; a recent command wins an otherwise-equal match (MRU tiebreak).
    const d = (b.skor as number) - (a.skor as number);
    if (Math.abs(d) > 0.001) return d;
    return mruIdx(a.c.id) - mruIdx(b.c.id);
  });
  return dinilai;
}

// Does a keydown event match a command's declared shortcut (e.g. "Ctrl+L",
// "Ctrl+Shift+N")? Strict: Ctrl+Shift+L must NOT fire a Ctrl+L binding.
function _cocokKombo(e: any, kunci: string): boolean {
  if (!kunci) return false;
  const p = kunci
    .toLowerCase()
    .split("+")
    .map((s) => s.trim());
  const key = p[p.length - 1];
  const perluMod = p.includes("ctrl") || p.includes("cmd");
  const perluShift = p.includes("shift");
  const perluAlt = p.includes("alt");
  const mod = !!(e.ctrlKey || e.metaKey);
  return (
    mod === perluMod &&
    !!e.shiftKey === perluShift &&
    !!e.altKey === perluAlt &&
    String(e.key || "").toLowerCase() === key
  );
}

// Render text with the matched characters bolded (VS Code-style). Returns an
// array of spans/marks; runs of matched/unmatched chars are coalesced.
function _sorotTeks(teks: string, pos: number[]): any {
  if (!pos || !pos.length) return teks;
  const set = new Set(pos);
  const out: any[] = [];
  let buf = "";
  let mark = false;
  const dorong = (i: number) => {
    if (!buf) return;
    out.push(
      mark ? (
        <mark className="kpal-sorot" key={i + "m"}>
          {buf}
        </mark>
      ) : (
        <span key={i + "s"}>{buf}</span>
      ),
    );
    buf = "";
  };
  for (let i = 0; i < teks.length; i++) {
    const m = set.has(i);
    if (m !== mark) {
      dorong(i);
      mark = m;
    }
    buf += teks[i];
  }
  dorong(teks.length);
  return out;
}

// A tiny layout glyph for the Panel Position commands: the outer rectangle is
// the workspace, the filled band is where the panel lands. It sits just left of
// the Ctrl keybinding and its shape matches the command's target side, so the
// row reads "… ▸ Ctrl+Shift+U" with the shortcut and a picture of the result.
// `sisi` is one of the position values: "kanan" (right), "kiri" (left),
// "bawah" (bottom).
function _ikonPosisi(sisi: string): any {
  const isi =
    sisi === "kiri" ? (
      <rect x="2.5" y="3.5" width="4.5" height="9" rx="1" fill="currentColor" />
    ) : sisi === "bawah" ? (
      <rect x="2.5" y="9" width="11" height="3.5" rx="1" fill="currentColor" />
    ) : (
      // "kanan" and any unknown value fall back to the right band.
      <rect x="9" y="3.5" width="4.5" height="9" rx="1" fill="currentColor" />
    );
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden="true"
    >
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
      {isi}
    </svg>
  );
}

// ── The palette component ─────────────────────────────────────────────────────
function CommandPalette() {
  const [buka, setBuka] = (React as any).useState(false);
  const [q, setQ] = (React as any).useState("");
  const [sorot, setSorot] = (React as any).useState(0); // highlighted index
  const [, paksa] = (React as any).useReducer((x: number) => x + 1, 0);
  const inputRef = (React as any).useRef(null);
  const daftarRef = (React as any).useRef(null);

  // Re-render when the registry changes while we are open.
  (React as any).useEffect(() => {
    const fn = () => paksa();
    _regDengar.add(fn);
    return () => {
      _regDengar.delete(fn);
    };
  }, []);

  // Open on Ctrl/Cmd+Shift+P or the shared event; close on Esc handled below.
  (React as any).useEffect(() => {
    const kunci = (e: any) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && (e.key === "P" || e.key === "p")) {
        e.preventDefault();
        setBuka((v: boolean) => !v);
      }
    };
    const lewatEvent = () => setBuka(true);
    window.addEventListener("keydown", kunci);
    window.addEventListener("wolfspace_palette", lewatEvent);
    return () => {
      window.removeEventListener("keydown", kunci);
      window.removeEventListener("wolfspace_palette", lewatEvent);
    };
  }, []);

  // Global keybindings: any command that declares a `kunci` (shown on the right,
  // VS Code-style) is bound here so the shortcut actually runs it — not only as a
  // hint. Skipped while the palette itself is open, so its own keys win.
  (React as any).useEffect(() => {
    const h = (e: any) => {
      if (e.defaultPrevented) return;
      if (document.querySelector(".kpal-overlay")) return;
      for (const c of semuaPerintah()) {
        if (c.kunci && _cocokKombo(e, c.kunci)) {
          e.preventDefault();
          try {
            c.jalankan();
          } catch (err) {
            console.error("[palette] shortcut failed:", c.id, err);
          }
          return;
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // Reset query + focus the input each time it opens.
  (React as any).useEffect(() => {
    if (buka) {
      setQ("");
      setSorot(0);
      setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
    }
  }, [buka]);

  const hasil = buka ? _cocok(semuaPerintah(), q) : [];
  const aman = Math.max(0, Math.min(sorot, hasil.length - 1));

  (React as any).useEffect(() => {
    // Keep the highlighted row in view as the arrow keys move it.
    const el =
      daftarRef.current &&
      daftarRef.current.querySelector('[data-sorot="1"]');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
  }, [aman, q, buka]);

  if (!buka) return null;

  const jalankan = (idx: number) => {
    const item = hasil[idx];
    if (!item) return;
    _mruTulis(item.c.id);
    setBuka(false);
    // Defer so the palette is gone before the action (which may itself open UI).
    setTimeout(() => {
      try {
        item.c.jalankan();
      } catch (e) {
        console.error("[palette] command failed:", item.c.id, e);
      }
    }, 0);
  };

  const onKey = (e: any) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setBuka(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSorot((s: number) => (hasil.length ? (s + 1) % hasil.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSorot((s: number) =>
        hasil.length ? (s - 1 + hasil.length) % hasil.length : 0,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      jalankan(aman);
    }
  };

  return (
    <div className="kpal-overlay" onMouseDown={() => setBuka(false)}>
      <div
        className="kpal-modal"
        onMouseDown={(e: any) => e.stopPropagation()}
        role="dialog"
        aria-label="Command Palette"
      >
        <div className="kpal-input-row">
          <svg
            className="kpal-cari-ikon"
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" x2="16.65" y1="21" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            className="kpal-input"
            placeholder="Type a command…  (View, Terminal, MCP, Git…)"
            value={q}
            onChange={(e: any) => {
              setQ(e.target.value);
              setSorot(0);
            }}
            onKeyDown={onKey}
          />
        </div>
        <div className="kpal-list" ref={daftarRef}>
          {hasil.length === 0 ? (
            <div className="kpal-kosong">No matching commands</div>
          ) : (
            hasil.map((x: any, i: number) => (
              <div
                key={x.c.id}
                className={"kpal-item" + (i === aman ? " kpal-aktif" : "")}
                data-sorot={i === aman ? "1" : "0"}
                onMouseEnter={() => setSorot(i)}
                onMouseDown={(e: any) => {
                  e.preventDefault();
                  jalankan(i);
                }}
              >
                {x.c.kategori ? (
                  <span className="kpal-kategori">{x.c.kategori}</span>
                ) : null}
                <span className="kpal-judul">
                  {_sorotTeks(x.c.judul || x.c.id, x.judulPos)}
                </span>
                {x.c.petunjuk ? (
                  <span className="kpal-petunjuk">{x.c.petunjuk}</span>
                ) : null}
                {x.c.posisiIkon ? (
                  <span className="kpal-ikon" aria-hidden="true">
                    {_ikonPosisi(x.c.posisiIkon)}
                  </span>
                ) : null}
                {x.c.kunci ? <span className="kpal-kunci">{x.c.kunci}</span> : null}
              </div>
            ))
          )}
        </div>
        <div className="kpal-kaki">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> run
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
          <span className="kpal-kaki-kanan">
            <kbd>?</kbd> all commands
          </span>
        </div>
      </div>
    </div>
  );
}
