// ── Satu kosakata untuk pertanyaan "siapa yang menegakkan batas ini?" ──
//
// KENAPA ADA. Tiap jalur eksekusi tumbuh sendiri-sendiri dan melaporkan dengan
// kata yang berbeda: bash memakai "namespace"/"regex", zona memakai
// "bwrap"/"unshare", sandbox_run tak melaporkan apa pun. Tiga kosakata untuk
// satu pertanyaan berarti pemanggil harus tahu ia sedang bicara dengan jalur
// yang mana — persis yang seharusnya TIDAK perlu diketahui.
//
// Yang dipisahkan di sini ada dua hal, dan pemisahan itu disengaja:
//
//   penegakan : SIAPA yang menolak. Ini yang menentukan kekuatannya.
//   mekanisme : DENGAN APA. Ini yang berguna untuk mendiagnosis.
//
// Menggabungkan keduanya jadi satu kata selalu berakhir menyesatkan: "bwrap"
// tak memberi tahu bahwa itu batas kernel, dan "kernel" tak memberi tahu apa
// yang harus diperiksa saat ada yang aneh.
"use strict";

/**
 * @typedef {"kernel"|"runtime"|"penasihat"} Penegak
 *
 * kernel    — sistem operasi yang menolak: namespace, bwrap, hypervisor.
 *             Berlaku pada proses apa pun yang di-spawn dari dalamnya.
 * runtime   — runtime bahasa yang menolak: `--permission` milik Node. Kuat,
 *             tapi hanya untuk proses Node itu sendiri.
 * penasihat — kode KITA yang memeriksa: pemindai teks, cek path di helper JS.
 *             Proses yang di-spawn tak terikat sama sekali. TERUKUR bisa
 *             dilewati: path yang dirakit saat jalan tak punya token untuk
 *             dipindai (lihat tests/bash-tingkat-penegakan.test.js).
 */

/**
 * @param {Penegak} penegakan
 * @param {string} mekanisme
 * @returns {{penegakan: Penegak, mekanisme: string, terkurungOs: boolean}}
 */
function label(penegakan, mekanisme) {
  return {
    penegakan,
    mekanisme,
    // Turunan, bukan medan bebas — supaya tak mungkin ada laporan yang
    // mengklaim terkurung OS sambil menyebut penegaknya "penasihat".
    terkurungOs: penegakan === "kernel",
  };
}

// Terjemahan dari capabilities() adapter platform. Adapter sudah menjawab
// pertanyaan ini dengan jujur sejak awal ('none' | 'advisory' | 'enforced');
// yang belum ada cuma jalan bagi jawabannya untuk sampai ke pemanggil tool.
function dariAdapter(kap, mekanismeBila) {
  if (!kap) return label("penasihat", "tak diketahui");
  if (kap.fsIsolation === "enforced")
    return label("kernel", mekanismeBila || "namespace");
  // 'advisory' DAN 'none' sama-sama bukan batas OS. Bedanya cuma apakah kode
  // kita repot memeriksa — dan pemeriksaan itu tak mengikat proses anak.
  return label(
    "penasihat",
    kap.fsIsolation === "advisory" ? "helper-js" : "tak ada",
  );
}

module.exports = { label, dariAdapter };
