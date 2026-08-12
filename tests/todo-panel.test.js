// Checklist todowrite: satu daftar hidup di atas kotak ketik.
//
// KENAPA DIPINDAH. Dulu ia dirender sebagai run.todos di dalam gelembung agent.
// Gelembung tergulung naik begitu percakapan berlanjut — jadi daftar yang
// gunanya justru untuk dilihat SELAMA bekerja adalah hal yang paling cepat
// hilang dari layar. Sekarang ia duduk di composer-wrap, tepat di atas kotak
// ketik, dan tidak ikut bergulir.
//
// Yang dijaga di sini tiga hal, dan ketiganya mudah rusak tanpa terasa:
//   1. Ia dipindah, BUKAN digandakan. Dua tempat yang menampilkan daftar yang
//      sama akan berbeda begitu salah satunya lupa diperbarui.
//   2. Datanya tingkat APLIKASI, bukan state satu pesan. Kalau kelak dikembalikan
//      ke upd({ todos }), gejalanya persis keluhan aslinya: daftarnya hilang
//      saat digulir.
//   3. Nama kelasnya tidak generik. Cuplikan aslinya memakai `.my-form`, dan
//      nama sekelas itu di lembar gaya seluruh aplikasi hampir pasti menabrak.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const baca = (p) => fs.readFileSync(path.join(AKAR, p), "utf8");
const APP = baca("public/app.jsx");
const KOMP = baca("public/app/Components.jsx");
const STEPS = baca("public/app/AgentSteps.jsx");
const CSS = baca("public/styles.css");
const BLOK = CSS.slice(
  CSS.indexOf(".todo-panel {"),
  CSS.indexOf(".composer {"),
);

describe("panel todowrite di atas kotak ketik", () => {
  test("dirender DI ATAS composer, di dalam composer-wrap", () => {
    const i = KOMP.indexOf('<div className="composer-wrap">');
    const iPanel = KOMP.indexOf("<TodoPanel todos={todos}");
    const iComposer = KOMP.indexOf('<div className="composer">');
    expect(i).toBeGreaterThan(0);
    expect(iPanel).toBeGreaterThan(i);
    expect(iPanel).toBeLessThan(iComposer);
  });

  test("datanya tingkat APLIKASI, bukan state satu pesan", () => {
    // Inti keluhan aslinya. upd({ todos }) menaruhnya di pesan; begitu pesannya
    // tergulung naik, daftarnya ikut hilang.
    expect(APP).toMatch(/const \[todos, setTodos\] = useState\(\[\]\)/);
    expect(APP).toMatch(/setTodos\(j\.todos \|\| \[\]\)/);
    expect(APP).not.toMatch(/upd\(\{ todos: j\.todos \}\)/);
  });

  test("DIPINDAH, bukan digandakan", () => {
    // Dua permukaan untuk satu daftar akan berbeda begitu salah satu lupa
    // diperbarui — dan yang salah tak bisa dibedakan dari yang benar.
    expect(STEPS).not.toContain("run.todos");
    expect(STEPS).not.toContain("aal-todos");
  });

  test("baris todowrite tak muncul lagi di timeline", () => {
    // todowrite mengirim DUA hal untuk satu kejadian: event t:"todos" yang
    // mengisi panel, DAN string ringkasan sebagai keluaran tool. Tanpa
    // penyaring, ringkasan itu muncul lagi sebagai baris "✓ [high] ..." di
    // timeline — satu daftar tampil dua kali, di dua tempat, dengan bentuk
    // berbeda.
    expect(STEPS).toMatch(/toLowerCase\(\) !== "todowrite"/);
  });

  test("yang disembunyikan TAMPILANNYA, bukan tool-nya", () => {
    // Tool tetap harus berjalan dan hasilnya tetap sampai ke model; kalau
    // emit-nya ikut dimatikan, panelnya justru kosong.
    const TOOLS = fs.readFileSync(
      path.join(AKAR, "agent", "tools", "index.cjs"),
      "utf8",
    );
    expect(TOOLS).toMatch(/emit\(\{ t: "todos", todos \}\)/);
  });

  test("panel disembunyikan saat daftarnya kosong", () => {
    // Kotak kosong di atas kotak ketik hanya memakan ruang dan membuat
    // pemakai mengira ada yang gagal dimuat.
    expect(KOMP).toMatch(
      /if \(!Array\.isArray\(todos\) \|\| todos\.length === 0\) return null;/,
    );
  });

  test("kemajuan terbaca tanpa menghitung sendiri", () => {
    expect(KOMP).toMatch(
      /filter\(\(t\) => \(t\.status \|\| ""\) === "completed"\)/,
    );
    expect(KOMP).toMatch(/\{selesai\}\/\{todos\.length\}/);
  });

  test("kotak centang BERFUNGSI, bukan hiasan", () => {
    expect(KOMP).toMatch(/checked=\{st === "completed"\}/);
    expect(KOMP).toMatch(/onChange=\{\(\) => onToggle && onToggle\(i\)\}/);
    // Dan pengubahnya benar-benar tersambung ke state, bukan berhenti di prop.
    expect(APP).toMatch(/onToggleTodo=\{\(i\) =>/);
    expect(APP).toMatch(/setTodos\(\(d\) =>/);
  });

  test("label terikat ke kotaknya lewat htmlFor/id", () => {
    // Tanpa ini, mengklik teks tak melakukan apa pun — dan teks itulah target
    // klik yang paling besar.
    expect(KOMP).toMatch(/id=\{id\}/);
    expect(KOMP).toMatch(/htmlFor=\{id\}/);
  });

  test("kelasnya tidak generik seperti cuplikan aslinya", () => {
    expect(BLOK).toMatch(/\.todo-panel \{/);
    expect(CSS).not.toMatch(/^\.my-form/m);
  });

  test("warnanya ikut tema, bukan dipatok", () => {
    // Aslinya #666/#f33195/#127acf — tiga warna mati yang tak ikut tema terang.
    expect(BLOK).toMatch(/var\(--text-dim/);
    expect(BLOK).toMatch(/var\(--surface-1\)/);
    expect(BLOK).not.toMatch(/#f33195|#127acf/);
  });

  test("lebarnya sama dengan composer, jadi terbaca satu tumpukan", () => {
    expect(BLOK).toMatch(/max-width:\s*880px/);
    expect(CSS).toMatch(/\.composer \{[\s\S]*?max-width:\s*880px/);
  });

  test("daftar panjang tidak mendorong kotak ketik keluar layar", () => {
    expect(BLOK).toMatch(/max-height:\s*\d+px/);
    expect(BLOK).toMatch(/overflow-y:\s*auto/);
  });

  test("item yang sedang dikerjakan disorot", () => {
    // Tanpa ini seluruh daftar terbaca rata dan pemakai harus menebak agent
    // sedang di baris mana.
    expect(BLOK).toMatch(/\.todo-baris\.st-in_progress/);
    expect(KOMP).toMatch(/"todo-baris st-" \+ st/);
  });
});
