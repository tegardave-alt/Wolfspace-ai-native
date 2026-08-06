// Web search + fetch for WOLFSPACE agent
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

function _get(opts) {
  return new Promise((resolve, reject) => {
    const r = https.get(opts, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        if (res.statusCode >= 400)
          return reject(new Error("HTTP " + res.statusCode));
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    });
    r.on("timeout", () => {
      r.destroy();
      reject(new Error("timeout"));
    });
    r.on("error", reject);
  });
}

const UA = "QuantumAgent/1.0";
function trunc(s, n) {
  s = String(s || "");
  return s.length <= n ? s : s.slice(0, n) + "…";
}

// ── Penjaga tujuan: web keluar, jaringan dalam TIDAK ──
//
// KENAPA ADA. Tanpa ini, web_fetch adalah lubang SSRF yang melewati seluruh
// pengurungan yang dibangun repo ini. Broker menjaga berkas dan proses; tujuan
// jaringan tak dijaga siapa pun. Terbukti dengan uji nyata: server lokal di
// 127.0.0.1:8399 dibaca utuh isinya oleh webFetch. Yang paling mahal bukan
// server buatan itu, melainkan backend WOLFSPACE SENDIRI di 8090 — di sana ada
// /plugins, /debug, dan konfigurasi.
//
// Yang dijaga TUJUANNYA, bukan string URL-nya. Nama host diresolusi lebih dulu
// lalu ALAMAT HASILNYA yang diperiksa; kalau tidak, "localtest.me" atau domain
// apa pun yang diarahkan ke 127.0.0.1 akan lolos begitu saja.
const dns = require("dns").promises;

// 169.254.x.x sengaja ikut: di penyedia cloud, 169.254.169.254 adalah endpoint
// metadata instance — sumber kredensial, dan sasaran SSRF paling klasik.
function _ipPrivat(ip) {
  const s = String(ip);
  if (s.includes(":")) {
    const v = s.toLowerCase();
    return (
      v === "::1" ||
      v === "::" ||
      v.startsWith("fc") ||
      v.startsWith("fd") ||
      v.startsWith("fe80") ||
      v.startsWith("::ffff:127.")
    );
  }
  const p = s.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return true; // tak terbaca = tolak
  const [a, b] = p;
  return (
    a === 0 ||
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) || // link-local + metadata cloud
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    a >= 224 // multicast / reserved
  );
}

/**
 * @param {string} urlStr
 * @returns {Promise<{ok: true, url: URL} | {ok: false, error: string}>}
 */
async function urlAman(urlStr) {
  let u;
  try {
    u = new URL(String(urlStr));
  } catch (_) {
    return { ok: false, error: "URL tidak valid: " + urlStr };
  }

  // Skema lain (file:, data:, chrome:) bukan "web" dan sebagian membaca disk.
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return {
      ok: false,
      error: "skema tidak diizinkan: " + u.protocol + " (hanya http/https)",
    };
  }
  // Jalan keluar untuk pengujian lokal yang memang disengaja. Mati secara bawaan.
  if (process.env.WOLFSPACE_WEB_IZINKAN_LOKAL === "1")
    return { ok: true, url: u };

  let alamat;
  try {
    alamat = await dns.lookup(u.hostname, { all: true });
  } catch (e) {
    return { ok: false, error: "host tak dapat diresolusi: " + u.hostname };
  }

  // SEMUA hasil resolusi harus publik. Satu saja yang privat sudah cukup untuk
  // menolak: host yang mengembalikan dua alamat bisa memilih yang privat saat
  // koneksi sungguhan dibuat.
  for (const a of alamat) {
    if (_ipPrivat(a.address)) {
      return {
        ok: false,
        error:
          "tujuan jaringan internal ditolak: " +
          u.hostname +
          " -> " +
          a.address +
          " (loopback/privat/link-local). Setel WOLFSPACE_WEB_IZINKAN_LOKAL=1 bila memang disengaja.",
      };
    }
  }
  return { ok: true, url: u };
}

// ── Tavily search API (sumber utama bila key tersedia) ──
// Purpose-built untuk agent AI: 1 request HTTP, hasil bersih + jawaban tersintesis,
// tanpa scraping/CAPTCHA/locale. Key dibaca dari ~/.wolfspace/cloud-keys.json (di luar
// repo, konsisten dengan kunci cloud lain). Di-cache setelah pembacaan pertama.
let _tavilyKey; // undefined = belum dibaca, null = tak ada
function _getTavilyKey() {
  if (_tavilyKey !== undefined) return _tavilyKey;
  try {
    const { resolveKeysPath } = require("./keys-path.cjs");
    const keys = JSON.parse(fs.readFileSync(resolveKeysPath(), "utf8"));
    _tavilyKey =
      (keys.tavily && keys.tavily.key) ||
      (keys.tavily && typeof keys.tavily === "string" ? keys.tavily : null) ||
      null;
  } catch (_) {
    _tavilyKey = null;
  }
  return _tavilyKey;
}
function _tavilySearch(query) {
  return new Promise((resolve, reject) => {
    const key = _getTavilyKey();
    if (!key) return reject(new Error("no tavily key"));
    const body = JSON.stringify({
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: true,
    });
    const req = https.request(
      {
        hostname: "api.tavily.com",
        path: "/search",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + key,
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 20000,
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          if (res.statusCode >= 400)
            return reject(new Error("tavily HTTP " + res.statusCode));
          let j;
          try {
            j = JSON.parse(d);
          } catch (e) {
            return reject(new Error("tavily bad JSON"));
          }
          const out = [];
          if (j.answer) out.push(`**Ringkasan:** ${trunc(j.answer, 500)}`);
          for (const r of (j.results || []).slice(0, 5)) {
            out.push(
              `**${trunc(r.title || "", 90)}** [web]\n   ${r.url || ""}\n   ${trunc((r.content || "").replace(/\s+/g, " ").trim(), 260)}`,
            );
          }
          resolve(out);
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("tavily timeout"));
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Playwright headless (mesin scraping utama) ──
// Lebih andal dari Edge `--dump-dom`: menunggu konten ter-render, ekstrak via selector
// DOM sungguhan, dan pakai browser Chromium bundel Playwright sendiri (bukan Edge user,
// jadi tak menyentuh profil/cookie/login mereka). Browser di-launch sekali lalu dipakai
// ulang (singleton), dan ditutup otomatis setelah idle agar tak membocorkan proses.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_IDLE_MS = 3 * 60 * 1000;
let _pw = null,
  _browser = null,
  _browserPromise = null,
  _idleTimer = null;

function _loadPw() {
  if (_pw !== null) return _pw;
  try {
    _pw = require("playwright");
  } catch (_) {
    _pw = false;
  }
  return _pw;
}
function _touchIdle() {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    const b = _browser;
    _browser = null;
    _browserPromise = null;
    if (b) b.close().catch(() => {});
  }, BROWSER_IDLE_MS);
  if (_idleTimer.unref) _idleTimer.unref(); // jangan menahan proses tetap hidup
}
async function _getBrowser() {
  const pw = _loadPw();
  if (!pw) throw new Error("playwright tidak tersedia");
  if (_browser && _browser.isConnected()) {
    _touchIdle();
    return _browser;
  }
  if (!_browserPromise) {
    _browserPromise = pw.chromium
      .launch({ headless: true })
      .then((b) => {
        _browser = b;
        b.on("disconnected", () => {
          _browser = null;
          _browserPromise = null;
        });
        return b;
      })
      .catch((e) => {
        _browserPromise = null;
        throw e;
      });
  }
  const b = await _browserPromise;
  _touchIdle();
  return b;
}
// Jalankan fn dengan satu context+page terisolasi, selalu dibersihkan.
async function _withPage(fn, contextOpts) {
  const browser = await _getBrowser();
  const ctx = await browser.newContext({
    userAgent: BROWSER_UA,
    ...(contextOpts || {}),
  });
  const page = await ctx.newPage();
  try {
    return await fn(page);
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ── Real web search via Bing SERP (Playwright — tunggu render, ekstrak via selector) ──
// Ini yang sebelumnya HILANG: tanpa sumber web umum, satu-satunya sumber yang selalu
// mengembalikan sesuatu adalah npm (fuzzy-match) — jadi query non-teknis seperti
// "gaji AI engineer" dijawab dengan paket npm acak. Bing memberi hasil web sungguhan.
async function _bingSearch(query) {
  // mkt + Accept-Language WAJIB: tanpa penanda locale yang jelas, Bing menebak lokasi
  // klien datacenter dan menyajikan hasil region acak (mis. Korea/China) untuk query
  // Indonesia. Dengan id-ID hasilnya relevan & konsisten.
  return _withPage(
    async (page) => {
      await page.goto(
        "https://www.bing.com/search?q=" +
          encodeURIComponent(query) +
          "&mkt=id-ID",
        { waitUntil: "domcontentloaded", timeout: 20000 },
      );
      await page
        .waitForSelector("li.b_algo", { timeout: 8000 })
        .catch(() => {});
      const items = await page.$$eval("li.b_algo", (els) =>
        els.slice(0, 6).map((el) => {
          const a = el.querySelector("h2 a");
          const cite = el.querySelector("cite");
          const p = el.querySelector(".b_caption p, p");
          return {
            title: a ? a.innerText.trim() : "",
            url: (cite && cite.innerText.trim()) || (a ? a.href : ""),
            snippet: p ? p.innerText.trim() : "",
          };
        }),
      );
      return items
        .filter((r) => r.title)
        .map(
          (r) =>
            `**${trunc(r.title, 90)}** [web]\n   ${trunc(r.url, 110)}\n   ${trunc(r.snippet, 260)}`,
        );
    },
    {
      locale: "id-ID",
      extraHTTPHeaders: { "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8" },
    },
  );
}

// ── Web Search (multi-source) ──
async function webSearch(query) {
  const q = encodeURIComponent(query);
  const results = [];

  // 0a) TAVILY — sumber utama bila key tersedia (API andal, hasil relevan + ringkasan,
  //     tanpa scraping). Kalau berhasil, cukup ini (+ SO/GH teknis) — Bing tak perlu.
  let tavilyOk = false;
  try {
    const tv = await _tavilySearch(query);
    if (tv.length) {
      results.push(...tv);
      tavilyOk = true;
    }
  } catch (_) {}

  // Tavily sudah memberi jawaban + 5 hasil relevan; jangan tambah latensi dengan
  // sumber lain (DDG-instant sering timeout ~10s). Langsung kembalikan (~3s).
  if (tavilyOk) return results.join("\n\n");

  // 0b) Fallback: Bing via Playwright HANYA jika Tavily tak tersedia/gagal (scraping
  //     lebih lambat & kadang salah-parse; dipakai kalau tak ada API).
  try {
    const web = await _bingSearch(query);
    results.push(...web);
  } catch (_) {}

  // 1) StackExchange
  try {
    const se = await _get({
      hostname: "api.stackexchange.com",
      path:
        "/2.3/search?order=desc&sort=relevance&intitle=" +
        q +
        "&site=stackoverflow&pagesize=5&filter=withbody",
      headers: { "User-Agent": UA },
      timeout: 12000,
    });
    if (se.items)
      for (const item of se.items.slice(0, 5)) {
        const bodySnippet = item.body
          ? trunc(item.body.replace(/<[^>]+>/g, "").trim(), 250)
          : "";
        results.push(
          `**${trunc(item.title, 80)
            .replace(/&amp;/g, "&")
            .replace(
              /&quot;/g,
              '"',
            )}** [SO]\n   ${item.link}\n   ${bodySnippet}`,
        );
      }
  } catch (_) {}

  // 2) GitHub
  try {
    const gh = await _get({
      hostname: "api.github.com",
      path: "/search/repositories?q=" + q + "&sort=stars&per_page=3",
      headers: { "User-Agent": UA, Accept: "application/vnd.github+json" },
      timeout: 12000,
    });
    if (gh.items)
      for (const item of gh.items.slice(0, 3)) {
        results.push(
          `**[GH] ${item.full_name}**  ★${item.stargazers_count}\n   ${item.html_url}\n   ${trunc(item.description, 200)}`,
        );
      }
  } catch (_) {}

  // 3) npm — HANYA jika query jelas tentang paket/library (dulu selalu jalan dan
  // mengembalikan paket acak untuk query apa pun, mencemari hasil web nyata).
  if (
    /\b(npm|package|paket|library|pustaka|module|modul|dependency|dependensi|install)\b/i.test(
      query,
    )
  ) {
    try {
      const npm = await _get({
        hostname: "registry.npmjs.org",
        path: "/-/v1/search?text=" + q + "&size=3",
        headers: { "User-Agent": UA },
        timeout: 10000,
      });
      if (npm.objects)
        for (const obj of npm.objects.slice(0, 3)) {
          const p = obj.package;
          results.push(
            `**[npm] ${p.name}**  v${p.version}\n   https://www.npmjs.com/package/${p.name}\n   ${trunc(p.description, 200)}`,
          );
        }
    } catch (_) {}
  }

  // 4) DuckDuckGo Instant Answer
  try {
    const ddg = await _get({
      hostname: "api.duckduckgo.com",
      path: "/?q=" + q + "&format=json&no_html=1&t=WOLFSPACE",
      headers: { "User-Agent": UA },
      timeout: 10000,
    });
    if (ddg.AbstractText && results.length < 8) {
      results.push(
        `**${ddg.Heading || ""}**\n   ${trunc(ddg.AbstractText, 300)}` +
          (ddg.AbstractURL ? `\n   ${ddg.AbstractURL}` : ""),
      );
    }
  } catch (_) {}

  return results.length
    ? results.join("\n\n")
    : `(tidak ada hasil untuk "${query}" — coba query berbeda)`;
}

// ── Web Fetch ──
// Playwright headless sebagai mesin utama (menunggu render, ambil innerText bersih).
// Fallback ke HTTPS mentah kalau Playwright/Chromium tak tersedia atau gagal.
let activeFetches = 0;
let lastFetchTime = 0;
async function webFetch(urlStr) {
  const now = Date.now();
  if (now - lastFetchTime < 1000)
    await new Promise((r) => setTimeout(r, 1000 - (now - lastFetchTime)));
  lastFetchTime = Date.now();
  if (activeFetches >= 3)
    return Promise.reject(
      new Error("RATE_LIMIT: Terlalu banyak request (max 3)"),
    );
  // Diperiksa SEBELUM koneksi apa pun dibuat, dan sebelum penghitung dinaikkan.
  const aman = await urlAman(urlStr);
  if (!aman.ok) throw new Error(aman.error);
  activeFetches++;
  try {
    if (_loadPw()) {
      try {
        return await _fetchWithPlaywright(urlStr);
      } catch (_) {
        return await _fetchWithHttp(urlStr);
      } // Playwright gagal -> HTTP mentah
    }
    return await _fetchWithHttp(urlStr);
  } finally {
    activeFetches--;
  }
}

async function _fetchWithPlaywright(urlStr) {
  return _withPage(async (page) => {
    await page.goto(urlStr, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForTimeout(400); // beri sedikit waktu konten dinamis
    let text = await page.evaluate(() => {
      document
        .querySelectorAll("script,style,noscript,svg,head")
        .forEach((e) => e.remove());
      return document.body ? document.body.innerText : "";
    });
    text = String(text || "")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+\n/g, "\n")
      .trim();
    return trunc(text, 8000) || "(konten kosong)";
  });
}

function _fetchWithHttp(urlStr) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return reject(new Error("URL tidak valid: " + urlStr));
    }
    const transport = u.protocol === "http:" ? http : https;
    const r = transport.get(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        port: u.port || undefined,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        timeout: 20000,
      },
      (res) => {
        if (
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          const loc = res.headers.location;
          // Lewat webFetch lagi, BUKAN request langsung: dengan begitu tujuan
          // baru ikut diperiksa urlAman(). Redirect ke 127.0.0.1 adalah cara
          // paling umum melewati penjaga yang hanya memeriksa URL pertama.
          return webFetch(
            loc.startsWith("http") ? loc : u.protocol + "//" + u.hostname + loc,
          ).then(resolve, reject);
        }
        if (res.statusCode >= 400) {
          res.resume();
          return reject(new Error("HTTP " + res.statusCode));
        }
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          body = body
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/p>/gi, "\n\n")
            .replace(/<\/h[1-6]>/gi, "\n\n")
            .replace(/<\/li>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, " ")
            .replace(/\n{3,}/g, "\n\n")
            .replace(/[ \t]+\n/g, "\n")
            .trim();
          resolve(trunc(body, 8000) || "(konten kosong)");
        });
      },
    );
    r.on("error", (e) => reject(new Error("fetch gagal: " + e.message)));
    r.on("timeout", () => {
      r.destroy();
      reject(new Error("fetch timeout"));
    });
  });
}

// ── webExtract: ambil BAGIAN halaman, bukan seluruh teksnya ────────────────
//
// KENAPA TERPISAH dari webFetch. webFetch mengembalikan innerText seluruh
// halaman lalu memotongnya di 8000 karakter. Untuk membaca artikel itu cukup;
// untuk MENGAMBIL DATA ia gagal dengan tiga cara sekaligus:
//
//   1. tabel, daftar, dan atribut (href, data-*) rata jadi prosa — strukturnya
//      hilang justru saat strukturnya yang dicari
//   2. waitForTimeout(400) adalah tebakan. Halaman yang mengisi kontennya lewat
//      JS setelah 400 ms akan terbaca KOSONG, dan kosong itu tak terbedakan dari
//      "memang tak ada datanya"
//   3. yang dicari sering ada di luar 8000 karakter pertama
//
// Jadi tool ini menerima SELECTOR (bagian mana), TUNGGU (sampai apa muncul), dan
// MODE (bentuk apa yang dikembalikan). Bedanya bukan kenyamanan: tanpa itu,
// jawaban "tidak ada data" tidak bisa dipercaya.
const MODE_EKSTRAK = ["teks", "tabel", "tautan", "atribut", "html"];

async function webExtract(opts) {
  const o = opts || {};
  const urlStr = String(o.url || "");
  const selector = String(o.selector || "body");
  const mode = MODE_EKSTRAK.includes(o.mode) ? o.mode : "teks";

  const aman = await urlAman(urlStr);
  if (!aman.ok) throw new Error(aman.error);

  const pw = _loadPw();
  if (!pw)
    throw new Error(
      "playwright tidak tersedia — webExtract butuh browser sungguhan",
    );

  const tungguSel = o.tunggu ? String(o.tunggu) : null;
  const tungguMs = Math.min(
    Math.max(Number(o.tunggu_ms || 15000), 1000),
    45000,
  );
  const gulir = Math.min(Math.max(Number(o.gulir || 0), 0), 20);
  const batas = Math.min(Math.max(Number(o.batas || 200), 1), 2000);

  return _withPage(async (page) => {
    // Penjaga kedua, di lapisan jaringan browser. goto() saja tak cukup: redirect
    // dan subresource bisa menuju alamat internal tanpa pernah lewat urlAman().
    await page.route("**/*", async (route) => {
      const cek = await urlAman(route.request().url());
      if (cek.ok) return route.continue();
      return route.abort();
    });

    await page.goto(urlStr, { waitUntil: "domcontentloaded", timeout: 25000 });

    // Menunggu SELECTOR, bukan menunggu waktu. Ini bedanya antara "belum sempat
    // dimuat" dan "memang tidak ada" — dua hal yang tampak sama pada tebakan waktu.
    if (tungguSel) {
      try {
        await page.waitForSelector(tungguSel, { timeout: tungguMs });
      } catch (_) {
        return (
          `(selector tunggu '${tungguSel}' tak pernah muncul dalam ${tungguMs} ms — ` +
          `halaman mungkin butuh login, diblokir bot, atau selectornya salah)`
        );
      }
    } else {
      await page.waitForTimeout(500);
    }

    // Konten lazy-load hanya muncul setelah digulir. Tanpa ini, daftar panjang
    // terbaca hanya beberapa baris pertama dan sisanya tampak tak ada.
    for (let i = 0; i < gulir; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(400);
    }

    const hasil = await page.evaluate(
      ({ selector, mode, batas, atribut }) => {
        const el = Array.from(document.querySelectorAll(selector)).slice(
          0,
          batas,
        );
        if (!el.length) return { kosong: true, jml: 0, data: [] };
        const bersih = (s) =>
          String(s || "")
            .replace(/\s+/g, " ")
            .trim();

        if (mode === "tabel") {
          return {
            jml: el.length,
            data: el.map((t) =>
              Array.from(t.querySelectorAll("tr")).map((r) =>
                Array.from(r.querySelectorAll("th,td")).map((c) =>
                  bersih(c.innerText),
                ),
              ),
            ),
          };
        }
        if (mode === "tautan") {
          const a = el.flatMap((e) =>
            e.tagName === "A" ? [e] : Array.from(e.querySelectorAll("a[href]")),
          );
          return {
            jml: a.length,
            data: a
              .slice(0, batas)
              .map((x) => ({ teks: bersih(x.innerText), href: x.href })),
          };
        }
        if (mode === "atribut") {
          return {
            jml: el.length,
            data: el.map((e) => e.getAttribute(atribut)),
          };
        }
        if (mode === "html") {
          return { jml: el.length, data: el.map((e) => e.outerHTML) };
        }
        return { jml: el.length, data: el.map((e) => bersih(e.innerText)) };
      },
      { selector, mode, batas, atribut: String(o.atribut || "href") },
    );

    if (hasil.kosong) {
      // Dinyatakan sebagai FAKTA TENTANG SELECTOR, bukan tentang halaman. Model
      // yang membaca "tidak ada data" akan menyimpulkan datanya memang tak ada.
      return `(selector '${selector}' tidak cocok dengan elemen apa pun di halaman ini)`;
    }
    const teks =
      mode === "teks"
        ? hasil.data.filter(Boolean).join("\n")
        : JSON.stringify(hasil.data, null, 1);
    return trunc(`[${hasil.jml} elemen cocok, mode=${mode}]\n` + teks, 16000);
  });
}

module.exports = { webSearch, webFetch, webExtract, urlAman, MODE_EKSTRAK };
