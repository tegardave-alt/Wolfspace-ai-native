// The GitHub panel in a split view.
//
// WHAT WAS ON SCREEN: with the browser open on the left and the agent on the
// right, the sign-in panel came out CUT IN HALF at the pane boundary. The left
// edge of every line was missing — "…rom", "…epository. GitHub does the signing
// in", "…with GitHub" where the button's label should have been.
//
// `position: fixed` is supposed to make that impossible; it escapes every
// ancestor and measures against the window. It stops doing so the moment any
// ancestor carries a transform, filter, backdrop-filter, will-change or
// contain — that ancestor becomes the containing block, and a "fixed" child is
// then positioned AND clipped against a pane instead.
//
// This repo has met that exact rule once before, when the right-click menu
// landed 232px away from the cursor. The cure was the same then as now: render
// where there are no ancestors to inherit from. Hunting the one guilty ancestor
// fixes it until the next `backdrop-filter` is added; a portal removes the
// class of bug instead.
//
// The second half is the sizing. `width: min(560px, 92vw)` measures the WINDOW
// while the overlay lives in whatever box it ended up in — so even after the
// clipping is gone, a modal sized to the window overflows a narrow pane. It is
// now sized against its own overlay.

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
const KOMP = tanpaKomentar(baca("public/app/Components.tsx"));
const CSS = baca("public/styles.css");
const BUILD = baca("public/app.build.js");

/** One CSS rule, read to its closing brace rather than a guessed length. */
function aturan(selektor: string) {
  const i = CSS.indexOf(selektor + " {");
  if (i < 0) return "";
  return CSS.slice(i, CSS.indexOf("}", i));
}

describe("the panel escapes whatever pane it was rendered from", () => {
  test("it is portalled to document.body", () => {
    const i = KOMP.indexOf("function GithubPanel");
    expect(i).toBeGreaterThan(-1);
    const blok = KOMP.slice(i);
    const j = blok.indexOf("const MI = {");
    const badan = j > 0 ? blok.slice(0, j) : blok;
    expect(badan).toMatch(/ReactDOM\.createPortal\(isi, document\.body\)/);
  });

  test("and it still renders when there is no document at all", () => {
    // The renderer is also parsed outside a browser (tests, the build step).
    // A bare createPortal call would throw there.
    const i = KOMP.indexOf("function GithubPanel");
    const badan = KOMP.slice(i, i + 40000);
    expect(badan).toMatch(/typeof document !== "undefined" && document\.body/);
    expect(badan).toMatch(/: isi;/);
  });

  test("the portal is in the shipped bundle, not only the source", () => {
    // public/app.build.js is what the app loads.
    expect(BUILD).toMatch(/createPortal/);
  });
});

describe("the modal is measured against its overlay, not the window", () => {
  test("its width no longer comes from viewport units", () => {
    // 92vw is the WINDOW. In a split view that is roughly twice the pane, so
    // the modal overflowed its own overlay and was clipped.
    const m = aturan(".gh-modal");
    expect(m).toBeTruthy();
    expect(m).not.toMatch(/width:[^;]*vw/);
    expect(m).toMatch(/width: min\(560px, 100%\)/);
  });

  test("its height cannot exceed the box either", () => {
    expect(aturan(".gh-modal")).toMatch(/max-height: min\(78vh, 100%\)/);
  });

  test("the overlay keeps the modal off its own edges", () => {
    // Without padding, "100%" means edge to edge — legible, but touching the
    // pane boundary on both sides.
    const o = aturan(".gh-overlay");
    expect(o).toMatch(/padding: 16px/);
    // And the padding must not be added ON TOP of the width.
    expect(o).toMatch(/box-sizing: border-box/);
  });

  test("the overlay still covers everything it can reach", () => {
    const o = aturan(".gh-overlay");
    expect(o).toMatch(/position: fixed/);
    expect(o).toMatch(/inset: 0/);
  });
});

// ── APA YANG DIBAYAR PORTAL ITU ─────────────────────────────────────────────
//
// Portal di atas menyembuhkan pemotongan, dan menciptakan yang ini. Selama
// panel masih anak dari layar yang membukanya, ia menumpuk DI DALAM konteks
// penumpukan layar itu dan z-index 60 selalu menang atas saudara-saudaranya.
// Dipindahkan ke <body>, ia bersaing langsung dengan layar-layar penuh — dan
// .project-picker-screen memasang position: fixed dengan lapisan 9999 secara
// inline di Screens.tsx.
//
// Terukur di aplikasi yang benar-benar berjalan (server.cjs + Chromium, klik
// sungguhan pada .picker-github):
//
//     overlay ada    : ya, 1400x900, opacity 1, tanpa galat konsol
//     modal          : 560x307
//     elementFromPoint di tengah modal -> DIV.project-picker-screen
//
// Panelnya terbuka sempurna dan tertutup rapat. Dari sisi pengguna itu terbaca
// sebagai tombol yang tidak merespons — dan TIDAK ADA satu pun uji berbasis
// teks yang bisa melihatnya: markup benar, handler benar, CSS terurai utuh.
//
// Uji di bawah karena itu MENGHITUNG syaratnya, bukan memakukan angka. Ia
// memindai setiap tirai se-jendela di sumber — dua bentuk, JSX `style={{…}}`
// dan `Object.assign(el.style, {…})` — lalu menuntut panel ini tidak berada di
// bawah satu pun. Sebelum perbaikan ia gagal; kalau besok ada tirai baru yang
// lebih tinggi, ia gagal lagi.

/** Isi aturan CSS tanpa komentarnya. */
function tanpaKomentarCss(s: string) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Setiap tirai `position: fixed` yang menutupi jendela, beserta lapisannya. */
function tiraiSeJendela() {
  const hasil: { dari: string; z: number }[] = [];
  const bacaan = (b: string, dari: string) => {
    if (!/position:\s*"fixed"/.test(b)) return;
    const menutupi =
      /inset:\s*"?0"?/.test(b) ||
      (/top:\s*"?0"?/.test(b) && /bottom:\s*"?0"?/.test(b));
    if (!menutupi) return;
    const z = b.match(/zIndex:\s*"?(\d+)"?/);
    if (z) hasil.push({ dari, z: Number(z[1]) });
  };
  for (const rel of [
    "public/app/Screens.tsx",
    "public/app/Components.tsx",
    "public/app/VisualTools.tsx",
    "public/app/Sidebar.tsx",
    "public/app/Views.tsx",
    "public/app.tsx",
  ]) {
    let src = "";
    try {
      src = baca(rel);
    } catch (_) {
      continue;
    }
    // Dua bentuk, karena repo ini memakai keduanya.
    for (const m of src.matchAll(/style=\{\{([^{}]*)\}\}/g)) bacaan(m[1], rel);
    for (const m of src.matchAll(
      /Object\.assign\(\s*[\w.]+\.style\s*,\s*\{([^{}]*)\}/g,
    ))
      bacaan(m[1], rel);
  }
  // Dan yang ditulis di stylesheet.
  for (const m of CSS.matchAll(/([.#][\w-]+)\s*\{([^{}]*)\}/g)) {
    const b = tanpaKomentarCss(m[2]);
    if (!/position:\s*fixed/.test(b) || !/inset:\s*0/.test(b)) continue;
    const z = b.match(/z-index:\s*(\d+)/);
    if (z && m[1] !== ".gh-overlay")
      hasil.push({ dari: "styles.css " + m[1], z: Number(z[1]) });
  }
  return hasil;
}

describe("panel GitHub berada di atas layar yang membukanya", () => {
  const tirai = tiraiSeJendela();
  // KOMENTARNYA DIBUANG DULU. Aturan .gh-overlay kini membawa catatan yang
  // menyebut lapisan 9999 milik layar picker, dan regex angka pertama akan
  // dengan senang hati membacanya sebagai deklarasi. Uji yang membaca
  // komentarnya sendiri sudah dua kali lolos secara palsu di repo ini.
  const zPanel = Number(
    (tanpaKomentarCss(aturan(".gh-overlay")).match(/z-index:\s*(\d+)/) ||
      [])[1],
  );

  test("pemindaiannya benar-benar menemukan sesuatu", () => {
    // Pemindaian kosong akan membuat uji di bawahnya lulus tanpa arti. Yang
    // sudah diketahui: layar picker (9999), tirai lampiran dan tirai
    // VisualTools (999999).
    expect(tirai.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...tirai.map((t) => t.z))).toBeGreaterThanOrEqual(999999);
  });

  test("lapisan panel terbaca dari deklarasinya, bukan dari komentarnya", () => {
    expect(Number.isFinite(zPanel)).toBe(true);
    expect(zPanel).toBe(999999);
  });

  test("tak ada tirai se-jendela yang berada di atasnya", () => {
    const diAtas = tirai.filter((t) => t.z > zPanel);
    expect(diAtas.length ? JSON.stringify(diAtas) : "tidak ada").toBe(
      "tidak ada",
    );
  });

  test("angkanya bukan angka baru — ia tingkat yang sudah dipakai", () => {
    // Menyamai tingkat yang ada menghentikan perlombaan angka, bukan
    // menambahinya.
    expect(tirai.filter((t) => t.z === zPanel).length).toBeGreaterThanOrEqual(
      2,
    );
  });

  test("dan itu yang dikirim", () => {
    expect(tanpaKomentarCss(aturan(".gh-overlay"))).toMatch(/z-index: 999999/);
  });
});
