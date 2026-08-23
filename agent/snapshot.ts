// ── WOLFSPACE Snapshot Engine ──
// Works like an automatic "git commit" taken before the agent edits a file.
// Stores file snapshots under .wolfspace/snapshots/<timestamp>/
// and provides a rollback to any of them.

"use strict";

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";

/** Metadata written as _meta.json inside every snapshot directory. */
interface MetaSnapshot {
  id: string;
  ts: number;
  label: string;
  /** Paths relative to QROOT, so a snapshot stays valid if the repo moves. */
  files: string[];
}

/** What createSnapshot()/createSnapshotAsync() hand back to the caller. */
interface HasilSnapshot {
  id: string;
  dir: string;
  files: string[];
  ts: number;
}

// A rollback either restored files or explains why it could not.
//
// Written as a union because the caller in agent/self_agent.ts sits inside a
// catch block above three emits, and an `ok:false` that lost its reason would
// tell the user the project was restored when it was not.
type HasilRollback =
  | { ok: true; restored: string[]; snapshotId: string }
  | { ok: false; error: string };

const QROOT = path.resolve(__dirname, "..");
const SNAP_DIR = path.join(QROOT, ".wolfspace", "snapshots");
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_SNAPS = 50; // most snapshots kept

// Make sure the snapshot directory exists
function _ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Snapshot a list of files before they are edited.
 * @param filePaths absolute paths of the files about to be edited
 * @param label optional label for this snapshot
 * @returns {{ id: string, dir: string, files: string[], ts: number }}
 */
function createSnapshot(filePaths: string[], label = ""): HasilSnapshot {
  _ensureDir(SNAP_DIR);

  const ts = Date.now();
  const id = ts + "_" + crypto.randomBytes(3).toString("hex");
  const dir = path.join(SNAP_DIR, id);
  _ensureDir(dir);

  const savedFiles: string[] = [];
  const meta: MetaSnapshot = { id, ts, label, files: [] };

  for (const fp of filePaths) {
    const abs = path.resolve(fp);
    if (!fs.existsSync(abs)) continue; // brand-new file, nothing to snapshot

    // Stored with a directory structure relative to QROOT
    const rel = path.relative(QROOT, abs);
    const dest = path.join(dir, rel);
    _ensureDir(path.dirname(dest));
    fs.copyFileSync(abs, dest);
    savedFiles.push(rel);
    meta.files.push(rel);
  }

  // Tulis metadata
  fs.writeFileSync(
    path.join(dir, "_meta.json"),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
  _pruneOldSnapshots();

  console.log(
    `[snapshot] Created: ${id} (${savedFiles.length} files) label="${label}"`,
  );
  return { id, dir, files: savedFiles, ts };
}

/**
 * Roll every file in the snapshot back to its original state.
 * @param {string} snapshotId
 * @returns {{ ok: boolean, restored: string[], error?: string }}
 */
function rollback(snapshotId: string): HasilRollback {
  const dir = path.join(SNAP_DIR, snapshotId);
  if (!fs.existsSync(dir)) {
    return { ok: false, error: `Snapshot '${snapshotId}' tidak ditemukan.` };
  }

  const metaPath = path.join(dir, "_meta.json");
  if (!fs.existsSync(metaPath)) {
    return { ok: false, error: `Metadata snapshot '${snapshotId}' hilang.` };
  }

  // JSON.parse DIBUNGKUS. Cabang di atas mengaku menangani metadata "rusak",
  // even though it only checked that the file EXISTS — corrupt contents fell
  // straight through to here and threw.
  //
  // That throw did not stop here. rollback() is called from inside the catch
  // block in self_agent.ts, ABOVE three emits — including the one whose own
  // comment reads "ALWAYS emit adone so frontend knows the agent is done".
  // Proven by executing that block as-is: corrupt metadata -> ZERO messages
  // reach the UI, and the UI hangs forever because it never learns the run
  // ended. A failed recovery turned into a permanently frozen UI.
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch (e) {
    return {
      ok: false,
      error: `Metadata snapshot '${snapshotId}' rusak: ${e.message}`,
    };
  }
  if (!meta || !Array.isArray(meta.files)) {
    return {
      ok: false,
      error: `Metadata snapshot '${snapshotId}' tidak memuat daftar berkas.`,
    };
  }
  const restored: string[] = [];

  for (const rel of meta.files) {
    const src = path.join(dir, rel);
    const dest = path.join(QROOT, rel);
    if (!fs.existsSync(src)) continue;
    _ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    restored.push(rel);
  }

  console.log(
    `[snapshot] Rollback: ${snapshotId} → restored ${restored.length} files`,
  );
  return { ok: true, restored, snapshotId };
}

/**
 * List every snapshot, newest first.
 * @returns {Array<{ id, ts, label, files }>}
 */
function listSnapshots(): MetaSnapshot[] {
  if (!fs.existsSync(SNAP_DIR)) return [];

  return fs
    .readdirSync(SNAP_DIR)
    .filter((name) => fs.statSync(path.join(SNAP_DIR, name)).isDirectory())
    .map((name) => {
      const metaPath = path.join(SNAP_DIR, name, "_meta.json");
      if (!fs.existsSync(metaPath)) return null;
      try {
        return JSON.parse(fs.readFileSync(metaPath, "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts);
}

/**
 * Drop snapshots older than MAX_AGE_MS or beyond the MAX_SNAPS limit.
 */
function _pruneOldSnapshots() {
  if (!fs.existsSync(SNAP_DIR)) return;

  // Reads the DIRECTORY NAMES only — no _meta.json, no stat per entry.
  //
  // This used to call listSnapshots(), which opens and JSON.parses every
  // snapshot's metadata: four syscalls per snapshot, measured at 22 ms over 50
  // of them. It runs on EVERY snapshot, and a snapshot is taken on every file
  // the agent edits — so that was 22 ms of frozen window per edit, growing with
  // the number of snapshots kept. All of server.ts runs inside Electron's main
  // process, which is what turns that into "Not Responding while it works".
  //
  // Nothing is lost, because an id already IS its timestamp: createSnapshot
  // mints `${Date.now()}_${hex}`. Both things this function decides — too old,
  // too many — come straight out of the name.
  const now = Date.now();
  let nama: string[];
  try {
    nama = fs.readdirSync(SNAP_DIR);
  } catch {
    return;
  }

  const snaps: { id: string; ts: number }[] = [];
  for (const id of nama) {
    const ts = Number(id.split("_")[0]);
    // A name that is not ours is left completely alone: this function deletes
    // directories, and guessing here would delete someone else's.
    if (Number.isFinite(ts) && ts > 0) snaps.push({ id, ts });
  }
  snaps.sort((a, b) => b.ts - a.ts);

  snaps.forEach((snap, idx) => {
    const tooOld = now - snap.ts > MAX_AGE_MS;
    const tooMany = idx >= MAX_SNAPS;
    if (tooOld || tooMany) {
      try {
        fs.rmSync(path.join(SNAP_DIR, snap.id), {
          recursive: true,
          force: true,
        });
        console.log(
          `[snapshot] Pruned: ${snap.id} (tooOld=${tooOld}, tooMany=${tooMany})`,
        );
      } catch (_) {}
    }
  });
}

// ── Asynchronous version of createSnapshot ──
//
// Called on the FIRST edit of every agent session, and under Electron that
// happens INSIDE the main process — the owner of the BrowserWindow and the
// pump of the Windows message queue. The synchronous version copies up to 500
// files with copyFileSync and then runs _pruneOldSnapshots(), which reads the
// _meta.json of every snapshot (up to 50) and may rmSync recursively. Measured
// at 285-365 ms of full blocking with a warm cache, ~1.8 s cold — all of it
// time the window is not pumping messages.
//
// The synchronous version is kept: rollback and other callers use it, and its
// behaviour is deliberately identical so snapshots from either path match.
const fsp = fs.promises;

async function _petaBatas<T>(
  items: T[],
  batas: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  const pekerja = Array.from(
    { length: Math.min(batas, items.length) },
    async () => {
      while (i < items.length) await fn(items[i++]);
    },
  );
  await Promise.all(pekerja);
}

async function createSnapshotAsync(
  filePaths: string[],
  label = "",
): Promise<HasilSnapshot> {
  await fsp.mkdir(SNAP_DIR, { recursive: true });

  const ts = Date.now();
  const id = ts + "_" + crypto.randomBytes(3).toString("hex");
  const dir = path.join(SNAP_DIR, id);
  await fsp.mkdir(dir, { recursive: true });

  const savedFiles: string[] = [];
  const meta: MetaSnapshot = { id, ts, label, files: [] };

  await _petaBatas(filePaths, 12, async (fp) => {
    const abs = path.resolve(fp);
    const rel = path.relative(QROOT, abs);
    const dest = path.join(dir, rel);
    try {
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.copyFile(abs, dest); // new or missing file -> ENOENT, skipped
    } catch {
      return;
    }
    savedFiles.push(rel);
    meta.files.push(rel);
  });

  await fsp.writeFile(
    path.join(dir, "_meta.json"),
    JSON.stringify(meta, null, 2),
    "utf8",
  );
  // Pruning stays synchronous: it only touches the snapshot directory (not the
  // source tree), and its cost is small next to the copying above.
  _pruneOldSnapshots();

  console.log(
    `[snapshot] Created: ${id} (${savedFiles.length} files) label="${label}"`,
  );
  return { id, dir, files: savedFiles, ts };
}

module.exports = {
  createSnapshot,
  createSnapshotAsync,
  rollback,
  listSnapshots,
};
