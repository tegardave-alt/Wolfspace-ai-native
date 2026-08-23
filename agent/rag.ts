// ── WOLFSPACE RAG (P1) ──
// Retrieval for KNOWLEDGE, not code: project memory (run summaries, decisions)
// plus docs. Code is still searched agentically (grep/glob/read). See the design
// brief.
//
// P1 = offline, zero-dependency, file-based. A LOCAL hashing embedder (word plus
// character n-grams -> a normalised vector) behind an embed() interface that can
// be swapped for a transformer or a cloud one later without touching the store,
// the tool, or ingest.
//
// Store: ~/.wolfspace/rag/<projectKey>/index.json (one per project, so ww stays
// isolated).
"use strict";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const DIM = 512;
const MAX_RECORDS = 2000; // bound the growth; drop the oldest when full

function ragRoot() {
  return path.join(
    process.env.USERPROFILE || os.homedir(),
    ".wolfspace",
    "rag",
  );
}
// A stable project key from the workspace path or name (case-insensitive, safe
// as a folder name).
function projectKeyFrom(p) {
  const s = String(p || "").trim();
  if (!s) return "global";
  return (
    s
      .replace(/\\/g, "/")
      .replace(/\/+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 80) || "global"
  );
}
function storeFile(projectKey) {
  return path.join(ragRoot(), projectKey, "index.json");
}

// ── Embedder lokal (hashing vectorizer) ───────────────────────────────────────
function _hash(str) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}
function _features(text) {
  const t = String(text || "").toLowerCase();
  const words = t.split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  const feats: any[] = [];
  for (const w of words) {
    feats.push("w:" + w); // token utuh
    const p = "#" + w + "#"; // character 3-grams (sub-word: robust to variant forms)
    for (let i = 0; i + 3 <= p.length; i++)
      feats.push("c:" + p.slice(i, i + 3));
  }
  return feats;
}
function embed(text) {
  const v = new Float32Array(DIM);
  const feats = _features(text);
  const tf = new Map();
  for (const f of feats) tf.set(f, (tf.get(f) || 0) + 1);
  for (const [f, c] of tf) {
    const idx = _hash(f) % DIM;
    const sign = _hash("s" + f) & 1 ? 1 : -1; // signed hashing → kurangi tabrakan
    v[idx] += sign * (1 + Math.log(c)); // TF ter-log
  }
  let norm = 0;
  for (let i = 0; i < DIM; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) v[i] /= norm;
  return Array.from(v);
}
function cosine(a, b) {
  let d = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) d += a[i] * b[i]; // both are already L2-normalised
  return d;
}

// ── Store I/O ─────────────────────────────────────────────────────────────────
function _load(projectKey) {
  try {
    const f = storeFile(projectKey);
    if (!fs.existsSync(f)) return { dim: DIM, records: [] };
    const j = JSON.parse(fs.readFileSync(f, "utf8"));
    if (!j || !Array.isArray(j.records)) return { dim: DIM, records: [] };
    return j;
  } catch (_) {
    return { dim: DIM, records: [] };
  }
}
function _save(projectKey, data) {
  const dir = path.join(ragRoot(), projectKey);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(storeFile(projectKey), JSON.stringify(data), "utf8");
}
function _norm(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ── Ingest ────────────────────────────────────────────────────────────────────
// { text, kind: "memory"|"doc", meta:{source,tags} } → simpan (dedupe by text).
function ingest(projectRef, item) {
  try {
    const text = String((item && item.text) || "").trim();
    if (text.length < 3) return { ok: false, err: "teks kosong" };
    const projectKey = projectKeyFrom(projectRef);
    const store = _load(projectKey);
    const nt = _norm(text);
    // Dedupe: skip when (nearly) the same text is already present.
    if (store.records.some((r) => _norm(r.text) === nt))
      return { ok: true, dedup: true };
    store.records.push({
      id:
        (item.kind || "mem") +
        "_" +
        Date.now().toString(36) +
        Math.random().toString(36).slice(2, 6),
      kind: item.kind === "doc" ? "doc" : "memory",
      text,
      vec: embed(text),
      meta: {
        source: (item.meta && item.meta.source) || "run",
        ts: Date.now(),
        tags: (item.meta && item.meta.tags) || [],
      },
    });
    if (store.records.length > MAX_RECORDS)
      store.records.splice(0, store.records.length - MAX_RECORDS);
    _save(projectKey, store);
    return { ok: true, count: store.records.length };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

// ── Retrieve ──────────────────────────────────────────────────────────────────
// query → top-k { text, kind, source, ts, score }. Filter opsional by kind.
function retrieve(projectRef, query, opts: any = {}) {
  try {
    const q = String(query || "").trim();
    if (!q) return { ok: true, results: [] };
    const k = Math.max(1, Math.min(20, opts.k || 5));
    const projectKey = projectKeyFrom(projectRef);
    const store = _load(projectKey);
    const qv = embed(q);
    const scored = store.records
      .filter((r) => !opts.kind || r.kind === opts.kind)
      .map((r) => ({
        score: cosine(qv, r.vec),
        text: r.text,
        kind: r.kind,
        source: r.meta && r.meta.source,
        ts: r.meta && r.meta.ts,
      }))
      .filter((r) => r.score > 0.02) // drop what is barely relevant
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
    return {
      ok: true,
      results: scored,
      total: store.records.length,
      projectKey,
    };
  } catch (e) {
    return { ok: false, err: e.message, results: [] };
  }
}

// Format the results for the agent to read (as tool output) — with citations.
function retrieveFormatted(projectRef, query, opts: any = {}) {
  const r = retrieve(projectRef, query, opts);
  if (!r.ok) return "retrieve gagal: " + r.err;
  if (!r.results.length)
    return "Tak ada memori/dokumen relevan (" + (r.total || 0) + " tersimpan).";
  return r.results
    .map(
      (x, i) =>
        `[${i + 1}] (${x.kind} · ${x.source || "?"} · ${x.score.toFixed(2)})\n${x.text}`,
    )
    .join("\n\n");
}

module.exports = {
  embed,
  cosine,
  ingest,
  retrieve,
  retrieveFormatted,
  projectKeyFrom,
  storeFile,
  DIM,
};
