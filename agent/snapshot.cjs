// ── WOLFSPACE Snapshot Engine ──
// Bekerja seperti "git commit otomatis" sebelum agent mengedit file.
// Menyimpan snapshot file ke .wolfspace/snapshots/<timestamp>/
// dan menyediakan rollback ke snapshot manapun.

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const QROOT = path.resolve(__dirname, "..");
const SNAP_DIR = path.join(QROOT, ".wolfspace", "snapshots");
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari
const MAX_SNAPS = 50; // max snapshot yang disimpan

// Pastikan direktori snapshot ada
function _ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Buat snapshot dari daftar file sebelum diedit.
 * @param {string[]} filePaths - array path absolut file yang akan diedit
 * @param {string} [label] - label opsional untuk snapshot ini
 * @returns {{ id: string, dir: string, files: string[], ts: number }}
 */
function createSnapshot(filePaths, label = "") {
  _ensureDir(SNAP_DIR);

  const ts = Date.now();
  const id = ts + "_" + crypto.randomBytes(3).toString("hex");
  const dir = path.join(SNAP_DIR, id);
  _ensureDir(dir);

  const savedFiles = [];
  const meta = { id, ts, label, files: [] };

  for (const fp of filePaths) {
    const abs = path.resolve(fp);
    if (!fs.existsSync(abs)) continue; // file baru, tidak perlu di-snapshot

    // Simpan dengan struktur direktori relatif terhadap QROOT
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
 * Rollback semua file dalam snapshot ke kondisi semula.
 * @param {string} snapshotId
 * @returns {{ ok: boolean, restored: string[], error?: string }}
 */
function rollback(snapshotId) {
  const dir = path.join(SNAP_DIR, snapshotId);
  if (!fs.existsSync(dir)) {
    return { ok: false, error: `Snapshot '${snapshotId}' tidak ditemukan.` };
  }

  const metaPath = path.join(dir, "_meta.json");
  if (!fs.existsSync(metaPath)) {
    return { ok: false, error: `Metadata snapshot '${snapshotId}' rusak.` };
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const restored = [];

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
 * Ambil daftar semua snapshot, diurutkan dari yang paling baru.
 * @returns {Array<{ id, ts, label, files }>}
 */
function listSnapshots() {
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
 * Hapus snapshot yang sudah lebih dari MAX_AGE_MS atau melebihi MAX_SNAPS.
 */
function _pruneOldSnapshots() {
  if (!fs.existsSync(SNAP_DIR)) return;

  const snaps = listSnapshots();
  const now = Date.now();

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

// ── Versi asinkron dari createSnapshot ──
//
// Dipanggil pada edit PERTAMA tiap sesi agent, dan di mode Electron itu terjadi
// DI DALAM proses main — pemilik BrowserWindow dan pemompa antrean pesan
// Windows. Versi sinkronnya menyalin sampai 500 berkas dengan copyFileSync lalu
// menjalankan _pruneOldSnapshots(), yang membaca _meta.json tiap snapshot
// (sampai 50) dan bisa rmSync rekursif. Terukur 285-365ms memblokir penuh
// dengan cache panas, ~1,8 detik saat dingin — semuanya waktu jendela tidak
// memompa pesan.
//
// Versi sinkron dipertahankan: rollback dan pemanggil lain memakainya, dan
// perilakunya sengaja dibuat identik supaya snapshot dari kedua jalur sama.
const fsp = fs.promises;

async function _petaBatas(items, batas, fn) {
  let i = 0;
  const pekerja = Array.from(
    { length: Math.min(batas, items.length) },
    async () => {
      while (i < items.length) await fn(items[i++]);
    },
  );
  await Promise.all(pekerja);
}

async function createSnapshotAsync(filePaths, label = "") {
  await fsp.mkdir(SNAP_DIR, { recursive: true });

  const ts = Date.now();
  const id = ts + "_" + crypto.randomBytes(3).toString("hex");
  const dir = path.join(SNAP_DIR, id);
  await fsp.mkdir(dir, { recursive: true });

  const savedFiles = [];
  const meta = { id, ts, label, files: [] };

  await _petaBatas(filePaths, 12, async (fp) => {
    const abs = path.resolve(fp);
    const rel = path.relative(QROOT, abs);
    const dest = path.join(dir, rel);
    try {
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.copyFile(abs, dest); // file baru/hilang -> ENOENT, dilewati
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
  // Prune tetap sinkron: ia hanya menyentuh direktori snapshot (bukan pohon
  // source), dan biayanya kecil dibanding penyalinan di atas.
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
