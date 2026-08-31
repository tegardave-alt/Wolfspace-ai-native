// The vendor cost meter in public/index.html.
//
// It exists to answer one question with a number instead of a guess: how much
// of startup is spent fetching, compiling and EXECUTING the render-blocking
// vendor bundles. A first attempt to measure that in Node reported 0 ms for all
// of them, because V8 defers compilation until a function is called -- so the
// measurement has to happen in the browser, which is what this instruments.
//
// Two failure modes are guarded here, and the first is the dangerous one:
//
//   1. A new <script src="/vendor/..."> is added with no __vt() after it. The
//      meter still prints a number, and the number is now wrong -- silently.
//      An instrument that under-reports without saying so is worse than none,
//      because it ends the investigation with a confident figure.
//
//   2. The meter itself stops reporting. Caught by executing the real code
//      lifted out of the page rather than by reading it.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const HTML = fs.readFileSync(
  path.join(__dirname, "..", "public", "index.html"),
  "utf8",
);

/** Every vendor <script src> and every __vt() marker, in document order. */
function urutanPeristiwa() {
  const re = /<script src="(\/vendor\/[^"]+)"|__vt\("([^"]+)"\)/g;
  const out = [];
  let m;
  while ((m = re.exec(HTML))) {
    out.push(
      m[1]
        ? { jenis: "vendor", nama: m[1], at: m.index }
        : { jenis: "tanda", nama: m[2], at: m.index },
    );
  }
  return out;
}

describe("vendor cost meter", () => {
  test("__vt is defined before the first vendor script runs", () => {
    const def = HTML.indexOf("window.__vt =");
    const vendorPertama = HTML.indexOf('<script src="/vendor/');
    expect(def).toBeGreaterThan(-1);
    expect(def).toBeLessThan(vendorPertama);
  });

  test("the run opens with __mulai and closes with __selesai", () => {
    const ev = urutanPeristiwa();
    expect(ev[0]).toEqual(expect.objectContaining({ nama: "__mulai" }));
    expect(ev[ev.length - 1]).toEqual(
      expect.objectContaining({ nama: "__selesai" }),
    );
  });

  test("every vendor bundle is accounted for by a NAMED marker", () => {
    // THE ONE THAT MATTERS, and the first two attempts at it were both too
    // weak. "no vendor after the last marker" and "every vendor has some marker
    // after it" BOTH stayed green when a bundle was inserted with no marker of
    // its own -- its cost silently folded into the next group's number while
    // the meter kept printing a total that looked complete. Proven by inserting
    // exactly that mistake and watching nothing go red.
    //
    // So the grouping is DECLARED here rather than inferred from the file. A
    // new <script src="/vendor/..."> now lands in one of these buckets and
    // breaks the comparison, which is the point: adding a bundle must force a
    // decision about whether it is measured, not merely be allowed to pass.
    const DIHARAPKAN = [
      { tanda: "__mulai", vendor: [] },
      {
        tanda: "xterm",
        vendor: [
          "/vendor/xterm/xterm.js",
          "/vendor/xterm/addon-fit.js",
          "/vendor/xterm/addon-webgl.js",
          // Search (Ctrl+F) and clickable URLs. Both are small -- 12 KB and
          // 3 KB -- and both MUST stay above Monaco's AMD loader: they are UMD
          // bundles that prefer AMD, so below it they would register as
          // anonymous modules and set no global at all.
          "/vendor/xterm/addon-search.js",
          "/vendor/xterm/addon-web-links.js",
        ],
      },
      { tanda: "cytoscape", vendor: ["/vendor/cytoscape.min.js"] },
      {
        tanda: "react",
        vendor: [
          "/vendor/react.production.min.js",
          "/vendor/react-dom.production.min.js",
        ],
      },
      { tanda: "monaco-loader", vendor: ["/vendor/monaco/vs/loader.js"] },
      { tanda: "__selesai", vendor: [] },
    ];

    const nyata = [];
    let bucket = [];
    for (const e of urutanPeristiwa()) {
      if (e.jenis === "vendor") bucket.push(e.nama);
      else {
        nyata.push({ tanda: e.nama, vendor: bucket });
        bucket = [];
      }
    }
    expect(bucket).toEqual([]); // nothing trailing past the final marker
    expect(nyata).toEqual(DIHARAPKAN);
  });

  // THE THREE HEAVY ONES MUST STAY LAZY.
  //
  // Measured in the running app, before this changed:
  //
  //   VENDOR 11795ms total — mermaid 8904, three3d 1266, xterm 705,
  //   babel 580, react 238, monaco-loader 74, cytoscape 28
  //
  // Eleven point eight seconds of blocked render, twice the 5000 ms after which
  // Windows marks a window unresponsive, and mermaid alone was 75% of it. None
  // of the three is needed to show the first screen: mermaid only when a chat
  // message carries a diagram, three3d only when a 3D preview opens, babel only
  // on the HMR path.
  //
  // The list above no longer names them, so an eager <script> tag for one of
  // them would already fail that comparison. This asserts the other half: that
  // each still has a loader, and that the loader is actually reachable by name.
  test("mermaid, three3d dan babel dimuat SESUAI PERMINTAAN, bukan saat start", () => {
    const html = HTML;
    for (const src of [
      "/vendor/mermaid.min.js",
      "/vendor/three3d.bundle.js",
      "/vendor/babel.min.js",
    ]) {
      // No eager tag anywhere. A plain string, deliberately: the tag being
      // matched is written one exact way in index.html, and a regex here would
      // only add escaping layers for nothing.
      expect(html).not.toContain('<script src="' + src + '"');
      // But the loader still knows where to find it.
      expect(html).toContain('"' + src + '"');
    }
    for (const fn of ["__muatMermaid", "__muatThree", "__muatBabel"]) {
      expect(html).toContain("window." + fn + " =");
    }
    // And the consumers actually call them — a loader nobody invokes is the
    // same as no loader, except that it looks fine.
    const cb = fs.readFileSync(
      path.join(__dirname, "..", "public", "app", "CodeBlocks.tsx"),
      "utf8",
    );
    expect(cb).toMatch(/__muatMermaid\(\)/);
    const m3 = fs.readFileSync(
      path.join(__dirname, "..", "public", "app", "Model3DViewer.tsx"),
      "utf8",
    );
    expect(m3).toMatch(/__muatThree\(\)/);
    expect(html).toMatch(/await window\.__muatBabel\(\)/);
  });

  test("marker names are unique, so a copy-paste cannot hide a bundle", () => {
    const nama = urutanPeristiwa()
      .filter((e) => e.jenis === "tanda")
      .map((e) => e.nama);
    expect(new Set(nama).size).toBe(nama.length);
  });

  test("the meter actually reports, and names the expensive bundles", () => {
    // The real code, lifted out of the page and run. Reading it would not prove
    // it reports; this does.
    const blok = HTML.slice(
      HTML.indexOf("window.__vt ="),
      HTML.indexOf('__vt("__mulai")'),
    );
    expect(blok).toContain("performance.now()");

    let jam = 0;
    const baris = [];
    const ctx: any = {
      window: {},
      performance: {
        now: () => jam,
      },
      console: { log: (s) => baris.push(String(s)) },
    };
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(blok, ctx);

    const vt = ctx.window.__vt;
    expect(typeof vt).toBe("function");

    vt("__mulai");
    jam += 5; // below the 1 ms floor? no -- 5 ms, should be listed
    vt("xterm");
    jam += 900;
    vt("mermaid");
    jam += 0.4; // under 1 ms, must be dropped from the listing
    vt("react");
    vt("__selesai");

    expect(baris.length).toBe(1);
    const s = baris[0];
    expect(s).toContain("[probe] VENDOR");
    expect(s).toContain("905ms total");
    // Sorted heaviest first, and the sub-millisecond entry is not listed.
    expect(s).toContain("mermaid 900ms");
    expect(s).toContain("xterm 5ms");
    expect(s).not.toContain("react");
  });

  test("reports through console.log, which main.ts already forwards", () => {
    // electron/main.ts attaches a console-message handler to the window's
    // webContents, so a renderer console.log lands in the main log with no IPC
    // and no preload bridge. If that handler ever goes, this meter goes silent.
    const main = fs.readFileSync(
      path.join(__dirname, "..", "electron", "main.ts"),
      "utf8",
    );
    expect(main).toContain('"console-message"');
  });
});
