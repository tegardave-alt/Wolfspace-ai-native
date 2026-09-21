// How a staged attachment looks.
//
// ── WHAT THIS EXISTS TO PREVENT ──────────────────────────────────────────────
//
// Every attachment used to be forced into one 60x60 square, and a text file
// filled that square with the first couple of hundred characters of its own
// source at 6.5px with `word-break: break-all`. A staged index.html rendered as
// a grey tile of shredded "<!DOCTYPE html> <ht ml lang= "en"> <he ad> <met":
// no name, no type, no size. The tile also hardcoded #4ec9b0 and #0d1117, so it
// stayed dark whatever the theme said.
//
// The tests below RENDER THE COMPONENT rather than grep for class names, so
// they check what a person would actually see.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const AKAR = path.resolve(__dirname, "..");
const esbuild = require(path.join(AKAR, "node_modules", "esbuild"));
const React = require(path.join(AKAR, "node_modules", "react"));
const RS = require(path.join(AKAR, "node_modules", "react-dom", "server"));

const SUMBER = fs.readFileSync(
  path.join(AKAR, "public", "app", "Components.tsx"),
  "utf8",
);
const CSS = fs.readFileSync(path.join(AKAR, "public", "styles.css"), "utf8");

/**
 * The component, taken from the real source and transformed the way the build
 * transforms it. Nothing is re-implemented here — a copy would pass while the
 * app rendered something else.
 */
function muatChip() {
  const i = SUMBER.indexOf("/** The icons are the material-icon-theme");
  const j = SUMBER.indexOf("/* ----------------------------- Composer");
  if (i < 0 || j < 0 || j < i) throw new Error("chip region not found");
  const code = esbuild.transformSync(SUMBER.slice(i, j), {
    loader: "tsx",
    jsx: "transform",
  }).code;
  const IKON: any = {};
  const teks = fs.readFileSync(
    path.join(AKAR, "public", "app", "IkonBahasa.ts"),
    "utf8",
  );
  for (const g of teks.matchAll(/^\s{2}([a-z0-9]+):\s*'(<svg[\s\S]*?)',$/gm)) {
    IKON[g[1]] = g[2];
  }
  const ctx: any = { React, IKON_BAHASA: IKON, console };
  vm.createContext(ctx);
  vm.runInContext(code + "\n;this.__chip = AttachmentChip;", ctx);
  return ctx.__chip;
}

const Chip = muatChip();
const render = (att: any, props: any = {}) =>
  RS.renderToStaticMarkup(React.createElement(Chip, { att, ...props }));
/** Text only, the way a person reads the chip. */
const teksSaja = (html: string) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("dokumen tampil sebagai baris ikon", () => {
  test("an HTML file shows its NAME, not its source", () => {
    // The exact case from the screenshot: a staged index.html carrying a
    // snippet of its own markup.
    const html = render({
      name: "index.html",
      size: 4312,
      snippet: '<!DOCTYPE html> <html lang="en"> <head> <meta',
    });
    const teks = teksSaja(html);
    expect(teks).toContain("index");
    expect(teks).toContain(".html");
    // The snippet must not appear anywhere in the chip.
    expect(html).not.toContain("DOCTYPE");
    expect(html).not.toContain("<head>");
  });

  test("it names the type and the size", () => {
    expect(teksSaja(render({ name: "index.html", size: 4312 }))).toContain(
      "HTML · 4.2 KB",
    );
    expect(teksSaja(render({ name: "a.py", size: 2_200_000 }))).toContain(
      "PY · 2.1 MB",
    );
  });

  test("a file with no extension gets no stray separator", () => {
    const teks = teksSaja(render({ name: "notes", size: 900 }));
    expect(teks).toContain("900 B");
    expect(teks).not.toMatch(/·/);
  });

  test("bytes below a kilobyte stay bytes", () => {
    // "0.0 KB" says nothing. Small files are common here.
    expect(teksSaja(render({ name: "a.txt", size: 12 }))).toContain("12 B");
  });
});

describe("nama panjang tetap terbaca", () => {
  test("the extension is in its own element, so it cannot be truncated", () => {
    // A plain ellipsis over the whole name eats ".tsx" -- the part that says
    // what the file IS. Only the stem is allowed to shrink.
    const html = render({
      name: "a-very-long-component-filename-indeed.tsx",
      size: 18422,
    });
    expect(html).toMatch(
      /<span class="lam-batang">a-very-long-component-filename-indeed<\/span><span class="lam-ekor">\.tsx<\/span>/,
    );
    // And the CSS has to actually do that: stem clips, extension does not.
    const batang = CSS.slice(CSS.indexOf(".lam-batang {"));
    expect(batang.slice(0, batang.indexOf("}"))).toMatch(/text-overflow/);
    const ekor = CSS.slice(CSS.indexOf(".lam-ekor {"));
    expect(ekor.slice(0, ekor.indexOf("}"))).toMatch(/flex: none/);
  });

  test("the full name is always available on hover", () => {
    const html = render({ name: "sangat-panjang-sekali.tsx", size: 10 });
    expect(html).toContain('title="sangat-panjang-sekali.tsx"');
  });
});

describe("gambar tampil sebagai thumbnail", () => {
  test("an image renders the picture, not an icon row", () => {
    const html = render({
      name: "shot.png",
      size: 55000,
      previewUrl: "blob:x",
      type: "image/png",
    });
    expect(html).toContain("lam-gambar");
    expect(html).not.toContain("lam-berkas");
    expect(html).toMatch(/<img src="blob:x"/);
  });

  test("video gets a video element, not a broken image", () => {
    const html = render({ name: "clip.mp4", previewUrl: "blob:v", size: 10 });
    expect(html).toContain("<video");
  });

  test("an image with no preview yet falls back to the icon row", () => {
    // Otherwise it would render an <img> with an empty src.
    const html = render({ name: "shot.png", size: 10 });
    expect(html).toContain("lam-berkas");
    expect(html).not.toMatch(/<img/);
  });
});

describe("keadaan unggah dan gagal", () => {
  test("uploading says so in the line the eye is already on", () => {
    const html = render({ name: "a.py", size: 20, status: "uploading" });
    expect(teksSaja(html)).toContain("Uploading…");
    expect(html).toContain("lam-garis");
  });

  test("a failure shows the reason, not a warning sign", () => {
    const html = render({
      name: "b.json",
      size: 12,
      status: "error",
      error: "Too large",
    });
    expect(teksSaja(html)).toContain("Too large");
    expect(html).toContain("lam-error");
  });

  test("no emoji anywhere in the chip", () => {
    // The old tile used 📄 💻 🧊 ⏳ ⚠️ as its entire vocabulary.
    for (const att of [
      { name: "a.py", size: 1, status: "uploading" },
      { name: "b.json", size: 1, status: "error", error: "x" },
      { name: "c.html", size: 1 },
    ]) {
      expect(render(att)).not.toMatch(
        /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
      );
    }
  });
});

describe("tombol hapus", () => {
  test("it is only rendered when removing is possible", () => {
    // A sent attachment cannot be unsent, so the message bubble passes no
    // handler and must get no button.
    expect(render({ name: "a.txt", size: 1 })).not.toContain("lam-buang");
    expect(
      render({ name: "a.txt", size: 1 }, { onRemove: () => {} }),
    ).toContain("lam-buang");
  });

  test("it is hidden until hover or keyboard focus", () => {
    // A row of permanent little crosses reads as clutter; focus-visible keeps
    // it reachable without a mouse.
    const blok = CSS.slice(CSS.indexOf(".lam-buang {"));
    expect(blok.slice(0, blok.indexOf("}"))).toMatch(/opacity: 0/);
    expect(CSS).toMatch(/\.lam:hover \.lam-buang,\s*\.lam-buang:focus-visible/);
  });

  test("it names what it removes", () => {
    expect(
      render({ name: "a.txt", size: 1 }, { onRemove: () => {} }),
    ).toContain('aria-label="Remove a.txt"');
  });
});

describe("gaya ikut tema, bukan warna mati", () => {
  // Scoped to the ATTACHMENT surfaces: the chip and the preview modal. Other
  // parts of this file have their own literals (MCP status badges) and are not
  // what this test is about.
  //
  // COMMENTS STRIPPED. The comments in that region describe exactly what was
  // removed -- the old colours, the old emoji -- so matching the raw source
  // would fail against its own record of the fix.
  const WILAYAH = (
    SUMBER.slice(
      SUMBER.indexOf("/* --------------------------- Attachment chips"),
      SUMBER.indexOf("/* ----------------------------- Composer"),
    ) +
    SUMBER.slice(
      SUMBER.indexOf("function LightboxModal"),
      SUMBER.indexOf("function TodoPanel"),
    )
  )
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*/g, "");

  test("the old hardcoded tile colours are gone", () => {
    expect(WILAYAH).not.toContain("#4ec9b0");
    expect(WILAYAH).not.toContain("#0d1117");
  });

  test("the preview modal shows the file's icon, not one emoji for all", () => {
    expect(WILAYAH).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(WILAYAH).toContain("<IkonLampiran");
  });

  test("the code preview does not split identifiers mid-token", () => {
    // `word-break: break-all` on code is worse than on a filename: it breaks
    // inside names, so the preview stops reading as the language it is.
    const blok = CSS.slice(CSS.indexOf(".lam-pratayang {"));
    const satu = blok.slice(0, blok.indexOf("}"));
    expect(satu).not.toMatch(/break-all/);
    expect(satu).toMatch(/white-space: pre;/);
    expect(satu).toMatch(/font-family: var\(--mono\)/);
  });
  test("the old 60x60 raw-source tile is gone entirely", () => {
    expect(SUMBER).not.toContain("composer-attachment-item");
    expect(SUMBER).not.toContain('fontSize: "6.5px"');
    expect(CSS).not.toContain(".composer-attachment-item");
  });

  test("the chip takes its colours from tokens", () => {
    const blok = CSS.slice(
      CSS.indexOf(".lam {"),
      CSS.indexOf(".lam-clickable {"),
    );
    expect(blok).toMatch(/var\(--surface-2\)/);
    expect(blok).toMatch(/var\(--line\)/);
  });

  test("the moving upload line respects reduced motion", () => {
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.lam-garis/,
    );
  });
});

describe("satu komponen, dipakai di semua tempat", () => {
  const LAYAR = fs.readFileSync(
    path.join(AKAR, "public", "app", "Screens.tsx"),
    "utf8",
  );

  test("both composers and the sent message use it", () => {
    // Three hand-written variants of the same thing is how they drifted apart:
    // one showed a name, one showed two letters, one showed raw source.
    //
    // The count went from 2 to 3 when files dragged in from an editor tab
    // arrived: they are rendered by the SAME component, through its `ref`
    // branch, rather than by a fourth hand-written chip. What is guarded is
    // that every rendering funnels through the one component — not that there
    // are exactly two of them, so the number follows the call sites.
    expect(SUMBER.match(/<AttachmentChip/g) || []).toHaveLength(3);
    expect(LAYAR).toContain("<AttachmentChip");
    expect(LAYAR).not.toContain("composer-attachment-icon");
  });

  test("the built renderer actually carries it", () => {
    // public/app.build.js is what ships; source alone proves nothing.
    const bundel = fs.readFileSync(
      path.join(AKAR, "public", "app.build.js"),
      "utf8",
    );
    expect(bundel).toContain("function AttachmentChip");
    expect(bundel).not.toContain("composer-attachment-item");
  });
});
