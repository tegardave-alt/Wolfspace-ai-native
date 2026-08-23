// Chat streaming and reply handling (extracted from server.cjs)
// Dependencies – same as original server.cjs
const http = require("http");
const https = require("https");
const { dlog } = require("./debug.cjs");
const { pickSystem } = require("./prompts.cjs");
// runners.cjs DIHAPUS bersama runByLang/detectLang/extractCode: ketiganya
// diimpor di sini tapi TIDAK PERNAH dipanggil — masing-masing muncul tepat
// sekali, yaitu di baris impor ini. Eksekusi kode berjalan lewat tool agent
// (sandbox_run / capability_exec), bukan lewat dispatcher bahasa.
const { runSelfTool, SELF_TOOLS } = require("./tools.cjs");
const {
  askCloudStream,
  fillCloudKey,
  loadCloudKeys,
  CLOUD_KEYS,
} = require("./cloud.ts");
const { createPseudoTagStreamFilter } = require("./pseudo-tag-filter.cjs");

/**
 * Stream a chat completion to the client.
 * @param {Object} opts - {history, port, cloud}
 *   - history: array of {role, content}
 *   - port: local model port (if using local model)
 *   - cloud: optional cloud config {key, provider?, model?, system?, baseUrl?}

 * @param {function(string):void} emit - SSE writer (writes "data: ...\n\n").
 * @param {Object} ctl - control object, currently unused but kept for compatibility.
 */
async function chatStream({ history, port, cloud }, emit, ctl) {
  // Guard: pastikan history selalu berupa array, bukan null/undefined
  const safeHistory = Array.isArray(history) ? history : [];

  // Choose system prompt based on history and mode – prompts module handles.
  const sys = pickSystem(safeHistory);

  // Batasi (slice) riwayat pesan sesuai batas konteks token di masing-masing mode effort
  const effortLevel =
    cloud && typeof cloud.effort !== "undefined"
      ? Number(cloud.effort)
      : arguments[0].effort !== undefined
        ? Number(arguments[0].effort)
        : 1;
  const effortMaxTurns = effortLevel === 0 ? 6 : effortLevel === 2 ? 40 : 16;
  const slicedHistory = safeHistory.slice(-effortMaxTurns);

  const messages = [{ role: "system", content: sys }, ...slicedHistory];
  console.log("[chat] chatStream started", {
    historyLen: safeHistory.length,
    useCloud: !!(cloud && cloud.key),
    port,
  });
  // Plain chat has no tool-execution loop, so a pseudo tool-call tag from a weak/local
  // model can never be a real call here — it only ever needs to be kept off the screen.
  const tagFilter = createPseudoTagStreamFilter((safe) =>
    emit({ t: "tok", c: safe }),
  );
  const onToken = (token) => {
    console.log("[chat] token:", token);
    tagFilter.feed(token);
  };
  const onError = (err) => {
    console.error("[chat] stream error:", err.message || err);
    dlog("chat", "error", "stream error", { err: err.message || err });
    emit({ t: "err", m: err.message || String(err) });
  };

  // Resolusi cloud MANDIRI (sama seperti selfAgentStream). Jalur IPC Electron TIDAK
  // melewati preprocessing HTTP (fillCloudKey), dan localStorage Electron terpisah &
  // kosong → cloud bisa null. Isi key dari file kunci; kalau tetap kosong, pilih
  // provider pertama yang punya key. Tanpa ini chat jatuh ke model LOKAL yang tak ada
  // (config.models kosong) → "model diam" di Electron.
  loadCloudKeys();
  fillCloudKey(cloud);
  if (!(cloud && cloud.key)) {
    const prov = Object.keys(CLOUD_KEYS).find(
      (p) => CLOUD_KEYS[p] && CLOUD_KEYS[p].key,
    );
    if (prov)
      cloud = {
        provider: prov,
        key: CLOUD_KEYS[prov].key,
        model: CLOUD_KEYS[prov].model,
        baseUrl: CLOUD_KEYS[prov].baseUrl,
      };
  }

  // TIDAK ADA lagi cadangan ke model lokal. Jalur llama.cpp/GGUF sudah dihapus
  // bersama Model Hub, jadi askModelStream() pasti menolak dengan
  // "local model is not active — no port" — pesan yang menyebut PORT dan FITUR
  // yang sama-sama tak ada lagi. Pengguna melihatnya sebagai HTTP 400 dan tak
  // punya petunjuk apa pun tentang apa yang harus dilakukan.
  //
  // Penyebab sebenarnya selalu sama: tak ada kunci cloud yang terjangkau. Itu
  // yang harus dikatakan, beserta cara memperbaikinya. Perhatikan `port` masih
  // diterima di tanda tangan fungsi tapi sudah tak dipakai untuk memilih model.
  if (!(cloud && cloud.key)) {
    dlog("chat", "info", "stop", { reason: "no_cloud_key" });
    // Pesan menyebut BERKASNYA, bukan cuma "simpan API key": saat backend jalan
    // di WSL, menyimpan lewat UI hanya mengisi localStorage untuk origin
    // http://<ip-wsl>:8090 — dan IP distro berubah tiap restart, jadi kuncinya
    // hilang lagi. Berkas di $HOME backend kebal terhadap itu.
    const os = require("os");
    const berkas = require("path").join(
      os.homedir(),
      ".wolfspace",
      "cloud-keys.json",
    );
    const pesan =
      "Belum ada API key cloud yang bisa dipakai.\n\n" +
      `Isi kunci di berkas backend: ${berkas}\n` +
      '  contoh: { "opencode": { "key": "...", "model": "deepseek-v4-flash-free" } }\n\n' +
      "Menyimpan lewat menu API Key juga bisa, tapi itu hanya mengisi " +
      "localStorage untuk origin yang sedang dipakai — dan bila backend berjalan " +
      "di WSL, IP distro berubah tiap restart sehingga originnya ikut berubah dan " +
      "kunci itu hilang lagi. Berkas di atas kebal terhadap itu.\n\n" +
      "Model lokal (llama.cpp/GGUF) sudah dihapus, jadi tidak ada jalur cadangan " +
      "selain cloud.";
    emit({ t: "err", m: pesan });
    emit({ t: "done" });
    return { ok: false, error: "no_cloud_key" };
  }
  const streamPromise = askCloudStream(cloud, messages, onToken, null);

  return streamPromise
    .then((full) => {
      dlog("chat", "info", "stream completed", { length: full.length });
      tagFilter.flush(); // release any held-back tail (e.g. text that merely started with "<f")

      return { ok: true, reply: full };
    })
    .catch(onError);
}

/**
 * Determine whether the most recent user message explicitly requests code execution.
 * Guards against auto-executing code blocks in greetings or explanations.
 * @param {Array} history - chat history
 * @returns {boolean} true if the latest user message explicitly requests execution.
 */
// _isExecutionRequested() DIHAPUS — nol pemanggil di seluruh repo. Deteksi
// "user minta eksekusi" sudah pindah ke jalur tool-calling self_agent.cjs.

// runReply() DIHAPUS. Docstring-nya menjanjikan "detect code blocks, execute if
// requested", tapi badannya sudah lama hanya mengembalikan
//     { ok: true, info: "auto-run disabled in normal chat", reply }
// tanpa menjalankan apa pun. Objek itu ikut dipancarkan self_agent sebagai
// field `run` pada event adone, sehingga UI menerima ok:true yang terbaca
// seperti "eksekusi berhasil" padahal tak ada eksekusi, plus salinan penuh teks
// ringkasan di bawah nama `run`. Verifikasi nyata terjadi di tool agent.

/**
 * Helper to parse a pseudo‑action line like "!run python ..." – not used currently
 * but kept for compatibility with older code.
 */
function parseAction(line) {
  const m = line.match(/^!([a-zA-Z]+)\s+(.*)$/);
  if (!m) return null;
  return { verb: m[1], args: m[2] };
}

module.exports = {
  chatStream,
  parseAction,
  SELF_TOOLS,
};
