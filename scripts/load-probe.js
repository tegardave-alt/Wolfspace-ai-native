// Uji beban BERTAHAP untuk menemukan titik WOLFSPACE mulai "not responding".
//
// Kenapa bukan sekadar membanjiri request: yang dirasakan user sebagai "hang"
// bukan throughput rendah, melainkan EVENT LOOP TERBLOKIR — request sepele pun
// tak dijawab. Jadi selain beban, kita jalankan CANARY: request paling ringan
// setiap 300ms. Kalau canary yang biasanya <20ms tiba-tiba butuh detik, itulah
// momen aplikasi membeku dari sudut pandang user.
//
// Berhenti otomatis saat salah satu terpenuhi (supaya tak menggantung selamanya):
//   - canary p95 > CANARY_FAIL_MS
//   - error rate > 20%
//   - concurrency maksimum tercapai
//
// Jalankan: node scripts/load-probe.js [--host 127.0.0.1] [--port 8090]
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const args = process.argv.slice(2);
const argv = (k, d) => {
  const i = args.indexOf("--" + k);
  return i > -1 && args[i + 1] ? args[i + 1] : d;
};
const HOST = argv("host", "127.0.0.1");
const PORT = Number(argv("port", 8090));
const OUT = argv("out", path.join(__dirname, "..", "load-report.md"));

const LEVELS = [1, 2, 5, 10, 20, 40, 80, 150, 250, 400];
const REQ_PER_LEVEL = 120; // request per tingkat konsentrasi
const CANARY_FAIL_MS = 3000; // canary p95 di atas ini = dianggap tak responsif
const ERR_FAIL_PCT = 20;

// Endpoint beban: dipilih yang MEMBACA + memproses, bukan file statis murni,
// supaya benar-benar menyentuh event loop server.
const LOAD_PATH = "/mcp";
const CANARY_PATH = "/"; // paling ringan; kalau ini lambat = server tersendat

function once(pathname, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = http.request(
      { host: HOST, port: PORT, path: pathname, method: "GET" },
      (res) => {
        res.resume();
        res.on("end", () =>
          resolve({
            ok: res.statusCode < 500,
            ms: Date.now() - t0,
            code: res.statusCode,
          }),
        );
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ ok: false, ms: Date.now() - t0, code: 0, timeout: true });
    });
    req.on("error", () => resolve({ ok: false, ms: Date.now() - t0, code: 0 }));
    req.end();
  });
}

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

function serverMemMB() {
  try {
    const out = execSync(
      'powershell.exe -NoProfile -Command "(Get-Process node -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum"',
      { encoding: "utf8", timeout: 15000 },
    ).trim();
    const n = Number(out);
    return n ? +(n / 1048576).toFixed(1) : null;
  } catch (_) {
    return null;
  }
}

(async () => {
  console.log("WOLFSPACE load probe -> http://" + HOST + ":" + PORT);
  const warm = await once(CANARY_PATH);
  if (!warm.ok && !warm.code) {
    console.log("Server tidak menjawab. Nyalakan dulu.");
    process.exit(1);
  }
  console.log(
    "baseline canary: " + warm.ms + "ms  (mem " + serverMemMB() + " MB)\n",
  );

  const rows = [];
  let stopReason = "selesai semua tingkat";
  const memStart = serverMemMB();

  for (const conc of LEVELS) {
    // canary berjalan PARALEL selama beban ditembakkan
    const canary = [];
    let canaryOn = true;
    (async () => {
      while (canaryOn) {
        const r = await once(CANARY_PATH, 10000);
        canary.push(r.timeout ? 10000 : r.ms);
        await new Promise((r2) => setTimeout(r2, 300));
      }
    })();

    const lat = [];
    let err = 0;
    const t0 = Date.now();
    let sent = 0;
    await new Promise((done) => {
      let active = 0;
      const pump = () => {
        while (active < conc && sent < REQ_PER_LEVEL) {
          active++;
          sent++;
          once(LOAD_PATH).then((r) => {
            lat.push(r.ms);
            if (!r.ok) err++;
            active--;
            if (sent >= REQ_PER_LEVEL && active === 0) done();
            else pump();
          });
        }
      };
      pump();
    });
    const dur = Date.now() - t0;
    canaryOn = false;
    await new Promise((r) => setTimeout(r, 350));

    const errPct = +((err / REQ_PER_LEVEL) * 100).toFixed(1);
    const row = {
      conc,
      rps: +(REQ_PER_LEVEL / (dur / 1000)).toFixed(1),
      p50: pct(lat, 50),
      p95: pct(lat, 95),
      max: Math.max(...lat),
      canaryP95: pct(canary, 95),
      canaryMax: canary.length ? Math.max(...canary) : 0,
      errPct,
      mem: serverMemMB(),
    };
    rows.push(row);
    console.log(
      `conc ${String(conc).padStart(3)} | rps ${String(row.rps).padStart(6)} | ` +
        `beban p50 ${String(row.p50).padStart(5)}ms p95 ${String(row.p95).padStart(6)}ms | ` +
        `CANARY p95 ${String(row.canaryP95).padStart(6)}ms max ${String(row.canaryMax).padStart(6)}ms | ` +
        `err ${String(errPct).padStart(5)}% | mem ${row.mem} MB`,
    );

    if (row.canaryP95 > CANARY_FAIL_MS) {
      stopReason = `canary p95 ${row.canaryP95}ms > ${CANARY_FAIL_MS}ms pada concurrency ${conc}`;
      break;
    }
    if (errPct > ERR_FAIL_PCT) {
      stopReason = `error ${errPct}% > ${ERR_FAIL_PCT}% pada concurrency ${conc}`;
      break;
    }
  }

  const memEnd = serverMemMB();
  // laporan
  const L = [];
  L.push("# WOLFSPACE — Laporan Uji Beban");
  L.push("");
  L.push("Tanggal: " + new Date().toLocaleString("id-ID"));
  L.push(
    "Target: `http://" +
      HOST +
      ":" +
      PORT +
      "`  ·  beban `" +
      LOAD_PATH +
      "`  ·  canary `" +
      CANARY_PATH +
      "`",
  );
  L.push("Request per tingkat: " + REQ_PER_LEVEL);
  L.push("");
  L.push(
    "**Canary** = request paling ringan tiap 300ms selama beban berjalan. Ia mengukur",
  );
  L.push(
    "apa yang user rasakan: kalau canary melambat, aplikasi terasa *not responding*.",
  );
  L.push("");
  L.push(
    "| Concurrency | RPS | Beban p50 | Beban p95 | **Canary p95** | Canary max | Error | Memori |",
  );
  L.push("|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const r of rows) {
    L.push(
      `| ${r.conc} | ${r.rps} | ${r.p50} ms | ${r.p95} ms | **${r.canaryP95} ms** | ${r.canaryMax} ms | ${r.errPct}% | ${r.mem} MB |`,
    );
  }
  L.push("");
  L.push("## Hasil");
  L.push("- Berhenti karena: **" + stopReason + "**");
  L.push(
    "- Memori server: " +
      memStart +
      " MB → " +
      memEnd +
      " MB (selisih " +
      (memEnd && memStart ? (memEnd - memStart).toFixed(1) : "?") +
      " MB)",
  );
  const firstBad = rows.find((r) => r.canaryP95 > 1000);
  L.push(
    "- Ambang terasa tersendat (canary p95 > 1 detik): " +
      (firstBad
        ? "concurrency **" + firstBad.conc + "**"
        : "TIDAK tercapai pada rentang yang diuji"),
  );
  L.push("");
  fs.writeFileSync(OUT, L.join("\n"), "utf8");
  console.log("\nBerhenti: " + stopReason);
  console.log("Memori: " + memStart + " -> " + memEnd + " MB");
  console.log("Laporan: " + OUT);
})();
