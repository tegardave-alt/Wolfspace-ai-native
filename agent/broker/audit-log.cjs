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
const crypto = require("crypto");

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

// ── Rantai (CommandChain, Fase 1) ──
//
// Tiap catatan membawa seq + prevHash + hash, dirantai:
//     hash(rec) = sha256(prevHash + JSON kanonik rec-tanpa-hash)
// Mengubah satu catatan lama memutus semua hash sesudahnya, jadi rantai
// TAMPER-EVIDENT — perubahan riwayat ketahuan. BUKAN tamper-proof: proses
// ber-izin tulis tetap bisa menulis ulang seluruh berkas berikut hash-nya. Beda
// keduanya penting dan disebut apa adanya (lihat docs/COMMANDCHAIN.md).
//
// _lastHash/_lastSeq disimpan di memori dan dipulihkan dari ekor berkas saat
// dingin, jadi rantai bersambung lintas proses DAN lintas rotasi (entri pertama
// berkas baru menaut ke hash terakhir berkas lama).
let _lastHash = null;
let _lastSeq = -1;
let _dimuat = false;

function _hashRec(prevHash, rec) {
  return crypto
    .createHash("sha256")
    .update((prevHash || "") + JSON.stringify(rec))
    .digest("hex");
}

// Pulihkan state rantai dari baris terakhir yang sah di berkas aktif.
function _muatEkor() {
  _dimuat = true;
  try {
    const isi = fs.readFileSync(BERKAS, "utf8").trimEnd();
    if (!isi) return;
    const baris = isi.split("\n");
    for (let i = baris.length - 1; i >= 0; i--) {
      try {
        const j = JSON.parse(baris[i]);
        if (typeof j.seq === "number" && j.hash) {
          _lastSeq = j.seq;
          _lastHash = j.hash;
          return;
        }
      } catch (_) {
        /* baris cacat — coba baris sebelumnya */
      }
    }
  } catch (_) {
    /* berkas belum ada — mulai dari genesis kosong */
  }
}

// Menulis SATU record berantai. `rec` sudah dalam bentuk final (field terurut),
// TANPA seq/prevHash/hash — ketiganya ditambahkan di sini.
function _tulisBerantai(rec) {
  const seq = _lastSeq + 1;
  const prevHash = _lastHash;
  const berantai = { seq, prevHash, ...rec };
  const hash = _hashRec(prevHash, berantai);
  const baris = JSON.stringify({ ...berantai, hash });
  fs.appendFileSync(BERKAS, baris + "\n");
  _lastSeq = seq;
  _lastHash = hash;
  return { seq, hash };
}

// Genesis: entri seq-0 yang menambatkan RULESET sesi. Hanya ditulis bila ledger
// masih kosong — genesis harus benar-benar pertama. Ruleset dibekukan sebelum
// masuk; hash-nya mengunci isinya di rantai.
function catatGenesis(ruleset) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    if (!_dimuat) _muatEkor();
    if (_lastSeq !== -1) return null; // sudah ada isi — genesis tak bisa disisipkan
    return _tulisBerantai({
      ts: new Date().toISOString(),
      pid: process.pid,
      capability: "__genesis__",
      decision: "GENESIS",
      ruleset,
      rulesetHash: crypto
        .createHash("sha256")
        .update(JSON.stringify(ruleset))
        .digest("hex"),
    });
  } catch (e) {
    laporGagalSekali(e);
    return null;
  }
}

// Satu baris JSON per catatan. Format ini dipilih supaya bisa dibaca sambil
// ditulis (tail) dan tak bisa rusak seluruhnya gara-gara satu baris cacat —
// beda dengan satu array JSON besar yang harus utuh untuk bisa diurai.
function catat(entry) {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    rotasiBilaPerlu();
    if (!_dimuat) _muatEkor();
    _tulisBerantai({
      ts: new Date(entry.ts || Date.now()).toISOString(),
      pid: process.pid,
      capability: entry.capability,
      decision: entry.decision,
      reason: entry.reason || undefined,
      params: ringkasParams(entry.params),
      resultBytes: entry.resultBytes,
      // Status cakupan eksekusi (CommandChain Fase 2: bash/proc.raw membawanya).
      kurungan: entry.kurungan || undefined,
    });
  } catch (e) {
    laporGagalSekali(e);
  }
}

// Verifikasi INTEGRITAS rantai dalam satu berkas: tiap hash harus cocok dengan
// isinya, dan prevHash tiap baris harus = hash baris sebelumnya. Mengembalikan
// { ok, panjang, putusDi } — putusDi = seq pertama yang rusak, atau null.
function verifikasiRantai(berkas) {
  const f = berkas || BERKAS;
  let baris;
  try {
    baris = fs.readFileSync(f, "utf8").trimEnd().split("\n").filter(Boolean);
  } catch (_) {
    return { ok: true, panjang: 0, putusDi: null }; // tak ada berkas = rantai kosong, sah
  }
  let prev = null;
  for (let i = 0; i < baris.length; i++) {
    let rec;
    try {
      rec = JSON.parse(baris[i]);
    } catch (_) {
      return {
        ok: false,
        panjang: baris.length,
        putusDi: i,
        alasan: "baris cacat",
      };
    }
    const { hash, ...tanpaHash } = rec;
    // Tautan: prevHash baris ini harus = hash baris sebelumnya (kecuali baris
    // pertama berkas, yang boleh menaut ke berkas yang sudah dirotasi).
    if (i > 0 && rec.prevHash !== prev) {
      return {
        ok: false,
        panjang: baris.length,
        putusDi: rec.seq,
        alasan: "tautan putus",
      };
    }
    // Integritas: hash tercatat harus = hash yang dihitung ulang.
    if (_hashRec(rec.prevHash, tanpaHash) !== hash) {
      return {
        ok: false,
        panjang: baris.length,
        putusDi: rec.seq,
        alasan: "hash tak cocok",
      };
    }
    prev = hash;
  }
  return { ok: true, panjang: baris.length, putusDi: null };
}

module.exports = {
  catat,
  catatGenesis,
  verifikasiRantai,
  ringkasParams,
  BERKAS,
  DIR,
};
