// blender-tools — orkestrasi Blender HEADLESS sebagai tool agent (bukan fork, bukan
// MCP pihak-ketiga). Menjalankan `blender --background --python <script>` di host,
// menangkap log, dan mengurung file keluaran ke workspace. Model ini persis rekomendasi
// "miliki & verifikasi sendiri": kode kita, dependensi nol (selain Blender terpasang).
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

// ── Temukan blender.exe ──
// Urutan: env BLENDER_EXECUTABLE -> instalasi Blender Foundation (versi tertinggi)
// -> `blender` di PATH. Hasil di-cache.
let _blenderPath = null;
function findBlender() {
  if (_blenderPath !== null) return _blenderPath;
  const env = process.env.BLENDER_EXECUTABLE;
  if (env && fs.existsSync(env)) return (_blenderPath = env);
  if (process.platform === "win32") {
    const base = "C:\\Program Files\\Blender Foundation";
    try {
      const dirs = fs
        .readdirSync(base)
        .filter((d) => /^Blender/i.test(d))
        // urut versi menurun: "Blender 5.2" > "Blender 4.2"
        .sort((a, b) => {
          const nv = (s) => parseFloat((s.match(/([\d.]+)/) || [])[1] || "0");
          return nv(b) - nv(a);
        });
      for (const d of dirs) {
        const exe = path.join(base, d, "blender.exe");
        if (fs.existsSync(exe)) return (_blenderPath = exe);
      }
    } catch (_) {}
  }
  // fallback: andalkan PATH
  return (_blenderPath = "blender");
}

function blenderVersion() {
  try {
    const exe = findBlender();
    const r = require("child_process").execFileSync(exe, ["--version"], {
      timeout: 20000,
      windowsHide: true,
    });
    return String(r).split(/\r?\n/)[0].trim();
  } catch (e) {
    return null;
  }
}

// Cek path di dalam root (konfinemen keluaran).
function _inside(root, p) {
  const r = path.resolve(root);
  const t = path.resolve(p);
  return t === r || t.startsWith(r + path.sep);
}

// ── Jalankan skrip bpy headless ──
// args: { script, blend_file?, output?, timeout? }  ctx: { workspaceRoot? }
async function runBlender(args, ctx) {
  const exe = findBlender();
  const workspace = (ctx && ctx.workspaceRoot) || process.cwd();
  const script = String(args.script || "").trim();
  if (!script) return { ok: false, output: "Parameter 'script' (kode Python bpy) wajib diisi." };

  // File .blend/.glb pembuka (opsional) — harus di dalam workspace.
  let openFile = null;
  if (args.blend_file) {
    const abs = path.isAbsolute(args.blend_file)
      ? path.resolve(args.blend_file)
      : path.resolve(workspace, args.blend_file);
    if (!_inside(workspace, abs))
      return { ok: false, output: `blend_file '${args.blend_file}' di luar workspace.` };
    if (!fs.existsSync(abs))
      return { ok: false, output: `blend_file tidak ada: ${abs}` };
    openFile = abs;
  }

  // Keluaran (opsional) — dilaporkan bila terbentuk; wajib di dalam workspace.
  let outAbs = null;
  if (args.output) {
    outAbs = path.isAbsolute(args.output)
      ? path.resolve(args.output)
      : path.resolve(workspace, args.output);
    if (!_inside(workspace, outAbs))
      return { ok: false, output: `output '${args.output}' menembus keluar workspace.` };
    try { fs.mkdirSync(path.dirname(outAbs), { recursive: true }); } catch (_) {}
  }

  // Preamble: sediakan variabel WORKSPACE & OUTPUT ke skrip, dan bungkus dengan
  // try/except supaya traceback bpy muncul lengkap di log (bukan exit diam).
  const jsonWs = JSON.stringify(workspace);
  const jsonOut = JSON.stringify(outAbs || "");
  const preamble =
    "import bpy, os, sys, traceback\n" +
    "WORKSPACE = r" + jsonWs + "\n" +
    "OUTPUT = r" + jsonOut + "\n" +
    "os.chdir(WORKSPACE)\n" +
    "try:\n";
  const indented = script.split(/\r?\n/).map((l) => "    " + l).join("\n");
  const epilogue =
    "\nexcept Exception:\n" +
    "    traceback.print_exc()\n" +
    "    sys.exit(3)\n";
  const fullScript = preamble + indented + epilogue;

  const tmp = path.join(
    os.tmpdir(),
    "wolfspace_bl_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7) + ".py",
  );
  fs.writeFileSync(tmp, fullScript, "utf8");

  const bArgs = ["--background", "--factory-startup"];
  if (openFile) bArgs.push(openFile);
  bArgs.push("--python", tmp, "--python-exit-code", "3");

  const timeoutMs = Math.min(Math.max(args.timeout || 180000, 10000), 600000);
  return new Promise((resolve) => {
    let out = "", err = "", done = false;
    const finish = (res) => { if (done) return; done = true; try { fs.unlinkSync(tmp); } catch (_) {} resolve(res); };
    let child;
    try {
      child = spawn(exe, bArgs, { cwd: workspace, windowsHide: true });
    } catch (e) {
      return finish({ ok: false, output: "Gagal menjalankan Blender (" + exe + "): " + e.message });
    }
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) {}
      finish({ ok: false, output: "Blender timeout (" + (timeoutMs / 1000) + "s).\n" + (out + err).slice(-1500) });
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      finish({ ok: false, output: "Error spawn Blender: " + e.message + " (path: " + exe + ")" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      // Blender cerewet (info startup); ambil bagian relevan + traceback bila ada.
      let log = (out + (err ? "\n[stderr]\n" + err : "")).trim();
      if (log.length > 4000) log = log.slice(0, 1500) + "\n...\n[dipotong]\n...\n" + log.slice(-2000);
      const producedPath = outAbs && fs.existsSync(outAbs) ? outAbs : null;
      const ok = code === 0;
      finish({
        ok,
        output:
          (ok ? "Blender selesai (exit 0)." : "Blender GAGAL (exit " + code + ").") +
          (producedPath ? "\nFile keluaran: " + producedPath : outAbs ? "\n(output diminta tapi tak terbentuk: " + outAbs + ")" : "") +
          "\n\n--- log ---\n" + (log || "(tak ada output)"),
        path: producedPath || undefined,
      });
    });
  });
}

module.exports = { runBlender, findBlender, blenderVersion };
