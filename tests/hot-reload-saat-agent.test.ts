// Hot-reload tidak boleh menembak di tengah pekerjaan agent.
//
// KENAPA ADA. Agent WOLFSPACE menyunting sumbernya SENDIRI, dan direktori yang
// dipantau electron/main.js — public, electron, agent, scripts — persis yang
// disuntingnya. Jadi agent memicu reload-nya sendiri, dan dulu tanpa satu pun
// penjaga. Rantai akibatnya, ditelusuri dari laporan pemakai "agent mengulang
// pekerjaan" + "hot reload tiba-tiba":
//
//   agent menulis public/** non-js
//     -> public/index.html menjalankan window.location.reload()
//     -> thread_id yang hidup di state React lenyap
//     -> permintaan berikutnya dikirim tanpa thread_id
//     -> self_agent.ts mencetak thread BARU
//     -> MemorySaver tak punya checkpoint untuknya
//     -> agent mulai dari nol dan MENGULANG.
//
// Jadi keduanya bukan dua bug: yang kedua akibat yang pertama.
//
// Dua lapis dijaga di sini. Lapis pertama (penjaga sibuk) menutup sumber reload
// yang paling sering. Lapis kedua (thread_id bertahan) membuat reload dari mana
// pun — F5, rollback Babel di index.html, renderer mati — tak lagi membuat agent
// lupa.
//
// CATATAN CAKUPAN: electron/main.js me-require "electron", jadi tak bisa dimuat
// di Jest. Yang diuji di sini strukturnya, seperti berkas uji lain di repo ini
// untuk kode platform. Sifat yang benar-benar berisiko — kedaluwarsa dan
// penghapusan thread — diuji sebagai PERILAKU dengan mengeksekusi helper-nya.

const fs = require("fs");
const vm = require("vm");

// electron/main.js is generated and NOT committed, so it may not exist in a
// fresh clone. Building it here is also more honest than reading disk: the
// assertions below describe what the build produces.
const bangunMain = () => require("../scripts/build-main.cjs").bangun();

const MAIN = bangunMain();
const APP = fs.readFileSync(require.resolve("../public/app.tsx"), "utf8");

describe("penjaga: reload ditunda selama agent berjalan", () => {
  test("channel stream dicatat, sehingga run agent bisa dikenali", () => {
    // Tanpa ini _agentSibuk() tak punya cara membedakan run agent dari stream
    // chat biasa, dan penjaga jadi menunda segalanya atau tak menunda apa pun.
    expect(MAIN).toMatch(/const st = \{ cancelled: false, req: null, channel,/);
  });

  test("KEDUA jalur reload lewat penjaga, bukan cuma satu", () => {
    // Jalur frontend (hmr -> bisa berujung window.location.reload) dan jalur
    // backend (buang require.cache + bangun ulang core) sama-sama berbahaya di
    // tengah run. Menjaga satu saja menyisakan gejalanya.
    const jml = (MAIN.match(/_tundaSelagiSibuk\(/g) || []).length;
    expect(jml).toBeGreaterThanOrEqual(3); // 1 definisi + 2 pemakaian
    expect(MAIN).toMatch(/_tundaSelagiSibuk\("hmr /);
    expect(MAIN).toMatch(/_tundaSelagiSibuk\("backend /);
  });

  test("reload DITUNDA, bukan dibatalkan", () => {
    // Membuang reload akan mematikan tujuan aslinya: agent melihat perubahan
    // sumbernya sendiri. Yang ditunda harus benar-benar dijalankan nanti.
    expect(MAIN).toMatch(/function _lepasReloadTertunda/);
    expect(MAIN).toMatch(/_reloadTertunda = \{ label, fn \}/);
  });

  test("pelepasan terjadi SESUDAH stream dihapus dari daftar", () => {
    // Urutan terbalik membuat _agentSibuk() masih melihat run yang baru saja
    // selesai, sehingga yang ditunda tak pernah jalan sampai ada run berikutnya.
    const i = MAIN.indexOf("_streams.delete(id)");
    const j = MAIN.indexOf("_lepasReloadTertunda()", i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  test("finish() TERJAMIN walau fn melempar SINKRON", () => {
    // Promise.resolve(fn(...)) saja tidak cukup: lemparan sinkron terjadi SEBELUM
    // Promise.resolve membungkusnya, keluar dari handler, dan finish() tak pernah
    // jalan. Entri stream lalu tertinggal selamanya — dan sejak ada penjaga ini,
    // akibatnya berlipat: _agentSibuk() terus true, SETIAP reload ditunda tanpa
    // batas, dan aplikasi berhenti memperbarui diri tanpa satu pun pesan.
    const i = MAIN.indexOf("Promise.resolve(fn(payload, emit, ctl))");
    expect(i).toBeGreaterThan(-1);
    const sebelum = MAIN.slice(Math.max(0, i - 200), i);
    expect(sebelum).toMatch(/try {/);
  });

  test("run agent yang menggantung TIDAK menahan reload selamanya", () => {
    // Jaring pengaman kedua: penjaga ini bergantung pada finish(), dan
    // kebergantungan itu harus dibatasi waktu. Hot-reload yang mati diam-diam
    // jauh lebih mahal daripada reload yang menembak di tengah run panjang.
    expect(MAIN).toMatch(/AGENT_SIBUK_MAKS_MS/);
    expect(MAIN).toMatch(/mulai: Date\.now\(\)/);
    // Umur run BENAR-BENAR dibandingkan, bukan cuma konstantanya ada.
    expect(MAIN).toMatch(/s\.mulai[^)]*\)\s*<\s*AGENT_SIBUK_MAKS_MS/);
  });
});

// Helper thread_id diambil dari app.tsx lalu benar-benar DIJALANKAN dengan
// localStorage palsu. app.tsx berkas browser tanpa module.exports, jadi ini satu-
// satunya cara menguji perilakunya tanpa memuat seluruh React.
function muatHelperThread() {
  // Batas akhir dipatok ke deklarasi berikutnya, BUKAN offset tetap: offset
  // tetap memotong fungsi di tengah begitu isinya berubah sedikit saja, dan
  // ujinya merah karena SyntaxError alih-alih karena perilakunya salah.
  const mulai = APP.indexOf("const THREAD_KEY");
  const akhir = APP.indexOf("const PREFIXES", mulai);
  expect(mulai).toBeGreaterThan(-1);
  expect(akhir).toBeGreaterThan(mulai);
  const potong = APP.slice(mulai, akhir);
  const toko = new Map();
  const ctx = {
    localStorage: {
      getItem: (k) => (toko.has(k) ? toko.get(k) : null),
      setItem: (k, v) => toko.set(k, String(v)),
      removeItem: (k) => toko.delete(k),
    },
    JSON,
    Date,
  };
  vm.createContext(ctx);
  // TRANSPILED first, exactly as index.html loads a .tsx file. The extracted
  // slice carries type annotations since app.jsx migrated, and vm would stop
  // at the first colon.
  globalThis.self = globalThis;
  const Babel = require(
    require("path").join(__dirname, "..", "public/vendor/babel.min.js"),
  );
  vm.runInContext(
    Babel.transform(potong, { presets: ["typescript"], filename: "thread.ts" })
      .code,
    ctx,
  );
  return ctx;
}

describe("thread_id bertahan melewati reload", () => {
  test("disimpan lalu terbaca kembali", () => {
    const c = muatHelperThread();
    c.simpanThreadTerputus("thread_abc");
    expect(c.ambilThreadTerputus()).toBe("thread_abc");
  });

  test("DIHAPUS saat run tuntas — pesan berikutnya tak ikut tersambung", () => {
    // Ini sifat yang paling mudah salah. Thread basi yang tertinggal akan diam-
    // diam menyambungkan tugas baru ke percakapan lama, dan itu lebih
    // membingungkan daripada gejala yang sedang diperbaiki.
    const c = muatHelperThread();
    c.simpanThreadTerputus("thread_abc");
    c.simpanThreadTerputus(null);
    expect(c.ambilThreadTerputus()).toBeNull();
  });

  test("kedaluwarsa setelah 30 menit", () => {
    const c = muatHelperThread();
    c.simpanThreadTerputus("thread_lama");
    const asli = c.Date.now;
    c.Date.now = () => asli() + 31 * 60 * 1000;
    expect(c.ambilThreadTerputus()).toBeNull();
    c.Date.now = asli;
  });

  test("isi rusak tidak meledak, cuma dianggap tak ada", () => {
    const c = muatHelperThread();
    c.localStorage.setItem("wolfspace:thread-terputus", "{bukan json");
    expect(c.ambilThreadTerputus()).toBeNull();
  });

  test("hitlData tetap MENANG atas thread tersimpan", () => {
    // Urutan spread menentukan: thread_id tersimpan ditulis lebih dulu, lalu
    // ...hitlData menimpanya. Terbalik, resume HITL akan memakai thread yang
    // salah.
    const i = APP.indexOf("thread_id: ambilThreadTerputus()");
    const j = APP.indexOf("...hitlData", i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  test("dibersihkan hanya bila TIDAK sedang menunggu jawaban", () => {
    // Run yang berhenti untuk HITL belum tuntas; menghapus thread-nya di situ
    // akan membuat resume mustahil.
    expect(APP).toMatch(/if \(!waitingForInput\) simpanThreadTerputus\(null\)/);
  });
});
