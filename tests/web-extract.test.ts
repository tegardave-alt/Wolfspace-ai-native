// web_extract + penjaga tujuan jaringan.
//
// DUA HAL YANG DIKUNCI DI SINI, dan yang kedua ditemukan lewat uji nyata:
//
// 1. web_fetch mengembalikan innerText SELURUH halaman lalu memotongnya di 8KB.
//    Untuk membaca artikel itu cukup; untuk MENGAMBIL DATA ia gagal: struktur
//    tabel rata jadi prosa, atribut href hilang, dan konten yang dimuat JS
//    setelah 400 ms terbaca KOSONG — tak terbedakan dari "memang tak ada".
//
// 2. web_fetch bisa mencapai jaringan internal. Terbukti sebelum perbaikan:
//    server lokal di 127.0.0.1:8399 dibaca utuh isinya. Broker menjaga berkas
//    dan proses; tujuan jaringan tak dijaga siapa pun. Yang paling mahal bukan
//    server buatan itu, melainkan backend WOLFSPACE SENDIRI di 8090.

const http = require("http");
const W = require("../agent/web.ts");

const HTML = `<html><body>
<h1>Daftar</h1>
<table class="harga"><tr><th>Barang</th><th>Harga</th></tr>
<tr><td>Kopi</td><td>25000</td></tr><tr><td>Teh</td><td>15000</td></tr></table>
<div id="lambat"></div>
<script>setTimeout(function(){document.getElementById("lambat").innerHTML=
"<ul class=\\"nanti\\"><li>MUNCUL-BELAKANGAN-A</li><li>MUNCUL-BELAKANGAN-B</li></ul>";},1200)</script>
<a href="https://contoh.test/satu">Satu</a><a href="https://contoh.test/dua">Dua</a>
</body></html>`;

let srv;
let PORT;
beforeAll(async () => {
  srv = http.createServer((q, s) => {
    s.writeHead(200, { "Content-Type": "text/html" });
    s.end(HTML);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  PORT = srv.address().port;
});
afterAll(async () => {
  if (srv) await new Promise((r) => srv.close(r));
  // The browser tests below launch a real headless Chromium, and agent/web.ts
  // keeps it as a module singleton for BROWSER_IDLE_MS (3 minutes). Its idle
  // timer is unref'd, so it never holds the loop — the Chromium PROCESS does.
  // Jest waits a moment, gives up, and prints "a worker process has failed to
  // exit gracefully" for the whole run. Closing it here is the teardown that was
  // missing; the module owns the process, so it exports the way to release it.
  try {
    await require("../agent/web.ts").tutupBrowser();
  } catch (_) {}
});

const url = () => `http://127.0.0.1:${PORT}/`;

describe("penjaga tujuan: web keluar, jaringan dalam ditolak", () => {
  // Penjaga ini SENGAJA tidak dilewati di blok ini — yang diuji justru
  // penolakannya.
  const bebas = process.env.WOLFSPACE_WEB_IZINKAN_LOKAL;
  beforeAll(() => {
    delete process.env.WOLFSPACE_WEB_IZINKAN_LOKAL;
  });
  afterAll(() => {
    if (bebas != null) process.env.WOLFSPACE_WEB_IZINKAN_LOKAL = bebas;
  });

  test("loopback ditolak, termasuk lewat NAMA HOST", async () => {
    // Yang diperiksa TUJUANNYA, bukan string URL-nya. Penjaga yang cuma
    // mencocokkan "127.0.0.1" akan lolos oleh "localhost" — dan oleh domain
    // publik mana pun yang diarahkan ke loopback.
    for (const u of [
      `http://127.0.0.1:${PORT}/`,
      `http://localhost:${PORT}/`,
    ]) {
      const r = await W.urlAman(u);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/internal/i);
    }
  });

  test("metadata cloud (169.254.169.254) ditolak", async () => {
    // Sasaran SSRF paling klasik: di penyedia cloud, alamat ini menyajikan
    // kredensial instance.
    const r = await W.urlAman("http://169.254.169.254/latest/meta-data/");
    expect(r.ok).toBe(false);
  });

  test("rentang privat lain ditolak", async () => {
    for (const u of [
      "http://10.0.0.5/",
      "http://192.168.1.1/",
      "http://172.16.0.1/",
    ]) {
      expect((await W.urlAman(u)).ok).toBe(false);
    }
  });

  test("skema non-web ditolak — file: membaca disk", async () => {
    for (const u of [
      "file:///c:/Windows/win.ini",
      "data:text/html,<b>x",
      "chrome://version",
    ]) {
      const r = await W.urlAman(u);
      expect(r.ok).toBe(false);
    }
  });

  test("alamat publik LOLOS — penjaganya bukan sekadar 'tolak semua'", async () => {
    // IP literal supaya tak bergantung pada DNS/jaringan saat tes berjalan.
    const r = await W.urlAman("https://8.8.8.8/");
    expect(r.ok).toBe(true);
  });

  test("webFetch menolak tujuan internal SEBELUM koneksi dibuat", async () => {
    await expect(W.webFetch(url())).rejects.toThrow(/internal/i);
  });
});

// webExtract membaca innerText, dan innerText menuntut halaman yang benar-benar
// dirender — jadi blok ini butuh browser Playwright, bukan sekadar modulnya.
// CI memasang Chromium supaya tes ini JALAN di sana, bukan dilewati.
const { punyaBrowser, describeKalau } = require("./butuh.cjs");
const dBrowser = describeKalau(punyaBrowser());
dBrowser("webExtract mengambil BAGIAN, bukan seluruh teks", () => {
  const bebas = process.env.WOLFSPACE_WEB_IZINKAN_LOKAL;
  beforeAll(() => {
    // Jalan keluar yang memang disediakan untuk pengujian lokal.
    process.env.WOLFSPACE_WEB_IZINKAN_LOKAL = "1";
  });
  afterAll(() => {
    if (bebas == null) delete process.env.WOLFSPACE_WEB_IZINKAN_LOKAL;
    else process.env.WOLFSPACE_WEB_IZINKAN_LOKAL = bebas;
  });

  test("mode tabel mempertahankan baris & kolom", async () => {
    const r = await W.webExtract({
      url: url(),
      selector: "table.harga",
      mode: "tabel",
    });
    const d = JSON.parse(r.slice(r.indexOf("\n") + 1));
    expect(d[0][0]).toEqual(["Barang", "Harga"]);
    expect(d[0][1]).toEqual(["Kopi", "25000"]);
  }, 60000);

  test("mode tautan membawa href, bukan cuma teksnya", async () => {
    const r = await W.webExtract({ url: url(), selector: "a", mode: "tautan" });
    const d = JSON.parse(r.slice(r.indexOf("\n") + 1));
    expect(d).toEqual([
      { teks: "Satu", href: "https://contoh.test/satu" },
      { teks: "Dua", href: "https://contoh.test/dua" },
    ]);
  }, 60000);

  test("konten yang dimuat JS: web_fetch MELEWATKAN, web_extract menunggunya", async () => {
    // Inti seluruh tool ini. `tunggu` menunggu SELECTOR, bukan menunggu waktu —
    // itu bedanya antara "belum sempat dimuat" dan "memang tidak ada".
    const lewatFetch = await W.webFetch(url());
    expect(lewatFetch).not.toMatch(/MUNCUL-BELAKANGAN/);

    const r = await W.webExtract({
      url: url(),
      selector: ".nanti li",
      mode: "teks",
      tunggu: ".nanti li",
    });
    expect(r).toMatch(/MUNCUL-BELAKANGAN-A/);
    expect(r).toMatch(/MUNCUL-BELAKANGAN-B/);
  }, 60000);

  test("selector tak cocok dilaporkan SEBAGAI SELECTOR, bukan 'tak ada data'", async () => {
    // Model yang membaca "tidak ada data" akan menyimpulkan datanya memang tak
    // ada, lalu melaporkannya sebagai temuan. Kalimatnya harus menunjuk selector.
    const r = await W.webExtract({
      url: url(),
      selector: ".tidak-ada",
      mode: "teks",
    });
    expect(r).toMatch(/selector/i);
    expect(r).toMatch(/tidak-ada/);
  }, 60000);

  test("selector tunggu yang tak pernah muncul dibedakan dari kosong", async () => {
    const r = await W.webExtract({
      url: url(),
      selector: "body",
      mode: "teks",
      tunggu: ".tak-akan-pernah",
      tunggu_ms: 1500,
    });
    expect(r).toMatch(/never appeared/i);
  }, 60000);
});

describe("web_extract terdaftar dan digerbang", () => {
  const fs = require("fs");
  const DEF = fs.readFileSync(
    require.resolve("../agent/tools/tool-definitions.ts"),
    "utf8",
  );
  const IDX = fs.readFileSync(
    require.resolve("../agent/tools/index.ts"),
    "utf8",
  );

  test("ada di daftar tool model", () => {
    expect(DEF).toMatch(/name: "web_extract"/);
  });

  test("lewat admission CommandChain, dan penolakan dicatat", () => {
    const blok = IDX.slice(
      IDX.indexOf('if (name === "web_extract")'),
      IDX.indexOf('if (name === "web_extract")') + 1400,
    );
    expect(blok).toMatch(/cc\.periksa\(cc\.sesiRuleset\(\), "network:https"\)/);
    expect(blok).toMatch(/decision: "DENY"/);
  });

  test("modul gagal dimuat -> MELEMPAR, bukan mengembalikan string", () => {
    // "(web-tools not loaded)" sebagai HASIL akan dibaca model sebagai isi
    // halaman, lalu dilaporkan sebagai temuan.
    const blok = IDX.slice(
      IDX.indexOf("const webExtract = async"),
      IDX.indexOf("const webExtract = async") + 500,
    );
    expect(blok).toMatch(/throw new Error/);
  });
});
