// keys-path.ts — decides where cloud-keys.json lives, and nothing else.
//
// ROLE IN THE SYSTEM. Keys are PER PROJECT ROOT (the folder containing agent/),
// never one global file in ~/.wolfspace. A shared drawer would mean a fresh
// clone silently using an older installation's API keys — which reads as data
// arriving with the checkout.
//
// Canonical location: <project>/.wolfspace/cloud-keys.json, already gitignored.
// That keeps it outside both git and the tree the agent scans day to day. The
// sandbox must still refuse to read .wolfspace; this is defence in depth, not
// an OS boundary.
//
// Overrides:
//   WOLFSPACE_KEYS_PATH  = a full file path
"use strict";

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const QROOT = path.resolve(__dirname, "..");
const LEGACY_IN_REPO = path.join(QROOT, "cloud-keys.json"); // sangat lama
const LEGACY_HOME_DIR = path.join(os.homedir(), ".wolfspace");
const LEGACY_HOME_FILE = path.join(LEGACY_HOME_DIR, "cloud-keys.json");

function keysDir() {
  if (process.env.WOLFSPACE_KEYS_DIR) return process.env.WOLFSPACE_KEYS_DIR;
  // Opt-in: one drawer for every installation (the old behaviour). Off by default.
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
      // 1) Legacy at the project root (cloud-keys.json) -> move it into .wolfspace/
      if (fs.existsSync(LEGACY_IN_REPO)) {
        fs.copyFileSync(LEGACY_IN_REPO, target);
        try {
          fs.rmSync(LEGACY_IN_REPO, { force: true });
        } catch (_) {}
      }
      // 2) Do NOT automatically copy ~/.wolfspace/cloud-keys.json into every
      //    project. That is what made a clone "suddenly have API keys". Import
      //    deliberately: WOLFSPACE_IMPORT_HOME_KEYS=1 npm run app
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
