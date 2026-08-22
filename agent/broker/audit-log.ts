// ── Broker audit trail that PERSISTS to disk ──
//
// WHY THIS EXISTS. Before it, `Broker.audit` was only an in-memory array, and
// agent/tools/index.cjs built a NEW Broker on every capability_exec call. That
// meant ALLOW/DENY/BLOCKED records died with the call that produced them: seen
// once in the tool result, then gone. Nothing left to read tomorrow.
//
// That is not merely inconvenient. During development a zone ran for HOURS with
// no network containment and was only noticed because someone happened to test
// it — not because it was recorded. An audit trail that does not persist is not
// an audit trail.
//
// APPEND-ONLY, and only as far as that can honestly be promised. This file is
// only ever appended to, never rewritten in place. But a process with write
// permission can still truncate it — real immutability needs OS support
// (chattr +a, WORM) that cannot be relied on across platforms. Do not claim more.
"use strict";

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

/** One chained record as it lands in the JSONL ledger. */
export interface RekamRantai {
  seq: number;
  prevHash: string | null;
  hash: string;
  ts: string;
  pid: number;
  capability: string;
  decision: string;
  reason?: string;
  params?: unknown;
  resultBytes?: number;
  /** Containment status (CommandChain phase 2: bash/proc.raw carry this). */
  kurungan?: unknown;
  [k: string]: unknown;
}

/** What catat()/catatGenesis() report back about the record they wrote. */
export interface HasilTulis {
  seq: number;
  hash: string;
}

/** Verdict of a whole-file chain verification. */
export interface HasilVerifikasi {
  ok: boolean;
  panjang: number;
  /** seq of the first broken record, or null when the chain is intact. */
  putusDi: number | null;
  alasan?: string;
}

/** The subset of a Broker audit entry this module persists. */
export interface EntriMasuk {
  ts?: number;
  capability: string;
  decision: string;
  reason?: string | null;
  params?: unknown;
  resultBytes?: number;
  kurungan?: unknown;
}

const DIR =
  process.env.WOLFSPACE_AUDIT_DIR ||
  path.join(__dirname, "..", "..", ".wolfspace", "audit");
const BERKAS = path.join(DIR, "broker.jsonl");
const ROTASI_BYTE = 2 * 1024 * 1024;
const SIMPAN_ARSIP = 5;

// Long values are TRUNCATED, not stored. params.content for writeFile holds the
// ENTIRE file contents — writing that raw would bloat the log and, worse, copy
// possibly secret data into a plain text file. What an audit needs is WHAT was
// accessed, not the data itself.
const NILAI_MAKS = 200;
// Field names whose contents must never appear at all, however short.
const KUNCI_RAHASIA =
  /(key|token|secret|password|passwd|auth|cookie|credential)/i;

function ringkasNilai(v: unknown): unknown {
  if (typeof v === "string") {
    if (v.length <= NILAI_MAKS) return v;
    return v.slice(0, NILAI_MAKS) + "…<" + v.length + " char total>";
  }
  if (v && typeof v === "object")
    return "<" + (Array.isArray(v) ? "array" : "object") + ">";
  return v;
}

function ringkasParams(params: unknown): unknown {
  if (!params || typeof params !== "object") return params;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    // "<disunting>" is written to DISK and is asserted by the audit tests, so it
    // stays verbatim: changing it would make old ledgers disagree with new code.
    out[k] = KUNCI_RAHASIA.test(k) ? "<disunting>" : ringkasNilai(v);
  }
  return out;
}

let _sudahLaporGagal = false;
function laporGagalSekali(e: unknown): void {
  if (_sudahLaporGagal) return;
  _sudahLaporGagal = true;
  // A failure to write the audit does NOT fail the operation — the agent must
  // not be crippled by a full disk. But it must not be silent either: an audit
  // that quietly stops recording is exactly as bad as having no audit.
  try {
    process.stderr.write(
      "[WOLFSPACE:audit] WARNING: the broker audit trail FAILED to write to disk.\n" +
        "  file   : " +
        BERKAS +
        "\n" +
        "  cause  : " +
        (e && (e as Error).message) +
        "\n" +
        "  effect : the operation still runs, but nothing is being recorded.\n",
    );
  } catch (_) {}
}

function rotasiBilaPerlu(): void {
  let st;
  try {
    st = fs.statSync(BERKAS);
  } catch (_) {
    return; // no file yet — nothing to rotate
  }
  if (st.size < ROTASI_BYTE) return;
  const cap = new Date().toISOString().replace(/[:.]/g, "-");
  fs.renameSync(BERKAS, path.join(DIR, "broker-" + cap + ".jsonl"));
  // Old archives are dropped so this cannot grow without bound — the lesson from
  // a debug log that once reached 43 MB/day before it had any rotation.
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

// ── The chain (CommandChain, phase 1) ──
//
// Every record carries seq + prevHash + hash, chained as:
//     hash(rec) = sha256(prevHash + canonical JSON of rec-without-hash)
// Altering one old record breaks every hash after it, which makes the chain
// TAMPER-EVIDENT — a rewritten history is detectable. It is NOT tamper-proof: a
// process with write permission can still rewrite the whole file along with its
// hashes. The difference matters and is stated plainly (see docs/COMMANDCHAIN.md).
//
// _lastHash/_lastSeq live in memory and are recovered from the file tail when
// cold, so the chain continues across processes AND across rotations (the first
// entry of a new file links to the last hash of the old one).
let _lastHash: string | null = null;
let _lastSeq = -1;
let _dimuat = false;

function _hashRec(prevHash: string | null, rec: unknown): string {
  return crypto
    .createHash("sha256")
    .update((prevHash || "") + JSON.stringify(rec))
    .digest("hex");
}

/** Recover chain state from the last valid line of the active file. */
function _muatEkor(): void {
  _dimuat = true;
  try {
    const isi = fs.readFileSync(BERKAS, "utf8").trimEnd();
    if (!isi) return;
    const baris = isi.split("\n");
    for (let i = baris.length - 1; i >= 0; i--) {
      try {
        const j = JSON.parse(baris[i] as string);
        if (typeof j.seq === "number" && j.hash) {
          _lastSeq = j.seq;
          _lastHash = j.hash;
          return;
        }
      } catch (_) {
        /* malformed line — try the one before it */
      }
    }
  } catch (_) {
    /* file does not exist yet — start from an empty genesis */
  }
}

// Writes ONE chained record. `rec` is already in final form (fields ordered),
// WITHOUT seq/prevHash/hash — all three are added here.
function _tulisBerantai(rec: Record<string, unknown>): HasilTulis {
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

// Genesis: the seq-0 entry that anchors the session RULESET. Written only while
// the ledger is still empty — genesis has to be genuinely first. The ruleset is
// frozen before it arrives; its hash locks the contents into the chain.
//
// "__genesis__" is an on-disk marker asserted by the tests; it stays verbatim.
function catatGenesis(ruleset: unknown): HasilTulis | null {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    if (!_dimuat) _muatEkor();
    if (_lastSeq !== -1) return null; // already has content — genesis cannot be inserted
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

// One JSON line per record. This format was chosen so it can be read while being
// written (tail) and cannot be ruined entirely by a single malformed line —
// unlike one big JSON array, which must be whole to parse at all.
function catat(entry: EntriMasuk): void {
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
      kurungan: entry.kurungan || undefined,
    });
  } catch (e) {
    laporGagalSekali(e);
  }
}

// Verify the INTEGRITY of the chain within one file: every hash must match its
// contents, and each line's prevHash must equal the previous line's hash.
// Returns { ok, panjang, putusDi } — putusDi is the first broken seq, or null.
function verifikasiRantai(berkas?: string): HasilVerifikasi {
  const f = berkas || BERKAS;
  let baris: string[];
  try {
    baris = fs.readFileSync(f, "utf8").trimEnd().split("\n").filter(Boolean);
  } catch (_) {
    return { ok: true, panjang: 0, putusDi: null }; // no file = empty chain, valid
  }
  let prev: string | null = null;
  for (let i = 0; i < baris.length; i++) {
    let rec: RekamRantai;
    try {
      rec = JSON.parse(baris[i] as string);
    } catch (_) {
      return {
        ok: false,
        panjang: baris.length,
        putusDi: i,
        alasan: "malformed line",
      };
    }
    const { hash, ...tanpaHash } = rec;
    // The link: this line's prevHash must equal the previous line's hash (except
    // the file's first line, which may link into an already-rotated file).
    //
    // The word "tautan" is kept in this message because tests/commandchain.test.js
    // asserts /tautan/ on it to prove a broken LINK is reported distinctly from a
    // bad hash. Translating it silently would blur the two failure modes apart.
    if (i > 0 && rec.prevHash !== prev) {
      return {
        ok: false,
        panjang: baris.length,
        putusDi: rec.seq,
        alasan: "broken tautan (chain link)",
      };
    }
    // Integrity: the recorded hash must equal the recomputed one.
    if (_hashRec(rec.prevHash, tanpaHash) !== hash) {
      return {
        ok: false,
        panjang: baris.length,
        putusDi: rec.seq,
        alasan: "hash mismatch",
      };
    }
    prev = hash;
  }
  return { ok: true, panjang: baris.length, putusDi: null };
}

export { catat, catatGenesis, verifikasiRantai, ringkasParams, BERKAS, DIR };
