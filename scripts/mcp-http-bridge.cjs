// Install the .ts hook FIRST: modules below require TypeScript files, and
// this file can itself be an entry point — tests require it directly, and
// `node -e` subprocesses load it without ever going through server.cjs.
require("./ts-register.cjs");
// Jembatan server MCP REMOTE -> stdio.
//
// KENAPA ADA JEMBATAN SAMA SEKALI. Klien MCP WOLFSPACE (agent/mcp-client.ts)
// hanya bicara stdio: spawn proses anak, tulis JSON-RPC ke stdin, baca dari
// stdout. Tak ada satu pun fetch di sana. Berkas ini dijalankan SEBAGAI proses
// anak itu, lalu menerjemahkan stdio <-> jaringan.
//
// KENAPA MENGGANTIKAN sse-bridge.cjs. Pendahulunya hanya bicara transport SSE
// LAMA: GET dengan Accept: text/event-stream, menunggu event `endpoint`, lalu
// POST ke sana. Spesifikasi MCP sekarang memakai Streamable HTTP — SATU endpoint
// yang menerima POST dan membalas application/json ATAU text/event-stream,
// dengan sesi dibawa lewat header Mcp-Session-Id.
//
// Bahwa keduanya memang hidup berdampingan terbukti di log run nyata:
//   [INFO] StreamableHTTP endpoint available at http://127.0.0.1:3333/mcp
//   [INFO] StreamableHTTP endpoint available at http://127.0.0.1:3333/sse (backward compat)
// Server yang HANYA menyediakan /mcp tak akan pernah tersambung lewat jembatan
// lama — dan gagalnya senyap, cuma "Gagal inisialisasi MCP server ...".
//
// Urutan yang dipakai: coba Streamable HTTP dulu; kalau server menolaknya
// (405/404, atau balasan yang bukan JSON/SSE), jatuh ke SSE lama. Jadi server
// baru DAN lama sama-sama jalan tanpa user perlu tahu bedanya.

const readline = require("readline");

const URL_AWAL = process.argv[2];
if (!URL_AWAL) {
  console.error("Pemakaian: node mcp-http-bridge.cjs <url>");
  process.exit(1);
}

// Header tambahan lewat env, supaya token TIDAK perlu ditaruh di argv (argv
// terlihat di daftar proses dan ikut tercatat di log).
let HEADER_EKSTRA = {};
try {
  if (process.env.MCP_HEADERS)
    HEADER_EKSTRA = JSON.parse(process.env.MCP_HEADERS);
} catch (_) {}

const keluar = (s) => process.stdout.write(s.replace(/\r?\n/g, " ") + "\n");
const catat = (s) => console.error("[mcp-bridge] " + s);

// ── Transport 1: Streamable HTTP ──────────────────────────────────────────
//
// Satu URL. Tiap pesan klien dikirim POST. Balasannya bisa:
//   - application/json      -> satu respons, langsung diteruskan
//   - text/event-stream     -> aliran; tiap `data:` diteruskan sampai ditutup
//   - 202 tanpa badan       -> notifikasi diterima, tak ada balasan
// Sesi (kalau server memberikannya) dibawa di header Mcp-Session-Id.
let sesiId = null;

function headerPost() {
  const h = {
    "Content-Type": "application/json",
    // WAJIB memuat keduanya: server memilih format balasan berdasarkan ini.
    Accept: "application/json, text/event-stream",
    ...HEADER_EKSTRA,
  };
  if (sesiId) h["Mcp-Session-Id"] = sesiId;
  return h;
}

async function teruskanSSE(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let data = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    const baris = buf.split("\n");
    buf = baris.pop();
    for (let l of baris) {
      if (l.endsWith("\r")) l = l.slice(0, -1);
      if (l === "") {
        if (data) keluar(data);
        data = "";
      } else if (l.startsWith("data:")) {
        const d = l.slice(5);
        data += (data ? "\n" : "") + (d.startsWith(" ") ? d.slice(1) : d);
      }
      // baris `event:` dan `id:` diabaikan: pada Streamable HTTP muatan
      // JSON-RPC selalu ada di `data:`.
    }
  }
}

async function kirimStreamable(pesan) {
  const res = await fetch(URL_AWAL, {
    method: "POST",
    headers: headerPost(),
    body: pesan,
  });

  const sid = res.headers.get("mcp-session-id");
  if (sid) sesiId = sid;

  if (res.status === 202) return true; // notifikasi, tak ada balasan
  if (!res.ok) {
    const teks = await res.text().catch(() => "");
    catat(
      "POST gagal " +
        res.status +
        " " +
        res.statusText +
        " " +
        teks.slice(0, 200),
    );
    return false;
  }

  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("text/event-stream")) {
    // JANGAN di-await.
    //
    // Streamable HTTP MEMBOLEHKAN server menahan aliran tetap terbuka setelah
    // membalas, untuk pesan susulan yang ia mulai sendiri. Menunggu `done`
    // berarti menunggu server menutupnya — dan server yang tak pernah menutup
    // membuat antrean di bawah macet selamanya.
    //
    // Terukur pada @penpot/mcp: `initialize` dibalas dan lolos, lalu
    // `tools/list` menggantung sampai timeout 60 detik. Bukan Penpot yang
    // salah — permintaan yang sama lewat curl dijawab seketika.
    //
    // Kekhawatiran lama "balasannya saling menyalip di stdout" tidak berlaku:
    // JSON-RPC membawa `id`, klien mencocokkan balasan lewat id, dan keluar()
    // menulis satu baris utuh sekali jalan.
    teruskanSSE(res).catch((e) => catat("aliran SSE putus: " + e.message));
    return true;
  }
  if (ct.includes("application/json")) {
    const teks = await res.text();
    if (teks.trim()) keluar(teks.trim());
    return true;
  }
  catat("content-type tak dikenal: " + ct);
  return false;
}

// ── Transport 2: SSE lama (cadangan) ──────────────────────────────────────
//
// GET membuka aliran; server mengirim event `endpoint` berisi URL POST, lalu
// event `message` berisi balasan JSON-RPC.
let endpointPost = null;

async function mulaiSSELama() {
  const res = await fetch(URL_AWAL, {
    headers: { Accept: "text/event-stream", ...HEADER_EKSTRA },
  });
  if (!res.ok) {
    catat("SSE lama juga gagal: " + res.status + " " + res.statusText);
    process.exit(1);
  }
  catat("memakai transport SSE lama");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let ev = null;
  let data = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      catat("aliran SSE ditutup server");
      process.exit(0);
    }
    buf += dec.decode(value, { stream: true });
    const baris = buf.split("\n");
    buf = baris.pop();
    for (let l of baris) {
      if (l.endsWith("\r")) l = l.slice(0, -1);
      if (l === "") {
        if (ev === "endpoint" && data)
          endpointPost = new URL(data, URL_AWAL).href;
        else if (ev === "message" && data) keluar(data);
        ev = null;
        data = "";
      } else if (l.startsWith("event:")) ev = l.slice(6).trim();
      else if (l.startsWith("data:")) {
        const d = l.slice(5);
        data += (data ? "\n" : "") + (d.startsWith(" ") ? d.slice(1) : d);
      }
    }
  }
}

async function kirimSSELama(pesan) {
  if (!endpointPost) {
    catat("belum menerima endpoint POST — pesan dibuang");
    return;
  }
  try {
    const r = await fetch(endpointPost, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...HEADER_EKSTRA },
      body: pesan,
    });
    if (!r.ok) catat("POST gagal: " + r.status + " " + r.statusText);
  } catch (e) {
    catat("gagal mengirim: " + e.message);
  }
}

// ── Jalur utama ───────────────────────────────────────────────────────────
let mode = null; // "streamable" | "sse"
const antre = [];
let sibuk = false;

// Pesan diproses BERURUTAN. Streamable HTTP boleh membalas dengan aliran SSE
// yang dibaca sampai habis; mengirim pesan berikutnya sebelum itu selesai
// membuat balasannya saling menyalip di stdout.
async function proses() {
  if (sibuk) return;
  sibuk = true;
  while (antre.length) {
    const pesan = antre.shift();
    try {
      if (mode === "streamable") {
        const ok = await kirimStreamable(pesan);
        if (!ok && !endpointPost) {
          // Streamable ditolak pada pesan PERTAMA -> coba transport lama.
          catat("Streamable HTTP ditolak, beralih ke SSE lama");
          mode = "sse";
          mulaiSSELama().catch((e) => {
            catat("fatal: " + e.message);
            process.exit(1);
          });
          antre.unshift(pesan);
          // beri waktu event `endpoint` datang sebelum mencoba lagi
          await new Promise((r) => setTimeout(r, 1500));
        }
      } else {
        await kirimSSELama(pesan);
      }
    } catch (e) {
      catat("gagal memproses pesan: " + e.message);
    }
  }
  sibuk = false;
}

readline
  .createInterface({ input: process.stdin, terminal: false })
  .on("line", (l) => {
    if (!l.trim()) return;
    antre.push(l);
    proses();
  });

mode = "streamable";
catat("mencoba Streamable HTTP: " + URL_AWAL.replace(/\?.*$/, "?***"));
