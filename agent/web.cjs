// Web search + fetch for WOLFSPACE agent
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

function _get(opts) {
  return new Promise((resolve, reject) => {
    const r = https.get(opts, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error('HTTP ' + res.statusCode));
        try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
      });
    });
    r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    r.on('error', reject);
  });
}

const UA = 'QuantumAgent/1.0';
function trunc(s, n) { s = String(s||''); return s.length <= n ? s : s.slice(0, n) + '…'; }

// ── Tavily search API (sumber utama bila key tersedia) ──
// Purpose-built untuk agent AI: 1 request HTTP, hasil bersih + jawaban tersintesis,
// tanpa scraping/CAPTCHA/locale. Key dibaca dari ~/.wolfspace/cloud-keys.json (di luar
// repo, konsisten dengan kunci cloud lain). Di-cache setelah pembacaan pertama.
let _tavilyKey; // undefined = belum dibaca, null = tak ada
function _getTavilyKey() {
  if (_tavilyKey !== undefined) return _tavilyKey;
  try {
    const { resolveKeysPath } = require('./keys-path.cjs');
    const keys = JSON.parse(fs.readFileSync(resolveKeysPath(), 'utf8'));
    _tavilyKey = (keys.tavily && keys.tavily.key) || (keys.tavily && typeof keys.tavily === 'string' ? keys.tavily : null) || null;
  } catch (_) { _tavilyKey = null; }
  return _tavilyKey;
}
function _tavilySearch(query) {
  return new Promise((resolve, reject) => {
    const key = _getTavilyKey();
    if (!key) return reject(new Error('no tavily key'));
    const body = JSON.stringify({ query, search_depth: 'basic', max_results: 5, include_answer: true });
    const req = https.request({
      hostname: 'api.tavily.com', path: '/search', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(body) },
      timeout: 20000,
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error('tavily HTTP ' + res.statusCode));
        let j; try { j = JSON.parse(d); } catch (e) { return reject(new Error('tavily bad JSON')); }
        const out = [];
        if (j.answer) out.push(`**Ringkasan:** ${trunc(j.answer, 500)}`);
        for (const r of (j.results || []).slice(0, 5)) {
          out.push(`**${trunc(r.title || '', 90)}** [web]\n   ${r.url || ''}\n   ${trunc((r.content || '').replace(/\s+/g, ' ').trim(), 260)}`);
        }
        resolve(out);
      });
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('tavily timeout')); });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

// ── Playwright headless (mesin scraping utama) ──
// Lebih andal dari Edge `--dump-dom`: menunggu konten ter-render, ekstrak via selector
// DOM sungguhan, dan pakai browser Chromium bundel Playwright sendiri (bukan Edge user,
// jadi tak menyentuh profil/cookie/login mereka). Browser di-launch sekali lalu dipakai
// ulang (singleton), dan ditutup otomatis setelah idle agar tak membocorkan proses.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BROWSER_IDLE_MS = 3 * 60 * 1000;
let _pw = null, _browser = null, _browserPromise = null, _idleTimer = null;

function _loadPw() {
  if (_pw !== null) return _pw;
  try { _pw = require('playwright'); } catch (_) { _pw = false; }
  return _pw;
}
function _touchIdle() {
  if (_idleTimer) clearTimeout(_idleTimer);
  _idleTimer = setTimeout(() => {
    const b = _browser; _browser = null; _browserPromise = null;
    if (b) b.close().catch(() => {});
  }, BROWSER_IDLE_MS);
  if (_idleTimer.unref) _idleTimer.unref(); // jangan menahan proses tetap hidup
}
async function _getBrowser() {
  const pw = _loadPw();
  if (!pw) throw new Error('playwright tidak tersedia');
  if (_browser && _browser.isConnected()) { _touchIdle(); return _browser; }
  if (!_browserPromise) {
    _browserPromise = pw.chromium.launch({ headless: true })
      .then(b => { _browser = b; b.on('disconnected', () => { _browser = null; _browserPromise = null; }); return b; })
      .catch(e => { _browserPromise = null; throw e; });
  }
  const b = await _browserPromise;
  _touchIdle();
  return b;
}
// Jalankan fn dengan satu context+page terisolasi, selalu dibersihkan.
async function _withPage(fn, contextOpts) {
  const browser = await _getBrowser();
  const ctx = await browser.newContext({ userAgent: BROWSER_UA, ...(contextOpts || {}) });
  const page = await ctx.newPage();
  try { return await fn(page); }
  finally { await ctx.close().catch(() => {}); }
}

// ── Real web search via Bing SERP (Playwright — tunggu render, ekstrak via selector) ──
// Ini yang sebelumnya HILANG: tanpa sumber web umum, satu-satunya sumber yang selalu
// mengembalikan sesuatu adalah npm (fuzzy-match) — jadi query non-teknis seperti
// "gaji AI engineer" dijawab dengan paket npm acak. Bing memberi hasil web sungguhan.
async function _bingSearch(query) {
  // mkt + Accept-Language WAJIB: tanpa penanda locale yang jelas, Bing menebak lokasi
  // klien datacenter dan menyajikan hasil region acak (mis. Korea/China) untuk query
  // Indonesia. Dengan id-ID hasilnya relevan & konsisten.
  return _withPage(async (page) => {
    await page.goto('https://www.bing.com/search?q=' + encodeURIComponent(query) + '&mkt=id-ID',
      { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('li.b_algo', { timeout: 8000 }).catch(() => {});
    const items = await page.$$eval('li.b_algo', els => els.slice(0, 6).map(el => {
      const a = el.querySelector('h2 a');
      const cite = el.querySelector('cite');
      const p = el.querySelector('.b_caption p, p');
      return {
        title: a ? a.innerText.trim() : '',
        url: (cite && cite.innerText.trim()) || (a ? a.href : ''),
        snippet: p ? p.innerText.trim() : ''
      };
    }));
    return items.filter(r => r.title)
      .map(r => `**${trunc(r.title, 90)}** [web]\n   ${trunc(r.url, 110)}\n   ${trunc(r.snippet, 260)}`);
  }, { locale: 'id-ID', extraHTTPHeaders: { 'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8' } });
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
    if (tv.length) { results.push(...tv); tavilyOk = true; }
  } catch (_) {}

  // Tavily sudah memberi jawaban + 5 hasil relevan; jangan tambah latensi dengan
  // sumber lain (DDG-instant sering timeout ~10s). Langsung kembalikan (~3s).
  if (tavilyOk) return results.join('\n\n');

  // 0b) Fallback: Bing via Playwright HANYA jika Tavily tak tersedia/gagal (scraping
  //     lebih lambat & kadang salah-parse; dipakai kalau tak ada API).
  try { const web = await _bingSearch(query); results.push(...web); } catch (_) {}

  // 1) StackExchange
  try {
    const se = await _get({
      hostname: 'api.stackexchange.com', path: '/2.3/search?order=desc&sort=relevance&intitle=' + q + '&site=stackoverflow&pagesize=5&filter=withbody',
      headers: { 'User-Agent': UA }, timeout: 12000,
    });
    if (se.items) for (const item of se.items.slice(0, 5)) {
      const bodySnippet = item.body ? trunc(item.body.replace(/<[^>]+>/g, '').trim(), 250) : '';
      results.push(`**${trunc(item.title,80).replace(/&amp;/g,'&').replace(/&quot;/g,'"')}** [SO]\n   ${item.link}\n   ${bodySnippet}`);
    }
  } catch (_) {}

  // 2) GitHub
  try {
    const gh = await _get({
      hostname: 'api.github.com', path: '/search/repositories?q=' + q + '&sort=stars&per_page=3',
      headers: { 'User-Agent': UA, 'Accept': 'application/vnd.github+json' }, timeout: 12000,
    });
    if (gh.items) for (const item of gh.items.slice(0, 3)) {
      results.push(`**[GH] ${item.full_name}**  ★${item.stargazers_count}\n   ${item.html_url}\n   ${trunc(item.description,200)}`);
    }
  } catch (_) {}

  // 3) npm — HANYA jika query jelas tentang paket/library (dulu selalu jalan dan
  // mengembalikan paket acak untuk query apa pun, mencemari hasil web nyata).
  if (/\b(npm|package|paket|library|pustaka|module|modul|dependency|dependensi|install)\b/i.test(query)) {
    try {
      const npm = await _get({
        hostname: 'registry.npmjs.org', path: '/-/v1/search?text=' + q + '&size=3',
        headers: { 'User-Agent': UA }, timeout: 10000,
      });
      if (npm.objects) for (const obj of npm.objects.slice(0, 3)) {
        const p = obj.package;
        results.push(`**[npm] ${p.name}**  v${p.version}\n   https://www.npmjs.com/package/${p.name}\n   ${trunc(p.description,200)}`);
      }
    } catch (_) {}
  }

  // 4) DuckDuckGo Instant Answer
  try {
    const ddg = await _get({
      hostname: 'api.duckduckgo.com', path: '/?q=' + q + '&format=json&no_html=1&t=WOLFSPACE',
      headers: { 'User-Agent': UA }, timeout: 10000,
    });
    if (ddg.AbstractText && results.length < 8) {
      results.push(`**${ddg.Heading||''}**\n   ${trunc(ddg.AbstractText,300)}` + (ddg.AbstractURL ? `\n   ${ddg.AbstractURL}` : ''));
    }
  } catch (_) {}

  return results.length
    ? results.join('\n\n')
    : `(tidak ada hasil untuk "${query}" — coba query berbeda)`;
}

// ── Web Fetch ──
// Playwright headless sebagai mesin utama (menunggu render, ambil innerText bersih).
// Fallback ke HTTPS mentah kalau Playwright/Chromium tak tersedia atau gagal.
let activeFetches = 0;
let lastFetchTime = 0;
async function webFetch(urlStr) {
  const now = Date.now();
  if (now - lastFetchTime < 1000) await new Promise(r => setTimeout(r, 1000 - (now - lastFetchTime)));
  lastFetchTime = Date.now();
  if (activeFetches >= 3) return Promise.reject(new Error('RATE_LIMIT: Terlalu banyak request (max 3)'));
  activeFetches++;
  try {
    if (_loadPw()) {
      try { return await _fetchWithPlaywright(urlStr); }
      catch (_) { return await _fetchWithHttp(urlStr); } // Playwright gagal -> HTTP mentah
    }
    return await _fetchWithHttp(urlStr);
  } finally {
    activeFetches--;
  }
}

async function _fetchWithPlaywright(urlStr) {
  return _withPage(async (page) => {
    await page.goto(urlStr, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(400); // beri sedikit waktu konten dinamis
    let text = await page.evaluate(() => {
      document.querySelectorAll('script,style,noscript,svg,head').forEach(e => e.remove());
      return document.body ? document.body.innerText : '';
    });
    text = String(text || '').replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
    return trunc(text, 8000) || '(konten kosong)';
  });
}

function _fetchWithHttp(urlStr) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject(new Error('URL tidak valid: ' + urlStr)); }
    const transport = u.protocol === 'http:' ? http : https;
    const r = transport.get({
      hostname: u.hostname, path: u.pathname + u.search, port: u.port || undefined,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 20000,
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const loc = res.headers.location;
        return webFetch(loc.startsWith('http') ? loc : u.protocol + '//' + u.hostname + loc).then(resolve, reject);
      }
      if (res.statusCode >= 400) { res.resume(); return reject(new Error('HTTP ' + res.statusCode)); }
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        body = body
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<\/h[1-6]>/gi, '\n\n')
          .replace(/<\/li>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
          .replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n').trim();
        resolve(trunc(body, 8000) || '(konten kosong)');
      });
    });
    r.on('error', e => reject(new Error('fetch gagal: ' + e.message)));
    r.on('timeout', () => { r.destroy(); reject(new Error('fetch timeout')); });
  });
}

module.exports = { webSearch, webFetch };

