"use strict";
/**
 * Terminal session manager — wraps node-pty for persistent PTY sessions.
 * Shared by both the HTTP server and the agent tools.
 */

const os = require("os");
const { getPlatformAdapter } = require("../agent/platform/index.cjs");

// Dijaga dengan alasan yang sama seperti di server.cjs: node-pty adalah modul
// NATIVE dan bisa tak tersedia (mis. Alpine/musl tanpa prebuild linux dan tanpa
// toolchain untuk membangunnya). Require telanjang di sini membuat SETIAP
// pemuat modul ini ikut mati, bukan cuma fitur terminalnya.
let pty = null;
let ptyLoadError = null;
try {
  pty = require("node-pty");
} catch (e) {
  ptyLoadError = e.message;
}

const sessions = new Map();
let nextId = 1;
const OUTPUT_MAX = 4096; // max chars kept in buffer for late readers

const SHELL =
  os.platform() === "win32"
    ? process.env.COMSPEC || "cmd.exe"
    : process.env.SHELL || "/bin/bash";

function create(cwd, shellOverride) {
  if (!pty) {
    const e = new Error(
      "Terminal tidak tersedia: node-pty gagal dimuat di platform ini" +
        (ptyLoadError ? " — " + String(ptyLoadError).split("\n")[0] : ""),
    );
    e.code = "PTY_UNAVAILABLE";
    throw e;
  }
  const id = `term_${nextId++}`;
  const shell = shellOverride || SHELL;
  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: 120,
    rows: 30,
    cwd: cwd || process.cwd(),
    env: { ...process.env, TERM: "xterm-256color" },
  });

  const outputBuffer = [];
  const session = {
    id,
    ptyProcess,
    listeners: [],
    outputBuffer,
    created: Date.now(),
  };

  ptyProcess.onData((data) => {
    // Keep in buffer for late readers (e.g. agent read tool)
    outputBuffer.push(data);
    let total = 0;
    for (let i = outputBuffer.length - 1; i >= 0; i--) {
      total += outputBuffer[i].length;
      if (total > OUTPUT_MAX) {
        outputBuffer.splice(0, i);
        break;
      }
    }
    // Forward to live listeners
    for (const fn of session.listeners) {
      try {
        fn(data);
      } catch (_) {}
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    const msg = `\n[WOLFSPACE] Process exited (code=${exitCode}, signal=${signal})\n`;
    outputBuffer.push(msg);
    for (const fn of session.listeners) {
      try {
        fn(msg);
      } catch (_) {}
    }
    sessions.delete(id);
  });

  sessions.set(id, session);
  return { id, pid: ptyProcess.pid };
}

function write(id, input) {
  const session = sessions.get(id);
  if (!session) return false;
  session.ptyProcess.write(input);
  return true;
}

function onData(id, listener) {
  const session = sessions.get(id);
  if (!session) return false;
  session.listeners.push(listener);
  return () => {
    const idx = session.listeners.indexOf(listener);
    if (idx !== -1) session.listeners.splice(idx, 1);
  };
}

function resize(id, cols, rows) {
  const session = sessions.get(id);
  if (!session) return false;
  session.ptyProcess.resize(cols, rows);
  return true;
}

// ── Menutup PTY tanpa memanggil pendaftar konsol node-pty ──
//
// MASALAHNYA. Di jalur ConPTY, node-pty kill() men-fork
// lib/conpty_console_list_agent.js untuk mendaftar proses di konsol lalu
// membunuhnya satu per satu. Fork itu MATI di sini dengan "AttachConsole failed"
// — terukur bukan cuma di jest, tapi juga di proses node biasa, artinya ini
// jalur produksi. Akibatnya tiga:
//   1. jejak tumpukan setinggi 10 baris tercetak ke stderr tiap kali terminal
//      ditutup, yang terbaca seolah WOLFSPACE sendiri yang runtuh;
//   2. pipa fork yang sudah mati tertinggal sebagai handle (jest melaporkannya
//      sebagai PIPEWRAP dan tak bisa keluar bersih);
//   3. timeout 5 detik di dalam node-pty menunggu pesan yang tak akan datang.
// Daftar prosesnya sendiri TAK PERNAH tiba, jadi jaring pengamannya memang
// sudah tidak bekerja — bukan sesuatu yang hilang karena perubahan ini.
//
// GANTINYA LEBIH KUAT, bukan sekadar lebih sunyi. taskkill /F /T menghabisi
// seluruh pohon proses, termasuk cucu yang tak terdaftar di konsol — kasus yang
// justru jadi alasan node-pty menulis jalur itu (microsoft/vscode#26807).
// Fungsi yang sama sudah dipakai sandbox lewat adapter platform.
//
// Diukur sebelum dan sesudah, dengan anak `node` berumur panjang di dalam PTY:
//   sebelum: anak mati, TAPI stderr penuh jejak tumpukan + handle tertinggal
//   sesudah: anak mati, stderr bersih, tak ada handle tersisa
function _matikanPohon(pid) {
  if (!pid) return;
  try {
    getPlatformAdapter().killTree({ pid });
  } catch (_) {}
}
async function _matikanPohonAsync(pid) {
  if (!pid) return;
  try {
    await getPlatformAdapter().killTreeAsync({ pid });
  } catch (_) {}
}

// Menonaktifkan pendaftar konsol HANYA pada sesi yang sedang ditutup. Ini API
// privat node-pty, jadi dijaga: kalau bentuknya berubah di versi mendatang,
// tak ada yang meledak — kita cuma kembali ke perilaku lama yang berisik.
function _bungkamPendaftarKonsol(ptyProcess) {
  try {
    const agent = ptyProcess && ptyProcess._agent;
    if (agent && typeof agent._getConsoleProcessList === "function") {
      agent._getConsoleProcessList = () => Promise.resolve([]);
    }
  } catch (_) {}
}

// Satu-satunya cara membunuh PTY di seluruh basis kode ini.
//
// Diekspor karena server.cjs punya manajer sesi terminalnya SENDIRI untuk jalur
// HTTP/UI, terpisah dari yang di berkas ini (yang dipakai tool agent). Di sana
// penutupannya memanggil `pty.kill("SIGTERM")` — dan node-pty di Windows
// MELEMPAR begitu diberi argumen sinyal ("Signals not supported on windows",
// windowsTerminal.js:150). Lemparannya ditelan `catch {}`, sesinya dihapus dari
// map, jadi PTY-nya hidup terus DAN tak bisa dijangkau lagi untuk dibersihkan.
// Terukur pada proses server sungguhan: 3 anak sebelum, 9 sesudah tiga kali
// buka+tutup — dua proses yatim per siklus, bertahan sampai seluruh aplikasi
// ditutup, sementara /api/terminal/list sudah melaporkan kosong.
//
// Dua manajer sesi tetap dibiarkan (menyatukannya menyentuh jalur UI hidup dan
// bukan bagian dari perbaikan ini), tapi cara membunuhnya TIDAK boleh ada dua.
// Pipa conin/conout milik PTY tidak pernah ditutup oleh node-pty di jalur
// ConPTY non-DLL: kill() hanya menyetel `readable = false` pada _inSocket dan
// _outSocket (windowsPtyAgent.js:138-139), lalu membuang _conoutSocketWorker —
// yang itu soket worker, bukan soket PTY-nya. Keduanya tetap terbuka sebagai
// handle. Terukur: 4 PIPEWRAP tersisa untuk 4 sesi yang SUDAH ditutup, dan
// jest tak pernah bisa keluar bersih karenanya.
function _tutupPipa(ptyProcess) {
  try {
    const a = ptyProcess && ptyProcess._agent;
    if (!a) return;
    for (const s of [a._inSocket, a._outSocket]) {
      try {
        if (s && typeof s.destroy === "function") s.destroy();
      } catch (_) {}
    }
  } catch (_) {}
}

function killPty(ptyProcess) {
  if (!ptyProcess) return;
  // Urutannya penting: pohon dibunuh SELAGI pid-nya masih sah, baru handle
  // node-pty dilepas, baru pipanya ditutup.
  _matikanPohon(ptyProcess.pid);
  _bungkamPendaftarKonsol(ptyProcess);
  try {
    ptyProcess.kill(); // TANPA argumen — lihat catatan di atas
  } catch (_) {}
  _tutupPipa(ptyProcess);
}

// ── Versi yang tidak membekukan thread pemanggil ──
//
// Isi dan URUTANNYA sama persis dengan killPty; yang berbeda hanya pembunuhan
// pohonnya menunggu lewat promise alih-alih menahan thread. taskkill /F /T
// lewat execSync terukur mengunci thread utama Electron 1076 ms (terburuk
// 1507 ms) tiap panel terminal ditutup.
//
// Yang sinkron tetap ada dan tetap dipakai: pemanggil di luar thread utama
// (mis. pembersihan saat proses berhenti) justru butuh urutan "mati dulu, baru
// lanjut", dan di sana tak ada jendela yang bisa membeku.
async function killPtyAsync(ptyProcess) {
  if (!ptyProcess) return;
  await _matikanPohonAsync(ptyProcess.pid);
  _bungkamPendaftarKonsol(ptyProcess);
  try {
    ptyProcess.kill();
  } catch (_) {}
  _tutupPipa(ptyProcess);
}

function destroy(id) {
  const session = sessions.get(id);
  if (!session) return false;
  killPty(session.ptyProcess);
  sessions.delete(id);
  return true;
}

function list() {
  return Array.from(sessions.values()).map((s) => ({
    id: s.id,
    pid: s.ptyProcess.pid,
    created: s.created,
  }));
}

/** Read accumulated output buffer (and optionally clear it) */
function readBuffer(id, clear) {
  const session = sessions.get(id);
  if (!session) return null;
  const text = session.outputBuffer.join("");
  if (clear) session.outputBuffer.length = 0;
  return text;
}

module.exports = {
  create,
  write,
  onData,
  resize,
  destroy,
  list,
  readBuffer,
  killPty,
  killPtyAsync,
};
