// Web search + fetch for WOLFSPACE agent
const https = require('https');
const http = require('http');
const { execSync, exec } = require('child_process'); // exec dipakai _fetchWithEdge (dulu tak diimpor -> web_fetch selalu "exec is not defined")
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

// ── Find Microsoft Edge binary ──
function findEdge() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env['ProgramFiles(x86)'] + '\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.ProgramFiles + '\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return null;
}
const EDGE = findEdge();
// Profil Edge terdedikasi & PERSISTEN untuk headless. Terisolasi dari profil default
// user (jadi tak menyentuh cookie/history/login mereka, dan tak bentrok dengan Edge
// yang sedang mereka buka), tapi persisten -> hangat setelah panggilan pertama
// (cold-start ~15s hanya sekali, berikutnya jauh lebih cepat).
const EDGE_PROFILE = path.join(os.tmpdir(), 'wolfspace-edge-profile');

// ── Dump raw DOM via Edge headless (untuk parsing hasil pencarian nyata) ──
// PENTING: pakai --user-data-dir sementara & unik. Tanpa itu, Edge headless memakai
// profil default yang SAMA dengan Edge milik user yang sedang terbuka → bentrok
// (timeout) dan berisiko menyentuh data browsing user. Dibersihkan setelah selesai.
function _edgeDumpRaw(urlStr, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!EDGE) return reject(new Error('Edge tidak tersedia'));
    exec(
      `"${EDGE}" --headless=new --disable-gpu --no-sandbox --user-data-dir="${EDGE_PROFILE}" --dump-dom --virtual-time-budget=8000 "${urlStr}"`,
      { timeout: timeoutMs || 15000, encoding: 'utf8', windowsHide: true, maxBuffer: 12 * 1024 * 1024 },
      (error, stdout) => {
        if (error && !stdout) return reject(error);
        resolve(stdout || '');
      }
    );
  });
}

// ── Real web search via Bing SERP (Edge headless bypasses bot detection) ──
// Ini yang sebelumnya HILANG: tanpa sumber web umum, satu-satunya sumber yang
// selalu mengembalikan sesuatu adalah npm (fuzzy-match) — jadi query non-teknis
// seperti "gaji AI engineer" dijawab dengan paket npm acak. Bing mengembalikan
// hasil web sesungguhnya.
async function _bingSearch(query) {
  const url = 'https://www.bing.com/search?q=' + encodeURIComponent(query) + '&setlang=id&count=8';
  // Bound 12s: Edge headless bisa lambat/flaky. Kalau tak balas cepat, biar
  // fallback ke sumber lain daripada menggantung lama. Best-effort, bukan andalan.
  const html = await _edgeDumpRaw(url, 12000);
  const results = [];
  const strip = s => String(s || '')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
  const blocks = html.split(/<li class="b_algo"/).slice(1);
  for (const blk of blocks.slice(0, 6)) {
    const href = (blk.match(/<h2>\s*<a[^>]+href="([^"]+)"/i) || [])[1];
    const title = strip((blk.match(/<h2>\s*<a[^>]+>([\s\S]*?)<\/a>/i) || [])[1]);
    const snip = trunc(strip((blk.match(/<p[^>]*>([\s\S]*?)<\/p>/i) || [])[1]), 260);
    if (title && href) results.push(`**${trunc(title, 90)}** [web]\n   ${href}\n   ${snip}`);
  }
  return results;
}

// ── Web Search (multi-source) ──
async function webSearch(query) {
  const q = encodeURIComponent(query);
  const results = [];

  // 0) HASIL WEB NYATA (Bing via Edge) — sumber utama untuk pertanyaan apa pun.
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
// Uses Microsoft Edge headless mode as primary engine (bypasses bot detection).
// Falls back to raw HTTPS request if Edge is not available.
let activeFetches = 0;
let lastFetchTime = 0;
async function webFetch(urlStr) {
  const now = Date.now();
  if (now - lastFetchTime < 1000) await new Promise(r => setTimeout(r, 1000 - (now - lastFetchTime)));
  lastFetchTime = Date.now();
  if (activeFetches >= 3) return Promise.reject(new Error('RATE_LIMIT: Terlalu banyak request (max 3)'));
  activeFetches++;
  try {
    if (EDGE) {
      return await _fetchWithEdge(urlStr);
    }
    return await _fetchWithHttp(urlStr);
  } finally {
    activeFetches--;
  }
}

function _fetchWithEdge(urlStr) {
  // Async via exec (not execSync) to avoid blocking the event loop
  return new Promise((resolve, reject) => {
    // Profil terdedikasi persisten: isolasi dari Edge user + hangat setelah call pertama.
    exec(
      `"${EDGE}" --headless=new --disable-gpu --no-sandbox --user-data-dir="${EDGE_PROFILE}" --dump-dom --virtual-time-budget=10000 "${urlStr}"`,
      { timeout: 25000, encoding: 'utf8', windowsHide: true, maxBuffer: 12 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          // Edge headless failed — fall back to raw HTTP
          return _fetchWithHttp(urlStr).then(resolve, reject);
        }
        let body = stdout || '';
        if (!body.trim()) return resolve('(halaman kosong)');
        body = body
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<\/h[1-6]>/gi, '\n\n')
          .replace(/<\/li>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/[ \t]+\n/g, '\n')
          .trim();
        resolve(trunc(body, 8000) || '(konten kosong)');
      }
    );
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

