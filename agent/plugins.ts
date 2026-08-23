// The plugin system — discovery, manifests, and permissions.
//
// ONE RULE shapes this entire file:
//
//   who INSTALLS  !=  what the agent may REACH
//
// The user may install anything, from anywhere. That is the machine's. What is
// governed is not the installation but what the agent can call and with which
// capabilities. That separation exists because of one difference from VS Code:
// there a human presses the button, here the MODEL picks the tool — and the
// model reads file contents, tool output and web pages, any of which can carry
// a sentence that reads like an instruction.
//
// So a plugin whose permissions are not approved stays INSTALLED and stays
// visible in the UI. It simply has no tools at all in the model's view — not
// refused when called, but never offered to be called.
//
// THE DIFFERENCE FROM skills.ts. That older module `require()`d plugin code
// into the main process — the process that also owns the Electron window — and
// then guarded its file access with its own `startsWith(homedir())`, outside
// the broker. Here a plugin is a COMMAND run as an MCP server in a separate
// process. This module deliberately never loads plugin code.

"use strict";
// Install the .ts hook FIRST: modules below require TypeScript files, and
// this file can itself be an entry point — tests require it directly, and
// `node -e` subprocesses load it without ever going through server.cjs.
require("../scripts/ts-register.cjs");

import * as fs from "fs";
import * as path from "path";

const AKAR = path.resolve(__dirname, "..");
const DIR_PLUGIN = path.join(AKAR, "plugins");

// Capabilities a plugin MAY request. A closed list on purpose rather than a
// free string: this vocabulary has to match KOSAKATA_DEFAULT in
// broker/commandchain.ts. A permission outside the list is refused when the
// manifest is read, not silently ignored and then a surprise at call time.
const IZIN_DIKENAL = Object.freeze([
  "readFile",
  "writeFile",
  "fetch",
  "network:http",
  "network:https",
  "network:net",
  "network:tls",
  "network:dgram",
  "attachment.read",
]);

// proc.raw is DELIBERATELY absent from the list above. A plugin is a separate
// process already running its own command; handing it a raw shell would give
// back the very path the rest of this system contains.

function _amanNama(s) {
  return /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(String(s || ""));
}

/**
 * Read and VALIDATE one manifest. Never throws — a broken manifest is an
 * ordinary state (a user copied a folder from somewhere), not an accident.
 *
 * @param {string} dir the plugin folder
 * @returns {{ok: true, plugin: Plugin} | {ok: false, error: string}}
 */
function bacaManifest(dir) {
  const berkas = path.join(dir, "manifest.json");
  let mentah: any;
  try {
    mentah = fs.readFileSync(berkas, "utf8");
  } catch (e) {
    return { ok: false, error: "manifest.json tak terbaca: " + e.message };
  }

  let m: any;
  try {
    m = JSON.parse(mentah);
  } catch (e) {
    return { ok: false, error: "manifest.json bukan JSON valid: " + e.message };
  }

  const nama = m && m.nama;
  if (!_amanNama(nama)) {
    return {
      ok: false,
      error: "nama tak sah (huruf/angka/._- , maksimal 64): " + String(nama),
    };
  }

  // command is REQUIRED. A plugin is run, not required — there is no "entry
  // file" path loaded into this process.
  if (!m.command || typeof m.command !== "string") {
    return { ok: false, error: "field 'command' wajib (perintah server MCP)" };
  }
  if (m.args != null && !Array.isArray(m.args)) {
    return { ok: false, error: "field 'args' harus array bila ada" };
  }

  const izin = Array.isArray(m.izin) ? m.izin : [];
  const asing = izin.filter((z) => !IZIN_DIKENAL.includes(z));
  if (asing.length) {
    return {
      ok: false,
      error:
        "izin tak dikenal: " +
        asing.join(", ") +
        " (yang sah: " +
        IZIN_DIKENAL.join(", ") +
        ")",
    };
  }

  return {
    ok: true,
    plugin: {
      nama,
      versi: String(m.versi || "0.0.0"),
      ket: String(m.ket || m.description || ""),
      command: m.command,
      args: m.args || [],
      izin,
      dir,
      // Decided by the USER through the UI, not by the manifest. A manifest only
      // ASKS.
      disetujui: false,
    },
  };
}

/**
 * Scan the plugins/ folder. A broken manifest is NOT dropped silently — it is
 * returned as `rusak` so the UI can show what is wrong. A plugin vanishing
 * without a trace is exactly how skills.ts came to be forgotten.
 *
 * @returns {{plugin: Plugin[], rusak: {dir: string, error: string}[]}}
 */
function pindai() {
  const plugin: any[] = [];
  const rusak: any[] = [];
  let isi: any;
  try {
    isi = fs.readdirSync(DIR_PLUGIN, { withFileTypes: true });
  } catch (_) {
    return { plugin, rusak }; // the folder does not exist yet: not an error
  }
  for (const d of isi) {
    if (!d.isDirectory() || d.name.startsWith(".")) continue;
    const dir = path.join(DIR_PLUGIN, d.name);
    const r = bacaManifest(dir);
    if (r.ok) plugin.push(r.plugin);
    else rusak.push({ dir: d.name, error: r.error });
  }
  plugin.sort((a, b) => a.nama.localeCompare(b.nama));
  return { plugin, rusak };
}

/**
 * The capability name for one plugin. One plugin is one capability in the
 * genesis vocabulary, so `buatRuleset({ tanpa: ["plugin.kaggle"] })` locks that
 * plugin for the whole session — it cannot be loosened midway.
 *
 * @param {string} nama
 * @returns {string}
 */
function kapabilitas(nama) {
  return "plugin." + String(nama);
}

// The approvals file. Written by the UI when a user approves a plugin's
// permissions. Deliberately SEPARATE from the manifest: the manifest is written
// by the plugin's author and only ASKS; this file is written by the user and
// GRANTS. Merging them would let a plugin author approve themselves.
const BERKAS_SETUJU = path.join(DIR_PLUGIN, "_disetujui.json");

/**
 * The plugins whose permissions the user has approved. Never throws: no file
 * yet means nothing approved yet — deny-by-default, exactly like an empty
 * ruleset in CommandChain.
 *
 * @returns {string[]}
 */
function disetujui() {
  try {
    const j = JSON.parse(fs.readFileSync(BERKAS_SETUJU, "utf8"));
    const d = Array.isArray(j) ? j : j && j.disetujui;
    return Array.isArray(d) ? d.filter(_amanNama) : [];
  } catch (_) {
    return [];
  }
}

/**
 * The plugin capabilities that belong in the genesis vocabulary.
 *
 * TWO conditions, and both must hold: the plugin really exists on disk with a
 * valid manifest, AND the user has approved it. A name listed in the approvals
 * file whose plugin has since been deleted produces no capability at all — a
 * stale approval must not bring something back to life.
 *
 * @returns {string[]}
 */
function kapabilitasDisetujui() {
  const ada = new Set(pindai().plugin.map((p) => p.nama));
  return disetujui()
    .filter((n) => ada.has(n))
    .map(kapabilitas);
}

/**
 * Install a plugin: write plugins/<name>/manifest.json.
 *
 * Installing DELIBERATELY copies and downloads no code. All that is written is
 * the manifest — a command to RUN something that already exists (npx, or a
 * script on disk). So there is no "fetch code from a URL and save it" path,
 * which is what skill_install had and what made it a hole.
 *
 * Installing does NOT grant permission. The manifest only RECORDS what was
 * asked for; approval remains a separate action through _disetujui.json. That is
 * why installing a plugin can never make something immediately reachable by the
 * agent.
 *
 * @param {{nama: string, command: string, args?: string[], izin?: string[], ket?: string, versi?: string}} b
 * @returns {{ok: true, dir: string} | {ok: false, error: string}}
 */
function pasang(p) {
  const nama = String((p && p.nama) || "").trim();
  // Validated BEFORE touching a path. "../something" would escape plugins/ and
  // overwrite a file elsewhere; _amanNama refuses any path separator.
  if (!_amanNama(nama)) {
    return {
      ok: false,
      error:
        "nama tak sah: harus diawali huruf/angka, hanya boleh huruf, angka, titik, garis bawah, dan strip",
    };
  }
  const command = String((p && p.command) || "").trim();
  if (!command) return { ok: false, error: "perintah wajib diisi" };

  const args = Array.isArray(p && p.args) ? p.args.map(String) : [];
  const izin = Array.isArray(p && p.izin) ? p.izin.map(String) : [];
  const asing = izin.filter((z) => !IZIN_DIKENAL.includes(z));
  if (asing.length) {
    return { ok: false, error: "izin tak dikenal: " + asing.join(", ") };
  }

  const dir = path.join(DIR_PLUGIN, nama);
  // A second guard after _amanNama: confirm the joined result really is inside
  // plugins/. Cheap, and it catches what slips past any regex.
  if (path.relative(DIR_PLUGIN, dir).startsWith("..")) {
    return { ok: false, error: "jalur keluar dari folder plugins" };
  }
  if (fs.existsSync(path.join(dir, "manifest.json"))) {
    return { ok: false, error: "plugin '" + nama + "' sudah terpasang" };
  }

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "manifest.json"),
      JSON.stringify(
        {
          nama,
          versi: String((p && p.versi) || "0.1.0"),
          ket: String((p && p.ket) || ""),
          command,
          args,
          izin,
        },
        null,
        2,
      ),
    );
  } catch (e) {
    return { ok: false, error: "gagal menulis manifest: " + e.message };
  }
  return { ok: true, dir };
}

/**
 * Uninstall a plugin: remove its folder AND its approval.
 *
 * The approval goes too so that reinstalling a plugin with the same name does
 * not silently inherit the old permissions.
 *
 * @param {string} nama
 * @returns {{ok: boolean, error?: string}}
 */
function copot(nama) {
  const n = String(nama || "").trim();
  if (!_amanNama(n)) return { ok: false, error: "nama tak sah" };
  const dir = path.join(DIR_PLUGIN, n);
  if (path.relative(DIR_PLUGIN, dir).startsWith("..")) {
    return { ok: false, error: "jalur keluar dari folder plugins" };
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    const sisa = disetujui().filter((x) => x !== n);
    fs.writeFileSync(BERKAS_SETUJU, JSON.stringify(sisa.sort(), null, 2));
  } catch (e) {
    return { ok: false, error: e.message };
  }
  return { ok: true };
}

/**
 * MCP server configuration for APPROVED plugins, in the same shape as
 * config/mcp.json.
 *
 * WHY THIS WAY. mcp-client.ts already solved the hard parts: spawning, JSON-RPC
 * framing, the handshake, cleaning up orphaned processes, PID files, lazy start,
 * and surviving a backend hot reload. Rewriting all of that for plugins would
 * repeat the "two surfaces" pattern that has bitten this repo repeatedly — two
 * copies that must be fixed together, one of which will certainly be forgotten.
 *
 * So plugins have no launcher of their own. They ride the existing MCP path, and
 * all that is added is the gate.
 *
 * `cwd` is deliberately the repo root: manifests write relative args
 * ("agent/mcp-servers/kaggle-mcp.cjs"), and without a fixed cwd the command
 * would depend on where WOLFSPACE was started from.
 *
 * @returns {Record<string, {command: string, args: string[], cwd: string, _plugin: true}>}
 */
function konfigMcp() {
  const out: Record<string, any> = {};
  const setuju = new Set(disetujui());
  for (const p of pindai().plugin) {
    if (!setuju.has(p.nama)) continue; // not approved = never started
    out[p.nama] = {
      command: p.command,
      args: p.args,
      cwd: AKAR,
      // A marker so mcp-client knows this entry MUST pass admission, unlike the
      // older entries in config/mcp.json.
      _plugin: true,
    };
  }
  return out;
}

/**
 * Does this MCP server name come from a plugin (rather than config/mcp.json)?
 *
 * DELIBERATELY uses pindai(), NOT konfigMcp(). The difference decides which way
 * it fails: konfigMcp() loads only what is APPROVED, so revoking an approval
 * would make this answer `false` — and its caller would conclude "not a plugin,
 * no gate needed". Revoking a permission would OPEN the gate.
 *
 * This function answers "is it a plugin", not "is it allowed". Two different
 * questions, and mixing them produces a fail-open.
 *
 * @param {string} nama
 * @returns {boolean}
 */
function adalahPlugin(nama) {
  const n = String(nama);
  return pindai().plugin.some((p) => p.nama === n);
}

module.exports = {
  DIR_PLUGIN,
  BERKAS_SETUJU,
  IZIN_DIKENAL,
  bacaManifest,
  pindai,
  kapabilitas,
  disetujui,
  kapabilitasDisetujui,
  konfigMcp,
  adalahPlugin,
  pasang,
  copot,
};
