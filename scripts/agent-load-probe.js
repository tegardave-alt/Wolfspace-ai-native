// Uji beban RUN AGENT PARALEL berkonteks besar — tersangka terakhir penyebab
// "not responding" setelah lapisan HTTP dan Electron terbukti tahan beban.
//
// Kenapa ini beda dari dua uji sebelumnya: run agent bukan request sepele. Satu
// run = beberapa giliran LLM, masing-masing menahan koneksi sampai 10 MENIT
// (timeout di cloud.cjs). Beberapa run paralel berkonteks besar adalah kondisi
// yang PALING mungkin membuat aplikasi terasa membeku — persis pola yang terlihat
// di log user: 4 halaman Notion ditarik, konteks membengkak, lalu senyap.
//
// Diukur:
//   - CANARY: request ringan tiap 500ms -> apakah server masih melayani UI
//     saat beberapa agent berjalan (ini yang menentukan "hang" atau tidak)
//   - durasi & hasil tiap run, error, dan pertumbuhan memori proses
//
// BIAYA: memakai LLM sungguhan. Sengaja dibatasi (lihat WAVES) agar hemat.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const HOST = "127.0.0.1";
const PORT = 8090;
const OUT = path.join(__dirname, "..", "agent-load-report.md");
const WAVES = [1, 2, 4]; // jumlah run agent paralel per gelombang
const PROVIDER = process.env.LOAD_PROVIDER || "opencode";
const RUN_TIMEOUT_MS = 180000; // batas per run
const CANARY_MS = 500;

// Konteks besar: riwayat panjang meniru sesi yang sudah berjalan lama
// (beberapa halaman Notion + balasan agent). Bukan teks acak — struktur
// percakapan nyata supaya biaya tokenisasi & penanganannya realistis.
function bigHistory(padKB) {
  const blob = (
    "Ringkasan halaman: bagian ini memuat catatan proyek, daftar tugas, " +
    "status pekerjaan, dan tautan referensi internal yang dikumpulkan agent. "
  ).repeat(40);
  const h = [];
  const turns = Math.max(1, Math.round(padKB / 4));
  for (let i = 0; i < turns; i++) {
    h.push({
      role: "user",
      content: "Rangkum halaman ke-" + i + " dari workspace.",
    });
    h.push({ role: "assistant", content: "Halaman ke-" + i + ": " + blob });
  }
  h.push({
    role: "user",
    content:
      "Dari seluruh konteks di atas, jawab SINGKAT: sebutkan 3 poin utama. Jangan panggil tool apa pun.",
  });
  return h;
}

function memMB() {
  try {
    const o = execSync(
      'powershell.exe -NoProfile -Command "(Get-Process node -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum"',
      { encoding: "utf8", timeout: 15000 },
    ).trim();
    const n = Number(o);
    return n ? +(n / 1048576).toFixed(1) : null;
  } catch (_) {
    return null;
  }
}

function canaryOnce(timeoutMs = 8000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const req = http.request(
      { host: HOST, port: PORT, path: "/", method: "GET" },
      (res) => {
        res.resume();
        res.on("end", () => resolve(Date.now() - t0));
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(timeoutMs);
    });
    req.on("error", () => resolve(timeoutMs));
    req.end();
  });
}

function runAgent(id, history) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let events = 0,
      acts = 0,
      waits = 0,
      maxCtx = 0,
      finished = false,
      errMsg = "";
    const payload = JSON.stringify({ history, cloud: { provider: PROVIDER } });
    const req = http.request(
      {
        host: HOST,
        port: PORT,
        path: "/self-agent",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => {
          buf += c.toString();
          const parts = buf.split("\n\n");
          buf = parts.pop();
          for (const p of parts) {
            const m = p.match(/^data:\s*([\s\S]*)$/);
            if (!m) continue;
            let j;
            try {
              j = JSON.parse(m[1]);
            } catch (_) {
              continue;
            }
            events++;
            if (j.t === "act") acts++;
            if (j.t === "model_wait") {
              waits++;
              if (j.ctxChars > maxCtx) maxCtx = j.ctxChars;
            }
            if (j.t === "err") errMsg = String(j.m || "").slice(0, 80);
            if (j.t === "adone" || j.t === "done") finished = true;
          }
        });
        res.on("end", () =>
          resolve({
            id,
            ms: Date.now() - t0,
            events,
            acts,
            waits,
            maxCtx,
            finished,
            errMsg,
          }),
        );
      },
    );
    req.setTimeout(RUN_TIMEOUT_MS, () => {
      req.destroy();
      resolve({
        id,
        ms: Date.now() - t0,
        events,
        acts,
        waits,
        maxCtx,
        finished: false,
        errMsg: "TIMEOUT " + RUN_TIMEOUT_MS + "ms",
      });
    });
    req.on("error", (e) =>
      resolve({
        id,
        ms: Date.now() - t0,
        events,
        acts,
        waits,
        maxCtx,
        finished: false,
        errMsg: e.message.slice(0, 60),
      }),
    );
    req.end(payload);
  });
}

const pct = (a, p) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

(async () => {
  console.log("Agent load probe -> provider=" + PROVIDER);
  const base = await canaryOnce();
  console.log("baseline canary " + base + "ms | mem " + memMB() + " MB\n");

  const history = bigHistory(48); // ~48KB konteks
  const ctxChars = history.reduce((n, m) => n + m.content.length, 0);
  console.log(
    "konteks per run: " +
      Math.round(ctxChars / 1024) +
      " KB (" +
      history.length +
      " pesan)\n",
  );

  const memStart = memMB();
  const rows = [];
  let stop = "selesai semua gelombang";

  for (const n of WAVES) {
    const canary = [];
    let on = true;
    (async () => {
      while (on) {
        canary.push(await canaryOnce());
        await new Promise((r) => setTimeout(r, CANARY_MS));
      }
    })();

    const t0 = Date.now();
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) => runAgent(i + 1, history)),
    );
    const wall = Date.now() - t0;
    on = false;
    await new Promise((r) => setTimeout(r, 600));

    const ok = results.filter((r) => r.finished).length;
    const row = {
      n,
      wall,
      ok,
      fail: n - ok,
      slowest: Math.max(...results.map((r) => r.ms)),
      canaryP95: pct(canary, 95),
      canaryMax: canary.length ? Math.max(...canary) : 0,
      maxCtx: Math.max(...results.map((r) => r.maxCtx)),
      mem: memMB(),
      errs: results.filter((r) => r.errMsg).map((r) => r.errMsg),
    };
    rows.push(row);
    console.log(
      `paralel ${String(n).padStart(2)} | total ${String((wall / 1000).toFixed(1)).padStart(6)}s | ` +
        `terlama ${String((row.slowest / 1000).toFixed(1)).padStart(6)}s | sukses ${ok}/${n} | ` +
        `CANARY p95 ${String(row.canaryP95).padStart(5)}ms max ${String(row.canaryMax).padStart(5)}ms | mem ${row.mem} MB`,
    );
    if (row.errs.length)
      console.log("      error: " + [...new Set(row.errs)].join(" | "));

    if (row.canaryP95 > 3000) {
      stop = `canary p95 ${row.canaryP95}ms > 3000ms pada ${n} run paralel`;
      break;
    }
    if (row.fail === n) {
      stop = `semua run gagal pada ${n} paralel`;
      break;
    }
  }

  const memEnd = memMB();
  const L = [];
  L.push("# WOLFSPACE — Uji Beban Run Agent Paralel (Konteks Besar)");
  L.push("");
  L.push("Tanggal: " + new Date().toLocaleString("id-ID"));
  L.push(
    "Provider: `" +
      PROVIDER +
      "`  ·  konteks per run: **" +
      Math.round(ctxChars / 1024) +
      " KB** (" +
      history.length +
      " pesan)",
  );
  L.push("");
  L.push(
    "**Canary** = request ringan tiap " +
      CANARY_MS +
      "ms selama agent berjalan. Ia menjawab pertanyaan",
  );
  L.push(
    "inti: apakah aplikasi masih melayani UI ketika beberapa agent bekerja sekaligus?",
  );
  L.push("");
  L.push(
    "| Paralel | Total | Run terlama | Sukses | **Canary p95** | Canary max | Konteks puncak | Memori |",
  );
  L.push("|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const r of rows) {
    L.push(
      `| ${r.n} | ${(r.wall / 1000).toFixed(1)} s | ${(r.slowest / 1000).toFixed(1)} s | ${r.ok}/${r.n} | **${r.canaryP95} ms** | ${r.canaryMax} ms | ${r.maxCtx} char | ${r.mem} MB |`,
    );
  }
  L.push("");
  L.push("## Hasil");
  L.push("- Berhenti karena: **" + stop + "**");
  L.push(
    "- Memori: " +
      memStart +
      " MB → " +
      memEnd +
      " MB (selisih " +
      (memEnd && memStart ? (memEnd - memStart).toFixed(1) : "?") +
      " MB)",
  );
  const bad = rows.find((r) => r.canaryP95 > 1000);
  L.push(
    "- UI mulai tersendat (canary p95 > 1 detik): " +
      (bad ? "**" + bad.n + " run paralel**" : "TIDAK tercapai"),
  );
  const anyErr = [...new Set(rows.flatMap((r) => r.errs))];
  if (anyErr.length) {
    L.push("- Error yang muncul:");
    anyErr.forEach((e) => L.push("  - `" + e + "`"));
  }
  fs.writeFileSync(OUT, L.join("\n"), "utf8");
  console.log("\nBerhenti: " + stop);
  console.log("Memori: " + memStart + " -> " + memEnd + " MB");
  console.log("Laporan: " + OUT);
  process.exit(0);
})();
