// gen3d-tools — generate model 3D dari TEKS atau GAMBAR via Replicate (model
// open-source, kita orkestrasi; bukan skrip prosedural yang berantakan).
// Alur: prompt -> flux-schnell (teks->gambar bersih) -> TRELLIS (gambar->GLB).
// Bila 'image' diberikan, tahap teks->gambar dilewati (langsung gambar->3D).
const fs = require("fs");
const path = require("path");

const API = "https://api.replicate.com/v1";

function replicateKey() {
  // Cari replicate.key di beberapa lokasi cloud-keys.json (canonical, server/,
  // legacy QROOT). Cadangan terakhir: env REPLICATE_API_TOKEN.
  const QROOT = path.resolve(__dirname, "..", "..");
  const candidates = [];
  try { candidates.push(require("../keys-path.cjs").resolveKeysPath()); } catch (_) {}
  candidates.push(path.join(QROOT, "server", "cloud-keys.json"));
  candidates.push(path.join(QROOT, "cloud-keys.json"));
  for (const p of candidates) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      if (raw.replicate && raw.replicate.key) return raw.replicate.key;
    } catch (_) {}
  }
  return process.env.REPLICATE_API_TOKEN || null;
}

function _inside(root, p) {
  const r = path.resolve(root), t = path.resolve(p);
  return t === r || t.startsWith(r + path.sep);
}

// Jalankan satu model Replicate (buat prediction lalu polling sampai selesai).
async function replicateRun(key, modelPath, input, { maxWaitMs = 300000, onNote } = {}) {
  const create = await fetch(`${API}/models/${modelPath}/predictions`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Prefer: "wait=55", // Replicate blokir hingga 55s; sisanya kita polling
    },
    body: JSON.stringify({ input }),
  });
  let pred = await create.json();
  if (!create.ok) throw new Error(`Replicate ${modelPath}: ${pred.detail || pred.title || create.status}`);
  const started = Date.now();
  while (pred.status === "starting" || pred.status === "processing") {
    if (Date.now() - started > maxWaitMs) throw new Error(`${modelPath}: timeout (${maxWaitMs / 1000}s), status=${pred.status}`);
    if (onNote) onNote(`${modelPath}: ${pred.status}…`);
    await new Promise((r) => setTimeout(r, 3000));
    const g = await fetch(pred.urls.get, { headers: { Authorization: "Bearer " + key } });
    pred = await g.json();
  }
  if (pred.status !== "succeeded")
    throw new Error(`${modelPath} ${pred.status}: ${pred.error || "(tanpa detail)"}`);
  return pred.output;
}

// args: { prompt?, image?, output?, texture_size?, timeout? }  ctx: { workspaceRoot? }
async function generate3d(args, ctx) {
  const key = replicateKey();
  if (!key) return { ok: false, output: "Replicate API key tak ditemukan (server/cloud-keys.json -> replicate.key)." };
  const workspace = (ctx && ctx.workspaceRoot) || process.cwd();
  const outRel = args.output || "generated.glb";
  const outAbs = path.isAbsolute(outRel) ? path.resolve(outRel) : path.resolve(workspace, outRel);
  if (!_inside(workspace, outAbs)) return { ok: false, output: `output '${outRel}' menembus keluar workspace.` };
  try { fs.mkdirSync(path.dirname(outAbs), { recursive: true }); } catch (_) {}
  const notes = [];
  const onNote = (n) => notes.push(n);
  const maxWaitMs = Math.min(Math.max(args.timeout || 300000, 30000), 600000);

  try {
    // 1) Tentukan gambar sumber.
    let imageUrl = null;
    if (args.image) {
      if (/^https?:\/\//.test(args.image)) {
        imageUrl = args.image; // URL langsung
      } else {
        // File lokal (dalam workspace) -> data URI.
        const abs = path.isAbsolute(args.image) ? path.resolve(args.image) : path.resolve(workspace, args.image);
        if (!_inside(workspace, abs)) return { ok: false, output: `image '${args.image}' di luar workspace.` };
        if (!fs.existsSync(abs)) return { ok: false, output: `image tidak ada: ${abs}` };
        const ext = (path.extname(abs).slice(1) || "png").toLowerCase();
        imageUrl = `data:image/${ext};base64,` + fs.readFileSync(abs).toString("base64");
      }
    } else if (args.prompt) {
      // Teks -> gambar bersih (latar putih, 1 objek) supaya image->3D rapi.
      onNote("teks→gambar (flux-schnell)…");
      const p = args.prompt.trim() + ", single object, centered, full view, plain white background, product studio photo, no shadow";
      const imgOut = await replicateRun(key, "black-forest-labs/flux-schnell",
        { prompt: p, aspect_ratio: "1:1", num_outputs: 1, output_format: "png", go_fast: true }, { maxWaitMs, onNote });
      imageUrl = Array.isArray(imgOut) ? imgOut[0] : imgOut;
      if (!imageUrl) throw new Error("flux-schnell tak mengembalikan gambar.");
    } else {
      return { ok: false, output: "Butuh 'prompt' (teks) atau 'image' (path/URL)." };
    }

    // 2) Gambar -> 3D (TRELLIS). generate_model=true WAJIB agar menghasilkan GLB.
    onNote("gambar→3D (TRELLIS)…");
    const out = await replicateRun(key, "firtoz/trellis", {
      images: [imageUrl],
      generate_model: true,
      texture_size: args.texture_size || 1024,
      mesh_simplify: 0.9,
      generate_color: true,
    }, { maxWaitMs, onNote });
    const glbUrl = out && (out.model_file || (out.output && out.output.model_file));
    if (!glbUrl) throw new Error("TRELLIS tak mengembalikan model_file (GLB). Output: " + JSON.stringify(out).slice(0, 200));

    // 3) Unduh GLB ke workspace.
    const glbRes = await fetch(glbUrl);
    if (!glbRes.ok) throw new Error("Gagal unduh GLB: HTTP " + glbRes.status);
    const buf = Buffer.from(await glbRes.arrayBuffer());
    fs.writeFileSync(outAbs, buf);

    return {
      ok: true,
      path: outAbs,
      output:
        "Model 3D dibuat: " + outAbs + " (" + (buf.length / 1024 / 1024).toFixed(2) + " MB)\n" +
        "Alur: " + notes.join(" → ") + "\n" +
        (out.combined_video ? "Preview video: " + out.combined_video : ""),
    };
  } catch (e) {
    return { ok: false, output: "generate_3d gagal: " + e.message + (notes.length ? "\n(tahap: " + notes.join(" → ") + ")" : "") };
  }
}

module.exports = { generate3d, replicateKey };
