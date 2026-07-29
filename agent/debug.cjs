// Debug bus — a single event log wired through ALL of WOLFSPACE's logic.
// Every meaningful step (model call, execution, retry, cloud request, error)
// emits a structured event. Events live in a ring buffer, stream live to any
// /debug viewer, and append to a log file. Toggle with config.debug = false.

const fs = require("fs");
const os = require("os");
const path = require("path");
const CONFIG = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "config.json"), "utf8"),
);

const DEBUG_ON = CONFIG.debug !== false;
const VERBOSE = CONFIG.verbose === true;
const LOG_FILE = path.join(os.tmpdir(), "WOLFSPACE-debug.log");
const LOG_RING = []; // recent events, in memory
const LOG_MAX = 800;
const debugSubs = new Set(); // live SSE writers

// ── Rotasi berkas log ──
// LOG_RING dibatasi 800 entri sejak awal, tapi BERKASNYA tidak dibatasi sama
// sekali. Terukur di mesin ini: 0,99 GB dalam 23,8 hari (~4 juta event, ~43
// MB/hari) — tumbuh sampai disk penuh. Di container ia memakan volume /data
// yang sama dengan cloud-keys.json.
//
// Ukuran juga membebani penulisannya sendiri: append ke berkas kosong 0,476 ms,
// ke berkas 0,99 GB 0,787 ms — 65% lebih mahal, dan appendFileSync itu SINKRON
// di jalur yang dipanggil tiap langkah agent. Jadi masalahnya memperburuk diri
// sendiri seiring waktu.
//
// Ambangnya sengaja longgar (50 MB ~ seminggu pemakaian) supaya jejak untuk
// menelusuri bug tetap panjang; satu berkas lama disimpan, jadi batas atasnya
// ~100 MB, bukan tak terhingga.
const LOG_MAX_BYTES = 50 * 1024 * 1024;
const LOG_PREV = LOG_FILE + ".1";

// Ukuran dilacak di memori, BUKAN dengan statSync tiap tulis: statSync di jalur
// panas ini akan menambah syscall pada setiap event. Dihitung dari ukuran nyata
// sekali saat modul dimuat, lalu ditambah panjang tiap baris.
let _logBytes = 0;
try {
  _logBytes = fs.statSync(LOG_FILE).size;
} catch (_) {}

function _rotateIfNeeded() {
  if (_logBytes < LOG_MAX_BYTES) return;
  try {
    try {
      fs.unlinkSync(LOG_PREV);
    } catch (_) {}
    fs.renameSync(LOG_FILE, LOG_PREV);
    _logBytes = 0;
  } catch (_) {
    // Rotasi gagal (berkas terkunci, izin, dll) — JANGAN biarkan ini
    // menghentikan aplikasi. Reset penghitung supaya tak mencoba tiap tulis.
    _logBytes = 0;
  }
}

let _evSeq = 0;
function dlog(cat, level, msg, data) {
  const e = {
    seq: ++_evSeq,
    t: Date.now(),
    cat,
    level,
    msg,
    data: data === undefined ? null : data,
  };
  LOG_RING.push(e);
  if (LOG_RING.length > LOG_MAX) LOG_RING.shift();
  const line = "data: " + JSON.stringify(e) + "\n\n";
  for (const w of debugSubs) {
    try {
      w(line);
    } catch (_) {}
  }
  // Penulisan berkas kini MENGHORMATI DEBUG_ON. Dulu tidak: appendFileSync
  // berjalan tanpa syarat, sehingga `config.debug = false` hanya membungkam
  // konsol sementara berkasnya tetap tumbuh 43 MB/hari — mematikan debug tak
  // benar-benar mematikan apa pun yang memakan disk.
  if (DEBUG_ON) {
    try {
      const rec = JSON.stringify(e) + "\n";
      _rotateIfNeeded();
      fs.appendFileSync(LOG_FILE, rec);
      _logBytes += Buffer.byteLength(rec);
    } catch (_) {}
  }
  const _ws = (fn, ...a) => {
    try {
      fn(...a);
    } catch (_) {}
  };
  if (VERBOSE) {
    const prefix = `[WOLFSPACE:${cat}]`;
    const text = data ? JSON.stringify(data, null, 0) : "";
    if (level === "error")
      _ws(
        process.stderr.write.bind(process.stderr),
        `${prefix} ${msg} ${data && data.error ? data.error : ""}\n`,
      );
    else
      _ws(
        process.stdout.write.bind(process.stdout),
        `${prefix} ${msg} ${text}\n`,
      );
  } else if (DEBUG_ON && level === "error") {
    _ws(
      process.stderr.write.bind(process.stderr),
      `[WOLFSPACE:${cat}] ${msg} ${data && data.error ? data.error : ""}\n`,
    );
  }
  return e;
}

// Satu module.exports saja. Dulu ada DUA baris berturut-turut, dan yang kedua
// menimpa yang pertama — sehingga VERBOSE tak pernah benar-benar terekspor
// meski dicantumkan.
module.exports = {
  DEBUG_ON,
  VERBOSE,
  LOG_FILE,
  LOG_PREV,
  LOG_RING,
  LOG_MAX,
  LOG_MAX_BYTES,
  debugSubs,
  dlog,
};
