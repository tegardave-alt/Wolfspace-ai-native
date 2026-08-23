"use strict";
/**
 * ── A Debug Adapter Protocol client ──
 *
 * DAP is the standard language between an editor and a debugger — the same open
 * specification (MIT, from Microsoft) VS Code uses. This file is the EDITOR
 * side: it talks to an adapter process (debugpy, js-debug, dlv dap) and turns
 * its messages into promises and events.
 *
 * WHY IT EXISTS. The previous debug path read TEXT from a PTY: wait for a
 * `debug>`/`(Pdb)` prompt to appear, then infer the state from it. That worked,
 * but every language needed its own table of command words, and no state could
 * be read as data — breakpoints had to be typed, variable contents came back as
 * free text, and the end of a session could only be GUESSED from a prompt
 * reappearing.
 *
 * With DAP it is all data: `setBreakpoints` takes line numbers, `variables`
 * returns name/value pairs, and `terminated` is a definite event rather than a
 * guess about what appeared on screen.
 *
 * THE WIRE FORMAT is the same as LSP: a `Content-Length` header, a blank line,
 * then a JSON body.
 *
 *     Content-Length: 92\r\n
 *     \r\n
 *     {"seq":1,"type":"request","command":"initialize","arguments":{…}}
 *
 * Three message kinds: `request` (us -> adapter), `response` (an answer to a
 * request, matched by `request_seq`), and `event` (adapter -> us, unsolicited).
 */

import { spawn } from "child_process";
import { EventEmitter } from "events";

const PEMISAH = "\r\n\r\n";

class KlienDap extends EventEmitter {
  // Declared because TypeScript classes require it. Assignment happens in the
  // constructor, as it did in the CommonJS original — nothing moved.
  _seq: number;
  _menunggu: Map<
    number,
    { selesai: (v: any) => void; gagal: (e: any) => void }
  >;
  _sisa: Buffer;
  _mati: boolean;
  _balasStartDebugging?: boolean;
  proses: any;
  /**
   * @param {string} perintah  biner adapter (mis. "python")
   * @param {string[]} argumen argumennya (mis. ["-m", "debugpy.adapter"])
   * @param {object} opsi      { cwd, env }
   */
  constructor(perintah: any, argumen: any, opsi: any = {}) {
    super();
    this._seq = 1;
    this._menunggu = new Map(); // seq -> { selesai, gagal }
    this._sisa = Buffer.alloc(0);
    this._mati = false;

    this.proses = spawn(perintah, argumen, {
      cwd: opsi.cwd || process.cwd(),
      env: { ...process.env, ...(opsi.env || {}) },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.proses.stdout.on("data", (b) => this._terima(b));
    // The adapter's stderr is NOT the debugged program's output — that arrives as
    // an `output` event. What comes here is the adapter's own message when it is
    // in trouble, and discarding it makes an adapter failure completely silent.
    this.proses.stderr.on("data", (b) =>
      this.emit("galat-adapter", b.toString("utf8")),
    );
    this.proses.on("exit", (kode) => {
      this._mati = true;
      // Every still-pending promise is REJECTED. Without this, an adapter that
      // dies midway leaves its caller waiting forever.
      for (const { gagal } of this._menunggu.values())
        gagal(new Error("adapter berhenti (kode " + kode + ")"));
      this._menunggu.clear();
      this.emit("keluar", kode);
    });
    this.proses.on("error", (e) =>
      this.emit("galat-adapter", String(e.message)),
    );
  }

  // ── Reading a byte stream into whole messages ──
  //
  // Split with a Buffer, not a string: Content-Length counts BYTES, while a
  // JavaScript string's length counts UTF-16 units. One non-ASCII character in a
  // filename or a variable's contents is enough to make the two differ, and after
  // that the whole stream is offset.
  _terima(potongan) {
    this._sisa = Buffer.concat([this._sisa, potongan]);
    for (;;) {
      const batas = this._sisa.indexOf(PEMISAH);
      if (batas < 0) return;
      const kepala = this._sisa.slice(0, batas).toString("ascii");
      const cocok = /Content-Length:\s*(\d+)/i.exec(kepala);
      if (!cocok) {
        // A header with no length cannot be recovered — discard up to the next
        // separator rather than treating the remainder as a message body.
        this._sisa = this._sisa.slice(batas + PEMISAH.length);
        continue;
      }
      const panjang = Number(cocok[1]);
      const awal = batas + PEMISAH.length;
      if (this._sisa.length < awal + panjang) return; // not whole yet, wait
      const badan = this._sisa.slice(awal, awal + panjang).toString("utf8");
      this._sisa = this._sisa.slice(awal + panjang);
      let pesan: any;
      try {
        pesan = JSON.parse(badan);
      } catch (e) {
        this.emit("galat-adapter", "badan bukan JSON: " + badan.slice(0, 120));
        continue;
      }
      this._salurkan(pesan);
    }
  }

  _salurkan(pesan) {
    if (pesan.type === "response") {
      const nunggu = this._menunggu.get(pesan.request_seq);
      if (!nunggu) return;
      this._menunggu.delete(pesan.request_seq);
      if (pesan.success) nunggu.selesai(pesan.body);
      else
        nunggu.gagal(
          new Error(
            pesan.message || "permintaan '" + pesan.command + "' ditolak",
          ),
        );
      return;
    }
    if (pesan.type === "event") {
      this.emit("kejadian", pesan.event, pesan.body);
      this.emit(pesan.event, pesan.body);
      return;
    }
    if (pesan.type === "request") {
      // An adapter may REQUEST something of the client (runInTerminal,
      // startDebugging). What we do not support is answered plainly — leaving it
      // hanging makes the adapter wait forever and the session appear stuck for
      // no reason.
      //
      // `startDebugging` is ANSWERED WITH SUCCESS when the caller can honour it.
      // That is not a formality: js-debug uses it to spawn the child session that
      // actually does the debugging, and answering failure makes it abandon the
      // whole session — breakpoints never install, `stopped` never arrives, and
      // not a single message says why.
      const sanggup =
        pesan.command === "startDebugging" && this._balasStartDebugging;
      this._tulis({
        seq: this._seq++,
        type: "response",
        request_seq: pesan.seq,
        success: !!sanggup,
        command: pesan.command,
        ...(sanggup ? {} : { message: "tidak didukung: " + pesan.command }),
      });
      this.emit("permintaan-adapter", pesan);
    }
  }

  _tulis(pesan) {
    if (this._mati || !this.proses.stdin.writable) return;
    const badan = Buffer.from(JSON.stringify(pesan), "utf8");
    this.proses.stdin.write(
      "Content-Length: " + badan.length + PEMISAH,
      "ascii",
    );
    this.proses.stdin.write(badan);
  }

  /** Kirim request, dapatkan janji atas body responsnya. */
  kirim(perintah, argumen, batasMs = 15000) {
    if (this._mati) return Promise.reject(new Error("adapter sudah berhenti"));
    const seq = this._seq++;
    return new Promise((selesai, gagal) => {
      // A timeout is REQUIRED: an adapter that accepted a request but never
      // answers is indistinguishable from one working slowly, and without this
      // the whole flow stops with no message at all.
      const jam = setTimeout(() => {
        this._menunggu.delete(seq);
        gagal(new Error("tak ada balasan untuk '" + perintah + "'"));
      }, batasMs);
      this._menunggu.set(seq, {
        selesai: (b) => {
          clearTimeout(jam);
          selesai(b);
        },
        gagal: (e) => {
          clearTimeout(jam);
          gagal(e);
        },
      });
      this._tulis({
        seq,
        type: "request",
        command: perintah,
        arguments: argumen,
      });
    });
  }

  /** Wait for one event, with a timeout. */
  tunggu(kejadian, batasMs = 15000) {
    return new Promise((selesai, gagal) => {
      const jam = setTimeout(() => {
        this.off(kejadian, pada);
        gagal(new Error("kejadian '" + kejadian + "' tak pernah datang"));
      }, batasMs);
      const pada = (b) => {
        clearTimeout(jam);
        selesai(b);
      };
      this.once(kejadian, pada);
    });
  }

  tutup() {
    this._mati = true;
    try {
      this.proses.kill();
    } catch (_) {}
  }
}

/**
 * The session opening sequence, per the DAP specification.
 *
 * What is easy to get wrong is the ORDER, and getting it wrong produces no error
 * — just breakpoints that silently fail to install:
 *
 *   1. `initialize`           -> wait for its response
 *   2. `launch`               -> do NOT wait here. Its response only arrives
 *                                after the program has actually started, while
 *                                the adapter is waiting for us to send
 *                                breakpoints first — each waiting on the other,
 *                                and the session freezes.
 *   3. the `initialized` event -> only NOW is the adapter ready for breakpoints
 *   4. `setBreakpoints` + `configurationDone`
 *   5. and only after that does the `launch` response arrive
 */
async function mulaiSesi(klien, argumenLaunch, titikHenti) {
  await klien.kirim("initialize", {
    clientID: "wolfspace",
    clientName: "WOLFSPACE",
    adapterID: argumenLaunch.type || "debugpy",
    locale: "en",
    linesStartAt1: true,
    columnsStartAt1: true,
    pathFormat: "path",
    supportsVariableType: true,
    supportsRunInTerminalRequest: false,
  });

  const siap = klien.tunggu("initialized");
  const janjiLaunch = klien.kirim("launch", argumenLaunch, 30000);
  await siap;

  const hasilTitik: any[] = [];
  for (const [berkas, baris] of Object.entries(titikHenti || {})) {
    const b = await klien.kirim("setBreakpoints", {
      source: { path: berkas },
      breakpoints: (baris as any[]).map((l) => ({ line: l })),
    });
    hasilTitik.push(...((b && b.breakpoints) || []));
  }
  await klien.kirim("configurationDone", {});
  await janjiLaunch;
  return hasilTitik;
}

/** The debugpy adapter: a Python process speaking DAP over stdio. */
function klienPython(opsi: any = {}) {
  const py = opsi.python || process.env.WOLFSPACE_PYTHON || "python";
  return new KlienDap(py, ["-m", "debugpy.adapter"], { cwd: opsi.cwd });
}

// ── A client that talks over a SOCKET rather than stdio ──
//
// js-debug (the official Node/JavaScript adapter) offers no stdio mode: it runs
// as a server listening on a TCP port. The message format is identical — a
// Content-Length header then a JSON body — so only the pipe differs.
// Built as a FACTORY function rather than a subclass: KlienDap's constructor
// always spawns a process, so inheriting from it would spawn one process
// immediately discarded every time a socket client is made. What is reused here
// is its prototype — the message splitter, the seq matching, and the sending are
// all the same.
function klienDariSoket(soket) {
  const k = Object.create(KlienDap.prototype);
  EventEmitter.call(k);
  k._seq = 1;
  k._menunggu = new Map();
  k._sisa = Buffer.alloc(0);
  k._mati = false;
  k.proses = { stdin: soket, kill: () => soket.destroy() };
  soket.on("data", (b) => k._terima(b));
  soket.on("error", (e) => k.emit("galat-adapter", String(e.message)));
  soket.on("close", () => {
    k._mati = true;
    for (const { gagal } of k._menunggu.values())
      gagal(new Error("sambungan adapter terputus"));
    k._menunggu.clear();
    k.emit("keluar", 0);
  });
  return k;
}

// ── js-debug uses a CHILD SESSION, and that changes the client's shape ──
//
// This is what makes js-debug different from debugpy, and what made the first
// attempt fail with no explanation: breakpoints came back `verified:false` and
// the `stopped` event never arrived.
//
// The session we open is NOT the one doing the debugging. It is the parent; once
// `launch` is handled, it sends a `startDebugging` request BACK — asking the
// client to open a SECOND session that actually attaches to the Node process. A
// client that refuses that reverse request (as the first version of this file
// did) means the child session is never born, so nothing stops and nothing
// reports.
//
// Because breakpoints are set BEFORE the child exists, they have to be
// remembered and sent AGAIN once it does — that is where they actually take
// effect.
function _bungkusJs(induk, porta, prosesServer) {
  const net = require("net");
  const muka: any = new EventEmitter();
  let anakKlien: any = null;
  const titikDiingat: any[] = []; // [{ source, breakpoints }]

  const aktif = () => anakKlien || induk;

  muka.kirim = (perintah, argumen, batas) => {
    // setBreakpoints is REMEMBERED whatever its destination: if the child is born
    // later, it needs the same list.
    if (perintah === "setBreakpoints") titikDiingat.push(argumen);
    return aktif().kirim(perintah, argumen, batas);
  };
  muka.tunggu = (kejadian, batas = 15000) =>
    new Promise((selesai, gagal) => {
      const jam = setTimeout(() => {
        muka.off(kejadian, pada);
        gagal(new Error("kejadian '" + kejadian + "' tak pernah datang"));
      }, batas);
      const pada = (b) => {
        clearTimeout(jam);
        selesai(b);
      };
      muka.once(kejadian, pada);
    });
  muka.tutup = () => {
    try {
      anakKlien && anakKlien.tutup();
    } catch (_) {}
    try {
      induk.tutup();
    } catch (_) {}
    try {
      prosesServer.kill();
    } catch (_) {}
  };

  induk._balasStartDebugging = true;

  const teruskan = (k) => {
    k.on("kejadian", (nama, badan) => {
      muka.emit("kejadian", nama, badan);
      muka.emit(nama, badan);
    });
    k.on("galat-adapter", (t) => muka.emit("galat-adapter", t));
  };
  teruskan(induk);
  induk.on("keluar", (k) => muka.emit("keluar", k));

  induk.on("permintaan-adapter", (pesan) => {
    if (pesan.command !== "startDebugging") return;
    const konfigurasi =
      (pesan.arguments && pesan.arguments.configuration) || {};
    const soket = net.connect(porta, "127.0.0.1", async () => {
      const anak = klienDariSoket(soket);
      anakKlien = anak;
      teruskan(anak);
      try {
        await anak.kirim("initialize", {
          clientID: "wolfspace",
          adapterID: "pwa-node",
          linesStartAt1: true,
          columnsStartAt1: true,
          pathFormat: "path",
          supportsVariableType: true,
        });
        const siap = anak.tunggu("initialized", 15000);
        const janji = anak.kirim(
          pesan.arguments.request === "attach" ? "attach" : "launch",
          konfigurasi,
          30000,
        );
        await siap;
        for (const t of titikDiingat) await anak.kirim("setBreakpoints", t);
        await anak.kirim("configurationDone", {});
        await janji;
      } catch (e) {
        muka.emit("galat-adapter", "sesi anak gagal: " + String(e.message));
      }
    });
    soket.on("error", (e) =>
      muka.emit("galat-adapter", "sesi anak: " + String(e.message)),
    );
  });

  return muka;
}

/**
 * The js-debug adapter: a Node process LISTENING on a TCP port.
 *
 * Port 0 — chosen by the system, then read from the line the server prints.
 * Picking a fixed number would mean two WOLFSPACE windows could not debug at the
 * same time, and the clash would show up as a session failing for no clear
 * reason.
 */
function klienJs(opsi: any = {}) {
  const net = require("net");
  const berkasServer =
    opsi.server ||
    require("path").join(
      __dirname,
      "..",
      "vendor",
      "js-debug",
      "src",
      "dapDebugServer.js",
    );
  if (!require("fs").existsSync(berkasServer))
    return Promise.reject(
      new Error(
        "js-debug belum diambil. Jalankan: node scripts/ambil-js-debug.cjs",
      ),
    );
  return new Promise((selesai, gagal) => {
    const anak = spawn(process.execPath, [berkasServer, "0", "127.0.0.1"], {
      cwd: opsi.cwd || process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let keluaran = "";
    let sudah = false;
    const jam = setTimeout(() => {
      if (sudah) return;
      sudah = true;
      try {
        anak.kill();
      } catch (_) {}
      gagal(
        new Error(
          "js-debug tak mengumumkan portanya. Keluarannya: " +
            keluaran.slice(0, 200),
        ),
      );
    }, 15000);
    anak.stderr.on("data", (b) => (keluaran += b.toString("utf8")));
    anak.stdout.on("data", (b) => {
      keluaran += b.toString("utf8");
      // Server mencetak "Debug server listening at 127.0.0.1:<porta>".
      const m = /listening at [^:]*:(\d+)/i.exec(keluaran);
      if (!m || sudah) return;
      sudah = true;
      clearTimeout(jam);
      const porta = Number(m[1]);
      const soket = net.connect(porta, "127.0.0.1", () => {
        const induk = klienDariSoket(soket);
        selesai(_bungkusJs(induk, porta, anak));
      });
      soket.on("error", (e) => {
        try {
          anak.kill();
        } catch (_) {}
        gagal(e);
      });
    });
    anak.on("error", (e) => {
      if (sudah) return;
      sudah = true;
      clearTimeout(jam);
      gagal(e);
    });
  });
}

module.exports = {
  KlienDap,
  mulaiSesi,
  klienPython,
  klienJs,
  klienDariSoket,
};
