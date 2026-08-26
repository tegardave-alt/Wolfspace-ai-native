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
    else {
      // Berkas bisa LENYAP antara readdir dan readFile. Bukan kasus khayalan:
      // tests/gate-agent-path.test.js menulis lalu menghapus
      // public/_gate_test_probe.jsx, dan Jest menjalankan berkas uji secara
      // paralel — terukur, satu dari lima jalannya mati dengan
      // "ENOENT: open public\_gate_test_probe.jsx".
      //
      // Melewatinya juga LEBIH SETIA pada aslinya: penyemai di electron/main.js
      // menyusuri direktori hidup yang bisa berubah kapan saja, jadi penyemai
      // yang mati gara-gara satu berkas terhapus adalah cacat, bukan ketelitian.
      try {
        out.set(
          fp,
          crypto.createHash("md5").update(fs.readFileSync(fp)).digest("hex"),
        );
      } catch (err) {
        if (err.code !== "ENOENT") throw err;
      }
    }
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
    else {
      try {
        out.set(
          fp,
          crypto
            .createHash("md5")
            .update(await fs.promises.readFile(fp))
            .digest("hex"),
        );
      } catch (err) {
        if (err.code !== "ENOENT") throw err; // lihat catatan di seedSync
      }
    }
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

  // Take the MINIMUM of several runs, per strategy. Timer lateness measures how
  // long the event loop was unavailable — which also inflates when *other*
  // processes compete for CPU. An earlier version asserted an absolute cap
  // (asyncLateness < 80) and went red at 227ms during a build-heavy moment,
  // even though nothing had regressed: measured clean, async is 0-4ms against
  // sync's 130-190ms. The minimum is the least contaminated sample, so it keeps
  // the signal while shrugging off transient load spikes.
  const best = async (fn) => {
    let lo = Infinity;
    for (let i = 0; i < 3; i++) lo = Math.min(lo, await measureLateness(fn));
    return lo;
  };
  const syncLateness = await best(() => seedSync(PUB, 0, 20, new Map()));
  const asyncLateness = await best(async () =>
    seedAsync(PUB, 0, 20, new Map()),
  );

  // The real claim is RELATIVE and enormous (observed 47x-130x): the sync walk
  // holds the thread for the whole hash, the async walk yields between files.
  // Assert the mechanism as a ratio rather than a wall-clock number, so the test
  // fails when the fix breaks — not when the machine is busy.
  expect(syncLateness).toBeGreaterThan(asyncLateness * 3 + 20);

  // Loose sanity ceiling: catches a genuine regression (async blocking for a
  // meaningful stretch) without re-introducing load sensitivity.
  expect(asyncLateness).toBeLessThan(500);

  // Explicit timeout, and it is not a workaround: this test walks and MD5-hashes
  // the entire ~29MB public/ tree SEVEN times (one warm-up + three runs each of
  // sync and async). Jest's 5s default was never a sane budget for that. The
  // reason it went unnoticed is a jest asymmetry — the first test in this file is
  // synchronous, so jest cannot interrupt it and it passes even at 34s, while
  // these two are async and do get cut off. Under machine load they landed just
  // over 5s and failed the pre-commit hook repeatedly, with nothing actually
  // regressed. The assertions above are what guard the fix; the clock is not.
}, 120000);

test("both strategies compute identical baseline hashes (fix changes timing, not results)", async () => {
  const a = new Map();
  seedSync(PUB, 0, 20, a);
  const b = new Map();
  await seedAsync(PUB, 0, 20, b);

  // Berkas yang MUNCUL/HILANG di antara dua penyusuran diabaikan.
  //
  // KENAPA. Jest menjalankan berkas uji secara paralel, dan
  // tests/gate-agent-path.test.js menulis public/_gate_test_probe.jsx sebagai
  // bagian dari pengujiannya. Kalau berkas itu lahir setelah penyusuran sync
  // dan sebelum yang async, ukurannya berbeda dan uji ini merah — padahal tak
  // ada yang rusak. Terukur: lulus 3/3 saat dijalankan sendirian, merah di
  // suite penuh.
  //
  // Yang diuji di sini adalah "strategi sync dan async menghasilkan hash yang
  // SAMA", bukan "isi public/ tidak berubah selama uji". Membandingkan hanya
  // berkas yang dilihat KEDUANYA menjaga maksud itu tanpa ikut menguji
  // kestabilan direktori yang memang bukan urusannya.
  const bersama = [...a.keys()].filter((k) => b.has(k));
  const goyah = a.size + b.size - 2 * bersama.length;
  expect(bersama.length).toBeGreaterThan(0);
  // Kalau yang goyah banyak, itu bukan lagi balapan — ada yang benar-benar salah.
  expect(goyah).toBeLessThanOrEqual(4);
  for (const k of bersama) expect(b.get(k)).toBe(a.get(k));
}, 120000);
