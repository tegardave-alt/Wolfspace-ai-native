// Dua kegagalan senyap yang DITEMUKAN lewat reproduksi, bukan lewat membaca.
//
// Keduanya lolos code review "dengan mata" karena kodenya terlihat wajar.
// Yang menyingkapnya adalah mencoba MENJALANKAN jalur gagalnya.

const fs = require("fs");
const path = require("path");
const os = require("os");

const AKAR = path.resolve(__dirname, "..");
const { rollback, createSnapshot } = require("../agent/snapshot.cjs");

describe("rollback melaporkan kegagalan, bukan menyamarkannya", () => {
  // KENAPA ADA. rollback() dipanggil dari dalam blok catch self_agent.cjs, di
  // ATAS tiga emit — termasuk yang komentarnya berbunyi "ALWAYS emit adone so
  // frontend knows the agent is done". Dua kegagalan terbukti dengan
  // mengeksekusi blok itu apa adanya:
  //
  //   snapshot tak ada -> rollback {ok:false} DIABAIKAN, user tetap diberi tahu
  //                       "Proyek dipulihkan" (padahal tidak)
  //   metadata rusak   -> rollback MELEMPAR, lemparannya membunuh ketiga emit.
  //                       NOL pesan sampai ke UI, dan UI menggantung selamanya
  //                       karena tak pernah tahu run berakhir.
  //
  // Yang kedua paling mahal: kegagalan pemulihan berubah jadi UI beku permanen.

  test("snapshot tak ada -> {ok:false}, bukan melempar", () => {
    const r = rollback("snapshot-yang-tidak-pernah-ada");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/tidak ditemukan/i);
  });

  test("metadata RUSAK -> {ok:false}, bukan melempar", () => {
    // Cabang lama mengaku menangani metadata "rusak" padahal hanya memeriksa
    // KEBERADAAN berkas; isi rusak lolos ke JSON.parse tanpa pengaman.
    const berkas = path.join(os.tmpdir(), "uji-rollback-rusak.txt");
    fs.writeFileSync(berkas, "isi asli");
    const snap = createSnapshot([berkas], "uji-rusak");
    const meta = path.join(
      AKAR,
      ".wolfspace",
      "snapshots",
      snap.id,
      "_meta.json",
    );
    fs.writeFileSync(meta, "{ bukan json valid");

    let lempar = null;
    let hasil = null;
    try {
      hasil = rollback(snap.id);
    } catch (e) {
      lempar = e.message;
    }
    expect(lempar).toBeNull();
    expect(hasil.ok).toBe(false);
    expect(hasil.error).toMatch(/rusak/i);

    fs.rmSync(path.join(AKAR, ".wolfspace", "snapshots", snap.id), {
      recursive: true,
      force: true,
    });
    fs.rmSync(berkas, { force: true });
  });

  test("metadata tanpa daftar berkas -> {ok:false}", () => {
    const berkas = path.join(os.tmpdir(), "uji-rollback-kosong.txt");
    fs.writeFileSync(berkas, "isi");
    const snap = createSnapshot([berkas], "uji-kosong");
    const meta = path.join(
      AKAR,
      ".wolfspace",
      "snapshots",
      snap.id,
      "_meta.json",
    );
    fs.writeFileSync(meta, JSON.stringify({ id: snap.id }));
    const r = rollback(snap.id);
    expect(r.ok).toBe(false);
    fs.rmSync(path.join(AKAR, ".wolfspace", "snapshots", snap.id), {
      recursive: true,
      force: true,
    });
    fs.rmSync(berkas, { force: true });
  });
});

describe("pemanggil rollback memeriksa hasilnya, dan adone SELALU terkirim", () => {
  // Blok catch DIAMBIL dari sumber lalu dieksekusi — bukan ditulis ulang
  // menurut tafsiran, supaya yang diuji memang jalur produksi.
  const SRC = fs
    .readFileSync(require.resolve("../agent/self_agent.cjs"), "utf8")
    .replace(/\r\n/g, "\n");
  const i = SRC.indexOf("if (sessionSnapshotId && (edits || 0) === 0) {");
  const j = SRC.indexOf('finalSummary = "Error: "', i);
  const BLOK = SRC.slice(i, j);

  const jalankan = (snapId) => {
    const pesan = [];
    const emit = (e) => pesan.push({ t: e.t, m: e.m });
    const sessionSnapshotId = snapId;
    const edits = 0;
    const isCancelled = () => false;
    const e = new Error("crash buatan");
    let lempar = null;
    try {
      // eslint-disable-next-line no-eval
      eval(BLOK);
    } catch (err) {
      lempar = err.message;
    }
    return { pesan, lempar };
  };

  test("rollback GAGAL -> user diberi tahu GAGAL, bukan 'dipulihkan'", () => {
    const { pesan, lempar } = jalankan("snapshot-yang-tidak-pernah-ada");
    expect(lempar).toBeNull();
    const rb = pesan.find((p) => /Auto-Rollback/.test(p.m || ""));
    expect(rb.m).toMatch(/GAGAL/);
    expect(rb.m).toMatch(/TIDAK dipulihkan/);
    // Sebabnya ikut, supaya user tahu harus memeriksa apa.
    expect(rb.m).toMatch(/tidak ditemukan/i);
  });

  test("adone TETAP terkirim walau pemulihan gagal — UI tak boleh menggantung", () => {
    // Inilah sifat yang paling mahal bila hilang: tanpa adone, frontend tak
    // pernah tahu run berakhir dan tetap menampilkan agent sibuk selamanya.
    const { pesan } = jalankan("snapshot-yang-tidak-pernah-ada");
    expect(pesan.some((p) => p.t === "adone")).toBe(true);
  });

  test("panggilan rollback DIBUNGKUS try/catch", () => {
    expect(BLOK).toMatch(/try \{\s*\n\s*pulih = rollback\(sessionSnapshotId\)/);
    expect(BLOK).toMatch(/catch \(errRb\)/);
    // Bentuk lama yang mengabaikan nilai balik tak boleh kembali.
    expect(BLOK).not.toMatch(/^\s*rollback\(sessionSnapshotId\);\s*$/m);
  });
});

describe("tanda hidup sampai ke layar: model_wait", () => {
  // KENAPA ADA. model_wait di-emit backend tapi TAK ADA penanganannya di UI,
  // dan tak ada cabang penampung — jadi hilang senyap. Akibatnya seluruh masa
  // tunggu tampak sebagai layar diam: panggilan model yang belasan detik, dan
  // penyiapan MCP yang bisa 60 detik.
  //
  // Ironisnya, detak MCP yang dipasang untuk MENUTUP diam 60 detik justru
  // memakai event ini — jadi perbaikan itu tak menampilkan apa pun sampai
  // penanganannya ada.
  const UI = fs
    .readFileSync(require.resolve("../public/app.jsx"), "utf8")
    .replace(/\r\n/g, "\n");
  const STEPS = fs
    .readFileSync(require.resolve("../public/app/AgentSteps.jsx"), "utf8")
    .replace(/\s+/g, " ");

  test("ditangani di KEDUA salinan penangan event", () => {
    // Dua salinan penangan di app.jsx, keduanya di bawah streamSelfAgent.
    // Perbaikan yang hanya menyentuh satu membuat tanda hidup muncul di satu
    // jalur saja — pola yang sudah berulang di repo ini.
    const n = (UI.match(/j\.t === "model_wait"/g) || []).length;
    expect(n).toBeGreaterThanOrEqual(2);
    expect(
      (UI.match(/upd\(\{ status: j\.m, busy: true \}\)/g) || []).length,
    ).toBeGreaterThanOrEqual(2);
  });

  test("status DIRENDER apa adanya, bukan diganti teks generik", () => {
    // Sebelumnya baris ini hanya bisa berbunyi "Thinking..."/"Processing...",
    // sehingga teks detak yang sudah dikirim backend tak pernah terlihat.
    expect(STEPS).toContain("run.status ||");
    expect(STEPS).toContain('run.thinking ? "Thinking..." : "Processing..."');
  });

  test("force_retry dan todos ditangani di KEDUA salinan penangan", () => {
    // Pola dua permukaan lagi. force_retry di-emit dari ENAM titik di backend;
    // tanpa ini setiap putaran ulang (bisa 4 kali, 60+ detik) tampak sebagai
    // layar diam dan terbaca seolah run berhenti sendiri.
    expect(
      (UI.match(/j\.t === "force_retry"/g) || []).length,
    ).toBeGreaterThanOrEqual(2);
    expect((UI.match(/j\.t === "todos"/g) || []).length).toBeGreaterThanOrEqual(
      2,
    );
    // force_retry masuk timeline sebagai baris, memakai penampil yang sudah ada.
    expect((UI.match(/kind: "retry"/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(STEPS).toContain('k === "retry"');
    // todos jadi STATE checklist hidup, bukan baris timeline — isinya sudah
    // muncul lewat keluaran tool todowrite, jadi mendorongnya ke timeline
    // hanya menggandakan.
    expect(
      (UI.match(/upd\(\{ todos: j\.todos \}\)/g) || []).length,
    ).toBeGreaterThanOrEqual(2);
    expect(STEPS).toContain("run.todos");
  });

  test("status dibersihkan saat langkah baru — tak menempel sesudah tunggu usai", () => {
    expect(UI).toMatch(/upd\(\{ step: j\.n, thinking: "", status: "" \}\)/);
  });

  test("TAK ADA event backend yang tersisa tanpa penanganan UI", () => {
    // Penjaga arah, dan ia sudah membuktikan gunanya: saat force_retry dan
    // todos akhirnya ditangani, tes ini MERAH dan memaksa daftarnya diperbarui
    // secara sadar — bukan lewat begitu saja.
    //
    // Sekarang daftarnya KOSONG. Setiap event baru yang di-emit backend tanpa
    // penanganan di UI akan membuat tes ini merah, jadi "hilang senyap" tak
    // bisa terjadi diam-diam lagi.
    const be =
      fs.readFileSync(require.resolve("../agent/self_agent.cjs"), "utf8") +
      fs.readFileSync(require.resolve("../agent/tools/index.cjs"), "utf8");
    const emit = new Set(
      [...be.matchAll(/emit\(\s*\{\s*t:\s*"([a-z_]+)"/g)].map((m) => m[1]),
    );
    const tangani = new Set(
      [...UI.matchAll(/j\.t === "([a-z_]+)"/g)].map((m) => m[1]),
    );
    const hilang = [...emit].filter((t) => !tangani.has(t)).sort();
    expect(hilang).toEqual([]);
  });
});
