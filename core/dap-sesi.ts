"use strict";
/**
 * ── A DAP debug session, with state the renderer can read ──
 *
 * core/dap.ts speaks the protocol. This file REMEMBERS: one session has state
 * (where it is stopped, what its variables hold, what has been printed), and the
 * renderer asks for it in a single request.
 *
 * WHY IT IS PULLED HERE RATHER THAN IN THE RENDERER. When a program stops at a
 * breakpoint, what is needed is not one answer but three requests in sequence:
 * `stackTrace` -> `scopes` -> `variables`. Letting the renderer chain them means
 * three IPC round trips for one event, and every gap is a gap between "the
 * program stopped" and "the screen shows it". Here all three happen the moment
 * the `stopped` event arrives, so by the time the renderer asks, the answer is
 * already complete.
 */

import * as path from "path";
const { KlienDap, mulaiSesi } = require("./dap.ts");

const sesi = new Map();
let urut = 1;

const KELUARAN_MAKS = 400; // lines; a long session must not grow without bound

function _bersihkanKeluaran(s) {
  if (s.keluaran.length > KELUARAN_MAKS)
    s.keluaran = s.keluaran.slice(-KELUARAN_MAKS);
}

// Pull the full state when the program stops. A failure here must NOT bring the
// session down: adapters sometimes refuse `scopes` for a frame that is no longer
// valid (the user pressed Continue exactly as the data was being pulled, say),
// and that is no reason to kill the whole debug session.
async function _tarikKeadaan(s, badan) {
  const utas = badan && badan.threadId;
  const hasil: Record<string, any> = {
    alasan: (badan && badan.reason) || "stopped",
    utas,
    berkas: null,
    baris: null,
    tumpukan: [],
    variabel: [],
  };
  try {
    const st = await s.klien.kirim("stackTrace", {
      threadId: utas,
      levels: 20,
    });
    hasil.tumpukan = (st.stackFrames || []).map((f) => ({
      id: f.id,
      nama: f.name,
      baris: f.line,
      kolom: f.column,
      berkas: (f.source && f.source.path) || null,
    }));
    const atas = hasil.tumpukan[0];
    if (atas) {
      hasil.berkas = atas.berkas;
      hasil.baris = atas.baris;
      const sc = await s.klien.kirim("scopes", { frameId: atas.id });
      // Local scopes only. Python's `globals` holds hundreds of builtin names
      // nobody ever looks for while debugging, and showing them drowns the
      // variables that are actually being watched.
      const lokal =
        (sc.scopes || []).find((c) => /local/i.test(c.name)) ||
        (sc.scopes || [])[0];
      if (lokal && lokal.variablesReference) {
        const v = await s.klien.kirim("variables", {
          variablesReference: lokal.variablesReference,
        });
        hasil.variabel = (v.variables || []).map((x) => ({
          nama: x.name,
          nilai: x.value,
          tipe: x.type || "",
          // > 0 means the value has contents that can be expanded further.
          anak: x.variablesReference > 0 ? x.variablesReference : 0,
        }));
      }
    }
  } catch (e) {
    hasil.galat = String((e && e.message) || e);
  }
  s.berhenti = hasil;
}

/**
 * Open a session. `titikHenti` has the shape { "<absolute path>": [line numbers] }.
 */
// Extension -> adapter. The keys deliberately match jenisDebugger() in
// public/app.tsx so the UI and the server never disagree about which files go
// through DAP.
const ADAPTER = {
  py: "python",
  js: "js",
  mjs: "js",
  cjs: "js",
  ts: "js",
  tsx: "js",
  jsx: "js",
};
function adapterUntuk(berkas) {
  const m = /\.([a-z0-9]+)$/i.exec(String(berkas || ""));
  return (m && ADAPTER[m[1].toLowerCase()]) || null;
}

async function buka({ program, cwd, titikHenti, python }) {
  const jenis = adapterUntuk(program);
  if (!jenis) throw new Error("belum ada adapter DAP untuk berkas ini");
  const id = "dap_" + Date.now().toString(36) + "_" + urut++;
  const dap = require("./dap.ts");
  const klien =
    jenis === "js"
      ? await dap.klienJs({ cwd })
      : dap.klienPython({ cwd, python });
  const s: Record<string, any> = {
    id,
    klien,
    program,
    cwd,
    berhenti: null,
    keluaran: [],
    selesai: false,
    galat: null,
    titikHenti: titikHenti || {},
  };
  sesi.set(id, s);

  klien.on("output", (b) => {
    if (!b || !b.output) return;
    s.keluaran.push(String(b.output));
    _bersihkanKeluaran(s);
  });
  klien.on("breakpoint", (b) => {
    // js-debug runs a CHILD session; a setBreakpoints reply from the PARENT is
    // always `verified:false` because the parent is not what installed them. The
    // real acknowledgement arrives later as this event.
    const t = b && b.breakpoint;
    if (!t) return;
    s.terpasang = (s.terpasang || []).filter((x) => x.baris !== t.line);
    s.terpasang.push({ baris: t.line, sah: !!t.verified });
  });
  klien.on("stopped", (b) => {
    _tarikKeadaan(s, b);
  });
  // `continued` is not sent by every adapter, so the "running again" state is
  // also set when an action is sent (see aksi()). Both are needed: one for the
  // adapters that send it, one for those that do not.
  klien.on("continued", () => {
    s.berhenti = null;
  });
  const habis = () => {
    s.selesai = true;
    s.berhenti = null;
  };
  klien.on("terminated", habis);
  klien.on("exited", habis);
  klien.on("keluar", habis);
  klien.on("galat-adapter", (t) => {
    s.galat = String(t).slice(0, 500);
  });

  try {
    const tp = await mulaiSesi(
      klien,
      jenis === "js"
        ? {
            type: "pwa-node",
            request: "launch",
            name: "wolfspace",
            program,
            cwd,
            console: "internalConsole",
          }
        : {
            type: "debugpy",
            request: "launch",
            name: "wolfspace",
            program,
            cwd,
            console: "internalConsole",
            justMyCode: true,
          },
      s.titikHenti,
    );
    s.terpasang = tp.map((t) => ({ baris: t.line, sah: !!t.verified }));
  } catch (e) {
    // The session is NOT deleted here: its error message is exactly what the user
    // most wants to see, and deleting it makes /dap/keadaan answer "no such
    // session" — which reads like an application bug rather than like a program
    // that failed to start.
    s.galat = String((e && e.message) || e);
    s.selesai = true;
  }
  return id;
}

const PETA_AKSI = {
  lanjut: "continue",
  lewati: "next",
  masuk: "stepIn",
  keluar: "stepOut",
};

async function aksi(id, nama) {
  const s = sesi.get(id);
  if (!s) throw new Error("sesi tak ada: " + id);
  if (nama === "berhenti") {
    await tutup(id);
    return { ok: true, selesai: true };
  }
  const perintah = PETA_AKSI[nama];
  if (!perintah) throw new Error("aksi tak dikenal: " + nama);
  const utas = (s.berhenti && s.berhenti.utas) || 1;
  // The "stopped" state is cleared BEFORE the request is sent. Afterwards there
  // would be a window where the screen still shows the old line while the program
  // is already running — and the user presses the next button based on that.
  s.berhenti = null;
  await s.klien.kirim(perintah, { threadId: utas });
  return { ok: true };
}

async function titikHenti(id, berkas, baris) {
  const s = sesi.get(id);
  if (!s) throw new Error("sesi tak ada: " + id);
  s.titikHenti[berkas] = baris;
  const b = await s.klien.kirim("setBreakpoints", {
    source: { path: berkas },
    breakpoints: (baris || []).map((l) => ({ line: l })),
  });
  return (b.breakpoints || []).map((t) => ({
    baris: t.line,
    sah: !!t.verified,
  }));
}

function keadaan(id, sejak) {
  const s = sesi.get(id);
  if (!s) return null;
  const dari = Number(sejak) || 0;
  return {
    id: s.id,
    program: s.program,
    selesai: s.selesai,
    galat: s.galat,
    terpasang: s.terpasang || [],
    berhenti: s.berhenti,
    // Output is sent FROM the index the renderer already holds, rather than all of
    // it every time. Resending everything on a 400 ms poll makes the payload grow
    // continuously through the session.
    keluaranDari: dari,
    keluaran: s.keluaran.slice(dari),
    keluaranTotal: s.keluaran.length,
  };
}

async function tutup(id) {
  const s = sesi.get(id);
  if (!s) return false;
  sesi.delete(id);
  s.selesai = true;
  try {
    // Asked to stop politely first; if the adapter does not answer, the timeout
    // inside kirim() resolves it and then the process is killed.
    await s.klien.kirim("disconnect", { terminateDebuggee: true }, 3000);
  } catch (_) {}
  try {
    s.klien.tutup();
  } catch (_) {}
  return true;
}

function daftar() {
  return [...sesi.values()].map((s) => ({
    id: s.id,
    program: s.program,
    selesai: s.selesai,
  }));
}

module.exports = {
  adapterUntuk,
  buka,
  aksi,
  titikHenti,
  keadaan,
  tutup,
  daftar,
  _sesi: sesi,
};
