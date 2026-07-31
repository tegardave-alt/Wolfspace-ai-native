// ── Jejak audit broker yang BERTAHAN ke disk ──
//
// KENAPA ADA. Sebelum ini `Broker.audit` hanya array di memori, dan
// agent/tools/index.cjs membuat Broker BARU tiap panggilan capability_exec.
// Artinya catatan ALLOW/DENY/BLOCKED mati bersama panggilannya: terlihat sekali
// di hasil tool, lalu hilang. Tak ada yang bisa dibaca besok.
//
// Itu bukan sekadar kurang nyaman. Sepanjang pengembangan, zona sempat berjalan
// berjam-jam TANPA pengurungan jaringan dan baru ketahuan karena kebetulan ada
// yang menguji — bukan karena tercatat. Jejak audit yang tak bertahan bukan
// jejak audit.
//
// APPEND-ONLY, dan hanya sejauh yang bisa dijanjikan. Berkas ini hanya pernah
// di-append, tak pernah ditulis ulang di tempat. Tapi proses yang punya izin
// tulis tetap bisa memotongnya — kekekalan sungguhan menuntut dukungan OS
// (chattr +a, WORM) yang tak bisa diandalkan lintas platform. Jangan mengaku
// lebih dari itu.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const DIR =
  process.env.WOLFSPACE_AUDIT_DIR ||
  path.join(__dirname, "..", "..", ".wolfspace", "audit");
const BERKAS = path.join(DIR, "broker.jsonl");
const ROTASI_BYTE = 2 * 1024 * 1024;
const SIMPAN_ARSIP = 5;

// Nilai panjang DIPOTONG, bukan disimpan. params.content untuk writeFile berisi
// isi berkas UTUH — menuliskannya mentah-mentah membuat log membengkak dan,
// lebih buruk, menyalin data yang mungkin rahasia ke berkas teks biasa. Yang
// dibutuhkan audit adalah APA yang diakses, bukan datanya.
const NILAI_MAKS = 200;
// Nama field yang isinya tak boleh muncul sama sekali, seberapa pun pendeknya.
const KUNCI_RAHASIA =
  /(key|token|secret|password|passwd|auth|cookie|credential)/i;

function ringkasNilai(v) {
  if (typeof v === "string") {
    if (v.length <= NILAI_MAKS) return v;
    return v.slice(0, NILAI_MAKS) + "…<" + v.length + " char total>";
  }
  if (v && typeof v === "object")
    return "<" + (Array.isArray(v) ? "array" : "object") + ">";
  return v;
}

function ringkasParams(params) {
  if (!params || typeof params !== "object") return params;
  const out = {};
  for (const [k, v] of Object.entries(params)) {
    out[k] = KUNCI_RAHASIA.test(k) ? "<disunting>" : ringkasNilai(v);
  }
  return out;
}

let _sudahLaporGagal = false;
function laporGagalSekali(e) {
  if (_sudahLaporGagal) return;
  _sudahLaporGagal = true;
  // Kegagalan menulis audit TIDAK menggagalkan operasinya — agent tak boleh
  // lumpuh karena disk penuh. Tapi ia juga tak boleh senyap: audit yang diam-
  // diam berhenti mencatat persis sama buruknya dengan tak punya audit.
  try {
    process.stderr.write(
      "[WOLFSPACE:audit] PERINGATAN: jejak audit broker GAGAL ditulis ke disk.\n" +
        "  berkas : " +
        BERKAS +
        "\n" +
        "  sebab  : " +
        (e && e.message) +
        "\n" +
        "  akibat : operasi tetap berjalan, tapi tak ada catatan yang bertahan.\n",
    );
  } catch (_) {}
}

function rotasiBilaPerlu() {
  let st;
  try {
    st = fs.statSync(BERKAS);
  } catch (_) {
    return; // belum ada berkas — tak ada yang dirotasi
  }
  if (st.size < ROTASI_BYTE) return;
  const cap = new Date().toISOString().replace(/[:.]/g, "-");
  fs.renameSync(BERKAS, path.join(DIR, "broker-" + cap + ".jsonl"));
  // Arsip lama dibuang supaya tak tumbuh tanpa batas — pelajaran dari log debug
  // yang pernah mencapai 43 MB/hari sebelum rotasinya ada.
  const arsip = fs
    .readdirSync(DIR)
    .filter((f) => /^broker-.*\.jsonl$/.test(f))
    .sort();
  for (const f of arsip.slice(0, Math.max(0, arsip.length - SIMPAN_ARSIP))) {
    try {
      fs.unlinkSync(path.join(DIR, f));
    } catch (_) {}
  }
}

// Satu baris JSON per catatan. Format ini dipilih supaya bisa dibaca sambil
// ditulis (tail) dan tak bisa rusak seluruhnya gara-gara satu baris cacat —
// beda dengan satu array JSON besar yang harus utuh untuk bisa diurai.
function catat(entry) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    rotasiBilaPerlu();
    const baris = JSON.stringify({
      ts: new Date(entry.ts || Date.now()).toISOString(),
      pid: process.pid,
      capability: entry.capability,
      decision: entry.decision,
      reason: entry.reason || undefined,
      params: ringkasParams(entry.params),
      resultBytes: entry.resultBytes,
    });
    fs.appendFileSync(BERKAS, baris + "\n");
  } catch (e) {
    laporGagalSekali(e);
  }
}

module.exports = { catat, ringkasParams, BERKAS, DIR };
