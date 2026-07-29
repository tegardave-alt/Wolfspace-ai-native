// ── WOLFSPACE Safe-Edit Middleware ──
// Pengganti fs.writeFile yang aman: snapshot → sandbox test → apply/rollback
// Jika kode crash di sandbox, otomatis rollback & karantina.

"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const { createSnapshot, rollback } = require("./snapshot.cjs");
const codeQuality = require("./code-quality.cjs");

const QROOT = path.resolve(__dirname, "..");
const QUARANTINE = path.join(QROOT, ".wolfspace", "quarantine");
const EXEC_TIMEOUT = 10_000; // ms

function _ensureDir(d) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

// ── Deteksi bahasa dari ekstensi file ──
function _detectLang(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  // '.jsx' DULU TIDAK ADA di peta ini, sehingga setiap tulisan JSX melewati
  // syntax check sepenuhnya — JSX rusak mendarat di disk dan baru ketahuan saat
  // Babel gagal di browser (ditangkap auto-rollback, tapi itu SESUDAH fakta).
  // `node --check` tak bisa mem-parse JSX, jadi jalurnya terpisah.
  const map = {
    ".py": "python",
    ".js": "javascript",
    ".cjs": "javascript",
    ".mjs": "javascript",
    ".jsx": "jsx",
  };
  return map[ext] || null;
}

// ── Cari interpreter Python yang tersedia ──
function _pythonBin() {
  const bundled =
    process.env.APPDATA &&
    path.join(
      process.env.APPDATA,
      "uv",
      "python",
      "cpython-3.12.10-windows-x86_64-none",
      "python.exe",
    );
  if (bundled && fs.existsSync(bundled)) return `"${bundled}"`;
  return "python";
}

// ── Validasi sintaks tanpa menjalankan kode penuh ──
function _syntaxCheck(content, lang) {
  const tmp = path.join(os.tmpdir(), `_wf_check_${Date.now()}`);
  try {
    if (lang === "python") {
      const src = tmp + ".py";
      fs.writeFileSync(src, content, "utf8");
      execSync(`${_pythonBin()} -m py_compile "${src}"`, {
        timeout: 8000,
        stdio: "pipe",
      });
      fs.rmSync(src, { force: true });
      return { ok: true };
    }
    if (lang === "javascript") {
      const src = tmp + ".js";
      fs.writeFileSync(src, content, "utf8");
      execSync(`node --check "${src}"`, { timeout: 5000, stdio: "pipe" });
      fs.rmSync(src, { force: true });
      return { ok: true };
    }
    if (lang === "jsx") {
      // Pakai Babel standalone yang SUDAH di-vendor untuk runtime UI — sumber
      // kebenaran yang sama dengan yang akan mem-parse berkas ini di browser,
      // jadi lolos di sini berarti benar-benar lolos nanti.
      const B = require(path.join(QROOT, "public", "vendor", "babel.min.js"));
      B.transform(content, { presets: ["react"], filename: "check.jsx" });
      return { ok: true };
    }
    // Bahasa lain tidak di-check sintaks, langsung lolos
    return { ok: true };
  } catch (e) {
    const errMsg =
      ((e.stderr || "") + "").trim() || e.message || "Syntax error";
    try {
      fs.rmSync(tmp + (lang === "python" ? ".py" : ".js"), { force: true });
    } catch (_) {}
    return { ok: false, error: errMsg };
  }
}

/**
 * Karantina kode yang bermasalah.
 * @param {string} content - isi kode yang crash
 * @param {string} filePath - file yang seharusnya ditulis
 * @param {string} reason   - pesan error
 */
function quarantine(content, filePath, reason) {
  _ensureDir(QUARANTINE);
  const ts = Date.now();
  const name = `${ts}_${path.basename(filePath)}.json`;
  const data = {
    ts,
    isoTime: new Date(ts).toISOString(),
    targetFile: filePath,
    reason,
    content,
  };
  const dest = path.join(QUARANTINE, name);
  fs.writeFileSync(dest, JSON.stringify(data, null, 2), "utf8");
  console.warn(`[safe-edit] ⚠ Quarantined: ${name} — ${reason}`);
  return dest;
}

/**
 * Tulis file dengan aman:
 *   1. Snapshot file lama
 *   2. Cek sintaks kode baru di sandbox
 *   3a. Jika lolos → tulis ke file asli
 *   3b. Jika gagal → rollback + karantina kode baru
 *
 * @param {string} filePath   - path absolut file yang akan ditulis
 * @param {string} newContent - konten baru
 * @returns {{ ok: boolean, snapshotId?: string, quarantineFile?: string, error?: string }}
 */
function safeWriteFile(filePath, newContent) {
  const abs = path.resolve(filePath);
  const lang = _detectLang(abs);

  // 0. Gerbang kualitas struktural (HARDCODED — lihat agent/code-quality.cjs).
  //    Dijalankan SEBELUM snapshot: penolakan di sini tak mengubah apa pun di
  //    disk, jadi tak perlu rollback. Prinsipnya ratchet — berkas kotor boleh
  //    disunting, tapi tak boleh bertambah dalam. Ini menegakkan di jalur
  //    eksekusi apa yang prompt "write clean code" gagal tegakkan.
  let oldForGate = null;
  try {
    if (fs.existsSync(abs)) oldForGate = fs.readFileSync(abs, "utf8");
  } catch (_) {}
  const gate = codeQuality.check(abs, newContent, oldForGate);
  if (!gate.ok) {
    console.error(
      `[safe-edit] ✘ Edit DITOLAK (kualitas): ${path.basename(abs)}`,
    );
    return { ok: false, error: gate.error, metrics: gate.metrics };
  }

  // 1. Snapshot file yang ada (jika sudah ada)
  const snap = createSnapshot([abs], `before-edit:${path.basename(abs)}`);

  // 2. Syntax check di sandbox (hanya untuk JS/Python)
  if (lang) {
    const check = _syntaxCheck(newContent, lang);
    if (!check.ok) {
      // Gagal → rollback (file asli tidak berubah) + karantina kode baru
      rollback(snap.id); // file asli tidak berubah, ini hanya untuk konsistensi log
      const qFile = quarantine(newContent, abs, check.error);
      console.error(
        `[safe-edit] ✘ Edit DITOLAK: ${path.basename(abs)} — ${check.error}`,
      );
      return {
        ok: false,
        snapshotId: snap.id,
        quarantineFile: qFile,
        error: `Syntax error pada kode baru:\n${check.error}`,
      };
    }
  }

  // 3. Lolos → tulis ke file asli
  _ensureDir(path.dirname(abs));
  fs.writeFileSync(abs, newContent, "utf8");
  console.log(
    `[safe-edit] ✔ Edit diterapkan: ${path.basename(abs)} (snapshot: ${snap.id})`,
  );
  return { ok: true, snapshotId: snap.id };
}

module.exports = { safeWriteFile, quarantine };
