"use strict";
/**
 * ── Sesi debug DAP, dengan keadaan yang bisa dibaca renderer ──
 *
 * core/dap.cjs bicara protokolnya. Berkas ini yang MENGINGAT: satu sesi punya
 * keadaan (sedang berhenti di mana, apa isi variabelnya, apa yang sudah
 * dicetak), dan renderer menanyakannya lewat satu permintaan.
 *
 * KENAPA DITARIK DI SINI, BUKAN DI RENDERER. Saat program berhenti di titik
 * henti, yang dibutuhkan bukan satu jawaban melainkan tiga permintaan
 * beruntun: `stackTrace` -> `scopes` -> `variables`. Membiarkan renderer
 * merangkainya berarti tiga perjalanan IPC untuk satu peristiwa, dan tiap
 * jedanya adalah jeda antara "program berhenti" dan "layar menunjukkannya".
 * Di sini ketiganya dikerjakan begitu kejadian `stopped` tiba, jadi saat
 * renderer bertanya, jawabannya sudah lengkap.
 */

const path = require("path");
const { KlienDap, mulaiSesi } = require("./dap.cjs");

const sesi = new Map();
let urut = 1;

const KELUARAN_MAKS = 400; // baris; sesi panjang tak boleh tumbuh tanpa batas

function _bersihkanKeluaran(s) {
  if (s.keluaran.length > KELUARAN_MAKS)
    s.keluaran = s.keluaran.slice(-KELUARAN_MAKS);
}

// Menarik keadaan lengkap saat program berhenti. Kegagalan di sini TIDAK boleh
// menjatuhkan sesinya: adapter kadang menolak `scopes` untuk bingkai yang sudah
// tak sah (mis. pemakai menekan Continue tepat saat data ditarik), dan itu
// bukan alasan mematikan seluruh sesi debug.
async function _tarikKeadaan(s, badan) {
  const utas = badan && badan.threadId;
  const hasil = {
    alasan: (badan && badan.reason) || "stopped",
    utas,
    berkas: null,
    baris: null,
    tumpukan: [],
    variabel: [],
  };
  try {
    const st = await s.klien.kirim("stackTrace", {
      threadId: utas,
      levels: 20,
    });
    hasil.tumpukan = (st.stackFrames || []).map((f) => ({
      id: f.id,
      nama: f.name,
      baris: f.line,
      kolom: f.column,
      berkas: (f.source && f.source.path) || null,
    }));
    const atas = hasil.tumpukan[0];
    if (atas) {
      hasil.berkas = atas.berkas;
      hasil.baris = atas.baris;
      const sc = await s.klien.kirim("scopes", { frameId: atas.id });
      // Cakupan lokal saja. `globals` di Python memuat ratusan nama bawaan yang
      // tak pernah dicari orang saat men-debug, dan menampilkannya justru
      // menenggelamkan variabel yang benar-benar dilihat.
      const lokal =
        (sc.scopes || []).find((c) => /local/i.test(c.name)) ||
        (sc.scopes || [])[0];
      if (lokal && lokal.variablesReference) {
        const v = await s.klien.kirim("variables", {
          variablesReference: lokal.variablesReference,
        });
        hasil.variabel = (v.variables || []).map((x) => ({
          nama: x.name,
          nilai: x.value,
          tipe: x.type || "",
          // > 0 berarti nilainya punya isi yang bisa dibuka lebih dalam.
          anak: x.variablesReference > 0 ? x.variablesReference : 0,
        }));
      }
    }
  } catch (e) {
    hasil.galat = String((e && e.message) || e);
  }
  s.berhenti = hasil;
}

/**
 * Membuka sesi. `titikHenti` berbentuk { "<path absolut>": [nomor baris] }.
 */
// Ekstensi -> adapter. Kuncinya sengaja sama dengan jenisDebugger() di
// public/app.jsx supaya UI dan server tak pernah berbeda pendapat soal berkas
// mana yang lewat DAP.
const ADAPTER = {
  py: "python",
  js: "js",
  mjs: "js",
  cjs: "js",
  ts: "js",
  tsx: "js",
  jsx: "js",
};
function adapterUntuk(berkas) {
  const m = /\.([a-z0-9]+)$/i.exec(String(berkas || ""));
  return (m && ADAPTER[m[1].toLowerCase()]) || null;
}

async function buka({ program, cwd, titikHenti, python }) {
  const jenis = adapterUntuk(program);
  if (!jenis) throw new Error("belum ada adapter DAP untuk berkas ini");
  const id = "dap_" + Date.now().toString(36) + "_" + urut++;
  const dap = require("./dap.cjs");
  const klien =
    jenis === "js"
      ? await dap.klienJs({ cwd })
      : dap.klienPython({ cwd, python });
  const s = {
    id,
    klien,
    program,
    cwd,
    berhenti: null,
    keluaran: [],
    selesai: false,
    galat: null,
    titikHenti: titikHenti || {},
  };
  sesi.set(id, s);

  klien.on("output", (b) => {
    if (!b || !b.output) return;
    s.keluaran.push(String(b.output));
    _bersihkanKeluaran(s);
  });
  klien.on("breakpoint", (b) => {
    // js-debug menjalankan sesi ANAK; balasan setBreakpoints dari sesi INDUK
    // selalu `verified:false` karena bukan dia yang memasangnya. Pengakuan yang
    // sebenarnya datang belakangan sebagai kejadian ini.
    const t = b && b.breakpoint;
    if (!t) return;
    s.terpasang = (s.terpasang || []).filter((x) => x.baris !== t.line);
    s.terpasang.push({ baris: t.line, sah: !!t.verified });
  });
  klien.on("stopped", (b) => {
    _tarikKeadaan(s, b);
  });
  // `continued` tak selalu dikirim tiap adapter, jadi keadaan "jalan lagi" juga
  // disetel saat aksi dikirim (lihat aksi()). Keduanya perlu: yang satu untuk
  // adapter yang mengirimnya, yang satu untuk yang tidak.
  klien.on("continued", () => {
    s.berhenti = null;
  });
  const habis = () => {
    s.selesai = true;
    s.berhenti = null;
  };
  klien.on("terminated", habis);
  klien.on("exited", habis);
  klien.on("keluar", habis);
  klien.on("galat-adapter", (t) => {
    s.galat = String(t).slice(0, 500);
  });

  try {
    const tp = await mulaiSesi(
      klien,
      jenis === "js"
        ? {
            type: "pwa-node",
            request: "launch",
            name: "wolfspace",
            program,
            cwd,
            console: "internalConsole",
          }
        : {
            type: "debugpy",
            request: "launch",
            name: "wolfspace",
            program,
            cwd,
            console: "internalConsole",
            justMyCode: true,
          },
      s.titikHenti,
    );
    s.terpasang = tp.map((t) => ({ baris: t.line, sah: !!t.verified }));
  } catch (e) {
    // Sesinya TIDAK dihapus di sini: pesan galatnya justru yang paling ingin
    // dilihat pemakai, dan menghapusnya membuat /dap/keadaan menjawab
    // "sesi tak ada" — yang terbaca seperti bug aplikasi, bukan seperti
    // program yang gagal dijalankan.
    s.galat = String((e && e.message) || e);
    s.selesai = true;
  }
  return id;
}

const PETA_AKSI = {
  lanjut: "continue",
  lewati: "next",
  masuk: "stepIn",
  keluar: "stepOut",
};

async function aksi(id, nama) {
  const s = sesi.get(id);
  if (!s) throw new Error("sesi tak ada: " + id);
  if (nama === "berhenti") {
    await tutup(id);
    return { ok: true, selesai: true };
  }
  const perintah = PETA_AKSI[nama];
  if (!perintah) throw new Error("aksi tak dikenal: " + nama);
  const utas = (s.berhenti && s.berhenti.utas) || 1;
  // Keadaan "berhenti" dibersihkan SEBELUM permintaan dikirim. Kalau sesudah,
  // ada jendela saat layar masih menunjukkan baris lama padahal programnya
  // sudah jalan — dan pemakai menekan tombol berikutnya berdasarkan itu.
  s.berhenti = null;
  await s.klien.kirim(perintah, { threadId: utas });
  return { ok: true };
}

async function titikHenti(id, berkas, baris) {
  const s = sesi.get(id);
  if (!s) throw new Error("sesi tak ada: " + id);
  s.titikHenti[berkas] = baris;
  const b = await s.klien.kirim("setBreakpoints", {
    source: { path: berkas },
    breakpoints: (baris || []).map((l) => ({ line: l })),
  });
  return (b.breakpoints || []).map((t) => ({
    baris: t.line,
    sah: !!t.verified,
  }));
}

function keadaan(id, sejak) {
  const s = sesi.get(id);
  if (!s) return null;
  const dari = Number(sejak) || 0;
  return {
    id: s.id,
    program: s.program,
    selesai: s.selesai,
    galat: s.galat,
    terpasang: s.terpasang || [],
    berhenti: s.berhenti,
    // Keluaran dikirim SEJAK indeks yang sudah dipegang renderer, bukan
    // seluruhnya tiap kali. Mengirim ulang semuanya pada polling 400 ms membuat
    // muatannya tumbuh terus sepanjang sesi.
    keluaranDari: dari,
    keluaran: s.keluaran.slice(dari),
    keluaranTotal: s.keluaran.length,
  };
}

async function tutup(id) {
  const s = sesi.get(id);
  if (!s) return false;
  sesi.delete(id);
  s.selesai = true;
  try {
    // Diminta berhenti baik-baik dulu; kalau adapter tak menjawab, batas waktu
    // di dalam kirim() yang menyelesaikannya, lalu prosesnya dibunuh.
    await s.klien.kirim("disconnect", { terminateDebuggee: true }, 3000);
  } catch (_) {}
  try {
    s.klien.tutup();
  } catch (_) {}
  return true;
}

function daftar() {
  return [...sesi.values()].map((s) => ({
    id: s.id,
    program: s.program,
    selesai: s.selesai,
  }));
}

module.exports = {
  adapterUntuk,
  buka,
  aksi,
  titikHenti,
  keadaan,
  tutup,
  daftar,
  _sesi: sesi,
};
