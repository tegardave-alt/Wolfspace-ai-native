// ── Aplikasi harus benar-benar BISA DIRENDER ──
//
// KENAPA BERKAS INI ADA. Sebuah useEffect ditaruh di dekat state debug lain —
// tempat ia "terbaca lebih rapi" — padahal senarai dependensinya menyebut
// `terminalOpen` yang baru dideklarasikan 190 baris di bawahnya:
//
//     ReferenceError: Cannot access 'terminalOpen' before initialization
//
// Senarai dependensi dinilai SAAT RENDER, bukan saat effect-nya berjalan, jadi
// ia menyentuh binding yang masih di zona mati temporal. Seluruh aplikasi
// jatuh ke ErrorBoundary.
//
// Dan TAK SATU PUN penjaga yang ada menangkapnya:
//   - Babel lulus  -> sintaksisnya memang sah
//   - 868 uji lulus -> semuanya memeriksa TEKS SUMBER, bukan menjalankannya
//
// Satu-satunya yang bisa menangkap kelas kesalahan ini adalah MENJALANKAN
// komponennya. Itu yang dilakukan berkas ini.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");

// ── 1. Penjaga statis: dependensi tak boleh mendahului deklarasinya ──
//
// Murah, jalan di mana pun, dan menangkap persis bentuk bug di atas. Cakupannya
// SENGAJA dibatasi pada komponen utama: di komponen lain nama yang sama sering
// berupa prop, dan menganggapnya deklarasi tingkat-berkas menghasilkan alarm
// palsu.
describe("dependensi hook tidak dipakai sebelum dideklarasikan", () => {
  const src = fs
    .readFileSync(path.join(AKAR, "public", "app.tsx"), "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n");

  // Batas komponen utama.
  const mulai = src.findIndex((b) => /^function App\(/.test(b));
  const selesai = src.findIndex(
    (b, i) => i > mulai && /^function \w+\(/.test(b),
  );
  const akhir = selesai > mulai ? selesai : src.length;

  test("komponen utama ditemukan", () => {
    expect(mulai).toBeGreaterThan(-1);
    expect(akhir - mulai).toBeGreaterThan(500);
  });

  test("tak ada dependensi yang mendahului deklarasinya", () => {
    const deklarasi = new Map();
    for (let i = mulai; i < akhir; i++) {
      let m = src[i].match(/^\s*const \[(\w+),\s*(\w+)\]\s*=/);
      if (m) {
        if (!deklarasi.has(m[1])) deklarasi.set(m[1], i);
        if (!deklarasi.has(m[2])) deklarasi.set(m[2], i);
        continue;
      }
      m = src[i].match(/^\s*(?:const|let)\s+(\w+)\s*=/);
      if (m && !deklarasi.has(m[1])) deklarasi.set(m[1], i);
    }
    expect(deklarasi.size).toBeGreaterThan(20); // kalau nol, uji ini kosong

    const salah = [];
    for (let i = mulai; i < akhir; i++) {
      const m = src[i].match(/^\s*\},\s*\[([^\]]*)\]\s*\)/);
      if (!m) continue;
      for (const nama of m[1]
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\w+$/.test(s))) {
        const d = deklarasi.get(nama);
        if (d !== undefined && d > i)
          salah.push(
            "baris " +
              (i + 1) +
              ": '" +
              nama +
              "' baru ada di baris " +
              (d + 1),
          );
      }
    }
    expect(salah).toEqual([]);
  });
});

// ── 2. Penjaga hidup: komponennya benar-benar dirender ──
//
// Butuh Playwright + server yang bisa dijalankan. Di-skip kalau salah satunya
// tak ada — bukan digagalkan, supaya suite tetap berguna di mesin tanpa
// peramban. Sudah dijalankan dan lulus di mesin ini: root dirender, bilah atas
// ada, tombol menu ada, 0 galat konsol, ErrorBoundary tidak muncul.
const punyaPlaywright = (() => {
  try {
    require.resolve("playwright");
    return true;
  } catch (_) {
    return false;
  }
})();
const kalauBisa = punyaPlaywright ? describe : describe.skip;

kalauBisa("aplikasi dirender tanpa galat (butuh playwright)", () => {
  const { spawn } = require("child_process");
  const PORT = 8123;
  let server;

  beforeAll(async () => {
    server = spawn(process.execPath, [path.join(AKAR, "server.cjs")], {
      cwd: AKAR,
      env: { ...process.env, PORT: String(PORT) },
      stdio: "ignore",
      windowsHide: true,
    });
    // Ditunggu sampai benar-benar menjawab, bukan ditebak dengan tidur tetap.
    const http = require("http");
    for (let i = 0; i < 60; i++) {
      const hidup = await new Promise((ok) => {
        const r = http.get(
          { host: "127.0.0.1", port: PORT, path: "/healthz", timeout: 1000 },
          (res) => {
            res.resume();
            ok(true);
          },
        );
        r.on("error", () => ok(false));
        r.on("timeout", () => {
          r.destroy();
          ok(false);
        });
      });
      if (hidup) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("server tak pernah siap di port " + PORT);
  }, 60000);

  afterAll(() => {
    try {
      server && server.kill();
    } catch (_) {}
  });

  // ── Kenapa uji ini MENGKLIK, bukan cuma memuat ──
  //
  // Versi pertamanya hanya membuka halaman dan memeriksa root ada. Itu
  // meloloskan `TypeError: setChatShow is not a function`: prop yang namanya
  // ter-rename di SATU berkas dan tidak di yang lain tetap merender dengan
  // sempurna — ia baru meledak saat tombolnya ditekan.
  //
  // Jadi setiap kontrol di menu tata letak benar-benar diklik di sini. Tak ada
  // penjaga statis yang bisa menangkap kelas ini: kompilasi lulus, dan uji
  // berbasis teks sumber tak tahu prop mana yang dioper ke mana.
  test("root, bilah atas, dan menu ada — tanpa ErrorBoundary", async () => {
    const { chromium } = require("playwright");
    const b = await chromium.launch();
    try {
      const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
      const galat = [];
      p.on("console", (m) => {
        if (m.type() === "error") galat.push(m.text().slice(0, 200));
      });
      p.on("pageerror", (e) => galat.push("PAGEERROR " + e.message));
      await p.goto("http://127.0.0.1:" + PORT + "/", {
        waitUntil: "networkidle",
        timeout: 60000,
      });
      await p.waitForTimeout(5000);
      // Layar pemilih proyek DILEWATI dulu. Ia overlay penuh layar: sidebar di
      // belakangnya memang sudah ter-mount (jadi selector-nya cocok), tapi tiap
      // klik mendarat di overlay-nya — dan uji lalu gagal dengan alasan yang
      // menunjuk ke tombol yang sebenarnya baik-baik saja.
      const pemilih = await p.$(".picker-textarea");
      if (pemilih) {
        await p.click(".picker-textarea");
        await p.keyboard.insertText("hello");
        await p.keyboard.press("Enter");
        await p.waitForTimeout(2500);
      }
      const k = await p.evaluate(() => ({
        root: !!document.querySelector("#root, .app"),
        topbar: !!document.querySelector(".topbar"),
        menu: !!document.querySelector(".tb-menu-btn"),
        jatuh: /ErrorBoundary|Runtime Error|Auto-Rollback/i.test(
          document.body.innerText || "",
        ),
      }));
      expect(k.jatuh).toBe(false);
      expect(k.root).toBe(true);
      expect(k.topbar).toBe(true);
      expect(k.menu).toBe(true);
      expect(galat).toEqual([]);

      // ── Tiap tombol di menu tata letak DITEKAN ──
      //
      // Di-query ULANG tiap putaran, bukan dikumpulkan sekali di depan: menu
      // dirender ulang sesudah tiap pilihan, dan handle yang dipegang dari
      // render sebelumnya jadi basi — klik berikutnya menunggu elemen yang
      // sudah tak ada sampai kehabisan waktu.
      const bukaMenu = async () => {
        if (await p.$(".tb-menu")) return true;
        const tombol = await p.$(".sb-menu-kaki .tb-menu-btn");
        if (!tombol) return false;
        await tombol.click().catch(() => {});
        await p.waitForTimeout(250);
        return !!(await p.$(".tb-menu"));
      };
      expect(await bukaMenu()).toBe(true);
      const jumlahOpsi = (await p.$$(".tb-menu .tb-menu-opsi")).length;
      expect(jumlahOpsi).toBeGreaterThanOrEqual(8); // 4 baris posisi + 2 grup
      for (let i = 0; i < jumlahOpsi; i++) {
        if (!(await bukaMenu())) break;
        const semua = await p.$$(".tb-menu .tb-menu-opsi");
        if (i >= semua.length) break;
        await semua[i].click({ timeout: 4000 }).catch(() => {});
        await p.waitForTimeout(200);
      }
      await p.keyboard.press("Escape");
      await p.waitForTimeout(300);
      const sesudah = await p.evaluate(() => ({
        jatuh: /ErrorBoundary|Runtime Error|Auto-Rollback/i.test(
          document.body.innerText || "",
        ),
        root: !!document.querySelector("#root, .app"),
      }));
      expect(sesudah.jatuh).toBe(false);
      expect(sesudah.root).toBe(true);
      expect(galat).toEqual([]);
    } finally {
      await b.close();
    }
  }, 120000);
});
