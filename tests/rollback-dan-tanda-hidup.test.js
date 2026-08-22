// Dua kegagalan senyap yang DITEMUKAN lewat reproduksi, bukan lewat membaca.
//
// Keduanya lolos code review "dengan mata" karena kodenya terlihat wajar.
// Yang menyingkapnya adalah mencoba MENJALANKAN jalur gagalnya.

const fs = require("fs");
const path = require("path");
const os = require("os");

const AKAR = path.resolve(__dirname, "..");
const { rollback, createSnapshot } = require("../agent/snapshot.ts");

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
    .readFileSync(require.resolve("../public/app/AgentSteps.tsx"), "utf8")
    .replace(/\s+/g, " ");

  // Berapa TEMPAT yang memanggil streamSelfAgent, di luar definisinya sendiri.
  // Dulu ada dua: chat utama dan chat panel Workflow. Panel itu sudah dihapus
  // bersama kanvas React Flow, jadi tinggal satu.
  //
  // Angkanya sengaja DIHITUNG, bukan dipatok. Asersi lama menuntut "minimal 2"
  // dan langsung merah begitu salinan keduanya hilang — padahal yang hilang
  // justru duplikasinya, bukan penanganannya. Yang perlu dijaga bukan jumlah
  // dua, melainkan: SETIAP pemanggil menangani event ini, berapa pun jumlahnya.
  const PEMANGGIL =
    (UI.match(/streamSelfAgent\(/g) || []).length -
    (UI.match(/async function streamSelfAgent\(/g) || []).length;

  test("ditangani di SETIAP pemanggil streamSelfAgent", () => {
    expect(PEMANGGIL).toBeGreaterThanOrEqual(1);
    expect((UI.match(/j\.t === "model_wait"/g) || []).length).toBe(PEMANGGIL);
    expect(
      (UI.match(/upd\(\{ status: j\.m, busy: true \}\)/g) || []).length,
    ).toBe(PEMANGGIL);
  });

  test("status DIRENDER apa adanya, bukan diganti teks generik", () => {
    // Sebelumnya baris ini hanya bisa berbunyi "Thinking..."/"Processing...",
    // sehingga teks detak yang sudah dikirim backend tak pernah terlihat.
    expect(STEPS).toContain("run.status ||");
    expect(STEPS).toContain('run.thinking ? "Thinking..." : "Processing..."');
  });

  test("force_retry dan todos ditangani di SETIAP pemanggil", () => {
    // force_retry di-emit dari ENAM titik di backend; tanpa penanganan, setiap
    // putaran ulang (bisa 4 kali, 60+ detik) tampak sebagai layar diam dan
    // terbaca seolah run berhenti sendiri.
    //
    // Sama seperti model_wait di atas: yang dijaga bukan angka dua, melainkan
    // bahwa TIAP pemanggil menanganinya. Ambang tetap "minimal 2" akan merah
    // begitu salinan keduanya dihapus — dan itu terjadi saat panel chat
    // Workflow ikut dibuang bersama kanvas React Flow.
    expect((UI.match(/j\.t === "force_retry"/g) || []).length).toBe(PEMANGGIL);
    expect((UI.match(/j\.t === "todos"/g) || []).length).toBe(PEMANGGIL);
    // force_retry masuk timeline sebagai baris, memakai penampil yang sudah ada.
    expect((UI.match(/kind: "retry"/g) || []).length).toBe(PEMANGGIL);
    expect(STEPS).toContain('k === "retry"');
    // todos jadi STATE checklist hidup, bukan baris timeline — isinya sudah
    // muncul lewat keluaran tool todowrite, jadi mendorongnya ke timeline
    // hanya menggandakan.
    //
    // WADAHNYA BERPINDAH: dulu upd({ todos }) — state milik SATU pesan — jadi
    // daftarnya ikut tergulung naik bersama gelembungnya, dan daftar yang
    // gunanya untuk dilihat SELAMA bekerja justru paling cepat hilang dari
    // layar. Kini setTodos di tingkat aplikasi, dirender TodoPanel tepat di
    // atas kotak ketik. Yang dijaga tetap sama: tiap pemanggil menanganinya.
    expect((UI.match(/setTodos\(j\.todos \|\| \[\]\)/g) || []).length).toBe(
      PEMANGGIL,
    );
    expect(UI).not.toMatch(/upd\(\{ todos: j\.todos \}\)/);
    const KOMP = fs
      .readFileSync(require.resolve("../public/app/Components.jsx"), "utf8")
      .replace(/\s+/g, " ");
    expect(KOMP).toContain("function TodoPanel(");
    expect(KOMP).toContain("<TodoPanel todos={todos}");
    // Dan TIDAK dirender dua kali: dipindah, bukan digandakan.
    expect(STEPS).not.toContain("run.todos");
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
