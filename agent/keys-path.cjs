// ── Resolve where cloud-keys.json lives ──
// Keeps the plaintext API-key file OUT of the project tree so code run through
// the sandbox (which has full OS filesystem access — JS capability roots do NOT
// constrain a spawned process) can't read the obvious <project>/cloud-keys.json.
//
// LIMITATION (be honest): this reduces blast radius, it does not eliminate risk.
// The file still lives under the user's home dir; a spawned process that the user
// can run can still read it if it knows/guesses the path. Real isolation needs an
// OS-level sandbox (Job Object + restricted token / container). This is defense in
// depth, not a security boundary.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const QROOT = path.resolve(__dirname, '..');
const LEGACY_PATH = path.join(QROOT, 'cloud-keys.json'); // old in-repo location

function keysDir() {
  return process.env.WOLFSPACE_KEYS_DIR || path.join(os.homedir(), '.wolfspace');
}

// Canonical path to the keys file. Performs a one-time migration out of the
// project tree the first time it runs (copies then deletes the legacy file).
function resolveKeysPath() {
  if (process.env.WOLFSPACE_KEYS_PATH) return process.env.WOLFSPACE_KEYS_PATH;
  const dir = keysDir();
  const target = path.join(dir, 'cloud-keys.json');
  try {
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(target) && fs.existsSync(LEGACY_PATH)) {
      fs.copyFileSync(LEGACY_PATH, target);
      try { fs.rmSync(LEGACY_PATH, { force: true }); } catch (_) {}
    }
  } catch (_) {}
  return target;
}

module.exports = { resolveKeysPath, LEGACY_PATH, keysDir };
