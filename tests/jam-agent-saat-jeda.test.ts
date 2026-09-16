// The header's clock keeps running while the run is busy -- including across
// a pause for approval.
//
// WHAT WENT WRONG. bash asked for approval; the first stream ended; the
// stream's end stamped selesaiMs on the bubble; and durasiDetik read
// selesaiMs - mulaiMs from then on: a number that never moved, on a run that
// was still "Working…". After Allow the resumed stream kept the stale stamp,
// so the clock stayed frozen at the second bash had asked.
//
// Rendered headlessly with the real component and a bubble in exactly that
// state (busy, mulaiMs in the past, selesaiMs set): the clock must climb.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const STEPS = fs.readFileSync(
  path.join(AKAR, "public", "app", "AgentSteps.tsx"),
  "utf8",
);

test("busy overrides the end stamp", () => {
  const i = STEPS.indexOf("const durasiDetik");
  expect(STEPS.slice(i, i + 600)).toMatch(
    /!run\.busy && Number\.isFinite\(selesai\)/,
  );
});

const { punyaBrowser, describeKalau } = require("./butuh.cjs");
const whenPossible = describeKalau(punyaBrowser());

whenPossible("the clock, rendered (needs playwright)", () => {
  const { spawn } = require("child_process");
  const http = require("http");
  const PORT = 8180;
  let server: any;

  beforeAll(async () => {
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
      await new Promise((r) => setTimeout(r, 500));
    }
  }, 60000);
  afterAll(() => {
    try {
      server.kill();
    } catch (_) {}
  });

  test("a busy run with a stale end stamp keeps counting", async () => {
    const { chromium } = require("playwright");
    const b = await chromium.launch();
    try {
      const p = await b.newPage();
      await p.goto("http://127.0.0.1:" + PORT + "/", {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await p.waitForTimeout(500);
      // Exactly the reported state: started 9 s ago, a stream ended 9 s ago
      // (the approval pause), and the run is still busy.
      await p.evaluate(() => {
        const host = document.createElement("div");
        document.body.appendChild(host);
        const now = Date.now();
        (ReactDOM as any).createRoot(host).render(
          (React as any).createElement((window as any).__wolfspaceAgentSteps, {
            run: {
              busy: true,
              events: [
                {
                  type: "act",
                  kind: "bash",
                  arg: "npm test",
                  ok: true,
                  output: "…",
                },
              ],
              mulaiMs: now - 9000,
              selesaiMs: now - 9000,
            },
          }),
        );
      });
      await p.waitForSelector(".aal-waktu", { timeout: 5000 });
      const baca = () =>
        p.$eval(".aal-waktu", (e: any) => e.textContent.trim());
      const t1 = await baca();
      await p.waitForTimeout(2300);
      const t2 = await baca();
      // "· 9s" then "· 11s" (or so): it moved.
      const detik = (t: string) => Number((t.match(/(\d+)s/) || [])[1]);
      expect(detik(t1)).toBeGreaterThanOrEqual(9);
      expect(detik(t2)).toBeGreaterThan(detik(t1));
    } finally {
      await b.close();
    }
  }, 60000);
});
