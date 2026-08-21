// File operations for WOLFSPACE source code
const fs = require("fs");
const path = require("path");
const util = require("util");
const { exec } = require("child_process");
const execP = util.promisify(exec);

// ── WOLFSPACE source root + guardrails ──
const QROOT = path.resolve(__dirname, "..", "..");
const Q_ALLOWED =
  /^(server\.cjs|[\w-]+(?:\.[\w-]+)*\.cjs|[\w-]+(?:\.[\w-]+)*[\\/][\w-]+(?:\.[\w-]+)*\.cjs|agent[\\/][\w-]+(?:\.[\w-]+)*[\\/][\w-]+(?:\.[\w-]+)*\.cjs|config\.json|config[\\/][\w-]+(?:\.[\w-]+)*\.json|public[\\/].+\.(jsx|css|html|js|json))$/;
const Q_FORBID =
  /(^|[\\/])(cloud-keys\.json|node_modules|_agent_backups|dist-app|build|\.dart_tool|workspace)([\\/]|$)/;
function qResolve(p, mustBeEditable) {
  const rel = (p || "")
    .trim()
    .replace(/^[`"']+|[`"']+$/g, "")
    .replace(/^\//, "");
  const dest = path.resolve(QROOT, rel);
  if (dest !== QROOT && !dest.startsWith(QROOT + path.sep))
    throw new Error("path di luar root WOLFSPACE");
  const relNorm = path.relative(QROOT, dest).replace(/\\/g, "/");
  if (Q_FORBID.test(relNorm)) throw new Error("path terlarang: " + relNorm);
  if (
    mustBeEditable &&
    !Q_ALLOWED.test(relNorm) &&
    !Q_ALLOWED.test(relNorm.replace(/\//g, "\\\\"))
  )
    throw new Error("path tidak boleh ditulis: " + relNorm);
  return dest;
}
function qWalk(filterRe) {
  const skip =
    /^(node_modules|_agent_backups|dist-app|workspace|build|\.dart_tool|vendor|\.wolfspace|\.asar-pack|\.git)$/;
  const secret =
    /(cloud-keys\.json|\.env|\.pem$|\.key$|secret|credential|token)/i;
  // Noise files: backups, copies, temp files that are NOT real source code
  const noiseFile =
    /^(git_version|old_app|_old_app|vscode_backup_app|sedBrucB6|sedgrJyrL|test_.*|t\.cjs$)/;
  const out = [];
  (function walk(dir, depth) {
    if (out.length > 600 || depth > 5) return;
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (skip.test(e.name)) continue;
      if (e.isFile() && secret.test(e.name)) continue;
      if (e.isFile() && noiseFile.test(e.name)) continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp, depth + 1);
      else {
        const r = path.relative(QROOT, fp).replace(/\\/g, "/");
        if (!filterRe || filterRe.test(r)) out.push({ rel: r, fp });
      }
    }
  })(QROOT, 0);
  return out;
}
function qList() {
  return qWalk(null)
    .slice(0, 400)
    .map((f) => {
      let sz = 0;
      try {
        sz = fs.statSync(f.fp).size;
      } catch {}
      return f.rel + " (" + sz + "b)";
    })
    .join("\n");
}

// ── utils ──
function qGlob(pattern) {
  if (!pattern) return "pola kosong";
  const re = globToRe(pattern);
  const res = [];
  const files = qWalk(null);
  for (const f of files) {
    if (re.test(f.rel))
      res.push(
        f.rel +
          " (" +
          (() => {
            try {
              return fs.statSync(f.fp).size;
            } catch {
              return 0;
            }
          })() +
          "b)",
      );
  }
  return res.length ? res.join("\n") : "(tidak ada file cocok)";
}
// Glob -> RegExp. Dua bug lama diperbaiki di sini; keduanya ditemukan lewat
// profil CPU proses MAIN Electron saat run agent nyata, di mana satu baris ini
// menyumbang 3271ms self-time:
//
//     RegExp: ^.*.*/agent/.*.*/.*\.\{cjs,js,jsx,json\}$
//
//  1. BRACE DI-ESCAPE HARFIAH. `{}` masuk daftar escape, jadi pola lumrah
//     seperti `**/*.{cjs,js,jsx,json}` berubah menjadi pencarian nama berkas
//     yang benar-benar mengandung karakter "{cjs,js,jsx,json}". Tak ada berkas
//     seperti itu, jadi hasilnya SELALU nol — gagal diam-diam, bukan error.
//     Agent lalu mengira foldernya kosong dan mencoba pola lain berulang kali,
//     dan tiap percobaan membayar ongkos pemindaian penuh lagi.
//  2. `**` MENJADI `.*.*`. Dua wildcard tanpa batas yang bersebelahan membuat
//     regex engine backtracking secara katastrofik pada path panjang — dan
//     diskWalk mengujinya DUA KALI per berkas (fp dan rel).
//
// Ditulis sebagai pemindai satu-lewat supaya `{...}` bisa ditangani sebelum
// escaping, bukan sesudah. `*` tetap melintasi `/` seperti perilaku lama —
// yang berubah hanya yang memang rusak.
function globToRe(pat) {
  const src = String(pat == null ? "" : pat);
  const META = /[.+^${}()|[\]\\]/;
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "*") {
      let bintang = 1;
      while (src[i + 1] === "*") {
        i++;
        bintang++;
      }
      // `**/` berarti NOL ATAU LEBIH direktori. Kalau diterjemahkan `.*/`, ia
      // memaksa minimal satu segmen, sehingga `**/agent/**` gagal pada path
      // yang MULAI dengan `agent/` — persis pemakaian paling umum agent.
      if (bintang >= 2 && src[i + 1] === "/") {
        out += "(?:.*/)?";
        i++;
        continue;
      }
      out += ".*";
      continue;
    }
    if (c === "?") {
      out += ".";
      continue;
    }
    if (c === "{") {
      const tutup = src.indexOf("}", i);
      if (tutup > i) {
        const alt = src
          .slice(i + 1, tutup)
          .split(",")
          .map((s) => s.trim().replace(/[.+^${}()|[\]\\*?]/g, "\\$&"));
        out += "(?:" + alt.join("|") + ")";
        i = tutup;
        continue;
      }
      // `{` tanpa pasangan: perlakukan harfiah, seperti sebelumnya
    }
    out += META.test(c) ? "\\" + c : c;
  }
  return new RegExp("^" + out + "$", "i");
}
function qRead(absPath, near) {
  if (!absPath) return "(path kosong)";
  let txt;
  try {
    txt = fs.readFileSync(absPath, "utf8");
  } catch (e) {
    return "(gagal baca: " + e.message + ")";
  }
  const lines = txt.split("\n");
  const N = lines.length;
  near = parseInt(near);
  let a = 0,
    b = Math.min(N, 200);
  if (Number.isFinite(near) && near > 0) {
    a = Math.max(0, near - 40);
    b = Math.min(N, near + 40);
  }
  const shown = lines
    .slice(a, b)
    .map((l, i) => a + i + 1 + "\t" + l)
    .join("\n");
  const rest = N - b;
  const head =
    a > 0 || b < N
      ? `(baris ${a + 1}-${b} dari ${N}${rest > 0 ? ", " + rest + " baris tersisa" : ""})\n`
      : "";
  return head + shown;
}

function qGrep(pattern, options = {}) {
  if (!pattern) return "pola kosong";

  let patternsToSearch = [];

  // ── Semantic mode: expand query into multiple intent-based patterns ──
  if (options.intent || options.semantic) {
    const sv = getSemanticValidator();
    if (sv && sv.qSemanticSearch) {
      const semantic = sv.qSemanticSearch(options.intent || pattern, {
        intent: options.intent,
      });
      if (semantic.intent && semantic.patterns.length > 0) {
        patternsToSearch = semantic.patterns;
      }
    }
  }

  // ── Fallback/fast-path: pure lexical mode ──
  if (patternsToSearch.length === 0) {
    let re;
    try {
      re = new RegExp(pattern, "i");
    } catch {
      return "regex tidak valid: " + pattern;
    }
    patternsToSearch = [re];
  }

  const hits = [];
  const files = qWalk(/\.(cjs|js|jsx|css|html|json|dart|yaml|md)$/i);
  for (const f of files) {
    if (hits.length >= 150) break;
    let txt;
    try {
      txt = fs.readFileSync(f.fp, "utf8");
    } catch {
      continue;
    }
    txt.split("\n").forEach((l, i) => {
      if (hits.length >= 150) return;
      for (const re of patternsToSearch) {
        if (re.test(l)) {
          hits.push(f.rel + ":" + (i + 1) + ": " + l.trim().slice(0, 160));
          break; // avoid duplicate hits from multiple patterns on same line
        }
      }
    });
  }
  return hits.length ? hits.join("\n") : "(tidak ada kecocokan)";
}

async function qSyntaxOk(absPath) {
  const _t0 = performance.now();
  const ext = path.extname(absPath).toLowerCase();
  try {
    if (ext === ".cjs" || ext === ".js") {
      await execP(`"${process.execPath}" --check "${absPath}"`, {
        timeout: 15000,
        stdio: "pipe",
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      });
      return { ok: true };
    }
    if (ext === ".json") {
      JSON.parse(fs.readFileSync(absPath, "utf8"));
      return { ok: true };
    }
    if (ext === ".jsx") {
      const B = require(path.join(QROOT, "public", "vendor", "babel.min.js"));
      B.transform(fs.readFileSync(absPath, "utf8"), { presets: ["react"] });
      return { ok: true };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: (((e.stderr || "") + "").trim() || e.message).slice(0, 500),
    };
  } finally {
    const ms = performance.now() - _t0;
    if (ms >= 100 && global.__probe && global.__probe.say)
      global.__probe.say("qSyntaxOk " + ext + " " + ms.toFixed(0) + "ms");
  }
}

const { createSnapshot } = require("../snapshot.cjs");

function qBackup() {
  const filesToBackup = [];
  let n = 0;
  for (const f of qWalk(/\.(cjs|js|jsx|css|html|json|dart|yaml|py|md|txt)$/i)) {
    if (n > 500) break;
    const relSeg = f.rel.replace(/\//g, path.sep);
    if (!(Q_ALLOWED.test(relSeg) || Q_ALLOWED.test(f.rel))) continue;
    filesToBackup.push(f.fp);
    n++;
  }
  if (filesToBackup.length === 0) return null;
  const snap = createSnapshot(filesToBackup, "session-backup");
  return snap.id;
}

// ── Semantic file intent helper ──
// Uses sandbox-validator's intent detection for semantic-aware file operations
let _semanticModule = null;
function getSemanticValidator() {
  if (!_semanticModule) {
    try {
      _semanticModule = require("./sandbox-validator.cjs");
    } catch (e) {
      _semanticModule = null;
    }
  }
  return _semanticModule;
}

/**
 * Check file intent semantically (name + path + optional content analysis)
 * @param {string} filePath - file path to analyze
 * @param {string} [contentPreview] - optional content preview for deeper analysis
 * @returns {{ intents: Array, blocking: Array }}
 */
function qSemanticCheck(filePath, contentPreview) {
  const sv = getSemanticValidator();
  if (!sv || !sv.detectFileIntent) return { intents: [], blocking: [] };
  const normalized = (filePath || "").replace(/\\/g, "/");
  const intents = sv.detectFileIntent(normalized, contentPreview || "");
  const blocking = intents.filter((i) => i.block && i.confidence >= 0.6);
  return { intents, blocking };
}

/**
 * Get human-readable description of file intent
 * @param {string} filePath
 * @returns {string}
 */
function qIntentDescription(filePath) {
  const { intents } = qSemanticCheck(filePath, "");
  if (intents.length === 0) return "unknown / not classified";
  return intents
    .map((i) => `${i.intent} (${Math.round(i.confidence * 100)}%)`)
    .join(", ");
}

// ── Versi ASINKRON dari pemindai pohon source ──
//
// KENAPA ADA, dan kenapa versi sinkronnya tetap dipertahankan.
//
// Di mode Electron, backend WOLFSPACE TIDAK punya proses sendiri: main.js
// me-require core.js in-process, dan ipcMain.on("WOLFSPACE:stream") memanggil
// selfAgentStream() langsung. Proses main itu juga yang memiliki BrowserWindow
// dan memompa antrean pesan Windows. Jadi setiap detik yang dihabiskan di sini
// secara sinkron adalah satu detik jendela tidak memompa pesan — dan Windows
// menandainya "Not Responding".
//
// Terukur pada run agent SUNGGUHAN (tugas: grep + list di source sendiri),
// dengan sampler lag event-loop dipasang di proses main:
//     [MAIN-BEKU] 10845ms   [MAIN-BEKU] 5415ms   [MAIN-BEKU] 10670ms
// Di detik yang sama, PerformanceObserver('longtask') di RENDERER mencatat
// maksimal 312ms — renderer sehat; yang membeku pemilik jendelanya.
//
// Versi sinkron TIDAK dihapus: qBackup/qGrep sinkron masih dipakai jalur lain,
// dan tes yang ada bersandar padanya. Yang berubah hanya jalur tool agent, yaitu
// satu-satunya jalur yang berjalan di dalam proses pemilik jendela.
const fsp = fs.promises;

// Batas paralel untuk baca/salin berkas. Tanpa batas, 600 readFile serentak
// membanjiri threadpool libuv (default 4) dan justru memperlambat semuanya.
async function _petaBatas(items, batas, fn) {
  const hasil = new Array(items.length);
  let i = 0;
  const pekerja = Array.from(
    { length: Math.min(batas, items.length) },
    async () => {
      while (i < items.length) {
        const n = i++;
        hasil[n] = await fn(items[n], n);
      }
    },
  );
  await Promise.all(pekerja);
  return hasil;
}

// Cermin qWalk, tapi readdir-nya asinkron sehingga event loop (dan pompa pesan
// jendela) tetap dilayani di antara direktori. Batas dan filternya SAMA persis;
// kalau salah satu berubah, hasil tool jadi beda antara dua jalur.
async function qWalkAsync(filterRe) {
  const skip =
    /^(node_modules|_agent_backups|dist-app|workspace|build|\.dart_tool|vendor|\.wolfspace|\.asar-pack|\.git)$/;
  const secret =
    /(cloud-keys\.json|\.env|\.pem$|\.key$|secret|credential|token)/i;
  const noiseFile =
    /^(git_version|old_app|_old_app|vscode_backup_app|sedBrucB6|sedgrJyrL|test_.*|t\.cjs$)/;
  const out = [];
  async function walk(dir, depth) {
    if (out.length > 600 || depth > 5) return;
    let ents;
    try {
      ents = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (out.length > 600) return;
      if (skip.test(e.name)) continue;
      if (e.isFile() && secret.test(e.name)) continue;
      if (e.isFile() && noiseFile.test(e.name)) continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) await walk(fp, depth + 1);
      else {
        const r = path.relative(QROOT, fp).replace(/\\/g, "/");
        if (!filterRe || filterRe.test(r)) out.push({ rel: r, fp });
      }
    }
  }
  await walk(QROOT, 0);
  return out;
}

async function qListAsync() {
  const files = (await qWalkAsync(null)).slice(0, 400);
  const baris = await _petaBatas(files, 16, async (f) => {
    let sz = 0;
    try {
      sz = (await fsp.stat(f.fp)).size;
    } catch {}
    return f.rel + " (" + sz + "b)";
  });
  return baris.join("\n");
}

async function qGlobAsync(pattern) {
  if (!pattern) return "pola kosong";
  const re = globToRe(pattern);
  const files = (await qWalkAsync(null)).filter((f) => re.test(f.rel));
  const res = await _petaBatas(files, 16, async (f) => {
    let sz = 0;
    try {
      sz = (await fsp.stat(f.fp)).size;
    } catch {}
    return f.rel + " (" + sz + "b)";
  });
  return res.length ? res.join("\n") : "(tidak ada file cocok)";
}

async function qGrepAsync(pattern, options = {}) {
  if (!pattern) return "pola kosong";
  let patternsToSearch = [];
  if (options.intent || options.semantic) {
    const sv = getSemanticValidator();
    if (sv && sv.qSemanticSearch) {
      const semantic = sv.qSemanticSearch(options.intent || pattern, {
        intent: options.intent,
      });
      if (semantic.intent && semantic.patterns.length > 0)
        patternsToSearch = semantic.patterns;
    }
  }
  if (patternsToSearch.length === 0) {
    let re;
    try {
      re = new RegExp(pattern, "i");
    } catch {
      return "regex tidak valid: " + pattern;
    }
    patternsToSearch = [re];
  }

  const files = await qWalkAsync(/\.(cjs|js|jsx|css|html|json|dart|yaml|md)$/i);
  // Dibaca paralel-terbatas, lalu dikumpulkan MENURUT URUTAN BERKAS — bukan
  // urutan selesainya I/O. Kalau tidak, keluaran grep berubah-ubah tiap
  // panggilan untuk masukan yang sama, dan cache 30 detik jadi menyesatkan.
  const perFile = await _petaBatas(files, 12, async (f) => {
    let txt;
    try {
      txt = await fsp.readFile(f.fp, "utf8");
    } catch {
      return [];
    }
    const lokal = [];
    const lines = txt.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const re of patternsToSearch) {
        if (re.test(lines[i])) {
          lokal.push(
            f.rel + ":" + (i + 1) + ": " + lines[i].trim().slice(0, 160),
          );
          break;
        }
      }
    }
    return lokal;
  });

  const hits = [];
  for (const lokal of perFile) {
    for (const h of lokal) {
      if (hits.length >= 150) break;
      hits.push(h);
    }
    if (hits.length >= 150) break;
  }
  return hits.length ? hits.join("\n") : "(tidak ada kecocokan)";
}

async function qBackupAsync() {
  const filesToBackup = [];
  let n = 0;
  for (const f of await qWalkAsync(
    /\.(cjs|js|jsx|css|html|json|dart|yaml|py|md|txt)$/i,
  )) {
    if (n > 500) break;
    const relSeg = f.rel.replace(/\//g, path.sep);
    if (!(Q_ALLOWED.test(relSeg) || Q_ALLOWED.test(f.rel))) continue;
    filesToBackup.push(f.fp);
    n++;
  }
  if (filesToBackup.length === 0) return null;
  const { createSnapshotAsync } = require("../snapshot.cjs");
  const snap = await createSnapshotAsync(filesToBackup, "session-backup");
  return snap.id;
}

module.exports = {
  QROOT,
  Q_ALLOWED,
  Q_FORBID,
  qResolve,
  qWalk,
  qList,
  qGlob,
  qRead,
  qGrep,
  qBackup,
  qSyntaxOk,
  globToRe,
  qSemanticCheck,
  qIntentDescription,
  qWalkAsync,
  qListAsync,
  qGlobAsync,
  qGrepAsync,
  qBackupAsync,
};
