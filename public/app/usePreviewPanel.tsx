// usePreviewPanel.tsx — the state and behaviour of the Web Dev Live Browser:
// the in-app browser pane that shows the site being worked on.
//
// See public/app.tsx for how the renderer is assembled.
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

// Device presets, as VS Code's integrated browser offers them: CSS size,
// mobile (touch + mobile screen), device pixel ratio. "Responsive" is the
// pane itself. Applied through Electron's device emulation, scaled to fit.
const PERANGKAT: {
  id: string;
  nama: string;
  sub?: string;
  lebar?: number;
  tinggi?: number;
  mobile?: boolean;
  dpr?: number;
}[] = [
  { id: "responsif", nama: "Responsive", sub: "fills the pane" },
  {
    id: "iphone-se",
    nama: "iPhone SE",
    lebar: 375,
    tinggi: 667,
    mobile: true,
    dpr: 2,
  },
  {
    id: "iphone-15",
    nama: "iPhone 15",
    lebar: 393,
    tinggi: 852,
    mobile: true,
    dpr: 3,
  },
  {
    id: "pixel-8",
    nama: "Pixel 8",
    lebar: 412,
    tinggi: 915,
    mobile: true,
    dpr: 2.625,
  },
  { id: "ipad", nama: "iPad", lebar: 768, tinggi: 1024, mobile: true, dpr: 2 },
  {
    id: "laptop",
    nama: "Laptop",
    lebar: 1366,
    tinggi: 768,
    mobile: false,
    dpr: 1,
  },
];

// What the app draws over the page: menus, dialogs, the palette, dropdowns,
// lightboxes. Anything else can opt in with a data-overlay attribute. Kept
// as class names so a live collection can watch them (see terhalang).
const KELAS_OVERLAY = [
  "kpal-overlay",
  "browser-pane-menu",
  "browser-riwayat",
  "browser-ukuran",
  "gh-overlay",
  "gh-menu",
  "a2ui-panel",
  "pohon-menu",
  "diag-lightbox",
  "dots-menu",
  "filter-sort-menu",
  "picker-ws-dropdown",
];

function usePreviewPanel({
  selectedProject,
  onAutoOpen,
  halamanTampil = true,
  paneId = 0,
  autoPreview = true,
  bekukan = false,
}: {
  selectedProject?: unknown;
  onAutoOpen?: () => void;
  // Whether the page this panel lives on is the one being SHOWN.
  //
  // The panel belongs to the chat page, but pages are not unmounted when you
  // leave them — they keep their layout and fade to opacity 0. A DOM panel
  // disappears with its page. This one does not: it is a WebContentsView owned
  // by the main process, floating above the window, and it obeys the bounds it
  // is given and nothing else. Opening Plugins while a site was loaded left the
  // browser sitting on top of it.
  halamanTampil?: boolean;
  paneId?: number;
  autoPreview?: boolean;
  // A menu of this pane is open. The page must stay VISIBLE under it, yet the
  // view is a native layer above all DOM and would cover the menu. So while
  // this is set the view steps aside and a snapshot of the page, taken the
  // instant before, is painted in its place -- same pixels, same spot.
  bekukan?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [inputUrl, setInputUrl] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  // The bar is the user's while they are typing in it: a page navigating
  // underneath (an SPA's pushState, a redirect) must not overwrite their
  // text. What the page IS at is remembered separately, so Escape can put
  // it back. (VS Code's URL bar: isEditing / revert.)
  const editRef = useRef(false);
  const alamatAsliRef = useRef("");
  const mulaiEdit = useCallback(() => {
    editRef.current = true;
  }, []);
  const selesaiEdit = useCallback(() => {
    editRef.current = false;
  }, []);
  const batalEdit = useCallback(() => {
    editRef.current = false;
    setInputUrl(alamatAsliRef.current);
  }, []);
  // ── Size & zoom ──
  const [zum, setZum] = useState(1);
  const [perangkat, setPerangkat] = useState("responsif");
  const [ukuranBuka, setUkuranBuka] = useState(false);
  // The device box inside the slot: the view is drawn INTO this box, not
  // the whole slot. Responsive: the box is the slot. A preset: the box is
  // the device's size scaled down to fit, centred, on the pane's dark
  // surface -- a phone in the middle of the pane, as DevTools' device mode
  // and VS Code's emulation show it, rather than a corner-scaled page in a
  // white field. Sized imperatively by the bounds feeder (it already has
  // the slot's size on every change), read here through a ref so a preset
  // change does not restart the bounds effect (and re-mount the view).
  const kotakRef = useRef<HTMLDivElement | null>(null);
  const perangkatRef = useRef<any>(null);
  useEffect(() => {
    const d = PERANGKAT.find((x) => x.id === perangkat);
    perangkatRef.current = d && d.lebar ? d : null;
    // Nudge the feeder: it listens for resize and re-measures the box.
    try {
      window.dispatchEvent(new Event("resize"));
    } catch (_) {}
  }, [perangkat]);
  // ── History (every pane's navigations, kept by main) ──
  const [riwayatBuka, setRiwayatBuka] = useState(false);
  const [daftarRiwayat, setDaftarRiwayat] = useState<any[]>([]);
  const riwayatCariRef = useRef("");
  // ── Find in page (external pages: the engine searches) ──
  const [cari, setCari] = useState({
    buka: false,
    teks: "",
    aktif: 0,
    total: 0,
  });

  const ipc =
    typeof window !== "undefined" && window.WOLFSPACE && window.WOLFSPACE.ipc
      ? window.WOLFSPACE
      : null;

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
    setMuatGagal(false);
    setRefreshKey((k) => k + 1);
  }, []);

  // Close this pane the way a browser closes a tab: the address is cleared
  // and the engine is DISPOSED ("buang"), not merely hidden. The bounds
  // effect below hides on cleanup, but hiding keeps the WebContents — and its
  // page, its memory, its network — alive behind the window for nothing.
  const closePane = useCallback(() => {
    setGagalLuar("");
    sembunyikanPotret();
    setUrl("");
    setInputUrl("");
    if (ipc) ipc.invoke("browser", { aksi: "buang", paneId }).catch(() => {});
  }, [ipc, paneId]);

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
  // True from a did-fail-load until the next load starts. Kept apart from the
  // message above because it changes what is on screen: the view floats
  // ABOVE all DOM, so the "Page failed to load" overlay was being painted
  // underneath a blank native surface. While this is set the view is taken
  // off the window and the overlay shows; the diagnostic messages (zero-size
  // panel, refused IPC) do not hide anything -- there the view is already
  // invisible or absent.
  const [muatGagal, setMuatGagal] = useState(false);
  // The snapshot shown while the view is away for a menu (see bekukan).
  // The placeholder <img> in the slot. Driven DIRECTLY (a ref, not state):
  // between painting the picture and hiding the view there must be no
  // React render to wait for -- a render that lands late leaves the slot
  // dark for the frames in between, which is the flicker this replaces.
  const potretImgRef = useRef<HTMLImageElement | null>(null);
  const tampilkanPotret = (src: string) => {
    const img = potretImgRef.current;
    if (!img) return;
    if (img.src !== src) img.src = src;
    img.style.display = "block";
  };
  const sembunyikanPotret = () => {
    const img = potretImgRef.current;
    if (img) img.style.display = "none";
  };
  // The latest picture of the page, refreshed every second while it shows
  // and decoded ahead of time -- so a freeze needs no round trip: paint
  // this, one frame, hide. (VS Code keeps its placeholder the same way.)
  const potretRef = useRef<{ src: string; img: HTMLImageElement } | null>(null);
  // Read by the bounds effect's cleanup, which runs BEFORE the effect that
  // reacts to the new value and is the one place that can still photograph
  // the page: after it the view is gone.
  // ── Overlays found automatically (VS Code's overlayManager, reduced) ──
  //
  // Anything the app draws over the page must freeze it (see bekukan). The
  // caller can say so explicitly, but most overlays -- menus, dialogs, the
  // palette, dropdowns, lightboxes -- are just DOM that happens to land on
  // top of the slot. So they are found rather than declared: elements with
  // one of these classes (or a data-overlay attribute), whose box overlaps
  // the slot, AND which really are the topmost thing painted at the centre
  // of that overlap (elementFromPoint: a z-index check). Re-evaluated when
  // the DOM changes, coalesced to one check per frame.
  const [terhalang, setTerhalang] = useState(false);
  const bekukanRef = useRef(false);
  const beku = bekukan || terhalang;
  bekukanRef.current = beku;
  // What the engine reports after each navigation. Only an external page has
  // this; a local file in the <iframe> gives no such signal, so its arrows
  // stay enabled and history.back()/forward() simply do nothing at the ends.
  const [riwayat, setRiwayat] = useState({
    bisaMundur: false,
    bisaMaju: false,
  });

  const navigate = useCallback((urlOrPath) => {
    const t = tafsirkanAlamat(urlOrPath);
    if (!t) return;
    setGagalLuar("");
    setMuatGagal(false);
    // Enter on an unchanged address is a reload, as in a browser. setUrl with
    // the same value is a no-op for React, so the key has to move too; the
    // main process turns "same address, new key" into a reload.
    setUrl((cur) => {
      if (cur === t.url) setRefreshKey((k) => k + 1);
      return t.url;
    });
    // What the bar shows is the RESOLVED result, just as a browser does: typing
    // "github.com" and watching it become "https://github.com" is the feedback
    // that the guess was right. For files the original path is kept — that is the
    // useful part, not /preview-file?path=…
    setInputUrl(t.tampil);
    alamatAsliRef.current = t.tampil;
    editRef.current = false;
  }, []);

  // Back and forward, as the browser's arrows. An external page lives in the
  // main process, so it is an IPC action; a local file lives in the <iframe>
  // and its history is reachable directly (same origin as this page).
  const alamatLuarRef = useRef(false);
  const mundur = useCallback(() => {
    if (alamatLuarRef.current) {
      if (ipc)
        ipc.invoke("browser", { aksi: "mundur", paneId }).catch(() => {});
      return;
    }
    try {
      const w = iframeRef.current && iframeRef.current.contentWindow;
      if (w) w.history.back();
    } catch (_) {}
  }, [ipc, paneId]);
  const maju = useCallback(() => {
    if (alamatLuarRef.current) {
      if (ipc) ipc.invoke("browser", { aksi: "maju", paneId }).catch(() => {});
      return;
    }
    try {
      const w = iframeRef.current && iframeRef.current.contentWindow;
      if (w) w.history.forward();
    } catch (_) {}
  }, [ipc, paneId]);

  // Find in page. Enter = next, Shift+Enter = previous, Escape closes and
  // clears the highlight. The bar sits in its own row above the page (not
  // over it), so it needs no freeze.
  const cariTeks = useCallback(
    (teks: string, lanjut = false, mundur = false) => {
      setCari((c) => ({ ...c, teks }));
      if (!ipc) return;
      ipc
        .invoke("browser", { aksi: "cari", paneId, teks, lanjut, mundur })
        .catch(() => {});
    },
    [ipc, paneId],
  );
  const bukaCari = useCallback(() => {
    setCari((c) => ({ ...c, buka: true }));
  }, []);
  const tutupCari = useCallback(() => {
    setCari({ buka: false, teks: "", aktif: 0, total: 0 });
    if (ipc)
      ipc.invoke("browser", { aksi: "cari", paneId, teks: "" }).catch(() => {});
  }, [ipc, paneId]);

  // Zoom: +1 / -1 a step, 0 resets; main answers with the factor shown in
  // the pill. Viewport: a preset id from PERANGKAT, sent as its device.
  const zumUbah = useCallback(
    (arah: number) => {
      if (!ipc) return;
      ipc
        .invoke("browser", { aksi: "zum", paneId, arah })
        .then((r) => {
          if (r && typeof r.zum === "number") setZum(r.zum);
        })
        .catch(() => {});
    },
    [ipc, paneId],
  );
  const pilihPerangkat = useCallback(
    (id: string) => {
      const d = PERANGKAT.find((x) => x.id === id) || PERANGKAT[0]!;
      setPerangkat(d.id);
      if (!ipc) return;
      ipc
        .invoke("browser", {
          aksi: "emulasi",
          paneId,
          perangkat:
            d.id === "responsif"
              ? null
              : {
                  lebar: d.lebar,
                  tinggi: d.tinggi,
                  mobile: !!d.mobile,
                  dpr: d.dpr,
                },
        })
        .catch(() => {});
    },
    [ipc, paneId],
  );
  const bukaUkuran = useCallback(() => setUkuranBuka(true), []);
  const tutupUkuran = useCallback(() => setUkuranBuka(false), []);

  // History: loaded from main each time the panel opens (and on search), so
  // what the other pane just visited is already in it.
  const muatRiwayat = useCallback(
    (cari = "") => {
      if (!ipc) return;
      riwayatCariRef.current = cari;
      ipc
        .invoke("browser", { aksi: "riwayat", paneId, cari })
        .then((r) => {
          if (r && Array.isArray(r.riwayat)) setDaftarRiwayat(r.riwayat);
        })
        .catch(() => {});
    },
    [ipc, paneId],
  );
  const bukaRiwayat = useCallback(() => {
    setRiwayatBuka(true);
    muatRiwayat("");
  }, [muatRiwayat]);
  const tutupRiwayat = useCallback(() => setRiwayatBuka(false), []);
  const menuRiwayat = useCallback(
    (url: string) => {
      if (!ipc) return;
      ipc
        .invoke("browser", { aksi: "menu-riwayat", paneId, url })
        .then((r) => {
          if (r && r.aksi === "buka") {
            setRiwayatBuka(false);
            navigate(url);
            return;
          }
          // Whatever was chosen, the list is re-read: an entry may be gone.
          muatRiwayat(riwayatCariRef.current);
        })
        .catch(() => {});
    },
    [ipc, paneId, muatRiwayat, navigate],
  );
  const hapusRiwayat = useCallback(() => {
    setDaftarRiwayat([]);
    if (ipc)
      ipc.invoke("browser", { aksi: "riwayat-hapus", paneId }).catch(() => {});
  }, [ipc, paneId]);

  // Developer Tools, as a browser's F12. An external page is a view in the
  // main process: its own DevTools window. A local file is the window's
  // <iframe>: the window's DevTools, where the frame is in the Elements tree.
  const devtools = useCallback(() => {
    if (!ipc) return;
    ipc
      .invoke("browser", {
        aksi: alamatLuarRef.current ? "devtools" : "devtools-jendela",
        paneId,
      })
      .catch(() => {});
  }, [ipc, paneId]);

  // Auto-throw: when the agent WRITES/CHANGES an .html file, render it in the
  // preview panel immediately; if the same file is rewritten, refreshing the
  // iframe is enough. The source of truth for the path is d.path (the tool's
  // resolved result — accurate even when workspace containment remaps a write to
  // another folder); fallback: parse d.arg, resolving a relative path against the
  // active working folder or the WOLFSPACE root.
  useEffect(() => {
    if (!autoPreview) return;
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
  }, [selectedProject, autoPreview]);

  // External addresses (http/https) -> WebContentsView; the rest (files) -> <iframe>.
  const alamatLuar = /^https?:\/\//i.test(url);
  alamatLuarRef.current = alamatLuar;

  // The view's position is fed from here, and MUST keep being fed: it floats
  // above the window, so it does not move when the panel is resized, the sidebar
  // opens, or the window changes size. One observer covers all three.
  useEffect(() => {
    // halamanTampil is part of the CONDITION, not just a one-off hide. The
    // heartbeat below re-sends "tampil" every 400ms, so hiding once and leaving
    // the effect running would put the view straight back on screen.
    if (!ipc || !alamatLuar || !halamanTampil || muatGagal || beku) {
      // Frozen for a menu and nothing else wrong: the previous effect's
      // cleanup is mid-way through paint -> beku, and a "sembunyi" here
      // would yank the view out before the picture is on screen.
      const hanyaBeku =
        beku && ipc && alamatLuar && halamanTampil && !muatGagal;
      if (ipc && !hanyaBeku)
        ipc.invoke("browser", { aksi: "sembunyi", paneId }).catch(() => {});
      return;
    }
    const el = slotRef.current;
    if (!el) {
      ipc.invoke("browser", { aksi: "sembunyi", paneId }).catch(() => {});
      return;
    }
    let terakhir = "";
    let mati = false; // main process lacks this channel -> stop trying
    const suapi = (aksi: string) => {
      if (mati) return;
      // The box first: full slot, or the device scaled to fit and centred.
      const kotak = kotakRef.current;
      const slot = el.getBoundingClientRect();
      const d = perangkatRef.current;
      if (kotak) {
        if (d && slot.width > 0 && slot.height > 0) {
          const skala = Math.min(
            1,
            slot.width / d.lebar,
            slot.height / d.tinggi,
          );
          kotak.style.width = Math.round(d.lebar * skala) + "px";
          kotak.style.height = Math.round(d.tinggi * skala) + "px";
          kotak.classList.add("perangkat");
        } else {
          kotak.style.width = "100%";
          kotak.style.height = "100%";
          kotak.classList.remove("perangkat");
        }
      }
      const r = (kotak || el).getBoundingClientRect();
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
          paneId,
          url,
          // The refresh counter travels with the address: main reloads on
          // "same address, new key" and does nothing on "same address, same
          // key" -- so an effect re-run does not reload the page.
          kunci: refreshKey,
          bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
        })
        .then((r) => {
          // The RENDERER side logs what the MAIN side answered. Electron is two
          // engines, and when the panel is blank the question is always "which
          // one failed" — answerable only if both sides speak. Renderer
          // console.log is forwarded to WOLFSPACE-debug.log.
          if (aksi === "buka") console.warn("[browser:renderer] open ->", r);
          // The view is back on screen: the stand-in picture can go.
          if (aksi === "buka") sembunyikanPotret();
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
    // The stand-in picture, kept fresh: one capture a second, decoded
    // off-screen, held in a ref (no render). A freeze paints it at once.
    const ambilPotret = async () => {
      if (mati) return;
      try {
        const r = await ipc.invoke("browser", { aksi: "potret", paneId });
        if (mati || !r || !r.potret) return;
        const im = new Image();
        im.src = r.potret;
        try {
          await im.decode();
        } catch (_) {}
        if (!mati) potretRef.current = { src: r.potret, img: im };
      } catch (_) {}
    };
    const jadwalPotret = setInterval(ambilPotret, 2000);
    const potretPertama = setTimeout(ambilPotret, 250);
    return () => {
      mati = true;
      clearInterval(nadi);
      clearInterval(jadwalPotret);
      clearTimeout(potretPertama);
      ro.disconnect();
      window.removeEventListener("resize", onResize);
      // Leaving for a menu: photograph, paint the picture UNDER the still
      // visible view, wait for that paint, and only then hide the view --
      // so no frame is ever blank. Every step re-checks that the menu is
      // still open: if it closed meanwhile, the new effect has already sent
      // "buka" and this chain must not hide what that just showed.
      // Any other reason for leaving: just hide.
      if (!bekukanRef.current) {
        ipc.invoke("browser", { aksi: "sembunyi", paneId }).catch(() => {});
        return;
      }
      (async () => {
        try {
          // A FRESH picture, taken while the view is still up, so what
          // replaces the page is the page as it is now -- a picture up to a
          // second old would jump on the swap, and jump again when the
          // fresh one arrived: that double jump was the "flicker". Bounded:
          // if the capture is slow the last periodic one stands in.
          const segar: Promise<any> = ipc
            .invoke("browser", { aksi: "potret", paneId })
            .catch(() => null);
          const batas = new Promise((res) => setTimeout(() => res(null), 160));
          let r: any = await Promise.race([segar, batas]);
          if (!bekukanRef.current) return;
          let src = r && r.potret ? String(r.potret) : "";
          if (!src && potretRef.current) src = potretRef.current.src;
          if (src) {
            // Decoded off-screen, then painted directly into the slot's
            // <img>, then one full frame for the compositor -- and only
            // then does the view step aside. Nothing in between renders.
            try {
              const im = new Image();
              im.src = src;
              await im.decode();
            } catch (_) {}
            if (!bekukanRef.current) return;
            tampilkanPotret(src);
            await new Promise((res) =>
              requestAnimationFrame(() => requestAnimationFrame(res)),
            );
            if (!bekukanRef.current) return;
          }
          await ipc.invoke("browser", { aksi: "beku", paneId });
          // If the fallback was used, the fresh capture still lands: swap it
          // in (same box, already decoded) so the picture is current.
          if (!(r && r.potret)) {
            r = await segar;
            if (r && r.potret && bekukanRef.current) {
              try {
                const im = new Image();
                im.src = r.potret;
                await im.decode();
              } catch (_) {}
              if (bekukanRef.current) tampilkanPotret(String(r.potret));
            }
          }
        } catch (_) {}
      })();
    };
  }, [
    ipc,
    alamatLuar,
    url,
    refreshKey,
    halamanTampil,
    paneId,
    muatGagal,
    beku,
  ]);

  useEffect(() => {
    if (!ipc || !alamatLuar || !url || !halamanTampil) {
      setTerhalang(false);
      return;
    }
    const doc = document;
    // Live collections: no query on each check, the browser keeps them.
    const koleksi = KELAS_OVERLAY.map((k) => doc.getElementsByClassName(k));
    let jadwal = 0;
    const periksa = () => {
      jadwal = 0;
      const el = slotRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      let kena = false;
      const kandidat: Element[] = [];
      for (const c of koleksi) for (const e of Array.from(c)) kandidat.push(e);
      for (const e of Array.from(doc.querySelectorAll("[data-overlay]")))
        kandidat.push(e);
      for (const e of kandidat) {
        // An ancestor of the slot (a backdrop the pane sits inside) is not
        // over it.
        if (e.contains(el)) continue;
        const o = e.getBoundingClientRect();
        const x1 = Math.max(r.left, o.left);
        const y1 = Math.max(r.top, o.top);
        const x2 = Math.min(r.right, o.right);
        const y2 = Math.min(r.bottom, o.bottom);
        if (x2 <= x1 || y2 <= y1) continue;
        const atas = doc.elementFromPoint((x1 + x2) / 2, (y1 + y2) / 2);
        if (atas && e.contains(atas)) {
          kena = true;
          break;
        }
      }
      setTerhalang(kena);
    };
    const minta = () => {
      if (!jadwal) jadwal = requestAnimationFrame(periksa);
    };
    const mo = new MutationObserver(minta);
    mo.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    window.addEventListener("resize", minta);
    minta();
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", minta);
      if (jadwal) cancelAnimationFrame(jadwal);
    };
  }, [ipc, alamatLuar, url, halamanTampil]);

  // State arrives over IPC, not from the DOM: the view lives in another process.
  useEffect(() => {
    if (!ipc || !ipc.onBrowser) return;
    return ipc.onBrowser((m) => {
      if (m && m.paneId !== undefined && m.paneId !== paneId) return;
      // Every event is logged, not only the ones the UI uses. When the panel is
      // blank, this sequence is what separates "never started loading" from
      // "loaded then failed" from "finished loading but is not visible" — three
      // causes that look identical on screen.
      console.warn("[browser:peristiwa]", m.t, m);
      if (m.t === "muat") {
        setGagalLuar("");
        setMuatGagal(false);
      } else if (m.t === "gagal") {
        setGagalLuar((m.desc || "failed to load") + " (" + m.kode + ")");
        setMuatGagal(true);
      } else if (m.t === "pindah" && m.url) {
        alamatAsliRef.current = m.url;
        if (!editRef.current) setInputUrl(m.url);
      }
      if (m.t === "cari")
        setCari((c) => ({
          ...c,
          aktif: Number(m.aktif) || 0,
          total: Number(m.total) || 0,
        }));
      if (m.bisaMundur !== undefined || m.bisaMaju !== undefined)
        setRiwayat({ bisaMundur: !!m.bisaMundur, bisaMaju: !!m.bisaMaju });
      // A shortcut pressed INSIDE the page (see electron/preload-browser.ts):
      // re-dispatched on the window, so the palette and every other keydown
      // listener handle it exactly as if the app had focus. Only pane 0
      // dispatches when both panes receive the same message from an older
      // main process that sends no paneId -- one press, one event.
      if (m.t === "tombol" && (m.paneId === undefined ? paneId === 0 : true)) {
        const ctrl = !!(m.ctrlKey || m.metaKey) && !m.altKey;
        const k = String(m.key || "").toLowerCase();
        // Browser-level shortcuts stay with the pane they were pressed in.
        if (ctrl && !m.shiftKey && k === "f") {
          setCari((c) => ({ ...c, buka: true }));
          return;
        }
        if (ctrl && (k === "=" || k === "+" || k === "-" || k === "0")) {
          zumUbah(k === "0" ? 0 : k === "-" ? -1 : 1);
          return;
        }
        try {
          const ev = new KeyboardEvent("keydown", {
            key: m.key,
            code: m.code,
            keyCode: m.keyCode,
            ctrlKey: !!m.ctrlKey,
            shiftKey: !!m.shiftKey,
            altKey: !!m.altKey,
            metaKey: !!m.metaKey,
            repeat: !!m.repeat,
            bubbles: true,
            cancelable: true,
          } as any);
          window.dispatchEvent(ev);
        } catch (_) {}
      }
    });
  }, [ipc, paneId]);

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
    closePane,
    mundur,
    maju,
    devtools,
    potretImgRef,
    kotakRef,
    mulaiEdit,
    selesaiEdit,
    batalEdit,
    cari,
    cariTeks,
    bukaCari,
    tutupCari,
    riwayatBuka,
    daftarRiwayat,
    bukaRiwayat,
    tutupRiwayat,
    muatRiwayat,
    hapusRiwayat,
    menuRiwayat,
    zum,
    zumUbah,
    perangkat,
    pilihPerangkat,
    ukuranBuka,
    bukaUkuran,
    tutupUkuran,
    // Nothing loaded: nowhere to go. External: what the engine last said.
    // Local file: unknown, so allowed -- the iframe's history handles the ends.
    bisaMundur: !!url && (alamatLuar ? riwayat.bisaMundur : true),
    bisaMaju: !!url && (alamatLuar ? riwayat.bisaMaju : true),
    gagalLuar,
  };
}

// A second browser pane is deliberately a component, not a second set of
// markup wired to the first hook. Each pane receives its own hook instance, so
// typing, iframe refreshes, and external WebContentsView bounds cannot leak
// across the split.
//
// The address bar is built to the same measurements as the primary pane's
// bar in app.tsx (38px tall, 36px left inset holding the ⋮ button, the same
// pill, the same 14px icon buttons), so that in split mode the two omniboxes
// start on the same x-offset inside their panes and sit on one baseline.
function LivePreviewPane({
  preview,
  title = "Live Web Dev Preview",
  onClose,
  menuOpen,
  onMenuOpen,
}: {
  preview: any;
  title?: string;
  onClose?: () => void;
  // The menu's open state lives in App when given: App hides this pane's
  // page while the menu is open (the page is a native layer above all DOM,
  // so the menu would otherwise be invisible). Local state is the fallback.
  menuOpen?: boolean;
  onMenuOpen?: (buka: boolean) => void;
}) {
  const [menuLokal, setMenuLokal] = useState(false);
  const menuBuka = menuOpen !== undefined ? menuOpen : menuLokal;
  const setMenuBuka = onMenuOpen || setMenuLokal;
  // Any click outside closes the menu, as the left pane's menu does.
  useEffect(() => {
    if (!menuBuka) return;
    const tutup = () => setMenuBuka(false);
    window.addEventListener("click", tutup);
    return () => window.removeEventListener("click", tutup);
  }, [menuBuka]);
  return (
    <div className="browser-pane browser-pane-secondary">
      <div className="browser-pane-address">
        <div
          className="browser-pane-menu-btn"
          title="Pane menu"
          onClick={(e: any) => {
            e.stopPropagation();
            setMenuBuka(!menuBuka);
          }}
        >
          <svg
            width="10"
            height="20"
            viewBox="0 0 10 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="5" cy="4" r="1.6" fill="#ffffff"></circle>
            <circle cx="5" cy="10" r="1.6" fill="#ffffff"></circle>
            <circle cx="5" cy="16" r="1.6" fill="#ffffff"></circle>
          </svg>
        </div>
        {menuBuka && (
          <div
            className="browser-pane-menu"
            onClick={(e: any) => e.stopPropagation()}
          >
            <button
              className="btn-reset browser-pane-menu-item"
              disabled={!preview.bisaMundur}
              onClick={() => {
                setMenuBuka(false);
                preview.mundur();
              }}
            >
              <IkonPanah arah="kiri" />
              <span>Back</span>
            </button>
            <button
              className="btn-reset browser-pane-menu-item"
              disabled={!preview.bisaMaju}
              onClick={() => {
                setMenuBuka(false);
                preview.maju();
              }}
            >
              <IkonPanah arah="kanan" />
              <span>Forward</span>
            </button>
            {onClose && (
              <button
                className="btn-reset browser-pane-menu-item"
                onClick={() => {
                  setMenuBuka(false);
                  onClose();
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="16" rx="2"></rect>
                  <line x1="12" y1="4" x2="12" y2="20"></line>
                </svg>
                <span>Unsplit</span>
              </button>
            )}
            <button
              className="btn-reset browser-pane-menu-item"
              onClick={() => {
                setMenuBuka(false);
                preview.bukaRiwayat();
              }}
            >
              <IkonRiwayat />
              <span>History</span>
            </button>
            <button
              className="btn-reset browser-pane-menu-item"
              onClick={() => {
                setMenuBuka(false);
                preview.bukaUkuran();
              }}
            >
              <IkonUkuran />
              <span>Size &amp; Zoom</span>
            </button>
          </div>
        )}
        <PanelRiwayat preview={preview} />
        <PanelUkuran preview={preview} />
        <div className="browser-pane-omnibox">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8b98a9"
            strokeWidth="2"
            style={{ flexShrink: 0 }}
          >
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="12" r="4" />
            <line x1="21.17" y1="8" x2="12" y2="8" />
            <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
            <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
          </svg>
          <input
            type="text"
            value={preview.inputUrl}
            onChange={(e: any) => preview.setInputUrl(e.target.value)}
            onFocus={() => preview.mulaiEdit()}
            onBlur={() => preview.selesaiEdit()}
            onKeyDown={(e: any) => {
              if (e.key === "Enter") preview.navigate(preview.inputUrl);
              else if (e.key === "Escape") {
                preview.batalEdit();
                e.currentTarget.blur();
              }
            }}
            placeholder="Search the web, or type a URL / file path"
            aria-label={title + " address bar"}
          />
        </div>
        <div className="browser-pane-actions">
          <PilZum preview={preview} />
          <button
            className="btn-reset browser-pane-action"
            title="Reload / Refresh preview"
            onClick={() => preview.refresh()}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
          </button>
          <button
            className="btn-reset browser-pane-action browser-pane-action-devtools"
            title="Developer Tools (F12)"
            disabled={!preview.url}
            onClick={() => preview.devtools()}
          >
            <IkonDevTools />
          </button>
          {onClose && (
            <button
              className="btn-reset browser-pane-action browser-pane-action-close"
              title="Close split"
              onClick={onClose}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <BilahCari preview={preview} />
      <div className="browser-pane-content">
        {preview.gagalLuar && (
          <div className="browser-pane-error">
            <div style={{ fontSize: "28px" }}>🚫</div>
            <strong>Page failed to load</strong>
            <span>{preview.gagalLuar}</span>
          </div>
        )}
        {preview.url && preview.luar ? (
          <div ref={preview.slotRef} className="browser-pane-slot">
            <div ref={preview.kotakRef} className="browser-pane-kotak">
              <img
                ref={preview.potretImgRef}
                className="browser-pane-potret"
                style={{ display: "none" }}
                alt=""
                draggable={false}
              />
            </div>
          </div>
        ) : preview.url ? (
          <iframe
            ref={preview.iframeRef}
            key={preview.refreshKey}
            src={preview.url}
            title={title}
            className="browser-pane-frame"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
          />
        ) : (
          <div className="browser-pane-empty">
            <strong>{title}</strong>
            <span>Enter a URL or file path to preview it here.</span>
          </div>
        )}
      </div>
    </div>
  );
}

// The find bar: its own row between the address bar and the page, so it is
// never under the native view and needs no freeze. Shown by Ctrl+F pressed
// inside the page (forwarded by the preload) for external pages only -- a
// local file lives in an <iframe> the engine cannot search.
function BilahCari({ preview }: { preview: any }) {
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (preview.cari.buka && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [preview.cari.buka]);
  if (!preview.cari.buka || !preview.luar) return null;
  const c = preview.cari;
  return (
    <div className="browser-cari">
      <input
        ref={ref}
        type="text"
        value={c.teks}
        placeholder="Find in page"
        aria-label="Find in page"
        onChange={(e: any) => preview.cariTeks(e.target.value)}
        onKeyDown={(e: any) => {
          if (e.key === "Enter") preview.cariTeks(c.teks, true, !!e.shiftKey);
          else if (e.key === "Escape") preview.tutupCari();
        }}
      />
      <span className="browser-cari-hasil">
        {c.teks ? (c.total ? c.aktif + "/" + c.total : "0/0") : ""}
      </span>
      <button
        className="btn-reset browser-pane-action"
        title="Previous match (Shift+Enter)"
        disabled={!c.total}
        onClick={() => preview.cariTeks(c.teks, true, true)}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>
      <button
        className="btn-reset browser-pane-action"
        title="Next match (Enter)"
        disabled={!c.total}
        onClick={() => preview.cariTeks(c.teks, true, false)}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      <button
        className="btn-reset browser-pane-action browser-pane-action-close"
        title="Close (Escape)"
        onClick={() => preview.tutupCari()}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

// The history panel: a dropdown under the address bar listing every page
// any pane has visited, newest first, with a filter box. It is DOM over the
// page, so it carries an overlay class and the page freezes under it.
function PanelRiwayat({ preview }: { preview: any }) {
  const [q, setQ] = useState("");
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!preview.riwayatBuka) return;
    setQ("");
    if (ref.current) ref.current.focus();
    const tutup = () => preview.tutupRiwayat();
    const esc = (e: any) => {
      if (e.key === "Escape") preview.tutupRiwayat();
    };
    window.addEventListener("click", tutup);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("click", tutup);
      window.removeEventListener("keydown", esc);
    };
  }, [preview.riwayatBuka]);
  if (!preview.riwayatBuka) return null;
  const d: any[] = preview.daftarRiwayat || [];
  const kapan = (t: number) => {
    const s = Math.max(0, Date.now() - t) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  };
  return (
    <div className="browser-riwayat" onClick={(e: any) => e.stopPropagation()}>
      <div className="browser-riwayat-kepala">
        <input
          ref={ref}
          type="text"
          value={q}
          placeholder="Search history"
          aria-label="Search history"
          onChange={(e: any) => {
            setQ(e.target.value);
            preview.muatRiwayat(e.target.value);
          }}
        />
        <button
          className="btn-reset browser-pane-action"
          title="Clear history"
          disabled={!d.length}
          onClick={() => preview.hapusRiwayat()}
        >
          Clear
        </button>
      </div>
      <div className="browser-riwayat-daftar">
        {d.length === 0 && (
          <div className="browser-riwayat-kosong">
            {q ? "No matches." : "No history yet."}
          </div>
        )}
        {d.map((x) => (
          <button
            key={x.url}
            className="btn-reset browser-riwayat-butir"
            title={x.url}
            onContextMenu={(e: any) => {
              e.preventDefault();
              preview.menuRiwayat(x.url);
            }}
            onClick={() => {
              preview.tutupRiwayat();
              preview.navigate(x.url);
            }}
          >
            <span className="browser-riwayat-judul">{x.judul || x.url}</span>
            <span className="browser-riwayat-url">{x.url}</span>
            <span className="browser-riwayat-waktu">{kapan(x.waktu)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// The zoom pill: VS Code's browser shows the factor beside the address when
// it is not 100%; a click resets. Nothing when at 100%.
function PilZum({ preview }: { preview: any }) {
  if (!preview.url || Math.abs(preview.zum - 1) < 0.001) return null;
  return (
    <button
      className="btn-reset browser-zum-pil"
      title="Reset zoom (Ctrl+0)"
      onClick={() => preview.zumUbah(0)}
    >
      {Math.round(preview.zum * 100)}%
    </button>
  );
}

// Size & Zoom: a dropdown under the address bar (an overlay, so the page
// freezes beneath it) with the zoom ladder and the device presets.
function PanelUkuran({ preview }: { preview: any }) {
  useEffect(() => {
    if (!preview.ukuranBuka) return;
    const tutup = () => preview.tutupUkuran();
    const esc = (e: any) => {
      if (e.key === "Escape") preview.tutupUkuran();
    };
    window.addEventListener("click", tutup);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("click", tutup);
      window.removeEventListener("keydown", esc);
    };
  }, [preview.ukuranBuka]);
  if (!preview.ukuranBuka) return null;
  return (
    <div className="browser-ukuran" onClick={(e: any) => e.stopPropagation()}>
      <div className="browser-ukuran-judul">Zoom</div>
      <div className="browser-ukuran-zum">
        <button
          className="btn-reset browser-pane-action"
          title="Zoom out (Ctrl+-)"
          onClick={() => preview.zumUbah(-1)}
        >
          −
        </button>
        <span className="browser-ukuran-angka">
          {Math.round(preview.zum * 100)}%
        </span>
        <button
          className="btn-reset browser-pane-action"
          title="Zoom in (Ctrl+=)"
          onClick={() => preview.zumUbah(1)}
        >
          +
        </button>
        <button
          className="btn-reset browser-pane-action"
          title="Reset zoom (Ctrl+0)"
          disabled={Math.abs(preview.zum - 1) < 0.001}
          onClick={() => preview.zumUbah(0)}
        >
          Reset
        </button>
      </div>
      <div className="browser-ukuran-judul">Viewport</div>
      {PERANGKAT.map((d) => (
        <button
          key={d.id}
          className={
            "btn-reset browser-pane-menu-item browser-ukuran-butir" +
            (preview.perangkat === d.id ? " aktif" : "")
          }
          onClick={() => preview.pilihPerangkat(d.id)}
        >
          <span className="browser-ukuran-centang" aria-hidden="true">
            {preview.perangkat === d.id ? "✓" : ""}
          </span>
          <span>{d.nama}</span>
          <span className="browser-ukuran-sub">
            {d.lebar
              ? d.lebar + "×" + d.tinggi + (d.mobile ? " · mobile" : "")
              : d.sub}
          </span>
        </button>
      ))}
    </div>
  );
}

function IkonUkuran() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <line x1="12" y1="18" x2="12" y2="18.01" />
    </svg>
  );
}

function IkonRiwayat() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}

// The DevTools glyph: the code brackets a browser puts on its own button.
function IkonDevTools() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

// The arrow glyph for the Back / Forward menu entries.
function IkonPanah({ arah }: { arah: "kiri" | "kanan" }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {arah === "kiri" ? (
        <>
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </>
      ) : (
        <>
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </>
      )}
    </svg>
  );
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
