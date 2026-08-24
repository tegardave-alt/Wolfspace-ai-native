// Web search + fetch for WOLFSPACE agent
import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

function _get(opts) {
  return new Promise((resolve, reject) => {
    const r = https.get(opts, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        if (res.statusCode! >= 400)
          return reject(new Error("HTTP " + res.statusCode!));
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

// ── The destination guard: the outward web yes, the inward network NO ──
//
// WHY IT EXISTS. Without it, web_fetch is an SSRF hole that bypasses every
// containment this repo has built. The broker guards files and processes;
// nothing guarded a network destination. Proven by a real test: a local server
// on 127.0.0.1:8399 had its contents read whole by webFetch. The expensive one
// was not that test server but WOLFSPACE'S OWN backend on 8090 — where
// /plugins, /debug and the configuration live.
//
// What is guarded is the DESTINATION, not the URL string. The hostname is
// resolved first and the RESULTING ADDRESS is checked; otherwise "localtest.me"
// — or any domain pointed at 127.0.0.1 — would walk straight through.
const dns = require("dns").promises;

// 169.254.x.x is included deliberately: at cloud providers 169.254.169.254 is
// the instance metadata endpoint — a source of credentials, and the most
// classic SSRF target there is.
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
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return true; // unreadable = refuse
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
  let u: any;
  try {
    u = new URL(String(urlStr));
  } catch (_) {
    return { ok: false, error: "invalid URL: " + urlStr };
  }

  // Other schemes (file:, data:, chrome:) are not "the web", and some read disk.
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return {
      ok: false,
      error: "scheme not allowed: " + u.protocol + " (http/https only)",
    };
  }
  // An escape hatch for deliberately local testing. Off by default.
  if (process.env.WOLFSPACE_WEB_IZINKAN_LOKAL === "1")
    return { ok: true, url: u };

  let alamat: any;
  try {
    alamat = await dns.lookup(u.hostname, { all: true });
  } catch (e) {
    return { ok: false, error: "host could not be resolved: " + u.hostname };
  }

  // EVERY resolved address must be public. One private answer is enough to
  // refuse: a host returning two addresses could pick the private one when the
  // real connection is made.
  for (const a of alamat) {
    if (_ipPrivat(a.address)) {
      return {
        ok: false,
        error:
          "internal network destination refused: " +
          u.hostname +
          " -> " +
          a.address +
          " (loopback/privat/link-local). Setel WOLFSPACE_WEB_IZINKAN_LOKAL=1 bila memang disengaja.",
      };
    }
  }
  return { ok: true, url: u };
}

// ── The Tavily search API (the primary source when a key is available) ──
// Purpose-built for AI agents: one HTTP request, clean results plus a
// synthesised answer, with no scraping, CAPTCHA or locale handling. The key is
// read from ~/.wolfspace/cloud-keys.json (outside the repo, consistent with the
// other cloud keys). Cached after the first read.
let _tavilyKey; // undefined = not read yet, null = absent
function _getTavilyKey() {
  if (_tavilyKey !== undefined) return _tavilyKey;
  try {
    const { resolveKeysPath } = require("./keys-path.ts");
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
          if (res.statusCode! >= 400)
            return reject(new Error("tavily HTTP " + res.statusCode!));
          let j: any;
          try {
            j = JSON.parse(d);
          } catch (e) {
            return reject(new Error("tavily bad JSON"));
          }
          const out: any[] = [];
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

// ── Playwright headless (the primary scraping engine) ──
// More reliable than Edge `--dump-dom`: it waits for content to render,
// extracts through real DOM selectors, and uses Playwright's own bundled
// Chromium rather than the user's Edge — so it never touches their profile,
// cookies or logins. The browser is launched once and reused (a singleton), and
// closed automatically after idling so it does not leak a process.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const BROWSER_IDLE_MS = 3 * 60 * 1000;
let _pw: any = null,
  _browser: any = null,
  _browserPromise: any = null,
  _idleTimer: any = null;

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
  if (_idleTimer.unref) _idleTimer.unref(); // do not hold the process alive
}
async function _getBrowser() {
  const pw = _loadPw();
  if (!pw) throw new Error("playwright unavailable");
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
// Run fn with one isolated context and page, always cleaned up.
async function _withPage(fn: any, contextOpts?: any) {
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

// ── Real web search through the Bing SERP (Playwright: wait for render, extract
// by selector) ──
// This is what used to be MISSING: with no general web source, the only one that
// always returned something was npm (fuzzy-matched) — so a non-technical query
// like "AI engineer salary" was answered with random npm packages. Bing gives
// real web results.
async function _bingSearch(query) {
  // mkt plus Accept-Language are REQUIRED: with no clear locale marker, Bing
  // guesses the datacenter client's location and serves results from a random
  // region (Korea or China, say) for an Indonesian query. With id-ID the results
  // are relevant and consistent.
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
  const results: any[] = [];

  // 0a) TAVILY — the primary source when a key is available (a reliable API,
  //     relevant results plus a summary, no scraping). If it works, this is
  //     enough (plus SO/GH for technical queries) and Bing is not needed.
  let tavilyOk = false;
  try {
    const tv: any = await _tavilySearch(query);
    if (tv.length) {
      results.push(...tv);
      tavilyOk = true;
    }
  } catch (_) {}

  // Tavily already gave an answer plus 5 relevant results; do not add latency
  // with other sources (DDG-instant often times out around 10s). Return straight
  // away (~3s).
  if (tavilyOk) return results.join("\n\n");

  // 0b) Fallback: Bing through Playwright ONLY when Tavily is unavailable or
  //     failed (scraping is slower and sometimes mis-parses; used when there is
  //     no API).
  try {
    const web = await _bingSearch(query);
    results.push(...web);
  } catch (_) {}

  // 1) StackExchange
  try {
    const se: any = await _get({
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
    const gh: any = await _get({
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

  // 3) npm — ONLY when the query is clearly about a package or library (it used
  // to always run and return random packages for any query, polluting the real
  // web results).
  if (
    /\b(npm|package|paket|library|pustaka|module|modul|dependency|dependensi|install)\b/i.test(
      query,
    )
  ) {
    try {
      const npm: any = await _get({
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
    const ddg: any = await _get({
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
    : `(no results for "${query}" — try a different query)`;
}

// ── Web Fetch ──
// Playwright headless as the primary engine (waits for render, takes clean
// innerText). Falls back to raw HTTPS when Playwright/Chromium is unavailable or
// fails.
let activeFetches = 0;
let lastFetchTime = 0;
async function webFetch(urlStr) {
  const now = Date.now();
  if (now - lastFetchTime < 1000)
    await new Promise((r) => setTimeout(r, 1000 - (now - lastFetchTime)));
  lastFetchTime = Date.now();
  if (activeFetches >= 3)
    return Promise.reject(new Error("RATE_LIMIT: too many requests (max 3)"));
  // Checked BEFORE any connection is made, and before the counter is raised.
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
    return trunc(text, 8000) || "(empty content)";
  });
}

function _fetchWithHttp(urlStr) {
  return new Promise((resolve, reject) => {
    let u: any;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return reject(new Error("invalid URL: " + urlStr));
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
          res.statusCode! >= 300 &&
          res.statusCode! < 400 &&
          res.headers.location
        ) {
          res.resume();
          const loc = res.headers.location;
          // Through webFetch again, NOT a direct request: that way the new
          // destination is checked by urlAman() too. A redirect to 127.0.0.1 is
          // the most common way past a guard that only checks the first URL.
          return webFetch(
            loc.startsWith("http") ? loc : u.protocol + "//" + u.hostname + loc,
          ).then(resolve, reject);
        }
        if (res.statusCode! >= 400) {
          res.resume();
          return reject(new Error("HTTP " + res.statusCode!));
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
          resolve(trunc(body, 8000) || "(empty content)");
        });
      },
    );
    r.on("error", (e) => reject(new Error("fetch failed: " + e.message)));
    r.on("timeout", () => {
      r.destroy();
      reject(new Error("fetch timeout"));
    });
  });
}

// ── webExtract: take PART of a page, not all of its text ──
//
// WHY IT IS SEPARATE from webFetch. webFetch returns the whole page's innerText
// and then cuts it at 8000 characters. For reading an article that is fine; for
// EXTRACTING DATA it fails in three ways at once:
//
//   1. tables, lists and attributes (href, data-*) flatten into prose — the
//      structure is lost exactly when the structure is what was wanted
//   2. waitForTimeout(400) is a guess. A page that fills its content through JS
//      after 400 ms reads as EMPTY, and that emptiness is indistinguishable
//      from "there is genuinely no data"
//   3. what is wanted is often past the first 8000 characters
//
// So this tool takes a SELECTOR (which part), a WAIT (until what appears), and a
// MODE (what shape to return). The difference is not convenience: without it, an
// answer of "no data" cannot be trusted.
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
    throw new Error("playwright unavailable — webExtract needs a real browser");

  const tungguSel = o.tunggu ? String(o.tunggu) : null;
  const tungguMs = Math.min(
    Math.max(Number(o.tunggu_ms || 15000), 1000),
    45000,
  );
  const gulir = Math.min(Math.max(Number(o.gulir || 0), 0), 20);
  const batas = Math.min(Math.max(Number(o.batas || 200), 1), 2000);

  return _withPage(async (page) => {
    // A second guard, at the browser's network layer. goto() alone is not enough:
    // redirects and subresources can reach an internal address without ever
    // passing through urlAman().
    await page.route("**/*", async (route) => {
      const cek = await urlAman(route.request().url());
      if (cek.ok) return route.continue();
      return route.abort();
    });

    await page.goto(urlStr, { waitUntil: "domcontentloaded", timeout: 25000 });

    // Waiting for a SELECTOR, not for a duration. That is the difference between
    // "it had not loaded yet" and "it is genuinely not there" — two things that
    // look identical to a time-based guess.
    if (tungguSel) {
      try {
        await page.waitForSelector(tungguSel, { timeout: tungguMs });
      } catch (_) {
        return (
          `(the wait selector '${tungguSel}' never appeared within ${tungguMs} ms — ` +
          `the page may need a login, may block bots, or the selector may be wrong)`
        );
      }
    } else {
      await page.waitForTimeout(500);
    }

    // Lazy-loaded content only appears after scrolling. Without this, a long list
    // reads as just its first few rows and the rest appears absent.
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
              Array.from(t.querySelectorAll("tr")).map((r: any) =>
                Array.from(r.querySelectorAll("th,td")).map((c: any) =>
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
      // Stated as a FACT ABOUT THE SELECTOR, not about the page. A model that
      // reads "no data" will conclude the data does not exist.
      return `(selector '${selector}' matched no element on this page)`;
    }
    const teks =
      mode === "teks"
        ? hasil.data.filter(Boolean).join("\n")
        : JSON.stringify(hasil.data, null, 1);
    return trunc(`[${hasil.jml} elemen cocok, mode=${mode}]\n` + teks, 16000);
  });
}

module.exports = { webSearch, webFetch, webExtract, urlAman, MODE_EKSTRAK };
