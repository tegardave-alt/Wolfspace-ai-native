// usePreviewPanel — the state and behaviour of the "Web Dev Live Browser",
// extracted from App(). Loaded via APP_MODULES in index.html (CONCATenated ahead
// of app.jsx, one shared global scope).
//
// WHY A HOOK, NOT A COMPONENT.
// Moving the preview JSX into a component would require App() to pass url,
// inputUrl, refreshKey, a ref, and four setters — five or six props purely to
// hand back what had just been moved out. What piles up in App() is not the
// markup, it is the STATE. A hook moves that state out without adding a single
// prop: App() calls one line and uses the result directly in the JSX it already
// has.
//
// ONE COUPLING MADE EXPLICIT.
// The auto-preview effect used to call setPanelOpen(true) directly — this hook
// must not know about the right-hand panel. So it takes `onAutoOpen` and calls
// that instead. The same dependency, but now visible in the function signature
// rather than buried in the middle of an effect.

function usePreviewPanel({
  selectedProject,
  onAutoOpen,
}: {
  selectedProject?: unknown;
  onAutoOpen?: () => void;
}) {
  const [url, setUrl] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // A ref to the iframe, so the Visual Picker can reach the document INSIDE its
  // render (not merely the <iframe> element itself).
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // onAutoOpen is held in a ref so the effect below does NOT re-subscribe on
  // every render. The original effect depended only on [selectedProject]; if the
  // callback joined the dependency array, the listener would be detached and
  // reattached every render and the behaviour would change silently.
  const autoOpenRef = useRef(onAutoOpen);
  autoOpenRef.current = onAutoOpen;

  const getDoc = useCallback(() => {
    const f = iframeRef.current;
    return (f && f.contentDocument) || null;
  }, []);

  const refresh = useCallback(() => {
    setGagalLuar("");
    setRefreshKey((k) => k + 1);
  }, []);

  // ── External sites load through <webview>, not <iframe> ──
  //
  // An <iframe> in this renderer CANNOT load an external site at all. Measured to
  // the end: the subFrame request is sent and then net::ERR_ABORTED before a
  // single response header comes back. Ruled out as causes, each tested
  // separately: the iframe sandbox attribute, the production CSP <meta>, the
  // site's X-Frame-Options, the Electron User-Agent, and the network (net.fetch
  // from the main process returned 200, 473 KB from Bing).
  //
  // The decisive test was a user-facing one: wikipedia.org came up blank too,
  // even though Wikipedia is PROVABLY frameable — 3600 characters rendered in a
  // clean Chromium under exactly the same CSP. So this is not a per-site policy.
  //
  // A <webview> is not a subframe: it is a guest WebContents that navigates
  // itself. Local files STILL go through <iframe>, because the Visual Picker
  // reaches into contentDocument and a webview does not allow that.
  // An EMPTY container that only marks WHERE the browser should be drawn. Its
  // content is not DOM: the WebContentsView lives in the main process and floats
  // above the window, so what is sent there is this container's rectangle.
  const slotRef = useRef<HTMLElement | null>(null);
  const [gagalLuar, setGagalLuar] = useState("");

  const navigate = useCallback((urlOrPath) => {
    const t = tafsirkanAlamat(urlOrPath);
    if (!t) return;
    setGagalLuar("");
    setUrl(t.url);
    // What the bar shows is the RESOLVED result, just as a browser does: typing
    // "github.com" and watching it become "https://github.com" is the feedback
    // that the guess was right. For files the original path is kept — that is the
    // useful part, not /preview-file?path=…
    setInputUrl(t.tampil);
  }, []);

  // Auto-throw: when the agent WRITES/CHANGES an .html file, render it in the
  // preview panel immediately; if the same file is rewritten, refreshing the
  // iframe is enough. The source of truth for the path is d.path (the tool's
  // resolved result — accurate even when workspace containment remaps a write to
  // another folder); fallback: parse d.arg, resolving a relative path against the
  // active working folder or the WOLFSPACE root.
  useEffect(() => {
    const onActPreview = (e: Event & { detail?: any }) => {
      const d = (e && e.detail) || {};
      if (!/write|edit|create|apply|save/i.test(String(d.kind || ""))) return;
      if (d.ok === false) return; // tulisan gagal — jangan preview

      const p = resolveHtmlPath(d, selectedProject);
      if (!p) return;

      const target = "/preview-file?path=" + encodeURIComponent(p);
      setUrl((cur) => {
        if (cur === target) {
          setRefreshKey((k) => k + 1);
          return cur;
        }
        setInputUrl(p);
        return target;
      });
      if (autoOpenRef.current) autoOpenRef.current();
    };
    window.addEventListener("wolfspace_agent_act", onActPreview);
    return () =>
      window.removeEventListener("wolfspace_agent_act", onActPreview);
  }, [selectedProject]);

  // External addresses (http/https) -> WebContentsView; the rest (files) -> <iframe>.
  const alamatLuar = /^https?:\/\//i.test(url);

  const ipc =
    typeof window !== "undefined" && window.WOLFSPACE && window.WOLFSPACE.ipc
      ? window.WOLFSPACE
      : null;

  // The view's position is fed from here, and MUST keep being fed: it floats
  // above the window, so it does not move when the panel is resized, the sidebar
  // opens, or the window changes size. One observer covers all three.
  useEffect(() => {
    if (!ipc || !alamatLuar) {
      if (ipc) ipc.invoke("browser", { aksi: "sembunyi" }).catch(() => {});
      return;
    }
    const el = slotRef.current;
    if (!el) return;
    let terakhir = "";
    let mati = false; // proses main belum punya kanal ini -> berhenti mencoba
    const suapi = (aksi: string) => {
      if (mati) return;
      const r = el.getBoundingClientRect();
      const kunci = [r.x, r.y, r.width, r.height].join(",");
      if (aksi === "tampil" && kunci === terakhir) return;
      terakhir = kunci;
      // Failure MUST be caught. The heartbeat below calls this 2.5x per second;
      // without .catch, one un-updated main process floods the console with
      // "unknown invoke channel: browser" endlessly — and the user is still never
      // told what to actually do about it.
      //
      // The WebContentsView is created by the MAIN process, and hot reload does
      // not reach it. So after this update the app really does have to be closed
      // and reopened — and that is what is said here, once.
      ipc
        .invoke("browser", {
          aksi,
          url,
          bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
        })
        .then((r) => {
          // The RENDERER side logs what the MAIN side answered. Electron is two
          // engines, and when the panel is blank the question is always "which
          // one failed" — answerable only if both sides speak. Renderer
          // console.log is forwarded to WOLFSPACE-debug.log.
          if (aksi === "buka") console.warn("[browser:renderer] open ->", r);
          if (r && r.ok === false)
            setGagalLuar("Proses utama menolak: " + r.error);
          else if (r && r.bounds && (!r.bounds.width || !r.bounds.height))
            setGagalLuar(
              "Panel has zero size (" +
                r.bounds.width +
                "x" +
                r.bounds.height +
                ") — the browser has nowhere to draw.",
            );
        })
        .catch((e) => {
          mati = true;
          setGagalLuar(
            /unknown invoke channel/i.test(String((e && e.message) || e))
              ? "Quit and reopen WOLFSPACE — the browser panel is run by the " +
                  "main process, which hot-reload does not reach."
              : "Could not set up the browser panel: " +
                  ((e && e.message) || e),
          );
        });
    };
    suapi("buka");
    const ro = new ResizeObserver(() => suapi("tampil"));
    ro.observe(el);
    const onResize = () => suapi("tampil");
    window.addEventListener("resize", onResize);
    // The panel can move without changing size (sidebar opening/closing), and a
    // ResizeObserver does not see that. A slow heartbeat closes the gap without
    // costing anything meaningful.
    const nadi = setInterval(() => suapi("tampil"), 400);
    return () => {
      clearInterval(nadi);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      ipc.invoke("browser", { aksi: "sembunyi" }).catch(() => {});
    };
  }, [ipc, alamatLuar, url, refreshKey]);

  // State arrives over IPC, not from the DOM: the view lives in another process.
  useEffect(() => {
    if (!ipc || !ipc.onBrowser) return;
    return ipc.onBrowser((m) => {
      // Every event is logged, not only the ones the UI uses. When the panel is
      // blank, this sequence is what separates "never started loading" from
      // "loaded then failed" from "finished loading but is not visible" — three
      // causes that look identical on screen.
      console.warn("[browser:peristiwa]", m.t, m);
      if (m.t === "muat") setGagalLuar("");
      else if (m.t === "gagal")
        setGagalLuar((m.desc || "failed to load") + " (" + m.kode + ")");
      else if (m.t === "pindah" && m.url) setInputUrl(m.url);
    });
  }, [ipc]);

  return {
    url,
    inputUrl,
    setInputUrl,
    refreshKey,
    iframeRef,
    slotRef,
    luar: alamatLuar,
    getDoc,
    navigate,
    refresh,
    gagalLuar,
  };
}

// ── The address bar as an OMNIBOX, not just a path box ──
//
// It used to have only two branches: anything starting with http/https/app was a
// URL, everything else a file path. So the panel was useful only for viewing
// what the agent generated — typing "github.com" tried to open a FILE by that
// name and failed, and typing a question did nothing at all.
//
// The content is now interpreted the way a browser address bar does. The order
// matters, and the decisive rule is that a FILE EXTENSION IS CHECKED BEFORE A
// DOMAIN NAME: "index.html" must be a file even though it also matches the shape
// of a domain. Conversely "example.com" is not a file because ".com" is not an
// extension we recognise. Without that order, the most common case in this app —
// opening an agent-generated .html file — is exactly the one that breaks.
//
// Note also ".md" and ".sh": both are real TLDs (Moldova, Saint Helena), but in
// this app they almost always mean a file. That ambiguity is resolved toward
// files deliberately.
const _EKSTENSI_BERKAS =
  /\.(html?|md|markdown|txt|json|jsx?|tsx?|css|svg|xml|ya?ml|csv|log|sh|ps1|py|rb|go|rs|java|c|h|cpp|cs|php|toml|ini|pdf|png|jpe?g|gif|webp)$/i;

// A host with no scheme: "github.com", "sub.domain.co.uk/path", "localhost:3000".
const _BENTUK_HOST =
  /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#].*)?$/i;
const _BENTUK_LOKAL =
  /^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|(?:\d{1,3}\.){3}\d{1,3})(?::\d{1,5})?(?:[/?#].*)?$/i;

// DEFAULT search engine: Bing.
//
// The choice was decided by measurement, not taste. This panel is an <iframe>,
// and most search engines refuse to be shown inside a frame through their own
// headers — which cannot be overridden from our side. Measured:
//
//   Google      X-Frame-Options: SAMEORIGIN     -> NOT possible
//   Brave       X-Frame-Options: SAMEORIGIN     -> NOT possible
//   Startpage   X-Frame-Options: SAMEORIGIN     -> NOT possible
//   Mojeek      frame-ancestors 'none'          -> NOT possible
//   Bing        (no restricting header)         -> WORKS, real results rendered
//
// Overridable through localStorage `wolfspace_mesin_cari` (use %s for the query)
// for anyone running their own SearXNG, or who is happy to open results in an
// external browser via the "Open in an external tab/browser" button beside it.
const _MESIN_BAWAAN = "https://www.bing.com/search?q=%s";
function _mesinCari() {
  try {
    const m = localStorage.getItem("wolfspace_mesin_cari");
    if (m && m.includes("%s")) return m;
  } catch (_) {}
  return _MESIN_BAWAAN;
}

/**
 * Interpret the contents of the address bar.
 * @returns {{jenis: "url"|"berkas"|"cari", url: string, tampil: string}|null}
 */
function tafsirkanAlamat(teks: unknown) {
  const val = String(teks == null ? "" : teks).trim();
  if (!val) return null;

  const berkas = (p: string) => ({
    jenis: "berkas",
    url: "/preview-file?path=" + encodeURIComponent(p),
    tampil: p,
  });
  const langsung = (u: string) => ({ jenis: "url", url: u, tampil: u });

  // 1) An explicit scheme — the user already stated their intent; do not guess.
  if (/^(https?|app|file|data|about):/i.test(val)) return langsung(val);

  // 2) An absolute path: "C:\...", "\\server\share", "/usr/...".
  if (/^[a-zA-Z]:[\\/]/.test(val) || /^\\\\/.test(val) || /^\//.test(val))
    return berkas(val);

  // 3) An unmistakable relative path: contains a separator OR a known extension.
  //    MUST come before the domain check (see the note above).
  if (
    /^\.{1,2}[\\/]/.test(val) ||
    (/[\\/]/.test(val) && _EKSTENSI_BERKAS.test(val))
  )
    return berkas(val);
  if (_EKSTENSI_BERKAS.test(val) && !/\s/.test(val)) return berkas(val);

  // 4) A local host -> http (not https: dev servers rarely have a certificate,
  //    and https to a local port fails with a confusing certificate error).
  if (_BENTUK_LOKAL.test(val)) return langsung("http://" + val);

  // 5) A domain name -> https.
  if (_BENTUK_HOST.test(val)) return langsung("https://" + val);

  // 6) Anything else: treat it as a search query.
  return {
    jenis: "cari",
    url: _mesinCari().replace("%s", encodeURIComponent(val)),
    tampil: val,
  };
}

// Works out the absolute .html path from an agent act event. Split out of the
// effect above so its branching does not add two levels of indentation inside
// the listener — a shape required by the gate in agent/code-quality.cjs.
function resolveHtmlPath(
  d: { path?: unknown; arg?: unknown },
  selectedProject?: unknown,
) {
  if (/\.html?$/i.test(String(d.path || ""))) return String(d.path);

  const m = String(d.arg || "").match(/([^\s"'`]+\.html?)(?=[\s"'`]|$)/i);
  if (!m) return "";

  // m[1] is always present: the regex has exactly one capture group and m was
  // already null-guarded above. ?? "" states that without adding a dead branch.
  const p = m[1] ?? "";
  const isAbsolute = /^[a-zA-Z]:[\\\/]|^\\\\|^\//.test(p);
  if (isAbsolute) return p;

  const root = resolveWorkspaceRoot(selectedProject) || WOLFSPACE_ROOT;
  return (
    String(root).replace(/[\\\/]+$/, "") + "/" + p.replace(/^[.\/\\]+/, "")
  );
}
