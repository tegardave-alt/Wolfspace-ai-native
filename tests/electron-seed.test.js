// Regression test for the startup "Not Responding" freeze.
//
// Root cause: electron/main.js seeded baseline hashes of the ENTIRE public/ tree
// (~29MB) with fs.readFileSync on the MAIN process, right after createWindow().
// Because the UI is served through the app:// protocol (also main process), the
// blocked main thread stalled every asset request → the window painted but hung
// as "Not Responding" until hashing finished.
//
// Fix: seed with fs.promises.readFile, yielding to the event loop between files.
//
// This test walks the real public/ dir both ways and asserts the async version
// keeps the event loop responsive (a heartbeat timer keeps firing) while the old
// synchronous version starves it.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");
const PUB = path.join(ROOT, "public");

function seedSync(dir, depth, maxDepth, out) {
  if (depth > maxDepth) return;
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const e of ents) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) seedSync(fp, depth + 1, maxDepth, out);
    else
      out.set(
        fp,
        crypto.createHash("md5").update(fs.readFileSync(fp)).digest("hex"),
      );
  }
}

async function seedAsync(dir, depth, maxDepth, out) {
  if (depth > maxDepth) return;
  let ents;
  try {
    ents = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const e of ents) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const fp = path.join(dir, e.name);
    if (e.isDirectory()) await seedAsync(fp, depth + 1, maxDepth, out);
    else
      out.set(
        fp,
        crypto
          .createHash("md5")
          .update(await fs.promises.readFile(fp))
          .digest("hex"),
      );
  }
}

// Measure how late a timer fires while `work` runs. This is exactly the signal
// that matters: the app:// protocol handler and IPC live on the main thread's
// event loop, so anything that delays a timer delays serving UI assets too. A
// synchronous block cannot service the timer until it finishes, so the probe
// fires late by (roughly) the block duration; async work that yields lets the
// probe fire on time. (A setInterval-based heartbeat can't measure a fully
// synchronous block at all — it never gets a turn to tick — hence a probe.)
const PROBE_MS = 20;
function measureLateness(work) {
  return new Promise((resolve) => {
    const scheduledAt = Date.now();
    let lateness = null;
    const probe = setTimeout(() => {
      lateness = Date.now() - scheduledAt - PROBE_MS;
    }, PROBE_MS);
    Promise.resolve()
      .then(work)
      .finally(() => {
        // Give the event loop one macrotask turn so the probe (if not already
        // fired) gets its chance, then report.
        setTimeout(() => {
          clearTimeout(probe);
          resolve(lateness == null ? 0 : Math.max(0, lateness));
        }, 0);
      });
  });
}

test("public/ exists and is non-trivial (guards the test's relevance)", () => {
  expect(fs.existsSync(PUB)).toBe(true);
  const m = new Map();
  seedSync(PUB, 0, 20, m);
  expect(m.size).toBeGreaterThan(20);
});

test("async seeding keeps the event loop responsive; sync seeding freezes it", async () => {
  // Warm the OS file cache so the comparison reflects CPU/main-thread blocking,
  // not cold-disk variance.
  seedSync(PUB, 0, 20, new Map());

  const syncLateness = await measureLateness(() => {
    seedSync(PUB, 0, 20, new Map());
  });
  const asyncLateness = await measureLateness(async () => {
    await seedAsync(PUB, 0, 20, new Map());
  });

  // The async walk must never hand the main thread a long uninterruptible block:
  // the probe timer should fire close to on time. The sync walk holds the thread
  // for the whole hash, delaying the probe far more — proving the fix's mechanism.
  expect(asyncLateness).toBeLessThan(80);
  expect(syncLateness).toBeGreaterThan(asyncLateness);
});

test("both strategies compute identical baseline hashes (fix changes timing, not results)", async () => {
  const a = new Map();
  seedSync(PUB, 0, 20, a);
  const b = new Map();
  await seedAsync(PUB, 0, 20, b);
  expect(b.size).toBe(a.size);
  for (const [k, v] of a) expect(b.get(k)).toBe(v);
});
