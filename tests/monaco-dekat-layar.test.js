// Editor Monaco hanya dibuat untuk blok yang dekat layar.
//
// KENAPA ADA. Riwayat chat dirender utuh — public/app.jsx memakai
// `messages.map(...)` tanpa jendela — dan tiap blok kode membuat satu editor
// Monaco PENUH: model, view, ResizeObserver (automaticLayout), dan observer
// pada emitter global Monaco. Riwayat panjang berarti ratusan editor serentak.
//
// Di observer ke-200, Monaco sendiri yang melempar:
//     [001] potential listener LEAK detected, having 200 listeners already
//     at monaco.editor.create -> createModel -> onFirstObserverAdded
// Lemparan itu ditangkap window.onerror di public/index.html, memicu
// triggerAppRollback, lalu window.location.replace("/?rollback=true") — aplikasi
// kembali ke UI awal. Laporan pemakai "berat, lalu hang, lalu reload ke UI
// pertama" adalah satu kurva: menumpuk, melambat, menyentuh ambang, meledak.
//
// INI BUKAN KEBOCORAN. Cleanup di kedua komponen sudah membuang editor DAN
// model dengan benar; yang salah jumlah yang hidup bersamaan. Karena itu yang
// dijaga di sini adalah kapan editor DIBUAT — menambah pembuangan tak akan
// menyelesaikan apa pun.

const fs = require("fs");
const path = require("path");

const baca = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const VIEWPORT = baca("public/app/Viewport.jsx");
const AGENT = baca("public/app/AgentSteps.jsx");
const BLOCKS = baca("public/app/CodeBlocks.jsx");
const HTML = baca("public/index.html");

describe("gerbang pembuatan editor", () => {
  test("KEDUA komponen menahan pembuatan sampai dekat layar", () => {
    // Menjaga satu saja menyisakan gejalanya: jejak error yang dilaporkan
    // datang dari AgentSteps (tryCreate), tapi CodeBlocks punya pola yang sama.
    for (const [nama, src] of [
      ["AgentSteps", AGENT],
      ["CodeBlocks", BLOCKS],
    ]) {
      expect(`${nama}: ${src.includes("useDekatLayar(wrapRef)")}`).toBe(
        `${nama}: true`,
      );
      expect(`${nama}: ${/if \(!dekat\) return/.test(src)}`).toBe(
        `${nama}: true`,
      );
    }
  });

  test("gerbangnya ikut di dependensi effect, kalau tidak ia tak pernah dievaluasi ulang", () => {
    // Tanpa `dekat` di deps, effect hanya jalan sekali dan blok yang masuk layar
    // belakangan tak pernah mendapat editor — teksnya tetap terbaca lewat <pre>,
    // tapi tak bisa diedit atau dijalankan. Rusak dalam senyap.
    expect(AGENT).toMatch(/\}, \[language, dekat\]\)/);
    expect(BLOCKS).toMatch(/\}, \[dekat\]\)/);
  });

  test("elemen pembungkus benar-benar diamati", () => {
    // wrapRef yang tak terpasang membuat observer diam selamanya: dekat tetap
    // false, dan SEMUA blok turun jadi <pre> — gejala baru yang lebih buruk.
    expect(AGENT).toMatch(/ref=\{wrapRef\}/);
    expect(BLOCKS).toMatch(/ref=\{wrapRef\}/);
  });
});

describe("hook dimuat sebelum pemakainya", () => {
  test("Viewport.jsx terdaftar di APP_MODULES", () => {
    expect(HTML).toMatch(/"\/app\/Viewport\.jsx"/);
  });

  test("urutannya SEBELUM CodeBlocks dan AgentSteps", () => {
    // Saat ini semua modul digabung jadi satu <script> sehingga hoisting
    // menyelamatkan urutan apa pun. Itu jaminan yang bisa hilang diam-diam
    // kalau pemuatannya dipecah nanti, dan kalau hilang akibatnya berat:
    // useDekatLayar undefined -> TypeError saat render -> rollback -> reload,
    // persis gejala yang sedang diperbaiki.
    const i = HTML.indexOf('"/app/Viewport.jsx"');
    expect(i).toBeGreaterThan(-1);
    expect(HTML.indexOf('"/app/CodeBlocks.jsx"')).toBeGreaterThan(i);
    expect(HTML.indexOf('"/app/AgentSteps.jsx"')).toBeGreaterThan(i);
  });

  test("tanpa IntersectionObserver, kembali ke perilaku lama", () => {
    // Lingkungan tanpa IntersectionObserver tak boleh kehilangan editor sama
    // sekali — lebih baik berat seperti dulu daripada fiturnya hilang.
    // \s+ bukan spasi tunggal: prettier di hook pre-commit membungkus baris ini
    // begitu panjangnya lewat, dan pola yang mengunci format persis akan merah
    // karena PEMBUNGKUSAN, bukan karena perilakunya berubah. Sudah terjadi sekali.
    expect(VIEWPORT).toMatch(
      /IntersectionObserver === "undefined"\)\s+return setDekat\(true\)/,
    );
  });
});

describe("suntingan pemakai tidak hilang saat blok keluar layar", () => {
  test("naskah disalin SEBELUM editor dibuang", () => {
    // Editor di CodeBlock bisa ditulis. Membuangnya tanpa menyalin isinya akan
    // menghapus ketikan orang tanpa jejak — kerusakan yang jauh lebih mahal
    // daripada gejala yang sedang diperbaiki.
    const i = BLOCKS.indexOf("draftRef.current = isi");
    const j = BLOCKS.indexOf("edRef.current.dispose()", i);
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });

  test("naskah dipakai lagi saat dipasang kembali DAN di <pre>", () => {
    expect(BLOCKS).toMatch(/value: teks/);
    expect(BLOCKS).toMatch(/\{teks\}/);
    expect(BLOCKS).toMatch(
      /const teks = draftRef\.current != null \? draftRef\.current : code/,
    );
  });

  test("stream tidak menimpa naskah yang tersimpan", () => {
    // Blok yang sempat keluar layar setelah disunting akan menerima setValue
    // dari stream dan ketikan pemakai tertimpa — halus, dan baru ketahuan saat
    // pekerjaan orang hilang.
    expect(BLOCKS).toMatch(/if \(draftRef\.current != null\) return;/);
  });
});
