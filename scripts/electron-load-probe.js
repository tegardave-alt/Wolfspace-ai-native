// Uji beban DI DALAM Electron — mencari titik "not responding" yang sebenarnya.
//
// Uji beban HTTP sebelumnya (scripts/load-probe.js) TIDAK menemukan hang: server
// sanggup 400 koneksi serentak, canary tetap ~107ms. Artinya penyebab freeze ada
// di lapisan Electron, bukan HTTP. Skrip ini mengukur DUA proses secara terpisah,
// karena keduanya bisa membeku sendiri-sendiri dan penyebabnya beda:
//
//   CANARY MAIN     : window.WOLFSPACE.invoke("ping") pulang-pergi lewat IPC.
//                     Melonjak bila PROSES MAIN terblokir (mis. kerja sinkron —
//                     persis bug hashing 29MB yang bikin startup freeze dulu).
//   CANARY RENDERER : keterlambatan timer di dalam halaman (selisih waktu nyata
//                     vs yang dijadwalkan). Melonjak bila THREAD UI terblokir
//                     (Babel, Monaco, DOM raksasa, React re-render).
//
// Beban dinaikkan bertahap dengan pekerjaan yang MIRIP pemakaian nyata: menambah
// banyak node DOM ke area chat. Berhenti otomatis begitu salah satu canary lewat
// ambang, supaya tak menggantung.
//
// Jalankan: node scripts/electron-load-probe.js
"use strict";
const path = require("path");
const fs = require("fs");
const { _electron: electron } = require("playwright-core");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "electron-load-report.md");
const LEVELS = [100, 300, 700, 1500, 3000, 6000, 12000]; // node DOM kumulatif
const FAIL_MS = 2000; // canary di atas ini = tak responsif
const SAMPLE_MS = 250; // jarak sampel canary
const SAMPLES = 8; // sampel per tingkat

const pct = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

// Ukur keterlambatan timer DI DALAM renderer: proksi paling jujur utk "UI beku".
async function rendererLag(page) {
  return page.evaluate(
    () =>
      new Promise((res) => {
        const t0 = Date.now();
        setTimeout(() => res(Math.max(0, Date.now() - t0 - 50)), 50);
      }),
  );
}

// Ukur pulang-pergi IPC ke proses MAIN.
async function mainLag(page) {
  return page.evaluate(async () => {
    if (!window.WOLFSPACE || !window.WOLFSPACE.invoke) return -1;
    const t0 = Date.now();
    try {
      await window.WOLFSPACE.invoke("ping");
    } catch (_) {
      return -1;
    }
    return Date.now() - t0;
  });
}

(async () => {
  console.log("Meluncurkan Electron…");
  const tLaunch = Date.now();
  const app = await electron.launch({
    args: [path.join(ROOT, "electron", "main.js")],
    cwd: ROOT,
  });
  const page = await app.firstWindow();
  const tWindow = Date.now() - tLaunch;

  // Tunggu UI benar-benar ter-render (bukan sekadar jendela muncul).
  const tReady0 = Date.now();
  await page
    .waitForFunction(
      () =>
        document.querySelector("#root") &&
        document.querySelector("#root").children.length > 0,
      { timeout: 90000 },
    )
    .catch(() => {});
  const tInteractive = Date.now() - tLaunch;
  console.log(
    `jendela muncul: ${tWindow}ms | UI ter-render: ${tInteractive}ms`,
  );

  // Baseline
  await page.waitForTimeout(1500);
  const b = { r: [], m: [] };
  for (let i = 0; i < 6; i++) {
    b.r.push(await rendererLag(page));
    b.m.push(await mainLag(page));
    await page.waitForTimeout(SAMPLE_MS);
  }
  const baseR = pct(b.r, 50),
    baseM = pct(b.m, 50);
  console.log(`baseline  renderer ${baseR}ms | main ${baseM}ms\n`);

  const rows = [];
  let stop = "selesai semua tingkat";
  let placed = 0;

  for (const target of LEVELS) {
    const add = target - placed;
    // Tambah node DOM: meniru chat panjang (bubble + teks), bukan div kosong.
    const tAdd = Date.now();
    await page.evaluate((n) => {
      const host = document.querySelector("#root") || document.body;
      let box = document.getElementById("__loadbox");
      if (!box) {
        box = document.createElement("div");
        box.id = "__loadbox";
        host.appendChild(box);
      }
      const frag = document.createDocumentFragment();
      for (let i = 0; i < n; i++) {
        const d = document.createElement("div");
        d.className = "bubble-model";
        d.style.cssText =
          "padding:8px;margin:4px;border:1px solid #222;border-radius:8px";
        d.textContent =
          "Pesan uji beban ke-" +
          i +
          " — teks panjang untuk meniru balasan agent yang nyata dengan beberapa kalimat isi.";
        frag.appendChild(d);
      }
      box.appendChild(frag);
    }, add);
    const addMs = Date.now() - tAdd;
    placed = target;

    const R = [],
      M = [];
    for (let i = 0; i < SAMPLES; i++) {
      R.push(await rendererLag(page));
      M.push(await mainLag(page));
      await page.waitForTimeout(SAMPLE_MS);
    }
    const domCount = await page.evaluate(
      () => document.querySelectorAll("*").length,
    );
    const heap = await page.evaluate(() =>
      performance.memory
        ? Math.round(performance.memory.usedJSHeapSize / 1048576)
        : -1,
    );

    const row = {
      nodes: placed,
      domTotal: domCount,
      addMs,
      rP95: pct(R, 95),
      rMax: Math.max(...R),
      mP95: pct(M, 95),
      mMax: Math.max(...M),
      heap,
    };
    rows.push(row);
    console.log(
      `node ${String(placed).padStart(6)} | DOM ${String(domCount).padStart(6)} | sisip ${String(addMs).padStart(5)}ms | ` +
        `RENDERER p95 ${String(row.rP95).padStart(5)}ms max ${String(row.rMax).padStart(5)}ms | ` +
        `MAIN p95 ${String(row.mP95).padStart(5)}ms max ${String(row.mMax).padStart(5)}ms | heap ${heap}MB`,
    );

    if (row.rP95 > FAIL_MS) {
      stop = `renderer p95 ${row.rP95}ms > ${FAIL_MS}ms pada ${placed} node`;
      break;
    }
    if (row.mP95 > FAIL_MS) {
      stop = `main p95 ${row.mP95}ms > ${FAIL_MS}ms pada ${placed} node`;
      break;
    }
  }

  const L = [];
  L.push("# WOLFSPACE — Uji Beban di Dalam Electron");
  L.push("");
  L.push("Tanggal: " + new Date().toLocaleString("id-ID"));
  L.push("");
  L.push("## Waktu start");
  L.push("- Jendela muncul: **" + tWindow + " ms**");
  L.push("- UI ter-render (interaktif): **" + tInteractive + " ms**");
  L.push("");
  L.push("## Baseline (idle)");
  L.push(
    "- Renderer lag: **" + baseR + " ms**  ·  Main IPC: **" + baseM + " ms**",
  );
  L.push("");
  L.push(
    "Dua canary diukur terpisah karena kedua proses bisa membeku sendiri-sendiri:",
  );
  L.push(
    "**renderer** = thread UI (Babel/Monaco/DOM), **main** = proses Electron (IPC, kerja sinkron).",
  );
  L.push("");
  L.push(
    "| Node disisipkan | Total DOM | Waktu sisip | Renderer p95 | Renderer max | Main p95 | Main max | Heap |",
  );
  L.push("|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const r of rows) {
    L.push(
      `| ${r.nodes} | ${r.domTotal} | ${r.addMs} ms | **${r.rP95} ms** | ${r.rMax} ms | ${r.mP95} ms | ${r.mMax} ms | ${r.heap} MB |`,
    );
  }
  L.push("");
  L.push("## Hasil");
  L.push("- Berhenti karena: **" + stop + "**");
  const badR = rows.find((r) => r.rP95 > 500);
  const badM = rows.find((r) => r.mP95 > 500);
  L.push(
    "- Renderer mulai tersendat (p95 > 500ms): " +
      (badR
        ? "**" + badR.nodes + " node** (DOM " + badR.domTotal + ")"
        : "tidak tercapai"),
  );
  L.push(
    "- Main process mulai tersendat (p95 > 500ms): " +
      (badM ? "**" + badM.nodes + " node**" : "tidak tercapai"),
  );
  if (rows.length)
    L.push(
      "- Heap: " + rows[0].heap + " MB → " + rows[rows.length - 1].heap + " MB",
    );
  fs.writeFileSync(OUT, L.join("\n"), "utf8");

  console.log("\nBerhenti: " + stop);
  console.log("Laporan: " + OUT);
  await app.close();
  process.exit(0);
})().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
