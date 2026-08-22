// Execution tools (bash, terminal, workspace)
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { resolveDiskPath } = require("./disk-tools.cjs");
const { QROOT } = require("./file-tools.cjs");

// Modul PTY untuk tool terminal_open/write/read/close.
//
// DULU: require('../server.cjs') — mencoba menarik seluruh server hanya untuk
// mengambil beberapa fungsi terminal. server.cjs MENYALAKAN HTTP server sebagai
// efek samping saat di-require, jadi pemanggilan itu tak pernah kembali; try/catch
// tak menangkap apa pun karena bukan exception, melainkan hang/circular. Hasilnya
// term = null PERMANEN, dan ketiga tool terminal SELALU membalas "terminal
// unavailable (node-pty is not installed)" — pesan yang menyesatkan, sebab
// node-pty terpasang baik-baik saja.
//
// SEKARANG: langsung ke core/terminal.ts, yang mengekspor persis API yang
// dipakai di sini (create/write/readBuffer/destroy) dan termuat tanpa efek samping.
let term;
try {
  term = require("../../core/terminal.ts");
} catch (_) {
  term = null;
}

// ── Workspace helpers ──
const WORKSPACE = path.join(QROOT, "workspace");
try {
  fs.mkdirSync(WORKSPACE, { recursive: true });
} catch {}
function wsResolve(p) {
  const dest = path.resolve(WORKSPACE, (p || "").replace(/^[\\/]+/, ""));
  if (dest !== WORKSPACE && !dest.startsWith(WORKSPACE + path.sep))
    throw new Error("path di luar workspace");
  return dest;
}
function wsList(sub) {
  const root = wsResolve(sub || "");
  const out = [];
  (function walk(dir, depth) {
    if (out.length > 300 || depth > 8) return;
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (/^(node_modules)$/.test(e.name)) continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp, depth + 1);
      else {
        let sz = 0;
        try {
          sz = fs.statSync(fp).size;
        } catch {}
        out.push(
          path.relative(WORKSPACE, fp).replace(/\\/g, "/") + " (" + sz + "b)",
        );
      }
    }
  })(root);
  return out.length ? out.join("\n") : "(workspace kosong)";
}
let activeExecs = 0;
async function runInWorkspace(lang, code) {
  if (activeExecs >= 2)
    return {
      ok: false,
      error: "RATE_LIMIT: Terlalu banyak eksekusi bersamaan (max 2)",
    };
  activeExecs++;
  const l = (lang || "").toLowerCase();
  try {
    if (l === "javascript" || l === "js") {
      fs.writeFileSync(path.join(WORKSPACE, "_run.cjs"), code, "utf8");
      const out = await new Promise((resolve, reject) => {
        exec(
          `"${process.execPath}" _run.cjs`,
          {
            cwd: WORKSPACE,
            timeout: 120000,
            encoding: "utf8",
            maxBuffer: 200 * 1024,
          },
          (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve(stdout);
          },
        );
      });
      return { ok: true, output: (out || "").slice(0, 4000) };
    }
    if (l === "python" || l === "py") {
      fs.writeFileSync(path.join(WORKSPACE, "_run.py"), code, "utf8");
      const out = await new Promise((resolve, reject) => {
        exec(
          "python _run.py",
          {
            cwd: WORKSPACE,
            timeout: 120000,
            encoding: "utf8",
            maxBuffer: 200 * 1024,
          },
          (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve(stdout);
          },
        );
      });
      return { ok: true, output: out };
    }
    return {
      ok: false,
      error: 'RUN supports python or javascript (got "' + lang + '")',
    };
  } catch (e) {
    return {
      ok: false,
      output: (e.stdout || "").toString(),
      error: ((e.stderr || "") + "").trim() || e.message,
    };
  } finally {
    activeExecs--;
  }
}

module.exports = {
  WORKSPACE,
  wsResolve,
  wsList,
  runInWorkspace,
  term,
};
