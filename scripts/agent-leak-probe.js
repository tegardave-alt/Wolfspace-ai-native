// Membedakan "biaya inisialisasi sekali" dari "kebocoran per-run".
//
// Uji sebelumnya menunjukkan memori melompat 98 -> 391 MB lalu relatif datar saat
// paralelisme dinaikkan. Pola itu MENDUGA biaya lazy-load sekali, bukan bocor —
// tapi satu putaran tak bisa membuktikannya. Caranya: ulangi gelombang IDENTIK
// beberapa kali. Kalau memori datar setelah gelombang-1 => bukan bocor.
// Kalau naik konsisten tiap gelombang => bocor, dan delta-nya terukur.
//
// Sengaja memakai paralelisme TETAP (kecil) supaya hemat kredit LLM.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const HOST = "127.0.0.1",
  PORT = 8090;
const OUT = path.join(__dirname, "..", "agent-leak-report.md");
const WAVES = Number(process.env.LEAK_WAVES || 4); // jumlah gelombang identik
const PAR = Number(process.env.LEAK_PAR || 2); // run paralel per gelombang
const PROVIDER = process.env.LOAD_PROVIDER || "opencode";
const RUN_TIMEOUT_MS = 150000;

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

function history() {
  const blob =
    "Catatan proyek: status tugas, tautan referensi, dan ringkasan halaman kerja. ".repeat(
      40,
    );
  const h = [];
  for (let i = 0; i < 12; i++) {
    h.push({ role: "user", content: "Rangkum halaman ke-" + i + "." });
    h.push({ role: "assistant", content: "Halaman ke-" + i + ": " + blob });
  }
  h.push({
    role: "user",
    content: "Jawab SINGKAT: sebutkan 2 poin utama. Jangan panggil tool.",
  });
  return h;
}

function runAgent(hist) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    let finished = false,
      err = "";
    const payload = JSON.stringify({
      history: hist,
      cloud: { provider: PROVIDER },
    });
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
            if (j.t === "adone" || j.t === "done") finished = true;
            if (j.t === "err") err = String(j.m || "").slice(0, 60);
          }
        });
        res.on("end", () => resolve({ ms: Date.now() - t0, finished, err }));
      },
    );
    req.setTimeout(RUN_TIMEOUT_MS, () => {
      req.destroy();
      resolve({ ms: Date.now() - t0, finished: false, err: "timeout" });
    });
    req.on("error", (e) =>
      resolve({
        ms: Date.now() - t0,
        finished: false,
        err: e.message.slice(0, 50),
      }),
    );
    req.end(payload);
  });
}

(async () => {
  console.log(
    `Leak probe: ${WAVES} gelombang identik x ${PAR} paralel (provider ${PROVIDER})`,
  );
  const hist = history();
  const kb = Math.round(hist.reduce((n, m) => n + m.content.length, 0) / 1024);
  console.log("konteks per run: " + kb + " KB\n");

  const rows = [];
  const mem0 = memMB();
  console.log("memori awal: " + mem0 + " MB");

  for (let w = 1; w <= WAVES; w++) {
    const before = memMB();
    const t0 = Date.now();
    const rs = await Promise.all(
      Array.from({ length: PAR }, () => runAgent(hist)),
    );
    const wall = Date.now() - t0;
    // beri jeda agar GC sempat bekerja sebelum diukur
    await new Promise((r) => setTimeout(r, 4000));
    const after = memMB();
    const ok = rs.filter((r) => r.finished).length;
    const row = {
      w,
      before,
      after,
      delta: +(after - before).toFixed(1),
      wall,
      ok,
      par: PAR,
      errs: [...new Set(rs.filter((r) => r.err).map((r) => r.err))],
    };
    rows.push(row);
    console.log(
      `gel ${w} | ${(wall / 1000).toFixed(1)}s | sukses ${ok}/${PAR} | ` +
        `mem ${before} -> ${after} MB (delta ${row.delta >= 0 ? "+" : ""}${row.delta})` +
        (row.errs.length ? "  err: " + row.errs.join(",") : ""),
    );
  }

  const memEnd = memMB();
  // Vonis: bandingkan delta gelombang-1 (biaya init) vs rata-rata gelombang berikutnya
  const d1 = rows[0] ? rows[0].delta : 0;
  const rest = rows.slice(1);
  const avgRest = rest.length
    ? +(rest.reduce((n, r) => n + r.delta, 0) / rest.length).toFixed(1)
    : 0;
  const naikTerus = rest.length >= 2 && rest.every((r) => r.delta > 5);
  let vonis;
  if (naikTerus)
    vonis = `BOCOR: memori naik konsisten ~${avgRest} MB tiap gelombang setelah yang pertama.`;
  else if (Math.abs(avgRest) <= 10)
    vonis = `BUKAN bocor: lompatan hanya di gelombang-1 (${d1 >= 0 ? "+" : ""}${d1} MB = biaya inisialisasi); gelombang berikutnya rata-rata ${avgRest >= 0 ? "+" : ""}${avgRest} MB (datar).`;
  else
    vonis = `TIDAK KONKLUSIF: rata-rata delta setelah gelombang-1 = ${avgRest} MB. Perlu lebih banyak gelombang.`;

  const L = [];
  L.push("# WOLFSPACE — Uji Kebocoran Memori (Gelombang Berulang)");
  L.push("");
  L.push("Tanggal: " + new Date().toLocaleString("id-ID"));
  L.push(
    "Metode: " +
      WAVES +
      " gelombang **identik** x " +
      PAR +
      " run paralel, konteks " +
      kb +
      " KB, provider `" +
      PROVIDER +
      "`.",
  );
  L.push("");
  L.push(
    "Gelombang identik memisahkan **biaya inisialisasi sekali** dari **kebocoran per-run**:",
  );
  L.push("kalau memori datar setelah gelombang-1, tak ada kebocoran.");
  L.push("");
  L.push("| Gelombang | Durasi | Sukses | Mem sebelum | Mem sesudah | Delta |");
  L.push("|---:|---:|---:|---:|---:|---:|");
  for (const r of rows) {
    L.push(
      `| ${r.w} | ${(r.wall / 1000).toFixed(1)} s | ${r.ok}/${r.par} | ${r.before} MB | ${r.after} MB | **${r.delta >= 0 ? "+" : ""}${r.delta} MB** |`,
    );
  }
  L.push("");
  L.push("## Vonis");
  L.push("- " + vonis);
  L.push("- Memori total: " + mem0 + " MB → " + memEnd + " MB");
  const allErr = [...new Set(rows.flatMap((r) => r.errs))];
  if (allErr.length) {
    L.push("- Error:");
    allErr.forEach((e) => L.push("  - `" + e + "`"));
  }
  fs.writeFileSync(OUT, L.join("\n"), "utf8");

  console.log("\n" + vonis);
  console.log("Laporan: " + OUT);
  process.exit(0);
})();
