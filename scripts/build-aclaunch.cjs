#!/usr/bin/env node
"use strict";

// Compiles scripts/appcontainer/AcLaunch.exe when it is missing or out of date.
//
// WHY THIS EXISTS. The binary is in .gitignore and nothing ever built it, so a
// fresh clone had no launcher at all — and, worse, an EXISTING but stale one is
// silently wrong rather than absent. agent/tools/appcontainer-jail.ts now sets
// WOLFSPACE_JOB_MEM_MB and friends on every spawn; a build made before those
// were read simply ignores them. The command then runs with no resource ceiling
// and nothing anywhere says so.
//
// Absent fails loudly (appcontainer-jail reports "AcLaunch.exe belum
// dikompilasi" and falls back). Stale fails silently. This closes the second
// case, which is the dangerous one.
//
// STALENESS, NOT ALWAYS. csc takes ~0.8 s and `npm run app` already carries
// three build steps; rebuilding a 12 KB binary that has not changed would just
// be another second before the window appears. Comparing mtimes costs nothing.
//
// NOT AN ERROR OFF WINDOWS. The AppContainer path only exists here; on Linux and
// macOS the jail comes from namespaces (agent/tools/bash-jail.ts). Failing the
// build there would break CI for a file that platform never loads.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DIR = path.join(__dirname, "appcontainer");
const SRC = path.join(DIR, "AcLaunch.cs");
const EXE = path.join(DIR, "AcLaunch.exe");

/** csc.exe ships with the .NET Framework that is already part of Windows, so
 *  there is nothing to install — which is exactly why this launcher is C# and
 *  not something needing a toolchain of its own. */
function csc() {
  const p = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "Microsoft.NET",
    "Framework64",
    "v4.0.30319",
    "csc.exe",
  );
  return fs.existsSync(p) ? p : null;
}

function perluBangun() {
  if (!fs.existsSync(EXE)) return "belum ada";
  try {
    const src = fs.statSync(SRC).mtimeMs;
    const exe = fs.statSync(EXE).mtimeMs;
    if (src > exe) return "sumber lebih baru";
  } catch (_) {
    return "status berkas tak terbaca";
  }
  return null;
}

function bangun() {
  if (process.platform !== "win32") return { dilewati: "bukan Windows" };
  if (!fs.existsSync(SRC)) return { dilewati: "AcLaunch.cs tak ada" };

  const alasan = perluBangun();
  if (!alasan) return { terkini: true };

  const bin = csc();
  if (!bin) return { dilewati: "csc.exe tak ditemukan" };

  execFileSync(
    bin,
    ["-nologo", "-optimize", "-platform:x64", "-out:" + EXE, SRC],
    { stdio: "pipe", encoding: "utf8" },
  );
  return { dibangun: true, alasan, byte: fs.statSync(EXE).size };
}

module.exports = { bangun, perluBangun, EXE, SRC };

if (require.main === module) {
  try {
    const r = bangun();
    if (r.dibangun)
      console.log(
        "[build-aclaunch] AcLaunch.exe dibangun (" +
          r.alasan +
          ", " +
          r.byte +
          " byte)",
      );
    else if (r.terkini) console.log("[build-aclaunch] AcLaunch.exe terkini");
    else console.log("[build-aclaunch] dilewati: " + r.dilewati);
  } catch (e) {
    // A failure here must not stop the app from starting: without the binary
    // the bash tool falls back to the text-scanning guard, which is weaker but
    // working, and appcontainer-jail.ts says so in its enforcement label.
    console.error("[build-aclaunch] GAGAL: " + (e.stdout || e.message));
  }
}
