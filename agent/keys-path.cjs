// ── Resolve where cloud-keys.json lives ──
//
// Keys are PER PROJECT ROOT (folder yang memuat agent/), bukan satu file global
// di ~/.wolfspace. Tanpa itu, clone GitHub di folder lain ikut memakai API key
// instalasi lama di PC yang sama — terasa seperti data "ikut terpasang", padahal
// yang terjadi adalah satu laci bersama untuk semua salinan kode.
//
// Lokasi kanonik: <project>/.wolfspace/cloud-keys.json  (sudah di .gitignore)
//
// Masih di LUAR tree sumber yang di-scan agent sehari-hari, dan tetap di luar git.
// Sandbox/AppContainer tetap harus menolak baca .wolfspace; ini defense in depth,
// bukan batas keamanan OS.
//
// Override:
//   WOLFSPACE_KEYS_PATH  = path file penuh
//   WOLFSPACE_KEYS_DIR   = folder (file = cloud-keys.json di dalamnya)
//   WOLFSPACE_SHARE_KEYS=1 + default lama: pakai ~/.wolfspace (hanya jika sadar
//     ingin semua clone berbagi — tidak disarankan)
//
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const QROOT = path.resolve(__dirname, "..");
const LEGACY_IN_REPO = path.join(QROOT, "cloud-keys.json"); // sangat lama
const LEGACY_HOME_DIR = path.join(os.homedir(), ".wolfspace");
const LEGACY_HOME_FILE = path.join(LEGACY_HOME_DIR, "cloud-keys.json");

function keysDir() {
  if (process.env.WOLFSPACE_KEYS_DIR) return process.env.WOLFSPACE_KEYS_DIR;
  // Opt-in: satu laci untuk semua instalasi (perilaku lama). Default OFF.
  if (
    process.env.WOLFSPACE_SHARE_KEYS === "1" ||
    process.env.WOLFSPACE_SHARE_KEYS === "true"
  ) {
    return LEGACY_HOME_DIR;
  }
  return path.join(QROOT, ".wolfspace");
}

function resolveKeysPath() {
  if (process.env.WOLFSPACE_KEYS_PATH) return process.env.WOLFSPACE_KEYS_PATH;
  const dir = keysDir();
  const target = path.join(dir, "cloud-keys.json");
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(target)) {
      // 1) Legacy di root project (cloud-keys.json) → pindah ke .wolfspace/
      if (fs.existsSync(LEGACY_IN_REPO)) {
        fs.copyFileSync(LEGACY_IN_REPO, target);
        try {
          fs.rmSync(LEGACY_IN_REPO, { force: true });
        } catch (_) {}
      }
      // 2) JANGAN otomatis menyalin ~/.wolfspace/cloud-keys.json ke setiap
      //    project. Itu penyebab clone "tiba-tiba ber-API key". Impor sadar:
      //    WOLFSPACE_IMPORT_HOME_KEYS=1 npm run app
      else if (
        (process.env.WOLFSPACE_IMPORT_HOME_KEYS === "1" ||
          process.env.WOLFSPACE_IMPORT_HOME_KEYS === "true") &&
        fs.existsSync(LEGACY_HOME_FILE) &&
        path.resolve(dir) !== path.resolve(LEGACY_HOME_DIR)
      ) {
        fs.copyFileSync(LEGACY_HOME_FILE, target);
      }
    }
  } catch (_) {}
  return target;
}

module.exports = {
  resolveKeysPath,
  LEGACY_PATH: LEGACY_IN_REPO,
  keysDir,
  LEGACY_HOME_FILE,
};
