// ── The MCP "Connecting…" badge moves while it waits ──
//
// Asked for with a screenshot of "○ Connecting…": a still label for the
// whole handshake, which is exactly what a hung handshake looks like too.
// The badge now carries a small ring turned by CSS while either waiting
// state holds (Connect pressed, or process up and handshake pending), and the
// ring breathes instead of turning under prefers-reduced-motion.
//
// The badge was two inline copies (settings panel in Components.tsx, project
// picker in Screens.tsx). They are now one component, McpStatusBadge, with
// the order the copies had; a fix that reached only one copy is the class of
// bug tests/mcp-connect-hidupkan-gagal already guards against.
//
// Part 1 reads the source. Part 2 renders the component in every state on a
// harness page that uses the app's own React and styles.css, and reads the
// ring's computed animation -- with and without reduced motion.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
const read = (p: string) =>
  fs.readFileSync(path.join(AKAR, p), "utf8").replace(/\r\n/g, "\n");
const COMP = read("public/app/Components.tsx");
const SCR = read("public/app/Screens.tsx");
const CSS = read("public/styles.css");
const stripComments = (t: string) =>
  t
    .split("\n")
    .filter((b) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(b))
    .join("\n");

const badgeSource = () => {
  const m = stripComments(COMP).match(
    /function McpStatusBadge\(\{ srv \}: any\) \{[\s\S]*?\n\}/,
  );
  expect(m).not.toBeNull();
  return m![0];
};

describe("one badge, two screens", () => {
  test("both MCP lists render McpStatusBadge and keep no inline copy", () => {
    expect(COMP).toMatch(/<McpStatusBadge srv=\{srv\} \/>/);
    expect(SCR).toMatch(/<McpStatusBadge srv=\{srv\} \/>/);
    for (const src of [stripComments(COMP), stripComments(SCR)]) {
      expect(src).not.toMatch(/⟳ Connecting…/);
      expect(src).not.toMatch(/◌ Connecting…/);
      expect(src).not.toMatch(/○ Berhenti/);
    }
    // Defined once, in the file that loads first.
    expect(COMP.match(/function McpStatusBadge\(/g)!.length).toBe(1);
    expect(SCR).not.toMatch(/function McpStatusBadge\(/);
  });

  test("the order the copies had: connecting, connected, failed, stopped, starting, not ready", () => {
    const src = badgeSource();
    const at = (re: RegExp) => {
      const i = src.search(re);
      expect(i).toBeGreaterThan(-1);
      return i;
    };
    const connecting = at(/if \(srv\.connecting\)/);
    const active = at(/else if \(srv\.active\)/);
    const failed = at(/st && st\.lastCallOk === false/);
    const stopped = at(/else if \(st && !st\.running\)/);
    const starting = at(/else if \(st && st\.starting\)/);
    expect(connecting).toBeLessThan(active);
    expect(active).toBeLessThan(failed);
    expect(failed).toBeLessThan(stopped);
    expect(stopped).toBeLessThan(starting);
    expect(src).toMatch(/text = "✓ Connected"/);
    expect(src).toMatch(/text = "✕ Failed"/);
    expect(src).toMatch(/text = "○ Stopped"/);
    expect(src).toMatch(/let text = "○ Not ready"/);
    // The cause stays on the tooltip, lastError first.
    expect(src).toMatch(/\(st && st\.lastError\) \|\|/);
    expect(src).toMatch(/"MCP process is not running"/);
    expect(src).toMatch(/"Handshake in progress"/);
  });

  test("only the two waiting states spin", () => {
    const src = badgeSource();
    expect(src.match(/spinning = true;/g)!.length).toBe(2);
    const a = src.indexOf("if (srv.connecting) {");
    const b = src.indexOf("} else if (srv.active) {");
    expect(src.slice(a, b)).toMatch(/spinning = true;/);
    const c = src.indexOf("} else if (st && st.starting) {");
    const d = src.indexOf("}", c + 1);
    expect(src.slice(c, d)).toMatch(/spinning = true;/);
    expect(src).toMatch(
      /\{spinning && <span className="mcp-spin" aria-hidden="true" \/>\}/,
    );
  });
});

describe("the ring", () => {
  const rule = (sel: string) => {
    const m = CSS.match(
      new RegExp(
        "\\n" + sel.replace(/[.+:()*-]/g, (c) => "\\" + c) + " \\{([^}]*)\\}",
      ),
    );
    expect(m).not.toBeNull();
    return m![1];
  };

  test("turns by CSS, 9px, one quarter open", () => {
    const r = rule(".mcp-spin");
    expect(r).toMatch(/width: 9px/);
    expect(r).toMatch(/border: 1\.5px solid currentColor/);
    expect(r).toMatch(/border-right-color: transparent/);
    expect(r).toMatch(/animation: mcp-spin 0\.8s linear infinite/);
    expect(CSS).toMatch(
      /@keyframes mcp-spin \{\s*to \{\s*transform: rotate\(360deg\);/,
    );
  });

  test("breathes instead under prefers-reduced-motion", () => {
    const m = CSS.match(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.mcp-spin \{([^}]*)\}[\s\S]*?@keyframes mcp-breathe/,
    );
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/animation: mcp-breathe/);
    expect(m![1]).toMatch(/border-right-color: currentColor/);
  });

  test("the badge colours are the ones the inline copies had", () => {
    expect(rule(".mcp-badge-connecting")).toMatch(/#d7ba7d/);
    expect(rule(".mcp-badge-ok")).toMatch(/#4ec9b0/);
    expect(rule(".mcp-badge-failed")).toMatch(/#f85149/);
    expect(rule(".mcp-badge-off")).toMatch(/#858585/);
  });
});

// ── Part 2: rendered, and really turning ──
const { punyaBrowser, describeKalau } = require("./butuh.cjs");
const whenPossible = describeKalau(punyaBrowser());

whenPossible("the badge in a browser (needs playwright)", () => {
  const os = require("os");
  const { spawn } = require("child_process");
  const http = require("http");
  const PORT = 8141;
  let server: any;
  let TMP: string;
  let HARNESS: string;

  beforeAll(async () => {
    // The component alone, compiled to plain JS, on a page that takes React
    // and styles.css from the running server -- so the CSS under test is the
    // file that ships, not a copy.
    const esbuild = require("esbuild");
    const m = COMP.match(/function McpStatusBadge\([\s\S]*?\n\}\n/);
    expect(m).not.toBeNull();
    const js = esbuild.transformSync(m![0], {
      loader: "tsx",
      jsx: "transform",
    }).code;
    TMP = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-badge-"));
    HARNESS = path.join(TMP, "badge.html");
    fs.writeFileSync(
      HARNESS,
      [
        '<!doctype html><html><head><meta charset="utf-8">',
        '<link rel="stylesheet" href="http://127.0.0.1:' +
          PORT +
          '/styles.css">',
        '<script src="http://127.0.0.1:' +
          PORT +
          '/vendor/react.production.min.js"></script>',
        '<script src="http://127.0.0.1:' +
          PORT +
          '/vendor/react-dom.production.min.js"></script>',
        '</head><body><div id="host" style="display:flex;gap:10px;padding:12px"></div><script>',
        js,
        "const cases = [",
        '  ["connecting", { connecting: true }],',
        '  ["connected", { active: true, status: { running: true, ready: true } }],',
        '  ["failed", { status: { running: true, lastCallOk: false, lastError: "401 from GitHub" } }],',
        '  ["stopped", { status: { running: false } }],',
        '  ["starting", { status: { running: true, starting: true } }],',
        '  ["not ready", { status: { running: true } }],',
        "];",
        'ReactDOM.createRoot(document.getElementById("host")).render(',
        "  React.createElement(React.Fragment, null, cases.map(([k, srv]) => React.createElement(McpStatusBadge, { key: k, srv }))),",
        ");",
        "</script></body></html>",
      ].join("\n"),
    );

    server = spawn(process.execPath, [path.join(AKAR, "server.cjs")], {
      cwd: AKAR,
      env: { ...process.env, PORT: String(PORT) },
      stdio: "ignore",
      windowsHide: true,
    });
    for (let i = 0; i < 60; i++) {
      const alive = await new Promise((ok) => {
        const r = http.get(
          { host: "127.0.0.1", port: PORT, path: "/healthz", timeout: 1000 },
          (res: any) => {
            res.resume();
            ok(res.statusCode === 200);
          },
        );
        r.on("error", () => ok(false));
        r.on("timeout", () => {
          r.destroy();
          ok(false);
        });
      });
      if (alive) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("server never became ready on port " + PORT);
  }, 60000);

  afterAll(() => {
    try {
      server && server.kill();
    } catch (_) {}
    try {
      fs.rmSync(TMP, { recursive: true, force: true });
    } catch (_) {}
  });

  const open = async (b: any, reducedMotion: string) => {
    const ctx = await b.newContext({
      viewport: { width: 900, height: 200 },
      reducedMotion,
    });
    const p = await ctx.newPage();
    const errors: string[] = [];
    p.on("pageerror", (e: any) => errors.push("PAGEERROR " + e.message));
    p.on("console", (m: any) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 200));
    });
    await p.goto("file:///" + HARNESS.replace(/\\/g, "/"), {
      waitUntil: "networkidle",
    });
    await p.waitForSelector(".mcp-badge", { timeout: 15000 });
    await p.waitForTimeout(300);
    const read = await p.evaluate(() =>
      [...document.querySelectorAll("#host .mcp-badge")].map((el: any) => {
        const spin = el.querySelector(".mcp-spin");
        const cs = spin && getComputedStyle(spin);
        return {
          text: el.textContent,
          title: el.getAttribute("title"),
          color: getComputedStyle(el).color,
          anim: spin ? cs.animationName : null,
        };
      }),
    );
    return { p, ctx, errors, read };
  };

  test("six states; the two waiting ones carry a ring that really turns", async () => {
    const { chromium } = require("playwright");
    const b = await chromium.launch();
    try {
      const { p, ctx, errors, read } = await open(b, "no-preference");
      expect(read.map((r: any) => r.text)).toEqual([
        "Connecting…",
        "✓ Connected",
        "✕ Failed",
        "○ Stopped",
        "Connecting…",
        "○ Not ready",
      ]);
      expect(read.map((r: any) => r.anim)).toEqual([
        "mcp-spin",
        null,
        null,
        null,
        "mcp-spin",
        null,
      ]);
      expect(read[2].title).toBe("401 from GitHub");
      expect(read[3].title).toBe("MCP process is not running");
      expect(read[4].title).toBe("Handshake in progress");
      // Amber for the user's own Connect, grey for the handshake.
      expect(read[0].color).toBe("rgb(215, 186, 125)");
      expect(read[4].color).toBe("rgb(133, 133, 133)");
      // Two readings 120ms apart: the transform differs, so it moves.
      const t1 = await p.evaluate(
        () => getComputedStyle(document.querySelector(".mcp-spin")!).transform,
      );
      await p.waitForTimeout(120);
      const t2 = await p.evaluate(
        () => getComputedStyle(document.querySelector(".mcp-spin")!).transform,
      );
      expect(t1).not.toBe("none");
      expect(t2).not.toBe(t1);
      expect(errors).toEqual([]);
      await ctx.close();
    } finally {
      await b.close();
    }
  }, 120000);

  test("under reduced motion it breathes and does not turn", async () => {
    const { chromium } = require("playwright");
    const b = await chromium.launch();
    try {
      const { p, ctx, errors, read } = await open(b, "reduce");
      expect(read[0].anim).toBe("mcp-breathe");
      expect(read[4].anim).toBe("mcp-breathe");
      const t = await p.evaluate(
        () => getComputedStyle(document.querySelector(".mcp-spin")!).transform,
      );
      expect(t).toBe("none");
      expect(errors).toEqual([]);
      await ctx.close();
    } finally {
      await b.close();
    }
  }, 120000);
});
