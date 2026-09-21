const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const read = (name) =>
  fs.readFileSync(path.join(root, name), "utf8").replace(/\r\n/g, "\n");

describe("web-dev split preview", () => {
  const app = read("public/app.tsx");
  const hook = read("public/app/usePreviewPanel.tsx");
  const main = read("electron/main.ts");
  const css = read("public/styles.css");

  test("split mode renders two side-by-side address-bar panes", () => {
    expect(app).toMatch(/browserSplit\s*\?\s*"browser-pane-grid"/);
    expect(app).toMatch(/<LivePreviewPane[\s\S]*preview=\{previewRight\}/);
    expect(css).toMatch(
      /browser-pane-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) 6px minmax\(0, 1fr\)/,
    );
    expect(hook).toMatch(/browser-pane-address/);
  });

  test("each pane has independent renderer and main-process browser state", () => {
    expect(app).toMatch(/paneId: 0/);
    expect(app).toMatch(/paneId: 1/);
    expect(hook).toMatch(/paneId,\s*url/);
    expect(hook).toMatch(/m\.paneId !== undefined && m\.paneId !== paneId/);
    expect(main).toMatch(/const _br = new Map<number, any>/);
    expect(main).toMatch(/_brBuat\(paneId\)/);
    expect(main).toMatch(/paneId, \.\.\.d/);
  });

  // Regression: in single mode the grid falls back to a flex column, and a
  // pane without flex-grow shrinks to its 38px header. The slot beneath it
  // then reports a 772x0 rectangle and the WebContentsView draws nothing.
  test("a pane grows to fill the column, so the browser slot has height", () => {
    expect(css).toMatch(/\.browser-pane\s*\{[^}]*flex:\s*1 1 0;/);
    expect(css).toMatch(
      /browser-pane-grid\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\)/,
    );
  });

  // The split is a switch of its own, toggled from the panel menu — not a
  // side effect of splitting the code editor. Both engines are also gated on
  // the panel being open, so closing the panel takes both views off screen.
  test("the split is toggled from the panel menu, above Logic", () => {
    const iSplit = app.indexOf('{browserSplit ? "Unsplit" : "Split"}');
    const iLogic = app.indexOf("<span>Logic</span>");
    expect(iSplit).toBeGreaterThan(-1);
    expect(iLogic).toBeGreaterThan(iSplit);
    expect(app).toMatch(
      /const \[browserSplit, setBrowserSplit\] = useState\(false\)/,
    );
    expect(app).not.toMatch(/halamanTampil:[^\n]*logicGrup/);
    expect(app).toMatch(/halamanTampil:\s*view === "chat" && panelOpen &&/);
    expect(app).toMatch(
      /halamanTampil:\s*view === "chat" && panelOpen && browserSplit/,
    );
  });

  // The divider between the panes is draggable: the grid's columns follow
  // browserSplitPct, clamped so neither pane collapses, and iframes are made
  // pointer-transparent for the drag exactly as the panel splitters do.
  test("the panes are resizable by dragging the divider between them", () => {
    expect(app).toMatch(
      /const \[browserSplitPct, setBrowserSplitPct\] = useState\(50\)/,
    );
    expect(app).toMatch(/className="split-divider browser-pane-divider"/);
    expect(app).toMatch(/onMouseDown=\{geserPembagiBrowser\}/);
    expect(app).toMatch(/Math\.min\(80, Math\.max\(20, pct\)\)/);
    const i = app.indexOf("const geserPembagiBrowser");
    expect(app.slice(i, i + 1500)).toMatch(
      /classList\.add\("menyeret-pembagi"\)/,
    );
    expect(app).toMatch(/gridTemplateColumns:/);
  });

  // Back and forward live in the ⋮ menus -- one place, both panes -- and
  // are greyed when the engine reports nowhere to go. There is no toolbar
  // arrow pair: the bar keeps the browser's shape, ⋮ · address · actions.
  test("both ⋮ menus carry Back and Forward, and nothing else does", () => {
    expect(main).toMatch(/aksi === "maju"/);
    expect(main).toMatch(/navigationHistory\.goForward\(\)/);
    expect(main).toMatch(/bisaMundur: wc\.navigationHistory\.canGoBack\(\)/);
    expect(hook).toMatch(/aksi: "mundur", paneId/);
    expect(hook).toMatch(/aksi: "maju", paneId/);
    expect(hook).toMatch(/w\.history\.back\(\)/);
    expect(app).toMatch(/preview\.mundur\(\);[\s\S]{0,200}<span>Back<\/span>/);
    expect(hook).toMatch(
      /preview\.maju\(\);[\s\S]{0,200}<span>Forward<\/span>/,
    );
    expect(app).not.toMatch(/NavigasiPanah/);
    expect(hook).not.toMatch(/NavigasiPanah/);
    expect(css).not.toMatch(/\.browser-nav/);
    // The right pane's ⋮ at the left pane's coordinates.
    expect(hook).toMatch(/className="browser-pane-menu-btn"/);
    expect(css).toMatch(
      /\.browser-pane-menu-btn\s*\{[^}]*left: 10px;[^}]*width: 18px;/,
    );
  });

  // The menus are DOM and the page is a native layer above all DOM, so a
  // menu opened over a loaded page was invisible. While a menu is open its
  // pane's view steps aside and a snapshot of the page -- taken the instant
  // before, by the main process -- stands in for it: the user sees the page
  // with the menu on top. Closing the menu brings the live view back
  // without a reload and drops the picture.
  test("an open ⋮ menu keeps the page visible as a snapshot", () => {
    expect(app).toMatch(/bekukan: panelMenuOpen \|\| adaOverlay,/);
    expect(app).toMatch(/bekukan: menuKananOpen \|\| adaOverlay,/);
    expect(app).toMatch(/halamanTampil: view === "chat" && panelOpen,/);
    expect(app).toMatch(/menuOpen=\{menuKananOpen\}/);
    expect(app).toMatch(/onMenuOpen=\{setMenuKananOpen\}/);
    expect(hook).toMatch(/const setMenuBuka = onMenuOpen \|\| setMenuLokal;/);
    // No blank frame, in either direction. Out: photograph, paint the
    // picture under the still-visible view, wait for the paint, THEN hide --
    // by visibility (surface kept), not by detaching. Back: "buka" shows the
    // view over the picture, and the picture is dropped after.
    const c = hook.indexOf("return () => {");
    const cleanup = hook.slice(c, c + 3600);
    // A fresh capture (bounded, periodic one as fallback), painted DIRECTLY
    // into the always-mounted <img> (no React render in between), one full
    // frame, then hide. That order is what keeps every frame filled.
    expect(cleanup).toMatch(
      /Promise\.race\(\[segar, batas\]\)[\s\S]*im\.decode\(\)[\s\S]*tampilkanPotret\(src\);[\s\S]*requestAnimationFrame\(\(\) => requestAnimationFrame\(res\)\)[\s\S]*aksi: "beku"/,
    );
    expect(hook).toMatch(
      /const jadwalPotret = setInterval\(ambilPotret, 2000\);/,
    );
    expect(hook).toMatch(/if \(aksi === "buka"\) sembunyikanPotret\(\);/);
    for (const src of [app, hook])
      expect(src).toMatch(
        /ref=\{preview\.potretImgRef\}[\s\S]{0,120}style=\{\{ display: "none" \}\}/,
      );
    expect(hook).toMatch(/muatGagal \|\| beku\) \{/);
    expect(hook).toMatch(/const hanyaBeku =/);
    expect(main).toMatch(/aksi === "potret"[\s\S]{0,600}capturePage\(\)/);
    expect(main).toMatch(/aksi === "beku"[\s\S]{0,300}setVisible\(false\)/);
    expect(main).toMatch(/if \(b\.beku\) \{\s*b\.tampil\.setVisible\(true\);/);
    // Both panes paint it in the slot, exactly where the view was.
    expect(app).toMatch(/className="browser-pane-potret"/);
    expect(hook).toMatch(/className="browser-pane-potret"/);
    expect(css).toMatch(
      /\.browser-pane-potret \{\s*position: absolute;\s*inset: 0;/,
    );
  });

  // "Open in an external tab/browser" is gone; in its place, on both panes,
  // the browser's own Developer Tools: Chromium DevTools for the page in
  // the view (its own window), or the window's DevTools for a local file,
  // which lives in the window's <iframe>.
  test("both panes open the real Developer Tools", () => {
    expect(app).not.toMatch(/Open in an external tab\/browser/);
    expect(app).toMatch(/title="Developer Tools \(F12\)"/);
    expect(hook).toMatch(/title="Developer Tools \(F12\)"/);
    expect(app).toMatch(/onClick=\{\(\) => preview\.devtools\(\)\}/);
    expect(hook).toMatch(/onClick=\{\(\) => preview\.devtools\(\)\}/);
    expect(hook).toMatch(
      /alamatLuarRef\.current \? "devtools" : "devtools-jendela"/,
    );
    expect(main).toMatch(
      /aksi === "devtools"[\s\S]{0,300}openDevTools\(\{ mode: "detach" \}\)/,
    );
    expect(main).toMatch(/aksi === "devtools-jendela"/);
  });

  // Overlays drawn over the browser area -- the command palette, modals --
  // announce themselves on "wolfspace_overlay", and App freezes both panes
  // for as long as any is open, exactly as for the pane menus.
  test("overlays over the browser freeze it like the menus do", () => {
    expect(app).toMatch(/window\.addEventListener\("wolfspace_overlay", h\)/);
    expect(app).toMatch(/const adaOverlay = overlayAktif\.length > 0/);
    const palPath = path.join(root, "public/app/CommandPalette.tsx");
    if (fs.existsSync(palPath)) {
      const pal = read("public/app/CommandPalette.tsx");
      expect(pal).toMatch(
        /new CustomEvent\("wolfspace_overlay", \{\s*detail: \{ nama: "palette", buka \},/,
      );
    }
  });

  // Closing the panel closes the tabs: both engines disposed, the address
  // bars emptied, the split undone -- by whichever route the panel closes.
  // Overlays are FOUND, not declared: elements with one of the overlay
  // classes (or data-overlay) whose box overlaps the slot and which are the
  // topmost thing painted at the overlap's centre (elementFromPoint).
  test("overlays over the page are detected by class + hit-test", () => {
    expect(hook).toMatch(/const KELAS_OVERLAY = \[/);
    for (const k of [
      "kpal-overlay",
      "browser-pane-menu",
      "gh-overlay",
      "a2ui-panel",
    ])
      expect(hook).toContain('"' + k + '"');
    expect(hook).toMatch(/doc\.querySelectorAll\("\[data-overlay\]"\)/);
    expect(hook).toMatch(
      /doc\.elementFromPoint\(\(x1 \+ x2\) \/ 2, \(y1 \+ y2\) \/ 2\)/,
    );
    expect(hook).toMatch(/const beku = bekukan \|\| terhalang;/);
    expect(hook).toMatch(/new MutationObserver\(minta\)/);
    // Both pane menus carry the class the detector watches.
    expect((app.match(/className="browser-pane-menu"/g) || []).length).toBe(1);
    expect(hook).toMatch(/className="browser-pane-menu"/);
  });

  // The bar belongs to the user while they type in it: a page navigating
  // underneath must not overwrite their text; Escape puts the real
  // address back. Both panes.
  test("the address bar is not overwritten while being edited", () => {
    expect(hook).toMatch(/if \(!editRef\.current\) setInputUrl\(m\.url\);/);
    expect(hook).toMatch(/alamatAsliRef\.current = m\.url;/);
    expect(hook).toMatch(/const batalEdit = useCallback/);
    for (const src of [app, hook]) {
      expect(src).toMatch(/onFocus=\{\(\) => preview\.mulaiEdit\(\)\}/);
      expect(src).toMatch(/onBlur=\{\(\) => preview\.selesaiEdit\(\)\}/);
      expect(src).toMatch(/preview\.batalEdit\(\);/);
    }
  });

  // What a browser offers on right-click, Ctrl+F, and Ctrl+=/-/0 -- each
  // wired to the engine of the pane it happened in.
  test("context menu, find in page, and zoom", () => {
    expect(main).toMatch(/wc\.on\("context-menu"/);
    expect(main).toMatch(/Menu\.buildFromTemplate\(item\)\.popup\(/);
    expect(main).toMatch(/label: "Inspect Element"/);
    expect(main).toMatch(/wc\.on\("found-in-page"/);
    expect(main).toMatch(/aksi === "cari"[\s\S]{0,400}wc\.findInPage\(teks/);
    expect(main).toMatch(/aksi === "zum"[\s\S]{0,400}_brTerapkanZum\(b\)/);
    // Zoom survives navigation (Chromium resets it per document).
    expect(main).toMatch(
      /wc\.on\("dom-ready", \(\) => \{\s*state\.zumKunci = null;\s*_brTerapkanZum\(state\);/,
    );
    expect(hook).toMatch(/function BilahCari/);
    expect(app).toMatch(/<BilahCari preview=\{preview\} \/>/);
    expect(hook).toMatch(/<BilahCari preview=\{preview\} \/>/);
    expect(hook).toMatch(/if \(ctrl && !m\.shiftKey && k === "f"\)/);
    expect(hook).toMatch(/aksi: "zum",/);
    expect(css).toMatch(/\.browser-cari \{/);
  });

  // Browser history: main records every main-frame navigation of every
  // pane (one entry per address, newest first, titles patched in later,
  // persisted in userData); each pane's ⋮ menu opens a dropdown that
  // searches it, opens an entry, or clears it.
  test("browser history is recorded by main and shown from both menus", () => {
    expect(main).toMatch(
      /function _riwayatCatat\(url: string, judul: string\)/,
    );
    expect(main).toMatch(/"browser-riwayat\.json"/);
    expect(main).toMatch(/const _RIWAYAT_MAKS = 500;/);
    expect(main).toMatch(/wc\.on\("page-title-updated"/);
    expect(main).toMatch(/aksi === "riwayat"/);
    expect(main).toMatch(/aksi === "riwayat-hapus"/);
    expect(hook).toMatch(/function PanelRiwayat/);
    expect(hook).toContain('"browser-riwayat"');
    for (const src of [app, hook]) {
      expect(src).toMatch(
        /preview\.bukaRiwayat\(\);[\s\S]{0,200}<span>History<\/span>/,
      );
      expect(src).toMatch(/<PanelRiwayat preview=\{preview\} \/>/);
    }
    expect(css).toMatch(/\.browser-riwayat \{/);
  });

  // Size & Zoom, as VS Code's browser has them: a zoom pill by the address
  // (click resets), a dropdown with the zoom ladder and device presets, the
  // presets applied through Electron's device emulation and scaled to fit
  // the pane on every bounds update.
  test("size & zoom: pill, presets, device emulation scaled to the pane", () => {
    expect(main).toMatch(/return \{ ok: true, zum: ZUM_LANGKAH\[b\.zum\] \};/);
    expect(main).toMatch(/aksi === "emulasi"/);
    expect(main).toMatch(/function _brEmulasi\(b: any\)/);
    expect(main).toMatch(/wc\.enableDeviceEmulation\(\{/);
    expect(main).toMatch(/wc\.disableDeviceEmulation\(\);/);
    expect(main).toMatch(
      /b\.tampil\.setBounds\(kotak\);\s*if \(b\.emulasi\) _brEmulasi\(b\);/,
    );
    expect(hook).toMatch(/const PERANGKAT: \{/);
    expect(hook).toMatch(/function PanelUkuran/);
    expect(hook).toMatch(/function PilZum/);
    for (const src of [app, hook]) {
      expect(src).toMatch(
        /preview\.bukaUkuran\(\);[\s\S]{0,200}Size &amp; Zoom/,
      );
      expect(src).toMatch(/<PanelUkuran preview=\{preview\} \/>/);
      expect(src).toMatch(/<PilZum preview=\{preview\} \/>/);
    }
    expect(hook).toContain('"browser-ukuran"');
    // A preset is a centred device BOX the view is drawn into (device size
    // x fit scale), on the pane's dark surface -- not a corner-scaled page
    // in a white field. The feeder measures the box, not the slot.
    expect(hook).toMatch(
      /const skala = Math\.min\(\s*1,\s*slot\.width \/ d\.lebar,\s*slot\.height \/ d\.tinggi,?\s*\);/,
    );
    expect(hook).toMatch(
      /const r = \(kotak \|\| el\)\.getBoundingClientRect\(\);/,
    );
    for (const src of [app, hook])
      expect(src).toMatch(
        /ref=\{preview\.kotakRef\}[\s\S]{0,80}className="browser-pane-kotak"/,
      );
    expect(css).toMatch(/\.browser-pane-kotak\.perangkat \{/);
  });

  // Zoom belongs to the pane, not the site: Chromium's browser zoom is per
  // origin and shared by every WebContents, so it is applied as a root
  // stylesheet (`html { zoom }`) in THIS document only, re-inserted on each
  // new document, with the origin's own zoom pinned at 100%.
  test("zoom is per pane, not per origin", () => {
    expect(main).toMatch(/function _brTerapkanZum\(b: any\)/);
    expect(main).toMatch(
      /\.insertCSS\("html \{ zoom: " \+ faktor \+ " !important; \}"\)/,
    );
    expect(main).toMatch(
      /if \(wc\.getZoomFactor\(\) !== 1\) wc\.setZoomFactor\(1\);/,
    );
    expect(main).toMatch(/wc\.removeInsertedCSS\(lama\)/);
  });

  // A history entry's right-click menu (native, over everything): Open,
  // Open in System Browser, Copy Address, Clear -- and the list is re-read
  // once the menu closes.
  test("history entries can be cleared one at a time via right-click", () => {
    expect(main).toMatch(/aksi === "menu-riwayat"/);
    expect(main).toMatch(/label: "Clear",[\s\S]{0,400}d\.splice\(i, 1\);/);
    expect(main).toMatch(/aksi === "riwayat-hapus-satu"/);
    expect(hook).toMatch(
      /onContextMenu=\{\(e: any\) => \{\s*e\.preventDefault\(\);\s*preview\.menuRiwayat\(x\.url\);/,
    );
    expect(hook).toMatch(/muatRiwayat\(riwayatCariRef\.current\);/);
  });

  test("closing the panel closes the tabs, not just the panel", () => {
    const i = app.indexOf("const panelPernahBuka = useRef(false);");
    expect(i).toBeGreaterThan(-1);
    const blok = app.slice(i, i + 700);
    expect(blok).toMatch(/if \(!panelPernahBuka\.current\) return;/);
    expect(blok).toMatch(/preview\.closePane\(\);/);
    expect(blok).toMatch(/if \(browserSplit\) tutupBrowserSplit\(\);/);
    expect(blok).toMatch(/\}, \[panelOpen\]\);/);
  });

  test("closing the split disposes the right engine, like closing a tab", () => {
    expect(app).toMatch(/onClose=\{tutupBrowserSplit\}/);
    expect(app).toMatch(/previewRight\.closePane\(\)/);
    expect(hook).toMatch(/aksi: "buang", paneId/);
    expect(hook).toMatch(
      /if \(!el\) \{\s*ipc\.invoke\("browser", \{ aksi: (aksiSembunyi|"sembunyi"), paneId \}\)/,
    );
  });

  // The two omniboxes must start at the same x-offset inside their panes:
  // the primary bar (inline styles in app.tsx) is 38px tall with a 36px left
  // inset for the ⋮ button, and the right bar copies those numbers.
  test("both address bars share the primary bar's measurements", () => {
    expect(app).toMatch(/padding: "0 14px 0 36px"/);
    expect(css).toMatch(
      /\.browser-pane-address\s*\{[^}]*height: 38px;[^}]*padding: 0 14px 0 36px;/,
    );
    expect(hook).toMatch(/className="browser-pane-omnibox"/);
  });
});
