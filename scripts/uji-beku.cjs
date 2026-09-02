// Does the window keep drawing while the app works?
//
// WHY THIS EXISTS. Four freezes reached the user in a row, each a different
// route and each the same cause: synchronous work on the process that owns the
// window. Folder import (fs.cpSync, then a readdirSync walk), git commit
// (execFileSync), and before those the backend as a whole. Every one was found
// by the user, not by the suite -- because the suite reads source, and what
// breaks here is WHICH THREAD the code runs on. That is not visible in text.
//
// WHAT IT MEASURES, and the first version got this WRONG. It timed gaps between
// animation frames in the renderer. That detects nothing: the renderer is its
// own process with its own event loop, and it keeps painting quite happily
// while the main process is wedged. Proven by planting a 1500 ms busy-wait in a
// main-served route -- the request took 2010 ms and the largest frame gap was
// 23 ms.
//
// "Not Responding" is a verdict on the MAIN process's message queue. So what is
// measured is the round-trip of a cheap IPC call that main answers itself
// (`ping`, the first branch of its handler), sent repeatedly while the
// operation runs. If main is blocked, the reply cannot come back until it is
// free again, and the round-trip records exactly how long that was.
//
// Request DURATION is reported too but is not the test: 890 ms of git work is
// fine as long as main stayed answerable through it.
//
// THE BUDGET. Windows marks a process Not Responding after ONE unbroken 5000 ms
// stretch, but a gap far below that is already felt. The budget here is 250 ms
// -- roughly fifteen dropped frames -- which is loose enough not to fail on a
// busy machine and tight enough that the freezes we shipped would all have
// tripped it.
//
//   npm run uji:beku
//
// Not part of `npm test`: it launches Electron and takes about a minute.

const { _electron } = require("playwright");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const ANGGARAN_MS = 250;

/** A throwaway git repo with real changes, so commit has actual work to do. */
function repoUji() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-beku-"));
  const git = (...a) =>
    execFileSync("git", a, { cwd: dir, stdio: "ignore", timeout: 30000 });
  git("init");
  git("config", "user.email", "uji@local");
  git("config", "user.name", "uji");
  for (let i = 0; i < 40; i++)
    fs.writeFileSync(path.join(dir, "berkas-" + i + ".txt"), "awal\n");
  git("add", "-A");
  git("commit", "-m", "awal");
  for (let i = 0; i < 40; i++)
    fs.appendFileSync(path.join(dir, "berkas-" + i + ".txt"), "diubah\n");
  return dir;
}

/** A folder worth importing: enough files that a synchronous copy would show. */
function folderUji() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-impor-"));
  const sub = path.join(dir, "isi");
  fs.mkdirSync(sub);
  for (let i = 0; i < 60; i++)
    fs.writeFileSync(path.join(sub, "f" + i + ".txt"), "x".repeat(2048));
  return { dir, sub };
}

async function ukur(page, label, jalur, muatan, metode = "POST") {
  const r = await page.evaluate(
    async ({ jalur, muatan, metode }) => {
      // Ping MAIN while the operation runs. A blocked main cannot answer, so
      // the worst round-trip IS the length of the freeze.
      let maks = 0;
      let n = 0;
      let jalan = true;
      const denyut = (async () => {
        while (jalan) {
          const t0 = performance.now();
          try {
            await window.WOLFSPACE.invoke("ping");
          } catch (_) {}
          const d = performance.now() - t0;
          if (d > maks) maks = d;
          n++;
          await new Promise((r) => setTimeout(r, 16));
        }
      })();

      const t0 = performance.now();
      let status = 0;
      let teks = "";
      try {
        const res = await fetch(
          jalur,
          metode === "GET"
            ? undefined
            : {
                method: metode,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(muatan || {}),
              },
        );
        status = res.status;
        teks = await res.text();
      } catch (e) {
        teks = String((e && e.message) || e);
      }
      const lama = Math.round(performance.now() - t0);
      jalan = false;
      await denyut;
      return { status, lama, maks: Math.round(maks), frame: n, teks };
    },
    { jalur, muatan, metode },
  );
  return { label, ...r };
}

/**
 * Refuse to run while WOLFSPACE is already open.
 *
 * This harness launches its own Electron window. Run while the user has
 * `npm run app` going, it opens a SECOND window on top of theirs -- which is
 * exactly what happened repeatedly during development: windows appearing over
 * live work, two instances competing for the same profile and the same debug
 * log, and one run failing outright with "Target page has been closed" when the
 * two collided.
 *
 * A measurement tool that disturbs what it measures is worse than no tool.
 */
function wolfspaceSudahJalan() {
  try {
    const keluar = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | " +
          "Select-Object -ExpandProperty CommandLine",
      ],
      { encoding: "utf8", timeout: 20000 },
    );
    const kunci = path.join(AKAR, "electron", "main.js").toLowerCase();
    return keluar
      .toLowerCase()
      .split("\n")
      .some((b) => b.includes(kunci));
  } catch (_) {
    // Cannot tell -> say no. Blocking the harness on a failed probe would be
    // its own kind of broken.
    return false;
  }
}

(async () => {
  if (wolfspaceSudahJalan()) {
    console.log("");
    console.log("  WOLFSPACE sedang berjalan.");
    console.log("");
    console.log(
      "  Harness ini membuka jendelanya sendiri, jadi menjalankannya",
    );
    console.log("  sekarang akan menimpa jendela yang sedang Anda pakai.");
    console.log("  Tutup aplikasinya dulu, lalu jalankan lagi.");
    process.exit(2);
  }
  const repo = repoUji();
  const impor = folderUji();
  const env = { ...process.env, WOLFSPACE_PROFILE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await _electron.launch({
    args: [path.join(AKAR, "electron", "main.js")],
    env,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await new Promise((r) => setTimeout(r, 9000));

  const hasil = [];
  hasil.push(
    await ukur(page, "git commit (40 berkas)", "/ww/commit", {
      path: repo,
      message: "uji beku",
    }),
  );
  hasil.push(
    await ukur(page, "impor folder (60 berkas)", "/ww/impor", {
      root: repo,
      sources: [impor.sub],
    }),
  );
  hasil.push(
    await ukur(
      page,
      "git status",
      "/ww/git?path=" + encodeURIComponent(repo),
      null,
      "GET",
    ),
  );
  const buka = await ukur(page, "terminal open", "/api/terminal/open", {});
  hasil.push(buka);
  try {
    const id = JSON.parse(buka.teks).id;
    if (id) {
      hasil.push(
        await ukur(page, "terminal write", "/api/terminal/write", {
          id,
          data: "echo halo\r",
        }),
      );
      hasil.push(
        await ukur(page, "terminal close", "/api/terminal/close", { id }),
      );
    }
  } catch (_) {}
  hasil.push(
    await ukur(page, "mcp connect", "/mcp/connect", {
      name: "sequential-thinking",
    }),
  );
  hasil.push(
    await ukur(page, "INFO diagnostics", "/info/diagnostics", { root: repo }),
  );

  // ── Contention: does load on one host pile onto another? ──
  //
  // This is the failure the split exists to prevent, and the one the serial
  // measurements above cannot see. An agent step used to hold the single host
  // while an ordinary file listing queued behind it for the full 30 s budget.
  //
  // Git goes to "kerja" and spawns processes synchronously; INFO goes to
  // "layanan". Fired together, the second must not wait for the first.
  const tumpang = await page.evaluate(
    async ({ repo }) => {
      const berat = fetch("/ww/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: repo, message: "beban" }),
      }).catch(() => null);
      // Let the heavy one take its host before timing the light one.
      await new Promise((r) => setTimeout(r, 30));
      const t0 = performance.now();
      let ok = false;
      try {
        const r = await fetch("/info/diagnostics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ root: repo }),
        });
        ok = r.ok;
      } catch (_) {}
      const ringan = Math.round(performance.now() - t0);
      await berat;
      return { ringan, ok };
    },
    { repo },
  );

  await app.close();

  console.log("");
  console.log("  operasi                       lama    ping   RTT maks");
  console.log("  " + "-".repeat(58));
  let gagal = 0;
  for (const h of hasil) {
    const lewat = h.maks > ANGGARAN_MS;
    if (lewat) gagal++;
    console.log(
      "  " +
        h.label.padEnd(28) +
        (h.lama + "ms").padStart(7) +
        String(h.frame).padStart(8) +
        (h.maks + "ms").padStart(11) +
        (lewat ? "   <-- MELEWATI ANGGARAN" : ""),
    );
  }
  console.log("");
  console.log("  anggaran RTT ke main: " + ANGGARAN_MS + " ms");
  console.log("");
  console.log(
    "  kontensi: INFO (layanan) selagi git (kerja) berjalan -> " +
      tumpang.ringan +
      "ms" +
      (tumpang.ringan > 3000 ? "   <-- MENUMPUK" : ""),
  );
  if (tumpang.ringan > 3000) gagal++;

  try {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(impor.dir, { recursive: true, force: true });
  } catch (_) {}

  if (gagal) {
    console.log("  HASIL: " + gagal + " operasi memblokir proses main.");
    process.exit(1);
  }
  console.log("  HASIL: main tetap menjawab di seluruh operasi.");
  process.exit(0);
})().catch((e) => {
  console.log("GAGAL menjalankan harness:", e.message);
  process.exit(1);
});
