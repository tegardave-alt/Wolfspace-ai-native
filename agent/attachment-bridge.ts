// attachment-bridge.ts — how an attached file reaches the agent: the contents
// cross over, the address never does.
//
// ROLE IN THE SYSTEM. Attach used to write the file to public/uploads/ and
// paste its PATH into the message. Once the agent was confined to one worktree
// that path was out of scope and the broker refused it — containment killing
// attachments by working correctly. Widening the containment would have fixed
// it by weakening it; this fixes it by changing what crosses.
//
// THE RULE: serahkan() takes CONTENTS and a NAME. No path parameter exists, so
// there is nothing to strip, sanitise or leak. A handle→path map would still be
// a door, merely guarded. The consequence is deliberate: afterwards nothing in
// the system knows where the file came from, so "fetch something else from that
// directory" is not refused — it has no route.
//
// STORAGE: the backend process's memory, never disk. Under Electron the backend
// is the MAIN process, so attachments survive a renderer reload (frequent here:
// auto-rollback, hot reload) and die with the app. Nothing to clean up.
//
// CONNECTS TO
//   imports  crypto only
//   used by  agent/self_agent.ts, agent/tools/index.ts, server.ts

// @ts-check
"use strict";

import * as crypto from "crypto";

/**
 * The handover result. A UNION, not `{ok:boolean, id?:string, ...}`.
 *
 * The loose shape would allow `{ok:true}` with NO id — and the handle IS the
 * capability, so a success without one is not merely odd, it is a dead end
 * discovered at the caller. The union closes that at the declaration: success
 * always carries a handle, failure always carries a reason.
 *
 * Note also what is in NEITHER branch: no field about where the file came from.
 * That is not an oversight — it is the point of this module, and now it is
 * written into its contract too.
 *
 * @typedef {{ ok: true, id: string, nama: string, bytes: number, tipe: string|null }
 *         | { ok: false, error: string }} HasilSerah
 */

/**
 * The result of reading an attachment.
 *
 * The `biner` branch is deliberately separate from an ordinary failure: a
 * caller needs to tell "unknown" from "present but not readable as text",
 * because the second still carries a name and a size worth showing.
 *
 * @typedef {{ ok: true, nama: string, bytes: number, isi: string }
 *         | { ok: false, biner: true, nama: string, bytes: number, error: string }
 *         | { ok: false, error: string }} HasilAmbil
 */

// Bounded because the contents live in the memory of the window's owner process.
const MAKS_PER_BERKAS = 8 * 1024 * 1024; // 8 MB
const MAKS_TOTAL = 32 * 1024 * 1024; // seluruh sesi
const MAKS_JUMLAH = 50;

// A singleton on globalThis, as in mcp-client: a backend hot reload drops
// require.cache, and without this every user attachment would vanish mid-session
// just because a source file was touched.
const _G = globalThis;
if (!_G.__wolfspaceLampiran) _G.__wolfspaceLampiran = new Map();
const _simpan = _G.__wolfspaceLampiran;

// A filename, NOT a location.
//
// In the Electron renderer a File object has a non-standard `.path` holding the
// real absolute path. Even if a caller mistakenly passes that here as `nama`,
// this function cuts it down to the filename alone: drive letters, Windows and
// POSIX separators, and `..` segments all fall away. So address leakage does not
// depend on caller discipline.
function _namaAman(nama) {
  let s = String(nama == null ? "" : nama);
  s = s.replace(/^[A-Za-z]:/, ""); // C:\... -> \...
  s = s.split(/[\\/]/).pop() || ""; // ambil segmen TERAKHIR saja
  s = s.replace(/^\.+/, ""); // ".." / ".hidden" -> buang titik depan
  s = s.replace(/[\x00-\x1f]/g, "").trim();
  return s.slice(0, 120) || "unnamed";
}

function _totalByte() {
  let n = 0;
  for (const v of _simpan.values()) n += v.isi.length;
  return n;
}

/**
 * Hand one file over to the agent side.
 *
 * There is NO path parameter — that is the point of this module, not an
 * oversight.
 *
 * @param {object} b
 * @param {string} b.nama  display name; cut down to a basename whatever it holds
 * @param {Buffer|Uint8Array|string} b.isi  the file CONTENTS, already read by the caller
 * @param {string} [b.tipe] MIME from the file picker, informational only
 * @returns {HasilSerah}
 */
function serahkan(b) {
  const nama = _namaAman(b && b.nama);
  const mentah = b && b.isi;
  if (mentah == null) return { ok: false, error: "empty content" };

  const isi = Buffer.isBuffer(mentah)
    ? mentah
    : typeof mentah === "string"
      ? Buffer.from(mentah, "utf8")
      : Buffer.from(mentah);

  if (isi.length > MAKS_PER_BERKAS)
    return {
      ok: false,
      error:
        "file " +
        Math.round(isi.length / 1024) +
        " KB exceeds the limit " +
        MAKS_PER_BERKAS / 1024 / 1024 +
        " MB",
    };
  if (_simpan.size >= MAKS_JUMLAH)
    return {
      ok: false,
      error: "session attachments already at " + MAKS_JUMLAH,
    };
  if (_totalByte() + isi.length > MAKS_TOTAL)
    return {
      ok: false,
      error: "total lampiran sesi melebihi " + MAKS_TOTAL / 1024 / 1024 + " MB",
    };

  // Random and long: the handle IS the capability. A guessable handle is the
  // same as no guard at all — the agent would simply try sequential ids.
  const id = "att_" + crypto.randomBytes(12).toString("hex");

  _simpan.set(id, {
    nama,
    isi,
    tipe: String((b && b.tipe) || "") || null,
    ts: Date.now(),
  });

  // What is returned deliberately carries nothing about the file's origin.
  return { ok: true, id, nama, bytes: isi.length, tipe: (b && b.tipe) || null };
}

// A binary file is returned as neither text nor base64.
//
// A 240 KB PDF becomes ~320 KB of base64 — roughly 80 thousand tokens, burning
// the whole context window on something the model still cannot read. Returning
// an actionable explanation is more honest.
function _tampakBiner(buf) {
  const n = Math.min(buf.length, 4096);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true; // NUL = biner
  return false;
}

/**
 * Read the contents of an attachment that has ALREADY been handed over.
 *
 * What is read is the COPY that crossed over, not a file on the original disk —
 * so repeated reads never touch any directory. That is why a handle may
 * deliberately be used many times: the agent's context is often trimmed and it
 * needs to re-read, while re-reading here grants no additional access.
 *
 * @param {string} id the handle serahkan() returned; NOT a path
 * @returns {HasilAmbil}
 */
function ambil(id) {
  const a = _simpan.get(String(id || ""));
  if (!a) return { ok: false, error: "unknown attachment: " + id };
  if (_tampakBiner(a.isi))
    return {
      ok: false,
      biner: true,
      nama: a.nama,
      bytes: a.isi.length,
      error:
        "binary file (" +
        a.nama +
        ", " +
        a.isi.length +
        " bytes) — cannot be read as text",
    };
  return {
    ok: true,
    nama: a.nama,
    bytes: a.isi.length,
    isi: a.isi.toString("utf8"),
  };
}

// The attachments that exist. Deliberately metadata only — no contents, and
// above all no origin. Used by the UI to show what has been handed over.
function daftar() {
  return [..._simpan.entries()].map(([id, a]) => ({
    id,
    nama: a.nama,
    bytes: a.isi.length,
    tipe: a.tipe,
    ts: a.ts,
  }));
}

function lupakan(id) {
  return _simpan.delete(String(id || ""));
}

function bersihkan() {
  _simpan.clear();
}

module.exports = {
  serahkan,
  ambil,
  daftar,
  lupakan,
  bersihkan,
  _namaAman,
  MAKS_PER_BERKAS,
  MAKS_TOTAL,
  MAKS_JUMLAH,
};
