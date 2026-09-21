#!/usr/bin/env node
// profil-beku.cjs — a freeze watchdog: it records the moment the window stops
// answering, by itself.
//
// ROLE IN THE SYSTEM. Run it alongside the app when investigating a hang:
//
//     npm run profil
//
// WHY A WATCHDOG AND NOT A ONE-SHOT COMMAND. By the time you have seen "Not
// Responding", switched to a terminal and typed something, the freeze is over.
// A profile taken afterwards records a healthy application and says nothing. So
// the profiler here runs continuously, and what reaches disk is the slice from
// exactly when the freeze happened.
//
// TWO PROCESSES ARE WATCHED, because either can be the cause and the symptom
// looks identical:
//
//   MAIN     the backend lives here (main.js -> core.js -> server.cjs) AND this
//            process owns the BrowserWindow and pumps the Windows message
//            queue. Synchronous work here IS "Not Responding".
//   RENDERER parses ~9 MB of vendor script and compiles 15 modules with Babel
//            INSIDE the browser before one pixel is drawn. The renderer
//            a blocked renderer makes the window look frozen even before the
//            OS has marked it.
//
// Watching only one of them is an easy mistake and an expensive one: the
// renderer can look healthy while main is locked, and the other way round.
//
// PAKAI:
//   terminal 1:  WOLFSPACE_PROFILE=1 npm run app     (PowerShell: $env:WOLFSPACE_PROFILE=1)
//   terminal 2:  npm run profil
//
// HASILNYA di _profil/:
//   beku.log                        satu baris per kejadian + tersangka teratas
//   beku-<time>-<process>.cpuprofile  a V8 profile, openable in DevTools
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const DIR = path.join(AKAR, "_profil");
const LOG = path.join(DIR, "beku.log");

const PORT_MAIN = Number(process.env.WOLFSPACE_PROFILE_PORT_MAIN || 9333);
const PORT_RENDERER = Number(
  process.env.WOLFSPACE_PROFILE_PORT_RENDERER || 9444,
);

// The threshold. 400 ms was chosen because below it a person does not yet
// register a "stall"; above it, it starts to feel like an unresponsive cursor.
const AMBANG_MS = Number(process.env.WOLFSPACE_PROFILE_AMBANG || 400);
// Sample densely: ten 300 ms blocks are as damaging as one 3-second block, and
// sparse sampling misses the first shape entirely.
const INTERVAL_SAMPEL_US = 200;
// How long to wait for a frozen process to come back before giving up. A
// 30-second stall is still worth recording; anything longer usually means a
// permanent hang, and no amount of waiting will produce a profile for that.
const BATAS_TUNGGU_MS = Number(process.env.WOLFSPACE_PROFILE_TUNGGU || 45000);

const T0 = Date.now();
const det = () => ((Date.now() - T0) / 1000).toFixed(1).padStart(7);
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const waktuBerkas = () => new Date().toISOString().replace(/[:.]/g, "-");

fs.mkdirSync(DIR, { recursive: true });

function catat(baris) {
  const s = "[" + new Date().toISOString() + "] " + baris;
  console.log(det() + "s  " + baris);
  try {
    fs.appendFileSync(LOG, s + "\n");
  } catch (_) {}
}

// ── klien CDP seperlunya ────────────────────────────────────────────────────
class Cdp {
  constructor(nama, wsUrl) {
    this.nama = nama;
    this.wsUrl = wsUrl;
    this.id = 1;
    this.tunggu = new Map();
    this.ws = null;
  }
  async buka() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = () => rej(new Error("websocket failed: " + this.nama));
    });
    this.ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch (_) {
        return;
      }
      if (m.id && this.tunggu.has(m.id)) {
        this.tunggu.get(m.id)(m);
        this.tunggu.delete(m.id);
      }
    };
    this.ws.onclose = () => {
      this.ws = null;
    };
  }
  kirim(method, params, batasMs) {
    if (!this.ws) return Promise.resolve(null);
    return new Promise((res) => {
      const n = this.id++;
      let selesai = false;
      const tuntas = (v) => {
        if (selesai) return;
        selesai = true;
        this.tunggu.delete(n);
        res(v);
      };
      this.tunggu.set(n, tuntas);
      try {
        this.ws.send(JSON.stringify({ id: n, method, params: params || {} }));
      } catch (_) {
        return tuntas(null);
      }
      // A timeout is MANDATORY: a locked process will never answer, and without
      // one the watchdog hangs alongside what it is watching.
      if (batasMs) setTimeout(() => tuntas(null), batasMs);
    });
  }
}

async function targetList(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(1500),
    });
    return await r.json();
  } catch (_) {
    return null;
  }
}

// ── reduce a profile to a list of suspects ──────────────────────────────────
//
// SELF-TIME is reported, not total. Total always points at the outermost
// caller (main, require and so on) and never names the cause. (idle) is dropped
// from the suspects: that is WAITING, not working — and confusing the two is
// what sends people chasing the wrong thing.
function tersangka(profil, n) {
  const node = new Map();
  for (const x of profil.nodes || []) node.set(x.id, x);
  const self = new Map();
  const d = profil.timeDeltas || [];
  const s = profil.samples || [];
  let blokirMaks = 0;
  let blokirDi = "-";
  for (let i = 0; i < s.length; i++) {
    const dt = d[i] || 0;
    const nd = node.get(s[i]);
    if (!nd) continue;
    const cf = nd.callFrame || {};
    const nama = cf.functionName || "(anonim)";
    const berkas = cf.url
      ? path.basename(
          String(cf.url)
            .replace(/^file:\/+/, "")
            .split("?")[0],
        )
      : "-";
    const kunci =
      nama +
      "  " +
      berkas +
      (cf.lineNumber >= 0 ? ":" + (cf.lineNumber + 1) : "");
    self.set(kunci, (self.get(kunci) || 0) + dt);
    // A large gap between samples means the profiler could not take one, which
    // means the thread was locked inside ONE call. That is the shape that
    // freezes a window.
    if (dt > blokirMaks) {
      blokirMaks = dt;
      blokirDi = kunci;
    }
  }
  const urut = [...self.entries()]
    .filter(([k]) => !k.startsWith("(idle)"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n || 5);
  return {
    blokirMaksMs: Math.round(blokirMaks / 1000),
    blokirDi,
    atas: urut.map(([k, v]) => ({ di: k, ms: Math.round(v / 1000) })),
  };
}

// ── one watched process ─────────────────────────────────────────────────────
class Awasi {
  constructor(nama, cdp) {
    this.nama = nama;
    this.cdp = cdp;
    this.jalan = false;
  }
  async mulaiProfil() {
    await this.cdp.kirim("Profiler.enable", {}, 3000);
    await this.cdp.kirim(
      "Profiler.setSamplingInterval",
      { interval: INTERVAL_SAMPEL_US },
      3000,
    );
    const r = await this.cdp.kirim("Profiler.start", {}, 3000);
    this.jalan = r != null;
    return this.jalan;
  }
  /**
   * Wait until this process can answer again.
   *
   * WHY IT IS NECESSARY. CDP commands are handled on the SAME thread that is
   * locked, so during a stall Profiler.stop is never answered — and the first
   * version of this tool gave up after 8 seconds and reported "Profiler.stop
   * did not answer". The effect was the exact opposite of what was needed: a
   * profile was written for every process EXCEPT the one that was actually
   * beku. Terukur: dua penangkapan, dua-duanya main, nol renderer.
   *
   * Waiting is safe because V8's sampler runs on a SEPARATE thread and keeps
   * sampling while JS is locked. A profile collected AFTER the stall ends
   * therefore still contains the stall, call stacks and all.
   */
  async siapKembali(batasMs) {
    const tenggat = Date.now() + batasMs;
    while (Date.now() < tenggat) {
      const r = await this.cdp.kirim(
        "Runtime.evaluate",
        { expression: "1", returnByValue: true },
        2000,
      );
      if (r !== null) return true;
    }
    return false;
  }

  /** Tulis profil ke disk dan kembalikan ringkasannya. */
  async tangkap(sebab, bekuMs, bekuPada) {
    if (!this.jalan) return null;

    // Wait rather than give up. This is the difference between recording the
    // stall and
    // merekam segalanya kecuali macetnya.
    const sadar = await this.siapKembali(BATAS_TUNGGU_MS);
    if (!sadar) {
      catat(
        `[${this.nama}] still locked after ${BATAS_TUNGGU_MS / 1000} s — ` +
          `a profile cannot be taken from this process`,
      );
      return null;
    }

    const r = await this.cdp.kirim("Profiler.stop", {}, 20000);
    this.jalan = false;
    const profil = r && r.result && r.result.profile;
    if (!profil) {
      catat(
        `[${this.nama}] Profiler.stop failed even though the process answered`,
      );
      await this.mulaiProfil();
      return null;
    }
    const berkas = path.join(
      DIR,
      `beku-${waktuBerkas()}-${this.nama}.cpuprofile`,
    );
    try {
      fs.writeFileSync(berkas, JSON.stringify(profil));
    } catch (e) {
      catat(`[${this.nama}] failed to write the profile: ${e.message}`);
    }
    const t = tersangka(profil, 5);
    // Two different labels, and the difference matters: the process that FROZE
    // is not necessarily the one being reported. The first version of this tool
    // wrote "process=main" for a stall that happened in the renderer, which led
    // in entirely the wrong direction.
    catat(
      `BEKU ${bekuMs} ms pada [${bekuPada}] (${sebab}) | profil dari [${this.nama}] | ` +
        `blokir terpanjang ${t.blokirMaksMs} ms di ${t.blokirDi}`,
    );
    for (const a of t.atas)
      catat(`    tersangka: ${String(a.ms).padStart(6)} ms  ${a.di}`);
    catat(`    profile: ${path.relative(AKAR, berkas)}`);
    // Start again immediately: the next stall may be seconds away.
    await this.mulaiProfil();
    return t;
  }
}

// ── Windows' own .Responding flag ───────────────────────────────────────────
//
// This is the symptom the user ACTUALLY SEES, not a proxy for it. Taken from
// the OS rather than inferred from inside the application that is in trouble.
function pantauResponding(onBeku) {
  const PS = `
while ($true) {
  $p = Get-Process electron -ErrorAction SilentlyContinue |
       Where-Object { $_.MainWindowHandle -ne 0 }
  foreach ($x in $p) { Write-Output ("R|{0}|{1}" -f $x.Id, $x.Responding) }
  Start-Sleep -Milliseconds 200
}`;
  const ps = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", PS],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  const mulaiBeku = new Map();
  ps.stdout.on("data", (d) => {
    for (const b of String(d).split(/\r?\n/)) {
      const m = b.trim().split("|");
      if (m[0] !== "R" || m.length < 3) continue;
      const pid = m[1];
      const menjawab = m[2] === "True";
      if (!menjawab) {
        if (!mulaiBeku.has(pid)) mulaiBeku.set(pid, Date.now());
      } else if (mulaiBeku.has(pid)) {
        const lama = Date.now() - mulaiBeku.get(pid);
        mulaiBeku.delete(pid);
        if (lama >= AMBANG_MS)
          onBeku(lama, "window .Responding=False, PID " + pid);
      }
    }
  });
  return ps;
}

// ── utama ───────────────────────────────────────────────────────────────────
(async () => {
  console.log("Pengawas beku WOLFSPACE — ambang " + AMBANG_MS + " ms");
  console.log("hasil -> " + path.relative(AKAR, DIR) + "/\n");

  const daftarMain = await targetList(PORT_MAIN);
  const daftarRen = await targetList(PORT_RENDERER);
  if (!daftarMain && !daftarRen) {
    console.error(
      "The debug port is closed. Run the app with profiling on:\n\n" +
        "  PowerShell:  $env:WOLFSPACE_PROFILE=1; npm run app\n" +
        "  bash:        WOLFSPACE_PROFILE=1 npm run app\n\n" +
        "lalu jalankan lagi:  npm run profil",
    );
    process.exit(1);
  }

  const awas = [];
  const pasang = async (nama, daftar, pilih) => {
    const t = (daftar || []).find(pilih);
    if (!t) {
      catat(`[${nama}] target not found — this process is NOT being watched`);
      return;
    }
    const c = new Cdp(nama, t.webSocketDebuggerUrl);
    try {
      await c.buka();
      const a = new Awasi(nama, c);
      if (await a.mulaiProfil()) {
        awas.push(a);
        catat(`[${nama}] diawasi — ${String(t.title || t.url).slice(0, 50)}`);
      } else catat(`[${nama}] profiler menolak start`);
    } catch (e) {
      catat(`[${nama}] failed to connect: ${e.message}`);
    }
  };

  await pasang("main", daftarMain, (x) => !!x.webSocketDebuggerUrl);
  await pasang(
    "renderer",
    daftarRen,
    (x) => x.type === "page" && !!x.webSocketDebuggerUrl,
  );

  if (!awas.length) {
    console.error("Not a single process can be watched.");
    process.exit(1);
  }

  let sedangTangkap = false;
  let tangkapTerakhir = 0;
  const tangkapSemua = async (lamaMs, sebab, bekuPada) => {
    // One capture at a time: two concurrent Profiler.stop calls produce
    // profil sobek dan saling menimpa.
    if (sedangTangkap) return;
    // A short pause after a capture. Without it, ONE long stall is detected
    // repeatedly by both detectors and produces a pile of profiles all
    // describing the same event.
    if (Date.now() - tangkapTerakhir < 5000) return;
    sedangTangkap = true;
    try {
      for (const a of awas) await a.tangkap(sebab, lamaMs, bekuPada);
    } finally {
      tangkapTerakhir = Date.now();
      sedangTangkap = false;
    }
  };

  const ps = pantauResponding(
    (lama, sebab) => void tangkapSemua(lama, sebab, "main/window"),
  );

  // The second detector, from the INSIDE: how long the renderer takes to answer
  // a trivial evaluate. This catches a blocked renderer BEFORE Windows marks it
  // "Not Responding" — and the stalls people complain about most are exactly
  // the ones the OS never got round to flagging.
  const ren = awas.find((a) => a.nama === "renderer");
  if (ren) {
    setInterval(async () => {
      if (sedangTangkap) return;
      const t = Date.now();
      const r = await ren.cdp.kirim(
        "Runtime.evaluate",
        { expression: "1", returnByValue: true },
        15000,
      );
      const lama = Date.now() - t;
      if (r === null) {
        void tangkapSemua(
          15000,
          "renderer did not answer for 15 s",
          "renderer",
        );
      } else if (lama >= AMBANG_MS) {
        void tangkapSemua(lama, "renderer lambat membalas", "renderer");
      }
    }, 1000);
  }

  console.log("\nMengawasi. Pakai aplikasinya seperti biasa.");
  console.log("When the window freezes, its profile is written automatically.");
  console.log("Ctrl+C to stop.\n");

  const bersih = () => {
    try {
      ps.kill();
    } catch (_) {}
    process.exit(0);
  };
  process.on("SIGINT", bersih);
  process.on("SIGTERM", bersih);
})();
