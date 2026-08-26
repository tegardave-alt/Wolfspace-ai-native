#!/usr/bin/env node
// Uji stres WOLFSPACE — bisa diulang siapa pun, bukan angka yang ditulis di doc.
//
//   node scripts/stress.cjs broker [konkurensi] [total]     (jalankan DI backend)
//   node scripts/stress.cjs agent <host> [konkurensi] [total] (dari mana saja)
//   node scripts/stress.cjs leak                             (jalankan DI backend)
//
// RANCANGANNYA: "semuanya sukses" TIDAK otomatis lulus. Bebannya campuran dan tiap
// jenis punya harapan berbeda — percobaan jaringan HARUS diblokir, permintaan di
// luar policy HARUS ditolak, zona pencetak besar harus kembali UTUH (dihitung
// byte-nya). Uji yang cuma memeriksa "tidak error" akan lulus meski pengurungannya
// bocor, dan itu justru kegagalan yang paling ingin ditangkap.
"use strict";
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");

const ROOT = path.resolve(__dirname, "..");
const mode = process.argv[2];

// ── Beban broker ──────────────────────────────────────────────────────────────
async function stresBroker(konkuren, total) {
  const { Policy, Broker, runInCapabilityZone } = require(
    path.join(ROOT, "agent/broker/index.ts"),
  );

  const WS = path.join(os.tmpdir(), "wolfspace-stres");
  fs.mkdirSync(WS, { recursive: true });
  fs.writeFileSync(path.join(WS, "data.txt"), "isi-sah");
  const policy = new Policy({
    readFile: { roots: [WS] },
    writeFile: { roots: [WS] },
    fetch: { hosts: ["api.github.com"] },
  });

  const JENIS = [
    {
      nama: "jaringan-langsung",
      harus: "diblokir", // netns harus menahan, juga di bawah beban
      kode: 'const h=require("node:https");return await new Promise(r=>{const t=setTimeout(()=>r("timeout"),9000);h.get("https://api.github.com",x=>{clearTimeout(t);r("TEMBUS "+x.statusCode)}).on("error",e=>{clearTimeout(t);r("diblokir "+e.code)})});',
    },
    {
      nama: "cetak-banyak",
      harus: "utuh", // pipa harus terkuras habis, bukan terpotong
      kode: 'for(let i=0;i<3000;i++)console.log("x".repeat(100)); return "selesai";',
    },
    {
      nama: "baca-di-policy",
      harus: "sukses",
      kode: `return await request("readFile", { path: ${JSON.stringify(path.join(WS, "data.txt"))} });`,
    },
    {
      nama: "baca-luar-policy",
      harus: "refused",
      kode: 'return await request("readFile", { path: "/etc/hostname" });',
    },
    {
      nama: "fs-langsung",
      harus: "refused",
      kode: 'require("fs").readFileSync("/etc/hostname"); return "TEMBUS";',
    },
    {
      nama: "hitung",
      harus: "sukses",
      kode: "let s=0;for(let i=0;i<3e6;i++)s+=i; return s;",
    },
  ];

  const hasil = [];
  async function satu(n) {
    const j = JENIS[n % JENIS.length];
    const t0 = Date.now();
    const broker = new Broker(policy);
    let status, detail;
    try {
      const z = await runInCapabilityZone(j.kode, broker, { timeout: 25000 });
      const r = String(z.result);
      if (j.harus === "diblokir")
        status = /TEMBUS/.test(r) ? "FAIL-breached" : "ok";
      else if (j.harus === "utuh")
        status = z.outBytes >= 300000 ? "ok" : "FAIL-truncated";
      else if (j.harus === "refused") status = "FAIL-slipped-through";
      else status = "ok";
      detail = r.slice(0, 40) + (j.harus === "utuh" ? ` (${z.outBytes}B)` : "");
    } catch (e) {
      status = j.harus === "refused" ? "ok" : "FAIL-error";
      detail = (e.code || "") + " " + String(e.message).slice(0, 40);
    }
    hasil.push({ jenis: j.nama, status, ms: Date.now() - t0, detail });
  }

  const t0 = Date.now();
  let dikirim = 0;
  const aktif = new Set();
  while (dikirim < total || aktif.size) {
    while (aktif.size < konkuren && dikirim < total) {
      const p = satu(dikirim++).finally(() => aktif.delete(p));
      aktif.add(p);
    }
    await Promise.race(aktif);
  }
  laporkan(hasil, total, konkuren, Date.now() - t0, "zona");
}

// ── Beban agent (model sungguhan) ─────────────────────────────────────────────
// Kunci dikirim di BADAN permintaan, jadi tak ada kredensial yang perlu mendarat
// di filesystem backend.
async function stresAgent(host, konkuren, total) {
  const keysPath =
    process.env.WOLFSPACE_KEYS ||
    path.join(os.homedir(), ".wolfspace", "cloud-keys.json");
  let cloud;
  try {
    const k = JSON.parse(fs.readFileSync(keysPath, "utf8"));
    const prov = process.env.WOLFSPACE_PROVIDER || "opencode";
    cloud = {
      provider: prov,
      key: k[prov].key,
      model: process.env.WOLFSPACE_MODEL || k[prov].model,
    };
  } catch (e) {
    console.error(`  cannot read the key at ${keysPath}: ${e.message}`);
    process.exit(1);
  }

  // Tiap tugas punya PENANDA yang wajib muncul di jawaban — run yang selesai
  // tapi salah tetap terhitung gagal.
  const TUGAS = [
    {
      p: "Jalankan `uname -s` dan laporkan hasilnya. Singkat.",
      tanda: /linux|windows|darwin/i,
    },
    {
      p: "Jalankan `echo WOLFSTRESS-7742` dan laporkan keluarannya persis.",
      tanda: /WOLFSTRESS-7742/,
    },
    { p: "Berapa hasil 17 * 23? Jawab angkanya saja.", tanda: /391/ },
  ];

  const kirim = (payload) =>
    new Promise((resolve) => {
      const body = JSON.stringify(payload);
      const req = http.request(
        {
          host,
          port: Number(process.env.PORT || 8090),
          path: "/self-agent",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: 240000,
        },
        (res) => {
          let buf = "";
          let adone = null;
          res.on("data", (c) => {
            buf += c.toString();
            let i;
            while ((i = buf.indexOf("\n\n")) !== -1) {
              const line = buf
                .slice(0, i)
                .replace(/^data:\s*/, "")
                .trim();
              buf = buf.slice(i + 2);
              if (!line) continue;
              try {
                const e = JSON.parse(line);
                if (e.t === "adone") adone = e;
              } catch (_) {}
            }
          });
          res.on("end", () => resolve({ adone }));
        },
      );
      req.on("error", (e) => resolve({ error: e.message }));
      req.on("timeout", () => {
        req.destroy();
        resolve({ error: "timeout" });
      });
      req.end(body);
    });

  const hasil = [];
  async function satu(n) {
    const t = TUGAS[n % TUGAS.length];
    const t0 = Date.now();
    let payload = {
      history: [{ role: "user", content: t.p }],
      cloud,
      effort: 1,
      thread_id: "stres_" + n + "_" + Date.now(),
    };
    let r = null;
    // HITL & jeda-plafon disetujui otomatis, meniru user menekan tombolnya.
    for (let leg = 0; leg < 5; leg++) {
      r = await kirim(payload);
      if (r.error) break;
      const a = r.adone || {};
      if (a.hitlPending)
        payload = { ...payload, history: [], hitl_response: true };
      else if (a.continuable)
        payload = { ...payload, history: [], continue_response: true };
      else break;
    }
    const ms = Date.now() - t0;
    if (r.error) {
      hasil.push({
        jenis: "agent",
        status: "FAIL-" + r.error,
        ms,
        detail: "",
      });
      return;
    }
    const s = String((r.adone || {}).summary || "");
    hasil.push({
      jenis: "agent",
      status: t.tanda.test(s) ? "ok" : "FAIL-answer",
      ms,
      detail: s.replace(/\s+/g, " ").slice(0, 50),
    });
  }

  const t0 = Date.now();
  let dikirim = 0;
  const aktif = new Set();
  while (dikirim < total || aktif.size) {
    while (aktif.size < konkuren && dikirim < total) {
      const p = satu(dikirim++).finally(() => aktif.delete(p));
      aktif.add(p);
    }
    await Promise.race(aktif);
  }
  laporkan(hasil, total, konkuren, Date.now() - t0, "run agent");
}

// ── Jejak sumber daya: yang membedakan "cepat" dari "tidak bocor" ─────────────
function cekBocor() {
  const bacaProc = (f) => {
    try {
      return fs.readFileSync(f, "utf8");
    } catch (_) {
      return "";
    }
  };
  const rss = (bacaProc(`/proc/${process.pid}/status`).match(
    /VmRSS:\s*(\d+)/,
  ) || [])[1];
  let fd = "-";
  try {
    fd = fs.readdirSync(`/proc/${process.pid}/fd`).length;
  } catch (_) {}
  console.log(`  pid            : ${process.pid}`);
  console.log(`  RSS            : ${rss ? rss + " kB" : "(not Linux)"}`);
  console.log(`  fd terbuka     : ${fd}`);
  try {
    const dir = path.join(ROOT, "config", ".mcp-pids");
    console.log(`  MCP pid files : ${fs.readdirSync(dir).length}`);
  } catch (_) {
    console.log("  MCP pid files : 0");
  }
}

function laporkan(hasil, total, konkuren, ms, satuan) {
  const per = {};
  for (const h of hasil) {
    per[h.jenis] = per[h.jenis] || { ok: 0, gagal: 0, ms: [] };
    h.status === "ok" ? per[h.jenis].ok++ : per[h.jenis].gagal++;
    per[h.jenis].ms.push(h.ms);
  }
  console.log(
    `  ${total} ${satuan}, konkurensi ${konkuren}, total ${(ms / 1000).toFixed(1)} dtk`,
  );
  for (const [nama, v] of Object.entries(per)) {
    v.ms.sort((a, b) => a - b);
    const p50 = v.ms[Math.floor(v.ms.length / 2)];
    const p95 = v.ms[Math.min(v.ms.length - 1, Math.floor(v.ms.length * 0.95))];
    console.log(
      `    ${nama.padEnd(19)} ok=${String(v.ok).padStart(3)} failed=${v.gagal}` +
        `  p50=${String(p50).padStart(5)}ms p95=${String(p95).padStart(5)}ms`,
    );
  }
  const gagal = hasil.filter((h) => h.status !== "ok");
  console.log(`  TOTAL FAILED: ${gagal.length} / ${total}`);
  for (const g of gagal.slice(0, 5))
    console.log(`    ! ${g.jenis}: ${g.status} — ${g.detail}`);
  process.exitCode = gagal.length ? 1 : 0;
}

(async () => {
  if (mode === "broker") {
    await stresBroker(
      Number(process.argv[3] || 8),
      Number(process.argv[4] || 48),
    );
  } else if (mode === "agent") {
    const host = process.argv[3];
    if (!host) {
      console.error("  butuh host: node scripts/stress.cjs agent <host>");
      process.exit(1);
    }
    await stresAgent(
      host,
      Number(process.argv[4] || 4),
      Number(process.argv[5] || 8),
    );
  } else if (mode === "leak") {
    cekBocor();
  } else {
    console.log(
      "Usage:\n" +
        "  node scripts/stress.cjs broker [konkurensi] [total]\n" +
        "  node scripts/stress.cjs agent <host> [konkurensi] [total]\n" +
        "  node scripts/stress.cjs leak",
    );
    process.exit(1);
  }
})();
