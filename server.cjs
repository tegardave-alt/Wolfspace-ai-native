#!/usr/bin/env node
'use strict';
/**
 * Quantum server — serves the chat UI, runs code blocks, and orchestrates the
 * generate -> execute -> fix loop against local models.
 *
 *   GET  /             -> chat UI (public/index.html)
 *   GET  /models       -> list of configured models {name, port, default}
 *   POST /run          -> execute one code block, return real stdout/stderr
 *   POST /chat (SSE)   -> stream tokens; auto-run generated code; if it fails,
 *                         feed the error back to the model and retry (<=3x)
 *
 * The differentiator: the model only GUESSES code; the CPU is the judge.
 */
const http = require('http');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const vm   = require('vm');
const { execSync, spawn } = require('child_process');

const CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const HOST = (CONFIG.server && CONFIG.server.host) || '127.0.0.1';
const PORT = (CONFIG.server && CONFIG.server.port) || 8090;
const HTML = path.join(__dirname, 'public', 'index.html');
const TMP_PY = path.join(os.tmpdir(), '_quantum_run.py');

// ── Execute JavaScript as a script, capturing console output (5s timeout) ──
function runJS(code) {
  const logs = [];
  const push = (...a) => logs.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' '));
  const sandbox = {
    console: { log: push, error: push, warn: push, info: push },
    JSON, Math, Number, String, Array, Object, Boolean, Date, Map, Set, Symbol,
    parseInt, parseFloat, isNaN, isFinite, RegExp, Error, TypeError, RangeError,
    setTimeout: (f) => f && f(), clearTimeout: () => {}, setInterval: () => ({}), clearInterval: () => {},
  };
  try {
    vm.runInContext(code, vm.createContext(sandbox), { timeout: 5000 });
    return { ok: true, output: logs.join('\n') };
  } catch (e) {
    return { ok: false, output: logs.join('\n'), error: e.constructor.name + ': ' + e.message };
  }
}

// ── Execute Python as a script via subprocess (8s timeout) ──
function runPy(code) {
  fs.writeFileSync(TMP_PY, code, 'utf8');
  try {
    const out = execSync(`python "${TMP_PY}"`, { timeout: 8000, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { ok: true, output: out };
  } catch (e) {
    return { ok: false, output: (e.stdout || '').toString(), error: ((e.stderr || '') + '').trim() || e.message };
  }
}

const RUN = CONFIG.runners || {};

// ── Persistent Jedi worker: real Python autocomplete (static analysis, no model) ──
let jediProc = null, jediBuf = '', jediQueue = [];
function startJedi() {
  try {
    jediProc = spawn('python', [path.join(__dirname, 'jedi_worker.py')], { stdio: ['pipe', 'pipe', 'pipe'] });
    jediProc.stdout.on('data', d => {
      jediBuf += d.toString();
      let i;
      while ((i = jediBuf.indexOf('\n')) >= 0) {
        const line = jediBuf.slice(0, i); jediBuf = jediBuf.slice(i + 1);
        const cb = jediQueue.shift(); if (cb) cb(line);
      }
    });
    jediProc.on('exit', () => { jediProc = null; });
    jediProc.on('error', () => { jediProc = null; });
  } catch { jediProc = null; }
}
function jediComplete(reqObj) {
  return new Promise(resolve => {
    if (!jediProc) return resolve([]);
    jediQueue.push(line => { try { resolve(JSON.parse(line)); } catch { resolve([]); } });
    try { jediProc.stdin.write(JSON.stringify(reqObj) + '\n'); } catch { resolve([]); }
  });
}
startJedi();

// Compile (C/C++) -> run the produced exe. Returns {ok, output, error}.
function compileRun(code, ext, compiler, label, env) {
  if (!compiler) return { ok: false, error: `${label} not available (set runners in config.json)` };
  const base = path.join(os.tmpdir(), '_q_' + Date.now());
  const src = base + ext, exe = base + '.exe';
  fs.writeFileSync(src, code, 'utf8');
  let res;
  try {
    execSync(`"${compiler}" "${src}" -o "${exe}"`, { timeout: 60000, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], env: env || process.env });
    try { res = { ok: true, output: execSync(`"${exe}"`, { timeout: 8000, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], env: env || process.env }) }; }
    catch (e) { res = { ok: false, output: (e.stdout||'').toString(), error: ((e.stderr||'')+'').trim() || 'runtime error' }; }
  } catch (e) { res = { ok: false, error: 'compile error:\n' + (((e.stderr||'')+'').trim() || e.message) }; }
  try { fs.rmSync(src, { force: true }); fs.rmSync(exe, { force: true }); } catch {}
  return res;
}
const runC   = code => compileRun(code, '.c',   RUN.c,   'gcc');
const runCpp = code => compileRun(code, '.cpp', RUN.cpp, 'g++');

function runGo(code) {
  if (!RUN.go) return { ok: false, error: 'go not available (set runners.go in config.json)' };
  // Go ignores files starting with "_" or "." — use a clean dir + main.go
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qgo-'));
  const src = path.join(dir, 'main.go');
  fs.writeFileSync(src, code, 'utf8');
  let res;
  try { res = { ok: true, output: execSync(`"${RUN.go}" run "${src}"`, { timeout: 30000, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }) }; }
  catch (e) { res = { ok: false, output: (e.stdout||'').toString(), error: ((e.stderr||'')+'').trim() || 'error' }; }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  return res;
}

function runJava(code) {
  if (!RUN.java || !RUN.javac) return { ok: false, error: 'java not available (set runners.java/javac in config.json)' };
  const m = code.match(/public\s+class\s+(\w+)/);
  const cls = m ? m[1] : 'Main';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qjava-'));
  const src = path.join(dir, cls + '.java');
  fs.writeFileSync(src, code, 'utf8');
  let res;
  try {
    execSync(`"${RUN.javac}" "${src}"`, { cwd: dir, timeout: 30000, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
    try { res = { ok: true, output: execSync(`"${RUN.java}" -cp "${dir}" ${cls}`, { timeout: 10000, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }) }; }
    catch (e) { res = { ok: false, output: (e.stdout||'').toString(), error: ((e.stderr||'')+'').trim() || 'runtime error' }; }
  } catch (e) { res = { ok: false, error: 'compile error:\n' + (((e.stderr||'')+'').trim() || e.message) }; }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  return res;
}

// PHP: interpreter runs the file directly
function runPhp(code) {
  if (!RUN.php) return { ok: false, error: 'php not available (set runners.php in config.json)' };
  const src = path.join(os.tmpdir(), '_q_' + Date.now() + '.php');
  fs.writeFileSync(src, code, 'utf8');
  let res;
  try { res = { ok: true, output: execSync(`"${RUN.php}" "${src}"`, { timeout: 8000, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }) }; }
  catch (e) { res = { ok: false, output: (e.stdout||'').toString(), error: ((e.stderr||'')+'').trim() || 'error' }; }
  try { fs.rmSync(src, { force: true }); } catch {}
  return res;
}
// Rust: rustc compiles to an exe. GNU toolchain needs mingw on PATH (linker + DLLs).
function runRust(code) {
  const mingwBin = RUN.c ? path.dirname(RUN.c) : '';   // gcc.exe dir = mingw/bin
  const env = { ...process.env, PATH: mingwBin + path.delimiter + (process.env.PATH || '') };
  return compileRun(code, '.rs', RUN.rust, 'rustc', env);
}
// Kotlin: kotlinc -> jar, java runs it (slow: JVM startup + compile). Needs JAVA_HOME.
function runKotlin(code) {
  if (!RUN.kotlinc || !RUN.java) return { ok: false, error: 'kotlin not available (set runners.kotlinc/java in config.json)' };
  const javaHome = path.dirname(path.dirname(RUN.java));   // <home>/bin/java.exe -> <home>
  const env = { ...process.env, JAVA_HOME: javaHome };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qkt-'));
  const src = path.join(dir, 'main.kt'), jar = path.join(dir, 'app.jar');
  fs.writeFileSync(src, code, 'utf8');
  let res;
  try {
    execSync(`"${RUN.kotlinc}" "${src}" -include-runtime -d "${jar}"`, { timeout: 150000, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], env });
    try { res = { ok: true, output: execSync(`"${RUN.java}" -jar "${jar}"`, { timeout: 15000, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }) }; }
    catch (e) { res = { ok: false, output: (e.stdout||'').toString(), error: ((e.stderr||'')+'').trim() || 'runtime error' }; }
  } catch (e) { res = { ok: false, error: 'compile error:\n' + (((e.stderr||'')+'').trim() || e.message) }; }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  return res;
}

const RUNNABLE = new Set(['python', 'javascript', 'c', 'cpp', 'go', 'java', 'php', 'rust', 'kotlin']);
const ALIAS = { py: 'python', js: 'javascript', node: 'javascript', ts: 'typescript',
  'c++': 'cpp', cxx: 'cpp', cc: 'cpp', golang: 'go', yml: 'yaml', sh: 'shell', bash: 'shell', md: 'markdown' };
const KNOWN = ['python', 'javascript', 'typescript', 'html', 'css', 'json', 'yaml',
  'c', 'cpp', 'go', 'java', 'kotlin', 'rust', 'ruby', 'php', 'sql', 'shell', 'markdown'];

function detectLang(lang, code) {
  const l = (lang || '').toLowerCase();
  const canon = ALIAS[l] || l;
  if (KNOWN.includes(canon)) return canon;
  if (/(^|\n)\s*(def |import |print\(|class \w+:|elif )/.test(code)) return 'python';
  return 'javascript';
}

// Single dispatch used by both /run and /chat
function runByLang(lang, code) {
  switch (lang) {
    case 'python':     return runPy(code);
    case 'javascript': return runJS(code);
    case 'c':          return runC(code);
    case 'cpp':        return runCpp(code);
    case 'go':         return runGo(code);
    case 'java':       return runJava(code);
    case 'php':        return runPhp(code);
    case 'rust':       return runRust(code);
    case 'kotlin':     return runKotlin(code);
    default:           return { ok: false, error: `no runtime for "${lang}" — edit & highlight only` };
  }
}

// ── Model client + orchestration ──
const SYS = 'You are a precise coding assistant. Be brief: minimal prose, lead with the code in a fenced block, and keep any explanation to 1-2 short sentences. Do not repeat the question or add filler.';
function buildPrompt(hist) {
  let p = `<|im_start|>system\n${SYS}<|im_end|>\n`;
  for (const t of hist) p += `<|im_start|>${t.role}\n${t.content}<|im_end|>\n`;
  return p + `<|im_start|>assistant\n`;
}
function extractCode(text) {
  const m = text.match(/```(\w*)\s*\n([\s\S]*?)```/);
  return m ? { lang: m[1], code: m[2].trim() } : null;
}
// Fill-in-the-middle completion (for gray ghost-text). Qwen2.5-Coder FIM tokens.
function askFIM(port, prefix, suffix, reg) {
  return new Promise((resolve, reject) => {
    const prompt = `<|fim_prefix|>${prefix}<|fim_suffix|>${suffix}<|fim_middle|>`;
    const body = JSON.stringify({ prompt, n_predict: 12, temperature: 0.1, top_p: 0.9,
      stop: ['<|fim_pad|>', '<|endoftext|>', '<|fim_prefix|>', '<|file_sep|>', '<|im_end|>', '\n\n', '```'], cache_prompt: true });
    const r = http.request({ hostname: '127.0.0.1', port, path: '/completion', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 30000 },
      s => { let d = ''; s.on('data', c => d += c); s.on('end', () => { try { resolve(JSON.parse(d).content || ''); } catch (e) { reject(e); } }); });
    r.on('error', reject); r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    if (reg) reg(r);
    r.write(body); r.end();
  });
}

// Streaming model call; forwards each token via onToken. reg() exposes the
// request so the caller can destroy() it on cancel.
function askModelStream(port, prompt, onToken, reg) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ prompt, n_predict: 512, temperature: 0.3, top_p: 0.9,
      repeat_penalty: 1.2, stop: ['<|im_end|>', '<|endoftext|>'], stream: true, cache_prompt: true });
    const r = http.request({ hostname: '127.0.0.1', port, path: '/completion', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 600000 },
      s => {
        let acc = '', buf = '';
        s.on('data', chunk => {
          buf += chunk.toString(); const lines = buf.split('\n'); buf = lines.pop();
          for (const line of lines) {
            const m = line.match(/^data:\s*(.*)$/); if (!m) continue;
            try { const j = JSON.parse(m[1]); if (j.content) { acc += j.content; onToken(j.content); } } catch {}
          }
        });
        s.on('end', () => resolve(acc));
      });
    r.on('error', reject); r.on('timeout', () => { r.destroy(); reject(new Error('model timeout')); });
    if (reg) reg(r);
    r.write(body); r.end();
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // List configured models (UI builds the dropdown from this)
  if (req.method === 'GET' && req.url === '/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(CONFIG.models.map(m => ({ name: m.name, port: m.port, default: !!m.default }))));
  }

  // Chat: stream tokens + auto run/fix loop (SSE)
  if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    let cancelled = false, curReq = null;
    res.on('close', () => { if (!res.writableFinished) { cancelled = true; if (curReq) { try { curReq.destroy(); } catch (_) {} } } });
    req.on('data', c => body += c);
    req.on('end', async () => {
      let history, port;
      try { ({ history, port } = JSON.parse(body)); } catch (e) { res.writeHead(400); return res.end('bad json'); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      const ev = o => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(o)}\n\n`); };
      const work = (history || []).slice();
      let reply = '', run = null, attempts = 0;
      try {
        for (let i = 1; i <= 3; i++) {
          if (cancelled) break;
          attempts = i;
          if (i > 1) ev({ t: 'retry', n: i });
          reply = await askModelStream(port || CONFIG.models[0].port, buildPrompt(work), tok => ev({ t: 'tok', c: tok }), r => { curReq = r; });
          if (cancelled) break;
          const cb = extractCode(reply);
          if (!cb) { run = null; break; }
          const lang = detectLang(cb.lang, cb.code);
          if (!RUNNABLE.has(lang)) { run = null; break; } // html/css/etc -> show, don't auto-run/fix
          run = runByLang(lang, cb.code);
          run.language = lang;
          ev({ t: 'run', run });
          if (run.ok) break;
          work.push({ role: 'assistant', content: reply });
          work.push({ role: 'user', content: `The code failed when run:\n${(run.error || '').slice(0, 400)}\nFix it. Output only the corrected code block.` });
        }
        if (!cancelled) ev({ t: 'done', reply, run, attempts });
      } catch (e) { if (!cancelled) ev({ t: 'err', m: e.message }); }
      if (!res.writableEnded) res.end();
    });
    return;
  }

  // Inline ghost-text completion (FIM) — uses the fast "ghost" model
  if (req.method === 'POST' && req.url === '/complete') {
    let body = '';
    let cancelled = false, curReq = null;
    res.on('close', () => { if (!res.writableFinished) { cancelled = true; if (curReq) { try { curReq.destroy(); } catch (_) {} } } });
    req.on('data', c => body += c);
    req.on('end', async () => {
      let prefix = '', suffix = '', port = CONFIG.ghostPort || (CONFIG.models[0] && CONFIG.models[0].port);
      try { const j = JSON.parse(body); prefix = j.prefix || ''; suffix = j.suffix || ''; if (j.port) port = j.port; } catch {}
      let text = '';
      try { text = await askFIM(port, prefix.slice(-800), (suffix || '').slice(0, 300), r => { curReq = r; }); } catch (e) { text = ''; }
      // trim ghost text: drop markdown/prose, keep one block, remove suffix overlap
      text = (text || '').replace(/```[\s\S]*$/, '').split('\n\n')[0];
      const sufLine = (suffix || '').split('\n')[0].trim();
      if (sufLine && sufLine.length > 1 && text.includes(sufLine)) text = text.slice(0, text.indexOf(sufLine));
      text = text.replace(/\s+$/, '').slice(0, 200);
      if (cancelled || res.writableEnded) return;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text }));
    });
    return;
  }

  // Python autocomplete via Jedi (static analysis, no model)
  if (req.method === 'POST' && req.url === '/pycomplete') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let out = [];
      try { const { code, line, column } = JSON.parse(body); out = await jediComplete({ code, line, column }); } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
    return;
  }

  // Run one code block manually
  if (req.method === 'POST' && req.url === '/run') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let r;
      try {
        const { language, code } = JSON.parse(body);
        const lang = detectLang(language, code || '');
        r = runByLang(lang, code);
        r.language = lang;
      } catch (e) { r = { ok: false, error: 'bad request: ' + e.message }; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(r));
    });
    return;
  }

  // Static files from public/ (e.g. /vendor/codemirror/*) — path-traversal safe
  const urlPath = (req.url || '/').split('?')[0];
  if (req.method === 'GET' && urlPath !== '/') {
    const pubDir = path.join(__dirname, 'public');
    const filePath = path.join(pubDir, path.normalize(urlPath).replace(/^([\\/]|\.\.[\\/])+/, ''));
    if (filePath.startsWith(pubDir) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const types = { '.css':'text/css', '.js':'application/javascript', '.json':'application/json',
                      '.html':'text/html', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon',
                      '.ttf':'font/ttf', '.woff':'font/woff', '.woff2':'font/woff2', '.map':'application/json' };
      const ct = types[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': ct + '; charset=utf-8' });
      return fs.createReadStream(filePath).pipe(res);
    }
  }

  // Fallback: serve the chat UI
  fs.readFile(HTML, (e, data) => {
    if (e) { res.writeHead(404); return res.end('public/index.html not found'); }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Quantum  ->  http://${HOST}:${PORT}\n  (serves chat, executes code, verifies by running)\n`);
});
