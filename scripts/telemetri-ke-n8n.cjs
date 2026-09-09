#!/usr/bin/env node
// telemetri-ke-n8n.cjs — forwards WOLFSPACE telemetry to an n8n webhook.
//
// ROLE IN THE SYSTEM. WOLFSPACE HAS NO SINGLE TELEMETRY BUS — it has THREE, and
// they do not overlap. That fact shapes this whole file:
//
//   1. the CommandChain ledger (.wolfspace/audit/broker.jsonl)
//        DECISIONS: which capability, allowed or denied, enforced or merely
//        advisory. This is the security surface.
//
//   2. dlog (%TEMP%/WOLFSPACE-debug.log)
//        OPERATIONAL: self, mcp, cloud, model, http, chat, terminal, sandbox,
//        exec. This is what the system is doing.
//
//   3. emit() -> SSE to the UI
//        THE RUN ITSELF. NOT collected here: it exists only in memory, and the
//        UI already shows it better than n8n could. Duplicating it would only
//        add noise.
//
// IT TAILS FILES, IT DOES NOT HOOK CODE. dlog writes with appendFileSync —
// SYNCHRONOUS, in the main process, the process that also owns the window.
// Adding a network call there is exactly the class of bug that has bitten this
// repo repeatedly (a 10.8-second block that froze the window). A separate
// process reading a file cannot slow anything down, and stays correct if it
// dies.
//
// PAKAI:
//   node scripts/telemetri-ke-n8n.cjs <URL_WEBHOOK> [pilihan]
//
// Pilihan:
//   --only-important  only DENY/BLOCKED/failures — drops the thousands of ALLOW lines
//   --once            one pass then exit (for testing)
//   --sertakan-lama   also send the existing history (default: start from now)
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const POSISI = path.join(AKAR, ".wolfspace", "audit", ".posisi-n8n.json");

const URL_HOOK = process.argv[2];
const HANYA_PENTING =
  process.argv.includes("--only-important") ||
  process.argv.includes("--hanya-penting"); // old name still accepted
const SEKALI =
  process.argv.includes("--once") || process.argv.includes("--sekali");
const SERTAKAN_LAMA = process.argv.includes("--sertakan-lama");
const JEDA_MS = Number(process.env.TELEMETRI_JEDA || 5000);
const MAKS_BATCH = 200;

if (!URL_HOOK || URL_HOOK.startsWith("--")) {
  console.error(
    "Usage: node scripts/telemetri-ke-n8n.cjs <WEBHOOK_URL> [--only-important] [--once]\n\n" +
      "Create an n8n workflow with a Webhook (POST) node first, then copy its URL.",
  );
  process.exit(1);
}

// ── Sumber ────────────────────────────────────────────────────────────────
// Each is read differently because each really is a different shape: the ledger
// is sequence-numbered JSONL, dlog is line-by-line text.
const SUMBER = [
  {
    nama: "commandchain",
    berkas: path.join(AKAR, ".wolfspace", "audit", "broker.jsonl"),
    jenis: "jsonl",
  },
  {
    nama: "dlog",
    berkas: path.join(os.tmpdir(), "WOLFSPACE-debug.log"),
    jenis: "teks",
  },
];

const KEPUTUSAN_PENTING = new Set(["DENY", "BLOCKED", "ALLOW_BUT_FAILED"]);

function bacaPosisi() {
  try {
    return JSON.parse(fs.readFileSync(POSISI, "utf8"));
  } catch (_) {
    return null;
  }
}
function tulisPosisi(p) {
  try {
    fs.mkdirSync(path.dirname(POSISI), { recursive: true });
    fs.writeFileSync(
      POSISI,
      JSON.stringify({ ...p, ts: new Date().toISOString() }),
    );
  } catch (_) {}
}

/** The ledger is sequence-numbered, so the position is a seq — which survives
 *  the file being rotated. */
function bacaJsonl(berkas, sesudahSeq) {
  let teks;
  try {
    teks = fs.readFileSync(berkas, "utf8");
  } catch (_) {
    return { entri: [], batas: sesudahSeq };
  }
  const out = [];
  let batas = sesudahSeq;
  for (const baris of teks.split("\n")) {
    if (!baris.trim()) continue;
    let j;
    try {
      j = JSON.parse(baris);
    } catch (_) {
      continue; // baris setengah tertulis; terbaca utuh di putaran berikutnya
    }
    const s = Number(j.seq);
    if (!Number.isFinite(s)) continue;
    if (s > batas) batas = s;
    if (s <= sesudahSeq) continue;
    if (HANYA_PENTING && !KEPUTUSAN_PENTING.has(j.decision)) continue;
    out.push({
      sumber: "commandchain",
      seq: j.seq,
      ts: j.ts,
      pid: j.pid,
      capability: j.capability,
      decision: j.decision,
      reason: j.reason,
      // The distinction that matters most to a human reader: a real refusal or
      // merely advice. On Windows most of these read "advisory".
      ditegakkan: !!(j.kurungan && j.kurungan.enforced),
      mekanisme: j.kurungan && j.kurungan.mekanisme,
      params: j.params,
    });
  }
  return { entri: out.slice(-MAKS_BATCH), batas };
}

/** dlog is plain text, so the position is a byte OFFSET. A file that has shrunk
 *  was rotated or deleted. */
function bacaTeks(berkas, offset) {
  let st;
  try {
    st = fs.statSync(berkas);
  } catch (_) {
    return { entri: [], batas: 0 };
  }
  // %TEMP% can be cleared at any time and the log restarts at zero. Without
  // this, the old offset would silently skip everything new.
  let mulai = offset;
  if (st.size < offset) mulai = 0;
  if (st.size === mulai) return { entri: [], batas: mulai };

  let potongan;
  try {
    const fd = fs.openSync(berkas, "r");
    const panjang = Math.min(st.size - mulai, 1024 * 1024);
    const buf = Buffer.alloc(panjang);
    fs.readSync(fd, buf, 0, panjang, mulai);
    fs.closeSync(fd);
    potongan = buf.toString("utf8");
  } catch (_) {
    return { entri: [], batas: offset };
  }

  const baris = potongan.split("\n");
  // The last line may be truncated mid-write; leave it for the next pass.
  const sisa = baris.pop() || "";
  const batas = mulai + Buffer.byteLength(potongan) - Buffer.byteLength(sisa);

  const out = [];
  for (const b of baris) {
    const t = b.trim();
    if (!t) continue;
    // dlog writes one JSON object per line when it can; otherwise pass it raw.
    let j = null;
    try {
      j = JSON.parse(t);
    } catch (_) {}
    const level = j ? j.level : /error/i.test(t) ? "error" : "info";
    if (HANYA_PENTING && level !== "error" && level !== "warn") continue;
    out.push(
      j
        ? {
            sumber: "dlog",
            ts: j.ts,
            scope: j.cat || j.scope,
            level,
            msg: j.msg,
            data: j.data,
          }
        : { sumber: "dlog", level, mentah: t.slice(0, 500) },
    );
  }
  return { entri: out.slice(-MAKS_BATCH), batas };
}

async function kirim(entri) {
  const r = await fetch(URL_HOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sumber: "wolfspace",
      dikirim: new Date().toISOString(),
      jumlah: entri.length,
      entri,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error("HTTP " + r.status + " " + r.statusText);
}

let posisi = bacaPosisi();

async function putaran() {
  if (!posisi) {
    // First run: mark the current tail. Sending 4,684 historical entries would
    // flood n8n and say nothing about the state RIGHT NOW.
    posisi = {};
    for (const s of SUMBER) {
      posisi[s.nama] =
        s.jenis === "jsonl"
          ? SERTAKAN_LAMA
            ? -1
            : bacaJsonl(s.berkas, -1).batas
          : SERTAKAN_LAMA
            ? 0
            : (() => {
                try {
                  return fs.statSync(s.berkas).size;
                } catch (_) {
                  return 0;
                }
              })();
    }
    tulisPosisi(posisi);
    if (!SERTAKAN_LAMA) {
      console.error("[telemetri] starting from now; old history is not sent");
      return;
    }
  }

  const semua = [];
  const barn = { ...posisi };
  for (const s of SUMBER) {
    const p = posisi[s.nama] ?? (s.jenis === "jsonl" ? -1 : 0);
    const { entri, batas } =
      s.jenis === "jsonl" ? bacaJsonl(s.berkas, p) : bacaTeks(s.berkas, p);
    barn[s.nama] = batas;
    semua.push(...entri);
  }

  if (!semua.length) {
    // Nothing of interest, but the position still advances so the same lines are
    // not read again on every pass.
    posisi = barn;
    tulisPosisi(posisi);
    return;
  }

  try {
    await kirim(semua);
    posisi = barn;
    tulisPosisi(posisi);
    console.error("[telemetri] terkirim " + semua.length + " entri");
  } catch (e) {
    // The position is DELIBERATELY not advanced: a brief n8n outage must not
    // lose data.
    console.error("[telemetri] send failed (will retry): " + e.message);
  }
}

(async () => {
  await putaran();
  if (SEKALI) return;
  console.error(
    "[telemetri] mengawasi " +
      SUMBER.map((s) => s.nama).join(" + ") +
      " tiap " +
      JEDA_MS / 1000 +
      " detik" +
      (HANYA_PENTING ? " (only DENY/BLOCKED/error)" : "") +
      ". Ctrl+C to stop.",
  );
  setInterval(() => {
    putaran().catch((e) => console.error("[telemetri] " + e.message));
  }, JEDA_MS);
})();
