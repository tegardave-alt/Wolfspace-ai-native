// Performance budget & regression gate.
//
// WOLFSPACE keeps the app responsive through an ARCHITECTURE, not one-off tweaks:
// routes run off the window thread (electron/backend-host.cjs), the renderer is
// prebuilt so Babel never runs at boot, heavy vendors load lazily, and a probe
// watches the main thread for the >500ms stalls Windows calls "Not Responding".
//
// This suite LOCKS the load-bearing pieces in place so a later edit cannot quietly
// remove them — the difference between "we optimised once" and "a system that stays
// fast". The structural checks are deterministic; the boot check is a deliberately
// GENEROUS ceiling that catches a gross regression (a deadlock, a heavy new
// top-level require) without flaking on a loaded CI box.

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const baca = (rel: string) => fs.readFileSync(path.join(AKAR, rel), "utf8");

describe("performance architecture stays in place", () => {
  test("every process entry enables the V8 compile cache", () => {
    // A warm start then skips re-compiling the (ts-register-transpiled) module
    // graph to bytecode. Removing any of these silently regresses cold start.
    for (const f of [
      "server.cjs",
      "electron/backend-host.cjs",
      "electron/main.ts",
    ]) {
      expect(baca(f)).toMatch(/enableCompileCache/);
    }
  });

  test("the main-thread block detector (Not-Responding watchdog) is armed", () => {
    // Both halves matter: defined in the probe, and actually called in main.
    expect(baca("electron/probe.js")).toMatch(/function startStopProbe/);
    expect(baca("electron/main.ts")).toMatch(/probe\.startStopProbe\(\)/);
  });

  test("the backend runs OFF the window thread (utilityProcess host)", () => {
    // The core hang fix: if this disappears, every synchronous backend call is a
    // potential UI freeze again.
    expect(baca("electron/main.ts")).toMatch(/utilityProcess\.fork/);
  });

  test("Babel is loaded lazily, never eagerly at renderer boot", () => {
    const html = baca("public/index.html");
    // The lazy loader exists...
    expect(html).toMatch(/__muatBabel/);
    // ...and Babel is NOT an eager top-level <script src> (that eager 631 KB was
    // the ~3.1s RENDERER-STOP the prebuilt bundle was built to remove).
    expect(html).not.toMatch(
      /<script[^>]+src=["'][^"']*babel[^"']*["']/i,
    );
  });
});

describe("boot responsiveness (generous ceiling)", () => {
  const PORT = 8187;
  let srv: any;
  afterAll(() => {
    try {
      srv && srv.kill();
    } catch (_) {}
  });

  test("server.cjs answers /healthz well within the freeze budget", async () => {
    const t0 = Date.now();
    srv = spawn(process.execPath, [path.join(AKAR, "server.cjs")], {
      cwd: AKAR,
      env: { ...process.env, PORT: String(PORT) },
      stdio: "ignore",
    });
    // Generous on purpose. A healthy cold boot is a few seconds; this only fails
    // on a real regression (a deadlock, or new synchronous work at require time),
    // so it will not flake when the runner is busy.
    const CEILING_MS = 45000;
    const deadline = t0 + CEILING_MS;
    let ms = 0;
    while (Date.now() < deadline) {
      ms = await new Promise<number>((res) => {
        const req = http.get(
          { host: "127.0.0.1", port: PORT, path: "/healthz", timeout: 1500 },
          (r: any) => {
            r.resume();
            res(r.statusCode === 200 ? Date.now() - t0 : 0);
          },
        );
        req.on("error", () => res(0));
        req.on("timeout", () => {
          req.destroy();
          res(0);
        });
      });
      if (ms) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    console.log(
      `[perf] server.cjs -> /healthz in ${ms || ">" + CEILING_MS} ms (ceiling ${CEILING_MS})`,
    );
    expect(ms).toBeGreaterThan(0);
  }, 60000);
});
