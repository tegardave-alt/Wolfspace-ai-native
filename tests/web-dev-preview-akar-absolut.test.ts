// The Web Dev preview shows what a real browser shows -- for root-absolute
// asset URLs too.
//
// THE BUG. The preview served an HTML file with an injected <base> so RELATIVE
// asset URLs (src="app.js") resolve to /preview-file-assets/<dir>/. But <base>
// does nothing for ROOT-ABSOLUTE URLs (src="/assets/index.js"): those ignore it
// and resolve against the origin -- the WOLFSPACE server, not the previewed
// app. So a built SPA (Vite/CRA/webpack emit <script src="/assets/index-*.js">)
// loaded nothing and sat blank in Web Dev, while opening the same file in a real
// browser served from the dist root worked. The preview now rewrites
// root-absolute src/href to the same assets endpoint.

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const PORT = 8191;
const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

function getText(p: string): Promise<{ status: number; body: string }> {
  return new Promise((res, rej) => {
    const r = http.get(
      { host: "127.0.0.1", port: PORT, path: p, timeout: 8000 },
      (x: any) => {
        let b = "";
        x.on("data", (c: any) => (b += c));
        x.on("end", () => res({ status: x.statusCode, body: b }));
      },
    );
    r.on("error", rej);
    r.on("timeout", () => {
      r.destroy();
      rej(new Error("timeout"));
    });
  });
}

let server: any;
let dir = "";
let idx = "";

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-wdprev-"));
  fs.writeFileSync(
    path.join(dir, "index.html"),
    [
      "<!doctype html><html><head>",
      '<link rel="stylesheet" href="/assets/app.css">', // root-absolute -> rewrite
      '<link rel="stylesheet" href="local.css">', // relative -> base handles it
      '<link rel="stylesheet" href="//cdn.example.com/x.css">', // protocol-relative -> leave
      "</head><body>",
      '<script src="/assets/index.js"></script>', // root-absolute -> rewrite
      '<script src="rel.js"></script>', // relative -> leave
      '<img src="https://ex.com/a.png">', // absolute URL -> leave
      "</body></html>",
    ].join("\n"),
  );
  idx = path.join(dir, "index.html").replace(/\\/g, "/");
  server = spawn(process.execPath, [path.join(AKAR, "server.cjs")], {
    cwd: AKAR,
    env: { ...process.env, PORT: String(PORT) },
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    const ok = await new Promise((res) => {
      const r = http.get(
        { host: "127.0.0.1", port: PORT, path: "/healthz", timeout: 1000 },
        (x: any) => res(x.statusCode === 200),
      );
      r.on("error", () => res(false));
      r.on("timeout", () => {
        r.destroy();
        res(false);
      });
    });
    if (ok) break;
    await tidur(500);
  }
}, 60000);

afterAll(() => {
  try {
    server.kill();
  } catch (_) {}
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
});

describe("preview HTML rewriting", () => {
  let html = "";
  let prefix = "";
  beforeAll(async () => {
    const r = await getText("/preview-file?path=" + encodeURIComponent(idx));
    expect(r.status).toBe(200);
    html = r.body;
    prefix = "/preview-file-assets/" + encodeURI(idx.replace(/\/[^/]*$/, "/"));
  });

  test("a <base> is injected for relative URLs", () => {
    expect(html).toContain('<base href="' + prefix + '">');
  });

  test("root-absolute src/href are rewritten to the assets endpoint", () => {
    expect(html).toContain('href="' + prefix + 'assets/app.css"');
    expect(html).toContain('src="' + prefix + 'assets/index.js"');
  });

  test("relative, protocol-relative and absolute URLs are left alone", () => {
    expect(html).toContain('href="local.css"');
    expect(html).toContain('src="rel.js"');
    expect(html).toContain('href="//cdn.example.com/x.css"');
    expect(html).toContain('src="https://ex.com/a.png"');
    // The rewrite did not double-apply.
    expect(html).not.toContain("preview-file-assets/preview-file-assets");
  });

  test("the rewritten asset actually serves (200), not the server's SPA shell", async () => {
    // Put a real file where the rewritten URL points and fetch it back.
    fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(dir, "assets", "index.js"), "window.OK=1;");
    const r = await getText(prefix + "assets/index.js");
    expect(r.status).toBe(200);
    expect(r.body).toContain("window.OK=1;");
  });
});

// ── In a browser: the page actually comes alive ──
const { punyaBrowser, describeKalau } = require("./butuh.cjs");
const whenPossible = describeKalau(punyaBrowser());

whenPossible(
  "the preview runs a root-absolute bundle (needs playwright)",
  () => {
    test("a built-SPA-style page whose script is /assets/index.js executes", async () => {
      // A dist-style page: the only script is root-absolute, as a bundler emits.
      fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
      fs.writeFileSync(
        path.join(dir, "spa.html"),
        '<!doctype html><html><head></head><body><h1 id="t">blank</h1>' +
          '<script src="/assets/spa.js"></script></body></html>',
      );
      fs.writeFileSync(
        path.join(dir, "assets", "spa.js"),
        "document.getElementById('t').textContent='ALIVE';window.__spa=true;",
      );
      const spa = path.join(dir, "spa.html").replace(/\\/g, "/");
      const { chromium } = require("playwright");
      const b = await chromium.launch();
      try {
        const p = await (await b.newContext()).newPage();
        await p.goto(
          "http://127.0.0.1:" +
            PORT +
            "/preview-file?path=" +
            encodeURIComponent(spa),
          { waitUntil: "networkidle", timeout: 30000 },
        );
        await p.waitForTimeout(400);
        expect(await p.evaluate(() => (window as any).__spa === true)).toBe(
          true,
        );
        expect(
          await p.evaluate(() => document.getElementById("t")!.textContent),
        ).toBe("ALIVE");
      } finally {
        await b.close();
      }
    }, 60000);
  },
);
