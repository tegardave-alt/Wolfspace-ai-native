// Seeing a whole diagram.
//
// WHAT IT WAS: a rendered mermaid diagram sat in a box with `overflow-x: auto`,
// so anything wider than the chat column could only be read by scrolling it
// sideways a piece at a time — and a flowchart is exactly the kind of thing
// that is useless in pieces. A way out existed: a small button in the header
// labelled "⇱ interaktif". Nobody looks for a button in a header while trying
// to read a picture.
//
// The picture is now the control. Clicking it opens the diagram filling the
// window, scaled to fit, dragged with the pointer.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");

function tanpaKomentar(src: string) {
  const out: string[] = [];
  let dalam = false;
  for (const baris of src.split("\n")) {
    const t = baris.trim();
    const tutup = t.endsWith("*/") || t.endsWith("*/}");
    if (dalam) {
      if (tutup) dalam = false;
      continue;
    }
    if (t.startsWith("//") || t.startsWith("*")) continue;
    if (t.startsWith("/*") || t.startsWith("{/*")) {
      if (!tutup) dalam = true;
      continue;
    }
    out.push(baris);
  }
  return out.join("\n");
}

const baca = (rel: string) =>
  fs.readFileSync(path.join(AKAR, rel), "utf8").replace(/\r\n/g, "\n");
const SRC = tanpaKomentar(baca("public/app/CodeBlocks.tsx"));
const CSS = baca("public/styles.css");
const BUILD = baca("public/app.build.js");

/** One CSS rule, read to its closing brace rather than a guessed length. */
function aturan(selektor: string) {
  const i = CSS.indexOf(selektor + " {");
  if (i < 0) return "";
  return CSS.slice(i, CSS.indexOf("}", i));
}

// The two pure rules, taken from the source and run.
globalThis.self = globalThis;
const Babel = require(path.join(AKAR, "public/vendor/babel.min.js"));
const D = new Function(
  "React",
  "ReactDOM",
  "window",
  "useState",
  "useRef",
  "useEffect",
  "useMemo",
  "useCallback",
  Babel.transform(baca("public/app/CodeBlocks.tsx"), {
    presets: ["react", "typescript"],
    filename: "/app/CodeBlocks.tsx",
  }).code +
    "\n; return { skalaMuat, jepitSkala, ukuranViewBox, uraiTranslate, idSimpulDari, ujungTepi, geserJalur };",
)(
  { createElement: () => ({}), Fragment: null },
  { createPortal: (x: any) => x },
  { addEventListener() {} },
  () => [null, () => {}],
  () => ({}),
  () => {},
  (f: any) => f(),
  (f: any) => f,
);

describe("the scale that fits", () => {
  test("a diagram wider than the window is shrunk to fit", () => {
    // 2000 wide in a 1000 window, minus 48 of breathing room -> 0.476.
    const s = D.skalaMuat({ w: 2000, h: 500 }, { w: 1000, h: 800 });
    expect(s).toBeCloseTo((1000 - 48) / 2000, 5);
  });

  test("the tighter of the two axes wins", () => {
    // Fitting only the width would push the bottom of a tall diagram off
    // screen — which is the problem this whole thing exists to remove.
    const s = D.skalaMuat({ w: 400, h: 4000 }, { w: 1000, h: 800 });
    expect(s).toBeCloseTo((800 - 48) / 4000, 5);
  });

  test("a small diagram is NOT blown up to fill the window", () => {
    // Enlarging past 1:1 makes a picture blurry and says nothing more.
    expect(D.skalaMuat({ w: 100, h: 80 }, { w: 1600, h: 1200 })).toBe(1);
  });

  test("nonsense measurements answer 1, not NaN or Infinity", () => {
    // getBoundingClientRect returns zeroes for a node that is not laid out yet,
    // and a NaN transform silently renders nothing at all.
    for (const kasus of [
      [
        { w: 0, h: 0 },
        { w: 800, h: 600 },
      ],
      [
        { w: 100, h: 100 },
        { w: 10, h: 10 },
      ],
      [null, null],
      [
        { w: "x", h: "y" },
        { w: 800, h: 600 },
      ],
    ] as any[])
      expect(D.skalaMuat(kasus[0], kasus[1])).toBe(1);
  });
});

describe("zoom is bounded", () => {
  test("it cannot run away in either direction", () => {
    // Unbounded wheel zoom loses the diagram off-screen with no way back
    // except closing and reopening.
    expect(D.jepitSkala(1000)).toBe(8);
    expect(D.jepitSkala(0.0001)).toBe(0.1);
    expect(D.jepitSkala(2)).toBe(2);
  });

  test("a broken value falls back to 1:1", () => {
    for (const v of [NaN, Infinity, -Infinity, null, undefined, "x"])
      expect(D.jepitSkala(v as any)).toBe(1);
  });
});

describe("the picture is the control", () => {
  test("the canvas opens the full view when clicked", () => {
    const i = SRC.indexOf('className="mermaid-canvas"');
    expect(i).toBeGreaterThan(-1);
    const blok = SRC.slice(i, i + 1200);
    expect(blok).toMatch(/onClick=/);
    // `buka`, not setPenuh: the state moved UP to DiagramBlock once the full
    // view had to choose between a live graph and a picture, and only the
    // parent knows which the diagram converts into. The rule this guards is
    // "clicking the canvas opens it", not which component holds the flag.
    expect(blok).toMatch(/buka\(svg\.outerHTML\)/);
    expect(blok).toMatch(/cursor: "zoom-in"/);
  });

  test("and from the keyboard, because it calls itself a button", () => {
    // role="button" with no key handler is a lie to a screen reader.
    const i = SRC.indexOf('className="mermaid-canvas"');
    const blok = SRC.slice(i, i + 1200);
    expect(blok).toMatch(/role="button"/);
    expect(blok).toMatch(/tabIndex=\{0\}/);
    expect(blok).toMatch(/e\.key !== "Enter" && e\.key !== " "/);
  });
});

describe("the full view", () => {
  const i = SRC.indexOf("function DiagramLightbox");
  const badan = SRC.slice(i, SRC.indexOf("function DiagramBlock"));

  test("it is portalled, like every other overlay here", () => {
    // A fixed overlay rendered from inside the chat column is clipped by any
    // ancestor with a transform or filter — which in a split view means half
    // the picture disappears. The GitHub panel was cut in half by exactly this.
    expect(i).toBeGreaterThan(-1);
    expect(badan).toMatch(/ReactDOM\.createPortal\(isi, document\.body\)/);
    expect(badan).toMatch(/typeof document !== "undefined"/);
  });

  test("it drags", () => {
    expect(badan).toMatch(/onMouseDown=\{mulaiSeret\}/);
    expect(badan).toMatch(/onMouseMove=\{jalanSeret\}/);
    // Releasing outside the stage must end the drag too, or the diagram sticks
    // to the pointer afterwards.
    expect(badan).toMatch(/onMouseLeave=\{selesaiSeret\}/);
  });

  test("it zooms on the wheel, through the clamp", () => {
    expect(badan).toMatch(/onWheel=/);
    expect(badan).toMatch(/jepitSkala\(s \* arah\)/);
  });

  test("there are three ways out, and one of them is Escape", () => {
    // A diagram filling the window leaves little backdrop to click.
    expect(badan).toMatch(/e\.key === "Escape"/);
    expect(badan).toMatch(/aria-label="Close diagram"/);
    expect(badan).toMatch(/e\.target === e\.currentTarget/);
  });

  test("a drag ending on the backdrop does not count as a click", () => {
    // Without the target check, panning past the edge closes the view.
    const j = badan.indexOf("onMouseDown={(e: any) => {");
    expect(j).toBeGreaterThan(-1);
    expect(badan.slice(j, j + 300)).toMatch(/e\.target === e\.currentTarget/);
  });

  test("double-click and 0 both refit", () => {
    expect(badan).toMatch(/onDoubleClick=\{muat\}/);
    expect(badan).toMatch(/e\.key === "0"/);
  });
});

describe("the stage, not the picture, takes the pointer", () => {
  test("the svg wrapper ignores pointer events", () => {
    // An <svg> swallows the pointer at every node it contains, so a drag over
    // the picture selects its text instead of moving it.
    expect(aturan(".diag-isi")).toMatch(/pointer-events: none/);
  });

  test("the stage clips instead of scrolling", () => {
    // A scrollbar here would be the very thing this replaces.
    const p = aturan(".diag-panggung");
    expect(p).toMatch(/overflow: hidden/);
    expect(p).toMatch(/cursor: grab/);
  });

  test("the svg is not squeezed by an inherited max-width", () => {
    // Global rules cap images and svg at 100%; that would undo the zoom.
    const i2 = CSS.indexOf(".diag-isi svg {");
    expect(i2).toBeGreaterThan(-1);
    expect(CSS.slice(i2, CSS.indexOf("}", i2))).toMatch(/max-width: none/);
  });

  test("it ships in the built bundle", () => {
    expect(BUILD).toMatch(/diag-panggung/);
  });
});

describe("the first view fits, without a scrollbar", () => {
  // WHAT IT WAS: mermaid stamps a fixed `height` on the <svg>, so a tall
  // flowchart rendered at whatever height dagre decided — nine hundred pixels
  // is ordinary — and the reader met a picture they had to scroll before they
  // could tell what it was.
  test("the height attribute is dropped so height:auto can work", () => {
    // An attribute and a stylesheet rule are not the same fight; on some SVG
    // properties the attribute wins, so it is removed rather than overridden.
    const i = SRC.indexOf("ref.current.innerHTML = svg");
    expect(i).toBeGreaterThan(-1);
    expect(SRC.slice(i, i + 400)).toMatch(/removeAttribute\("height"\)/);
  });

  test("the inline diagram is capped to a moderate box", () => {
    const r = aturan(".mermaid-canvas svg");
    expect(r).toBeTruthy();
    expect(r).toMatch(/max-height: 360px/);
    // width:100% + height:auto is what lets the viewBox scale the drawing down
    // to MEET inside the box rather than crop it.
    expect(r).toMatch(/height: auto/);
    expect(r).toMatch(/width: 100%/);
  });

  test("the canvas no longer scrolls sideways either", () => {
    // overflow-x: auto was the other half of the same problem.
    const i = SRC.indexOf('className="mermaid-canvas"');
    const blok = SRC.slice(i, i + 1400);
    expect(blok).toMatch(/overflow: "hidden"/);
    expect(blok).not.toMatch(/overflowX: "auto"/);
  });

  test("the cap does NOT follow the diagram into the full view", () => {
    // Capping there would defeat the whole point of opening it.
    const f = aturan(".diag-isi svg");
    expect(f).toMatch(/max-height: none/);
    expect(f).toMatch(/max-width: none/);
  });

  test("it ships in the built bundle", () => {
    expect(BUILD).toMatch(/removeAttribute\("height"\)/);
  });
});

describe("the layout is the user's to rearrange", () => {
  test("the full view hosts the LIVE graph when the diagram converts", () => {
    // Dragging nodes was already possible, but only behind a small "⇱
    // interaktif" link in the header — not where anyone looks while reading a
    // picture. The picture itself now opens it.
    const i = SRC.indexOf("function DiagramBlock");
    expect(i).toBeGreaterThan(-1);
    const blok = SRC.slice(i, i + 2200);
    expect(blok).toMatch(
      /canInteractive[\s\S]{0,200}children: <CytoscapeBlock/,
    );
  });

  test("a diagram that does NOT convert still gets the picture view", () => {
    // Sequence, pie and class diagrams have no nodes to drag. Offering the
    // control anyway would be a control that does nothing.
    const i = SRC.indexOf("function DiagramBlock");
    const blok = SRC.slice(i, i + 2200);
    expect(blok).toMatch(/: \{ svgHtml: penuh \}/);
  });

  test("the hint tells the truth about which one you got", () => {
    const i = SRC.indexOf("function DiagramBlock");
    const blok = SRC.slice(i, i + 2200);
    expect(blok).toMatch(/hint: "drag the nodes to rearrange/);
  });

  test("the live stage does not fight cytoscape for the pointer", () => {
    // The pan transform and the grab cursor belong to the picture view. Applied
    // to a graph they would move the whole canvas when the user meant one node.
    const badan = SRC.slice(
      SRC.indexOf("function DiagramLightbox"),
      SRC.indexOf("function DiagramBlock"),
    );
    expect(badan).toMatch(/children \?/);
    expect(badan).toMatch(/diag-panggung diag-hidup/);
    const hidup = aturan(".diag-panggung.diag-hidup");
    expect(hidup).toMatch(/cursor: default/);
  });
});

describe("copying a diagram", () => {
  const i = SRC.indexOf("function MermaidBlock");
  const badan = SRC.slice(i, SRC.indexOf("function MermaidBlockFallback"));

  test("it copies the SOURCE, not the rendered picture", () => {
    // An SVG on the clipboard pastes into almost nothing useful; the mermaid
    // text goes into a document, an issue, or back into this chat to be edited.
    expect(badan).toMatch(/writeText\(code\)/);
  });

  test("it reuses CodeBlock's button, not a second copy idiom", () => {
    // Two shapes for one action drift apart, and this repo has paid for that
    // more than once.
    expect(badan).toMatch(
      /className=\{"ctb-btn" \+ \(disalin \? " copied" : ""\)\}/,
    );
    expect(badan).toMatch(/disalin \? <Icon\.check \/> : <Icon\.copy \/>/);
    expect(badan).toMatch(/setTimeout\(\(\) => setDisalin\(false\), 1500\)/);
  });

  test("clicking it does not also open the full view", () => {
    // The button sits inside the block; without stopPropagation the copy would
    // be followed by the diagram filling the window.
    const j = badan.indexOf("writeText(code)");
    expect(badan.slice(Math.max(0, j - 200), j)).toMatch(
      /e\.stopPropagation\(\)/,
    );
  });

  test("it ships in the built bundle", () => {
    expect(BUILD).toMatch(/Copy the diagram source/);
  });
});

// ── SATU KANVAS, DUA SASARAN SERET ──────────────────────────────────────────
//
// WHAT IT WAS: everything inside the full view was one picture. Dragging
// anywhere panned the whole thing, so a box could never be nudged out of the
// way. The first attempt at fixing that replaced mermaid with a Cytoscape
// graph — layout buttons, remembered positions, a second renderer to keep in
// step — and threw away the tidy drawing that was the good part. This is the
// small version: mermaid still draws it, and one box can be moved.

describe("reading a translate", () => {
  test("both spellings mermaid emits", () => {
    // Measured: mermaid writes "translate(140.9765625, 35)". Older output and
    // hand-written SVG use a space with no comma.
    expect(D.uraiTranslate("translate(140.9765625, 35)")).toEqual({
      x: 140.9765625,
      y: 35,
    });
    expect(D.uraiTranslate("translate(10 20)")).toEqual({ x: 10, y: 20 });
    expect(D.uraiTranslate("translate(-4.5,-8)")).toEqual({ x: -4.5, y: -8 });
  });

  test("a missing or unreadable transform is the origin, not NaN", () => {
    // A NaN in a transform makes the element vanish with no error at all.
    for (const t of [null, undefined, "", "rotate(20)", "scale(2)"])
      expect(D.uraiTranslate(t as any)).toEqual({ x: 0, y: 0 });
  });
});

describe("finding the node id inside mermaid's own id", () => {
  test("the shape mermaid actually emits", () => {
    // Measured from a real render, not assumed.
    expect(D.idSimpulDari("uji-flowchart-A-0")).toBe("A");
    expect(D.idSimpulDari("u1-flowchart-my_node-0")).toBe("my_node");
  });

  test("a node id containing a dash survives", () => {
    // The suffix is stripped from the END, so the dash inside stays.
    expect(D.idSimpulDari("x-flowchart-order-item-12")).toBe("order-item");
  });

  test("anything that is not a node id answers null", () => {
    for (const g of [null, "", "uji-L_A_B_0", "some-other-id", "flowchart"])
      expect(D.idSimpulDari(g as any)).toBe(null);
  });
});

describe("which end of an edge a node sits on", () => {
  const IDS = ["A", "B", "C"];

  test("source is the start, target is the end", () => {
    expect(D.ujungTepi("uji-L_A_B_0", "A", IDS)).toBe("awal");
    expect(D.ujungTepi("uji-L_A_B_0", "B", IDS)).toBe("akhir");
  });

  test("an edge the node has nothing to do with answers null", () => {
    expect(D.ujungTepi("uji-L_A_B_0", "C", IDS)).toBe(null);
  });

  test("node ids containing underscores are resolved, not miscounted", () => {
    // THE reason this takes the id list at all. "L_my_node_other_node_0"
    // cannot be split by counting underscores; it is split at the one place
    // where both halves are nodes the diagram really has.
    const ids = ["my_node", "other_node"];
    expect(D.ujungTepi("u1-L_my_node_other_node_0", "my_node", ids)).toBe(
      "awal",
    );
    expect(D.ujungTepi("u1-L_my_node_other_node_0", "other_node", ids)).toBe(
      "akhir",
    );
  });

  test("a genuinely ambiguous pair answers null rather than guessing", () => {
    // With nodes a, b, a_b and b_a, "L_a_b_a_0" splits two valid ways. Moving
    // the wrong edge looks like a bug; moving none looks like a limit.
    expect(D.ujungTepi("x-L_a_b_a_0", "a", ["a", "b", "a_b", "b_a"])).toBe(
      null,
    );
  });

  test("junk in, null out", () => {
    for (const e of [null, "", "uji-flowchart-A-0", "L_A_B"])
      expect(D.ujungTepi(e as any, "A", IDS)).toBe(null);
    expect(D.ujungTepi("uji-L_A_B_0", null as any, IDS)).toBe(null);
  });
});

describe("bending an edge so it follows the box that moved", () => {
  // M x,y L x,y C x,y,x,y,x,y — the only commands a measured mermaid render
  // emits. M and L take one point each and C takes three, so this is FIVE
  // points and the weights run 1, .75, .5, .25, 0.
  const D4 = "M0,0L30,0C60,0,90,0,90,0";

  test("the moved end travels the full distance", () => {
    const keluar = D.geserJalur(D4, 10, 4, true);
    expect(keluar.slice(0, keluar.indexOf("L"))).toBe("M10,4");
  });

  test("the far end does not move at all", () => {
    // It is still touching the node that did not move. If it drifted, the
    // arrow would come away from its box.
    expect(D.geserJalur(D4, 10, 4, true).endsWith("90,0")).toBe(true);
  });

  test("dragging the other end reverses the weights", () => {
    const keluar = D.geserJalur(D4, 10, 4, false);
    expect(keluar.startsWith("M0,0")).toBe(true);
    expect(keluar.endsWith("100,4")).toBe(true);
  });

  test("the points between are carried proportionally", () => {
    // Second point of five: weight .75, so 30 + 10*.75 = 37.5. Third: .5.
    const angka = D.geserJalur(D4, 10, 0, true).match(/-?[\d.]+/g);
    expect(parseFloat(angka[2])).toBeCloseTo(30 + 10 * 0.75, 3);
    expect(parseFloat(angka[4])).toBeCloseTo(60 + 10 * 0.5, 3);
  });

  test("a zero drag changes nothing measurable", () => {
    expect(D.geserJalur(D4, 0, 0, true).replace(/\s/g, "")).toBe(
      D4.replace(/\s/g, ""),
    );
  });

  test("a path using commands it cannot reason about is left alone", () => {
    // H, V and A do not take whole coordinate pairs, so treating every number
    // as an x or a y would corrupt them. Refusing beats mangling.
    for (const d of [
      "M0,0H50V50",
      "M0,0A25,25 0 0 1 50,0",
      "M0,0Q25,25 50,0",
      "M0,0L10,10Z",
    ])
      expect(D.geserJalur(d, 5, 5, true)).toBe(d);
  });

  test("an empty or odd path is returned untouched", () => {
    expect(D.geserJalur("", 5, 5, true)).toBe("");
    expect(D.geserJalur(null as any, 5, 5, true)).toBe("");
    expect(D.geserJalur("M0,0L10", 5, 5, true)).toBe("M0,0L10");
  });
});

describe("the canvas tells the two drags apart", () => {
  const i = SRC.indexOf("function DiagramLightbox");
  const badan = SRC.slice(i, SRC.indexOf("function DiagramBlock"));

  test("a mousedown on a box starts a box drag, everything else pans", () => {
    expect(badan).toMatch(/t\.closest\("g\.node"\)/);
    expect(badan).toMatch(/if \(g && mulaiSeretSimpul\(e, g\)\) return;/);
  });

  test("a box drag suppresses the pan, not the other way round", () => {
    // Both handlers hang off the same stage. If the pan ran too, the box would
    // move AND the whole picture would slide out from under it.
    const j = badan.indexOf("const jalanSeret");
    const gerak = badan.slice(j, badan.indexOf("const selesaiSeret", j));
    expect(gerak.indexOf("seretSimpul.current")).toBeLessThan(
      gerak.indexOf("if (!seret.current) return;"),
    );
    expect(gerak).toMatch(/return;\s*\}\s*if \(!seret\.current\) return;/);
  });

  test("releasing ends both kinds of drag", () => {
    const j = badan.indexOf("const selesaiSeret");
    const akhir = badan.slice(j, j + 200);
    expect(akhir).toMatch(/seret\.current = null/);
    expect(akhir).toMatch(/seretSimpul\.current = null/);
  });

  test("every frame is measured from where the drag began", () => {
    // Re-bending an already-bent path accumulates error fast; the starting
    // path is kept and the shift is always applied to that.
    expect(badan).toMatch(/d: p\.getAttribute\("d"\)/);
    expect(badan).toMatch(/geserJalur\(it\.d, dx, dy, it\.dariAwal\)/);
  });

  test("the pointer delta is converted through the SVG's own matrix", () => {
    // getScreenCTM carries the lightbox zoom AND the viewBox scale. Without
    // it, a drag at 3x zoom moves the box three times as far as the pointer.
    expect(badan).toMatch(/getScreenCTM/);
    expect(badan).toMatch(/\(e\.clientX - s\.x\) \/ \(s\.sx \|\| 1\)/);
  });

  test("only boxes take the pointer back; lines and background stay through", () => {
    expect(aturan(".diag-isi")).toMatch(/pointer-events: none/);
    const simpul = aturan(".diag-isi svg g.node");
    expect(simpul).toMatch(/pointer-events: all/);
    expect(simpul).toMatch(/cursor: grab/);
    expect(aturan(".diag-isi svg g.node:active")).toMatch(/cursor: grabbing/);
  });

  test("the hint says both drags exist", () => {
    // A control nobody is told about is a control nobody uses — the header
    // button this replaced proved that once already.
    expect(badan).toMatch(/drag a box to move it/);
    expect(badan).toMatch(/drag the background to pan/);
  });

  test("it ships in the built bundle", () => {
    expect(BUILD).toMatch(/drag a box to move it/);
    expect(BUILD).toMatch(/flowchart-link/);
  });
});

describe("only flowcharts have movable boxes", () => {
  // Measured, all four from a real render of the vendored mermaid:
  //   flowchart  g.node "z0-flowchart-A-0"   edge "z0-L_A_B_0"      (endpoints)
  //   class      g.node "z1-classId-Animal-0" edge "z1-id_Animal_Dog_1"
  //   state      g.node "z2-state-Diam-1"    edge "z2-edge0"        (no endpoints)
  //   sequence   no g.node at all
  //
  // A class or state box could be moved, but its connectors cannot be matched
  // back to it — a state diagram's edge id says nothing about which states it
  // joins — so the box would slide away and leave its arrows behind. Refusing
  // the drag keeps those diagrams exactly as they were: pictures that pan.

  test("a flowchart box is recognised", () => {
    expect(D.idSimpulDari("z0-flowchart-A-0")).toBe("A");
  });

  test("class and state boxes are not, so the drag falls through to the pan", () => {
    expect(D.idSimpulDari("z1-classId-Animal-0")).toBe(null);
    expect(D.idSimpulDari("z2-state-Diam-1")).toBe(null);
    expect(D.idSimpulDari("z2-state-root_start-0")).toBe(null);
  });

  test("the drag gives up rather than moving a box it cannot wire", () => {
    // mulaiSeretSimpul answers false, and mulaiSeret then pans.
    const i = SRC.indexOf("const mulaiSeretSimpul");
    const badan = SRC.slice(i, SRC.indexOf("const jalanSeret", i));
    expect(badan).toMatch(/if \(!nid\) return false;/);
    expect(SRC).toMatch(/if \(g && mulaiSeretSimpul\(e, g\)\) return;/);
  });
});

// ── KANVASNYA ADALAH PANGGUNG, BUKAN GAMBARNYA ──────────────────────────────
//
// WHAT IT WAS: a box dragged towards the bottom of the window vanished part of
// the way down. Nothing was covering it — an <svg> clips its own content at its
// viewport, and the drawing's viewport was far smaller than the window it sat
// in. Measured: a 1280x704 stage holding a drawing laid out at 300 x 87.7.
// Those two numbers are the bug; the area a box may move in and the canvas the
// user sees have to be the same area.

describe("the drawing is given its real size", () => {
  test("the viewBox is the size, and it is read exactly", () => {
    // Measured from a real render of the diagram in the report.
    expect(D.ukuranViewBox("0 0 1002.07421875 292.984375")).toEqual({
      w: 1002.07421875,
      h: 292.984375,
    });
    expect(D.ukuranViewBox("0,0,120,60")).toEqual({ w: 120, h: 60 });
    expect(D.ukuranViewBox("  0 0 120 60  ")).toEqual({ w: 120, h: 60 });
  });

  test("a viewBox that says nothing usable answers null", () => {
    // The caller then falls back to the ink. Answering {w:0,h:0} instead would
    // make the fit divide by zero and the diagram disappear.
    for (const vb of [null, "", "0 0", "0 0 1 2 3", "0 0 0 60", "a b c d"])
      expect(D.ukuranViewBox(vb as any)).toBe(null);
  });

  test("300px would have kept the window three-quarters empty", () => {
    // The fit never enlarges past 1:1, so a drawing wrongly laid out at 300
    // wide stays at 300 wide however big the window is. With the true size it
    // fills the stage.
    expect(D.skalaMuat({ w: 300, h: 87.7 }, { w: 1280, h: 704 })).toBe(1);
    expect(D.skalaMuat({ w: 1002, h: 293 }, { w: 1280, h: 704 })).toBe(1);
    // ...and a drawing genuinely wider than the window still shrinks to fit.
    expect(D.skalaMuat({ w: 2400, h: 293 }, { w: 1280, h: 704 })).toBeCloseTo(
      (1280 - 48) / 2400,
      5,
    );
  });
});

describe("nothing swallows a box at the edge", () => {
  const i = SRC.indexOf("function DiagramLightbox");
  const badan = SRC.slice(i, SRC.indexOf("function DiagramBlock"));

  test("only the stage clips, and the stage is the canvas", () => {
    // An <svg> clips at its own viewport by default. Measured: a box moved 400
    // units past the drawing was still on screen, but elementFromPoint at its
    // centre hit .diag-panggung — it was simply not drawn.
    expect(aturan(".diag-isi svg")).toMatch(/overflow: visible/);
    expect(aturan(".diag-panggung")).toMatch(/overflow: hidden/);
  });

  test("the size is pinned before anything is measured against it", () => {
    expect(badan).toMatch(/const u = ukuranGambar\(i\);/);
    expect(badan).toMatch(/i\.setAttribute\("width", String\(u\.w\)\)/);
    expect(badan).toMatch(/i\.setAttribute\("height", String\(u\.h\)\)/);
  });

  test("the fit no longer divides by a scale it cannot see", () => {
    // `muat` has an empty dependency list, so the `skala` it closed over was
    // forever the initial 1. Pressing 0 after zooming therefore refit against
    // a width that had already been multiplied by the real zoom. The viewBox
    // is in the drawing's own units and needs no such undoing.
    const j = badan.indexOf("const muat = useCallback");
    const m = badan.slice(j, badan.indexOf("}, []);", j));
    expect(m).not.toMatch(/skala \|\| 1/);
    expect(m).not.toMatch(/getBoundingClientRect/);
    expect(m).toMatch(/skalaMuat\(u \|\| \{ w: 0, h: 0 \}/);
  });

  test("it ships in the built bundle", () => {
    expect(BUILD).toMatch(/ukuranViewBox|ukuranGambar/);
  });
});
