// The agent noticing something and saying so, without being asked.
//
// ── WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT ────────────────────────────
//
// It wakes the agent to LOOK and REPORT. It never edits, never runs a command,
// never touches the network beyond the model call — and that is enforced by
// handing the run a tool array with nothing else in it (see `hanyaBaca` in
// self_agent.ts), not by asking the model to be careful. A prompt is advice; a
// missing tool is a fact.
//
// ── WHY EVERY LIMIT BELOW EXISTS ─────────────────────────────────────────────
//
// This is the only part of WOLFSPACE that spends the user's money without the
// user doing anything. Left ungoverned it is not a feature, it is a leak, and
// the failure is invisible: nobody notices a background run that costs a little
// each time. So the limits are not defensive habit, each one closes something
// specific:
//
//   TENANG (quiet period)  saving a file is not one event, it is a burst —
//                          the editor writes, a formatter rewrites, a build
//                          touches an output. Waiting for the noise to stop
//                          turns a burst into one report.
//   JEDA_MINIMUM           two unrelated bursts a second apart are still two
//                          bursts. This is the floor between reports whatever
//                          the quiet period decided.
//   MAKS_PER_JAM           the backstop for the case nobody predicted: a
//                          watcher loop, a generated file rewriting itself, a
//                          sync tool. Without a ceiling that is unbounded spend.
//   satu berjalan          a slow model plus a busy folder queues runs behind
//                          each other, and each one reports on a state that has
//                          already changed.
//
// ── OFF BY DEFAULT IS NOT THE SAME AS DISABLED ───────────────────────────────
//
// `aktif` starts false in config.json. A feature that spends money on its own
// must be switched on deliberately once, by the person paying — not arrive
// already running because it shipped in an installer.
"use strict";

import * as fs from "fs";
import * as path from "path";

const { dlog } = require("./debug.ts");

/** Milliseconds of silence before a burst of changes counts as finished. */
const TENANG = 20000;
/** Floor between two reports, whatever the quiet period says. */
const JEDA_MINIMUM = 90000;
/** The ceiling nobody should ever reach. */
const MAKS_PER_JAM = 12;
/** Files whose changes are never worth waking anything for. */
const ABAIKAN =
  /(^|[\\/])(node_modules|\.git|dist|dist-app|vendor|_agent_backups|_archive|artifacts|\.wolfspace|git_version|coverage)([\\/]|$)|\.(log|lock|map|br|gz|png|jpe?g|gif|webp|ico|woff2?|ttf)$|app\.build\.js$/i;
/** Only source is interesting; a changed README is not a code question. */
const PERHATIKAN = /\.(ts|tsx|js|jsx|cjs|mjs|py|json|css|html)$/i;

interface Keadaan {
  aktif: boolean;
  jam: any;
  berubah: Set<string>;
  sedangJalan: boolean;
  terakhirLapor: number;
  capJam: number[];
  pengawas: any[];
}

// A singleton on globalThis, following mcp-client and attachment-bridge: a
// backend hot reload drops require.cache, and without this the watchers would
// be re-created on every edit while the old ones kept running.
const _G: any = globalThis as any;
if (!_G.__wolfspaceReaktif) {
  _G.__wolfspaceReaktif = {
    aktif: false,
    jam: null,
    berubah: new Set<string>(),
    sedangJalan: false,
    terakhirLapor: 0,
    capJam: [],
    pengawas: [],
  } as Keadaan;
}
const S: Keadaan = _G.__wolfspaceReaktif;

/** How many reports in the last hour — the window slides, it does not reset. */
function _dalamJam() {
  const batas = Date.now() - 3600000;
  S.capJam = S.capJam.filter((t) => t > batas);
  return S.capJam.length;
}

/**
 * Whether a report may happen right now, and if not, why.
 *
 * Returns the REASON rather than a bare false: a feature that silently declines
 * to do the thing it exists for is indistinguishable from a broken one, and the
 * log is the only place anyone can find out which.
 */
function bolehLapor(): { boleh: boolean; sebab?: string } {
  if (!S.aktif) return { boleh: false, sebab: "switched off" };
  if (S.sedangJalan)
    return { boleh: false, sebab: "a report is already running" };
  const sejak = Date.now() - S.terakhirLapor;
  if (S.terakhirLapor && sejak < JEDA_MINIMUM) {
    return {
      boleh: false,
      sebab: "only " + Math.round(sejak / 1000) + "s since the last report",
    };
  }
  if (_dalamJam() >= MAKS_PER_JAM) {
    return {
      boleh: false,
      sebab: "hourly ceiling of " + MAKS_PER_JAM + " reached",
    };
  }
  return { boleh: true };
}

/** Worth waking for? Cheap checks only — this runs on every filesystem event. */
function berkasMenarik(f: string) {
  if (!f) return false;
  if (ABAIKAN.test(f)) return false;
  return PERHATIKAN.test(f);
}

/**
 * The brief the reactive run is given.
 *
 * SHORT ON PURPOSE. This run was not asked for, so its output competes with
 * whatever the user is actually doing. A report that needs scrolling is a report
 * that gets ignored, and an ignored report still cost money to produce.
 */
function _perintah(berkas: string[]) {
  const daftar = berkas
    .slice(0, 12)
    .map((f) => "  " + f)
    .join("\n");
  return (
    "These files just changed on disk:\n" +
    daftar +
    (berkas.length > 12 ? "\n  …and " + (berkas.length - 12) + " more" : "") +
    "\n\nRead what changed and report anything the person working here would " +
    "want to know NOW: a break in logic, a contradiction with another part of " +
    "the code, something started and not finished, a test that no longer " +
    "matches what it tests.\n\n" +
    "You can only read. Do not propose edits and do not restate the diff.\n" +
    "If nothing is worth interrupting for, reply with exactly: NOTHING.\n" +
    "Otherwise: at most six lines, each naming a file and a line."
  );
}

/**
 * Runs one report and hands the text to `lapor`.
 *
 * `jalankan` is injected rather than imported so this module can be tested
 * without an agent, a model or a key — the whole policy above is the part worth
 * testing, and it is unreachable if running it needs a live model.
 */
async function laporSekali(opsi: {
  berkas: string[];
  cloud: any;
  workspaceRoot?: string;
  jalankan: (payload: any, emit: (e: any) => void) => Promise<any>;
  lapor: (teks: string, berkas: string[]) => void;
}) {
  S.sedangJalan = true;
  S.terakhirLapor = Date.now();
  S.capJam.push(Date.now());
  let teks = "";
  try {
    await opsi.jalankan(
      {
        history: [{ role: "user", content: _perintah(opsi.berkas) }],
        cloud: opsi.cloud,
        workspace_root: opsi.workspaceRoot,
        // The whole guarantee of this feature, in one field.
        hanyaBaca: true,
        // LOW effort. This is a glance, not an investigation; a background run
        // that thinks for forty steps is the expensive failure mode.
        effort: 0,
      },
      (e: any) => {
        // Only the final answer. The step-by-step belongs to a run the user
        // started and watched; here it would be noise from nowhere.
        if (e && e.t === "adone" && typeof e.text === "string") teks = e.text;
        else if (e && e.t === "tok" && typeof e.c === "string") teks += e.c;
      },
    );
  } catch (e: any) {
    dlog("reaktif", "warn", "report failed", { error: e && e.message });
    return;
  } finally {
    S.sedangJalan = false;
  }
  const bersih = String(teks || "").trim();
  // NOTHING is the agreed way to say "not worth interrupting for", and it must
  // not reach the user as a message reading "NOTHING".
  if (!bersih || /^nothing\.?$/i.test(bersih)) {
    dlog("reaktif", "info", "nothing worth reporting", {
      berkas: opsi.berkas.length,
    });
    return;
  }
  opsi.lapor(bersih, opsi.berkas);
}

/**
 * Starts watching a folder.
 *
 * Returns a stop function. Watching is recursive where the platform supports it
 * (Windows and macOS do); elsewhere only the top level is seen, which is stated
 * rather than silently half-working.
 */
function mulai(opsi: {
  akar: string;
  cloud: any;
  jalankan: (payload: any, emit: (e: any) => void) => Promise<any>;
  lapor: (teks: string, berkas: string[]) => void;
  tenang?: number;
}) {
  const tenang = opsi.tenang || TENANG;
  let w: any = null;
  try {
    w = fs.watch(opsi.akar, { recursive: true }, (_jenis, nama) => {
      if (!nama) return;
      const penuh = path.join(opsi.akar, String(nama));
      if (!berkasMenarik(penuh)) return;
      S.berubah.add(penuh);
      // The quiet period restarts on every change: what matters is when the
      // burst ENDS, not when it began.
      if (S.jam) clearTimeout(S.jam);
      S.jam = setTimeout(() => {
        S.jam = null;
        const berkas = [...S.berubah];
        S.berubah.clear();
        const izin = bolehLapor();
        if (!izin.boleh) {
          dlog("reaktif", "info", "report skipped", {
            sebab: izin.sebab,
            berkas: berkas.length,
          });
          return;
        }
        // Never awaited, and every rejection caught. An unhandled rejection in
        // this app becomes an automatic rollback and reload — a background
        // feature must not be able to restart the application.
        laporSekali({ ...opsi, berkas }).catch((e: any) =>
          dlog("reaktif", "warn", "report threw", { error: e && e.message }),
        );
      }, tenang);
      if (S.jam.unref) S.jam.unref();
    });
  } catch (e: any) {
    dlog("reaktif", "warn", "watch failed", {
      akar: opsi.akar,
      error: e && e.message,
    });
    return () => {};
  }
  S.pengawas.push(w);
  return () => {
    try {
      w.close();
    } catch (_) {}
    S.pengawas = S.pengawas.filter((x) => x !== w);
    if (S.jam) {
      clearTimeout(S.jam);
      S.jam = null;
    }
  };
}

function setAktif(v: boolean) {
  S.aktif = Boolean(v);
  if (!S.aktif && S.jam) {
    clearTimeout(S.jam);
    S.jam = null;
    S.berubah.clear();
  }
  return keadaan();
}

/** What the UI needs to show a switch and explain a quiet feature. */
function keadaan() {
  return {
    aktif: S.aktif,
    sedangJalan: S.sedangJalan,
    dalamJam: _dalamJam(),
    maksPerJam: MAKS_PER_JAM,
    tenangMs: TENANG,
    jedaMinimumMs: JEDA_MINIMUM,
    menunggu: S.berubah.size,
    pengawas: S.pengawas.length,
  };
}

module.exports = {
  mulai,
  setAktif,
  keadaan,
  laporSekali,
  bolehLapor,
  berkasMenarik,
  _perintah,
  _S: S,
  TENANG,
  JEDA_MINIMUM,
  MAKS_PER_JAM,
};
export {};
