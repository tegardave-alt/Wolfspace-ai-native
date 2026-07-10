// Web search + fetch for WOLFSPACE agent
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
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

// ── Web Search (multi-source) ──
async function webSearch(query) {
  const q = encodeURIComponent(query);
  const results = [];

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

  // 3) npm
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

  // 4) Wikipedia
  try {
    const wp = await _get({
      hostname: 'en.wikipedia.org', path: '/w/api.php?action=query&list=search&srsearch=' + q + '&format=json&srlimit=3',
      headers: { 'User-Agent': UA }, timeout: 10000,
    });
    if (wp.query && wp.query.search) for (const item of wp.query.search) {
      results.push(`**[Wiki] ${item.title}**\n   https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g,'_'))}\n   ${trunc(item.snippet.replace(/<[^>]+>/g,''),250)}`);
    }
  } catch (_) {}

  // 5) DuckDuckGo Instant Answer
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
function webFetch(urlStr) {
  if (EDGE) {
    return _fetchWithEdge(urlStr);
  }
  return _fetchWithHttp(urlStr);
}

function _fetchWithEdge(urlStr) {
  // Async via exec (not execSync) to avoid blocking the event loop
  return new Promise((resolve, reject) => {
    const tmpFile = path.join(os.tmpdir(), '_qfetch_' + Date.now() + '.html');
    exec(
      `"${EDGE}" --headless=new --disable-gpu --no-sandbox --dump-dom --virtual-time-budget=10000 "${urlStr}"`,
      { timeout: 25000, encoding: 'utf8', windowsHide: true },
      (error, stdout) => {
        try { fs.rmSync(tmpFile, { force: true }); } catch (_) {}
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

