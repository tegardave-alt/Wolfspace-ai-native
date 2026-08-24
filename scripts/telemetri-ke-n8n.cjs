#!/usr/bin/env node
// Alirkan telemetri WOLFSPACE ke webhook n8n.
//
// WOLFSPACE TIDAK PUNYA SATU BUS TELEMETRI — ADA TIGA, dan ketiganya tak saling
// tumpang tindih. Itu fakta yang membentuk seluruh berkas ini:
//
//   1. ledger CommandChain (.wolfspace/audit/broker.jsonl)
//        KEPUTUSAN: kapabilitas apa, diizinkan atau ditolak, ditegakkan atau
//        sekadar advisory. Ini permukaan keamanan.
//
//   2. dlog (%TEMP%/WOLFSPACE-debug.log)
//        OPERASIONAL: self, mcp, cloud, model, http, chat, terminal, sandbox,
//        exec. Ini yang menceritakan sistemnya sedang mengerjakan apa.
//
//   3. emit() -> SSE ke UI
//        JALANNYA RUN. TIDAK diambil di sini: hanya ada di memori, dan UI
//        WOLFSPACE sendiri sudah menampilkannya lebih baik daripada yang bisa
//        dilakukan n8n. Menggandakannya cuma menambah derau.
//
// MENYUSURI BERKAS, BUKAN MENGAIT KODE. dlog menulis dengan appendFileSync —
// SINKRON, di proses main, proses yang juga memiliki jendela. Menyisipkan
// panggilan jaringan di sana adalah persis kelas bug yang sudah berkali-kali
// menggigit repo ini (blokir 10,8 detik yang membekukan jendela). Proses
// terpisah yang membaca berkas tak bisa memperlambat apa pun, dan tetap benar
// kalau ia sendiri mati.
//
// PAKAI:
//   node scripts/telemetri-ke-n8n.cjs <URL_WEBHOOK> [pilihan]
//
// Pilihan:
//   --only-important  only DENY/BLOCKED/failures — drops the thousands of ALLOW lines
//   --once            one pass then exit (for testing)
//   --sertakan-lama   kirim juga riwayat yang sudah ada (bawaan: mulai dari sekarang)
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
// Masing-masing dibaca dengan cara berbeda karena bentuknya memang berbeda:
// ledger JSONL yang bernomor urut, dlog teks baris-per-baris.
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

/** Ledger: bernomor urut, jadi posisinya seq — tahan terhadap rotasi berkas. */
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
      // Pembeda yang paling penting untuk dibaca manusia: penolakan sungguhan
      // atau sekadar nasihat. Di Windows sebagian besar berbunyi "advisory".
      ditegakkan: !!(j.kurungan && j.kurungan.enforced),
      mekanisme: j.kurungan && j.kurungan.mekanisme,
      params: j.params,
    });
  }
  return { entri: out.slice(-MAKS_BATCH), batas };
}

/** dlog: teks biasa. Posisinya OFFSET byte; menyusut = berkas dirotasi/dihapus. */
function bacaTeks(berkas, offset) {
  let st;
  try {
    st = fs.statSync(berkas);
  } catch (_) {
    return { entri: [], batas: 0 };
  }
  // %TEMP% bisa dibersihkan kapan saja, dan log dimulai ulang dari nol. Tanpa
  // ini, offset lama membuat seluruh isi baru terlewat diam-diam.
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
  // Baris terakhir mungkin terpotong; sisakan untuk putaran berikutnya.
  const sisa = baris.pop() || "";
  const batas = mulai + Buffer.byteLength(potongan) - Buffer.byteLength(sisa);

  const out = [];
  for (const b of baris) {
    const t = b.trim();
    if (!t) continue;
    // dlog menulis JSON per baris bila bisa; kalau tidak, teruskan mentah.
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
    // Jalan pertama: tandai ekor sekarang. Mengirim 4.684 entri lama akan
    // membanjiri n8n dan tak memberi tahu apa pun tentang keadaan SEKARANG.
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
    // Tak ada yang menarik, tapi posisi tetap maju supaya tak dibaca ulang terus.
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
    // Posisi SENGAJA tidak dimajukan: n8n mati sebentar tak membuat data hilang.
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
