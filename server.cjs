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
const https = require('https');
const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execSync, spawn } = require('child_process');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const HOST = (CONFIG.server && CONFIG.server.host) || '127.0.0.1';
const PORT = (CONFIG.server && CONFIG.server.port) || 8090;
const HTML = path.join(__dirname, 'public', 'index.html');
const TMP_PY = path.join(os.tmpdir(), '_quantum_run.py');
// Shared execution timeout for full-access runtimes (ms). Generous so that
// browser automation / network calls (e.g. Playwright) have time to finish.
const EXEC_TIMEOUT = (CONFIG.execTimeout) || 120000;
// The JS runtime that launched this server (bun.exe here, node elsewhere).
// We reuse it to execute generated JS so there is no hard dependency on `node`.
const JS_RUNTIME = process.execPath;

// ════════════════════════════════════════════════════════════════════════
// Debug bus — a single event log wired through ALL of Quantum's logic.
// Every meaningful step (model call, execution, retry, cloud request, error)
// emits a structured event. Events live in a ring buffer, stream live to any
// /debug viewer, and append to a log file. Toggle with config.debug = false.
// ════════════════════════════════════════════════════════════════════════
const DEBUG_ON  = CONFIG.debug !== false;
const LOG_FILE  = path.join(os.tmpdir(), 'quantum-debug.log');
const LOG_RING  = [];                 // recent events, in memory
const LOG_MAX   = 800;
const debugSubs = new Set();          // live SSE writers
let _evSeq = 0;
function dlog(cat, level, msg, data) {
  const e = { seq: ++_evSeq, t: Date.now(), cat, level, msg, data: data === undefined ? null : data };
  LOG_RING.push(e); if (LOG_RING.length > LOG_MAX) LOG_RING.shift();
  const line = 'data: ' + JSON.stringify(e) + '\n\n';
  for (const w of debugSubs) { try { w(line); } catch (_) {} }
  try { fs.appendFileSync(LOG_FILE, JSON.stringify(e) + '\n'); } catch (_) {}
  if (DEBUG_ON && level === 'error') console.error(`[quantum:${cat}] ${msg}`, data && data.error ? data.error : '');
  return e;
}

// ════════════════════════════════════════════════════════════════════════
// Code intelligence — static quality analysis (heuristics, zero dependencies).
// Quantum already proves code RUNS; this judges how WELL it is written and
// surfaces actionable notes + a 0–100 score alongside the execution verdict.
// ════════════════════════════════════════════════════════════════════════
function analyzeCode(lang, code) {
  const notes = [], add = (sev, msg) => notes.push({ sev, msg });
  const src = code || '', lines = src.split('\n'), L = lines.length;
  if (lang === 'python' && /\binput\s*\(/.test(src)) add('error', 'memakai input() — sandbox tanpa stdin, akan gagal (EOFError)');
  if (/\b(eval|exec)\s*\(/.test(src)) add('warn', 'memakai eval/exec — hindari demi keamanan & kejelasan');
  if (/\b(TODO|FIXME|XXX)\b/.test(src)) add('warn', 'ada TODO/FIXME — kode tampak belum selesai');
  if (lang === 'python') {
    if (/except\s*:/.test(src)) add('warn', 'bare "except:" — tangkap exception yang spesifik');
    if (/except[^\n:]*:\s*\n\s*pass\b/.test(src)) add('warn', '"except ...: pass" — menelan error diam-diam');
    if (L > 15 && !/\b(def|class)\s+\w+/.test(src)) add('info', 'kode panjang tanpa fungsi — pertimbangkan pecah jadi fungsi');
    if (/\bdef\s+\w+/.test(src) && !/"""|'''/.test(src)) add('info', 'fungsi tanpa docstring');
  } else if (lang === 'javascript') {
    if (/\bvar\s+\w/.test(src)) add('info', 'gunakan let/const, bukan var');
    if (/[^=!<>]==[^=]/.test(src)) add('info', 'gunakan === / !== (perbandingan ketat)');
  }
  const hasTest = /\bassert\b|console\.assert|expect\s*\(/.test(src);
  let score = 100;
  for (const n of notes) score -= n.sev === 'error' ? 25 : n.sev === 'warn' ? 10 : 4;
  if (!hasTest && L > 8) { score -= 6; add('info', 'tanpa assertion/self-test — sulit dibuktikan benar'); }
  return { score: Math.max(0, Math.min(100, score)), hasTest, lines: L, notes };
}

// Models sometimes mislabel a fenced block (e.g. tag JS as "python"). When the
// body unambiguously contradicts the tag, correct the runtime so it still runs.
// Conservative: only override when one language's signals are present and the
// other's are absent.
function reconcileLang(lang, code) {
  const src = code || '';
  const js = /(^|\n)\s*(\/\/|const\s|let\s|var\s|function\s|=>|console\.|document\.|require\(|export\s|import\s.+\sfrom\s)/.test(src);
  const py = /(^|\n)\s*(def\s|class\s+\w+\s*[:(]|print\(|elif\s|#|from\s+\w+\s+import|import\s+\w+\s*$)/m.test(src);
  if (lang === 'python' && js && !py) return 'javascript';
  if (lang === 'javascript' && py && !js) return 'python';
  return lang;
}

// Error text helpers. Tracebacks put the ACTUAL error on the LAST line, so naive
// head-truncation hides it. These keep the meaningful tail (and a bit of head).
function errTail(e) {
  const s = (e || '').trim(); if (!s) return '';
  const lines = s.split('\n').filter(Boolean);
  return lines.slice(-2).join(' | ').slice(-240);
}
function errForModel(e) {
  const s = (e || '').trim(); if (!s) return '';
  return s.length <= 700 ? s : (s.slice(0, 160) + '\n…\n' + s.slice(-520));
}

// ── Execution sandbox (Docker) — gate #1 for serving untrusted/other-user code ──
const SANDBOX_IMAGE = 'quantum-sandbox';
function hasDocker() { try { execSync('docker version', { stdio: 'ignore', timeout: 8000 }); return true; } catch (e) { return false; } }
const USE_SANDBOX = CONFIG.sandbox === true && hasDocker();
// Run code in a throwaway, network-less, resource-capped, read-only container.
function runSandboxed(lang, code) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qsbx-'));
  const isJs = lang === 'javascript';
  fs.writeFileSync(path.join(dir, isJs ? 'main.js' : 'main.py'), code, 'utf8');
  const inner = isJs ? 'node /code/main.js' : 'python /code/main.py';
  const hostDir = dir.replace(/\\/g, '/');
  const args = ['run', '--rm', '--network', 'none', '--memory', '256m', '--memory-swap', '256m',
    '--cpus', '0.5', '--pids-limit', '128', '--read-only', '--tmpfs', '/tmp:size=16m',
    '-v', hostDir + ':/code:ro', '-w', '/code', SANDBOX_IMAGE, 'sh', '-c', inner];
  let res;
  try {
    const out = execSync('docker ' + args.map(a => /[\s"]/.test(a) ? JSON.stringify(a) : a).join(' '), { timeout: EXEC_TIMEOUT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    res = { ok: true, output: out };
  } catch (e) {
    res = { ok: false, output: (e.stdout || '').toString(), error: ((e.stderr || '') + '').trim() || e.message };
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  return res;
}

// ── Execute JavaScript with FULL runtime access (require/import anything) ──
// NOTE: no longer sandboxed. Generated code runs as a real subprocess with the
// same privileges as this server, can require any installed module (including
// node_modules in this project), touch the filesystem, network, etc.
// Keep this server bound to 127.0.0.1 and never expose it to a network.
function runJS(code) {
  if (USE_SANDBOX) return runSandboxed('javascript', code);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qjs-'));
  const src = path.join(dir, 'main.cjs');
  fs.writeFileSync(src, code, 'utf8');
  let res;
  try {
    // Run with the same runtime (bun/node), from this project dir so
    // `require('<dep>')` resolves our node_modules.
    const out = execSync(`"${JS_RUNTIME}" "${src}"`, { cwd: __dirname, timeout: EXEC_TIMEOUT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    res = { ok: true, output: out };
  } catch (e) {
    res = { ok: false, output: (e.stdout || '').toString(), error: ((e.stderr || '') + '').trim() || e.message };
  }
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  return res;
}

// ── Execute Python as a script via subprocess (full access, import anything) ──
// Force UTF-8 I/O so generated Python that prints ✓/✗/emoji doesn't crash with
// UnicodeEncodeError under Windows' legacy cp1252 stdout codec.
const PY_ENV = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
function runPy(code) {
  if (USE_SANDBOX) return runSandboxed('python', code);
  fs.writeFileSync(TMP_PY, code, 'utf8');
  try {
    const out = execSync(`python "${TMP_PY}"`, { timeout: EXEC_TIMEOUT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: PY_ENV });
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

// Single dispatch used by both /run and /chat — every execution is logged.
function runByLang(lang, code) {
  const t0 = Date.now();
  let r;
  switch (lang) {
    case 'python':     r = runPy(code); break;
    case 'javascript': r = runJS(code); break;
    case 'c':          r = runC(code); break;
    case 'cpp':        r = runCpp(code); break;
    case 'go':         r = runGo(code); break;
    case 'java':       r = runJava(code); break;
    case 'php':        r = runPhp(code); break;
    case 'rust':       r = runRust(code); break;
    case 'kotlin':     r = runKotlin(code); break;
    default:           r = { ok: false, error: `no runtime for "${lang}" — edit & highlight only` };
  }
  dlog('exec', r.ok ? 'info' : 'warn', `run ${lang}`, {
    ok: !!r.ok, ms: Date.now() - t0, bytes: (code || '').length,
    sandbox: USE_SANDBOX, error: r.ok ? undefined : errTail(r.error),
  });
  return r;
}

// ── Model client + orchestration ──
const SYS = [
  'You are Quantum, a friendly assistant. Chat naturally and answer in plain text.',
  'Do NOT write code unless the user explicitly asks for code or gives a programming task. A greeting like "hi" gets a short friendly reply — never code.',
  'If you do write code, use one fenced block tagged with the language; it runs in a sandbox with no stdin, so avoid input().',
].join(' ');
// Quality-focused system prompt, used when the request is a programming task.
const CODE_SYS = [
  'You are Quantum, an expert programming assistant whose code is JUDGED BY EXECUTION.',
  'Write CLEAN, CORRECT code: descriptive names, handle edge cases and errors, prefer the standard library.',
  'Output EXACTLY ONE fenced code block tagged with its language — no alternative versions.',
  'The sandbox has NO stdin: never use input()/prompt()/sys.stdin (they crash with EOF); use hardcoded values.',
  'INCLUDE a short self-test using assertions that prints a clear success line, so the CPU can prove it works.',
  'Keep prose outside the code block to one or two sentences.',
].join(' ');
const CODE_HINT = /\b(code|coding|program|script|function|fungsi|kelas|class|algorithm|algoritma|buat(?:kan)?|tulis(?:kan)?|implement|debug|fix|refactor|optimi[sz]e|sort|parse|regex|api|loop|array|string|hitung|kalkulator)\b/i;
function isCodingTask(work) {
  for (let i = work.length - 1; i >= 0; i--) if (work[i].role === 'user') return CODE_HINT.test(work[i].content || '');
  return false;
}
function pickSystem(work) { return isCodingTask(work) ? CODE_SYS : SYS; }
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

// Streaming local-model call via llama-server's OpenAI-compatible chat endpoint.
// Using /v1/chat/completions lets llama.cpp apply EACH model's own chat template
// (from the GGUF), so Qwen/Llama/Phi/Gemma all honor the system prompt correctly.
// `messages` is [{role, content}, ...]. reg() exposes the request for cancel.
function askModelStream(port, messages, onToken, reg) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    dlog('model', 'info', 'local model start', { port, messages: messages.length });
    const body = JSON.stringify({ messages, stream: true, temperature: 0.3, top_p: 0.9, max_tokens: 1024, cache_prompt: true });
    const r = http.request({ hostname: '127.0.0.1', port, path: '/v1/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 600000 },
      s => {
        let acc = '', buf = '';
        s.on('data', chunk => {
          buf += chunk.toString(); const lines = buf.split('\n'); buf = lines.pop();
          for (const line of lines) {
            const m = line.match(/^data:\s*(.*)$/); if (!m) continue;
            if (m[1] === '[DONE]') continue;
            try { const j = JSON.parse(m[1]); const t = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content; if (t) { acc += t; onToken(t); } } catch {}
          }
        });
        s.on('end', () => { dlog('model', 'info', 'local model end', { port, ms: Date.now() - t0, chars: acc.length }); resolve(acc); });
      });
    r.on('error', e => { dlog('model', 'error', 'local model error', { port, error: e.message }); reject(e); });
    r.on('timeout', () => { dlog('model', 'error', 'local model timeout', { port }); r.destroy(); reject(new Error('model timeout')); });
    if (reg) reg(r);
    r.write(body); r.end();
  });
}

// ── Cloud models (bring-your-own API key) ──
// The provider is auto-detected from the key's prefix; the user pastes any key.
const CLOUD = {
  anthropic:  { host: 'api.anthropic.com',                 path: '/v1/messages',                model: 'claude-opus-4-8' },
  openai:     { host: 'api.openai.com',                    path: '/v1/chat/completions',        model: 'gpt-4o' },
  openrouter: { host: 'openrouter.ai',                     path: '/api/v1/chat/completions',    model: 'anthropic/claude-opus-4-8' },
  groq:       { host: 'api.groq.com',                      path: '/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
  qwen:       { host: 'dashscope-intl.aliyuncs.com',       path: '/compatible-mode/v1/chat/completions', model: 'qwen-plus' },
  deepseek:   { host: 'api.deepseek.com',                  path: '/chat/completions',           model: 'deepseek-chat' },
  github:     { host: 'models.inference.ai.azure.com',     path: '/chat/completions',           model: 'gpt-4o' },
  gemini:     { host: 'generativelanguage.googleapis.com', path: null,                          model: 'gemini-2.0-flash' },
};
// Short, friendly model names → full provider model IDs. Type "llama", get the real ID.
const MODEL_ALIASES = {
  anthropic:  { claude:'claude-opus-4-8', opus:'claude-opus-4-8', sonnet:'claude-sonnet-4-6', haiku:'claude-haiku-4-5' },
  openai:     { gpt:'gpt-4o', '4o':'gpt-4o', mini:'gpt-4o-mini' },
  groq:       { llama:'llama-3.3-70b-versatile', 'llama-fast':'llama-3.1-8b-instant', 'llama-8b':'llama-3.1-8b-instant', gemma:'gemma2-9b-it' },
  qwen:       { qwen:'qwen-plus', plus:'qwen-plus', max:'qwen-max', turbo:'qwen-turbo', coder:'qwen2.5-coder-32b-instruct' },
  deepseek:   { chat:'deepseek-chat', deepseek:'deepseek-chat', coder:'deepseek-chat', reasoner:'deepseek-reasoner', r1:'deepseek-reasoner' },
  github:     { '4o':'gpt-4o', 'gpt-4o':'gpt-4o', deepseek:'DeepSeek-V3-0324', 'deepseek-r1':'DeepSeek-R1', r1:'DeepSeek-R1', llama:'Llama-3.3-70B-Instruct' },
  gemini:     { gemini:'gemini-2.0-flash', flash:'gemini-2.0-flash', pro:'gemini-1.5-pro' },
  openrouter: {},
};
const PROVIDER_NAMES = { anthropic:'Claude', openai:'OpenAI', openrouter:'OpenRouter', groq:'Groq', qwen:'Qwen', deepseek:'DeepSeek', github:'GitHub Models', gemini:'Gemini' };
// Server-side keys: cloud-keys.json (gitignored) and/or <PROVIDER>_API_KEY env vars.
// Never sent to the browser — the UI only learns which providers are configured.
let CLOUD_KEYS = {};
function loadCloudKeys() {
  CLOUD_KEYS = {};
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'cloud-keys.json'), 'utf8'));
    for (const [p, v] of Object.entries(raw)) CLOUD_KEYS[p] = (typeof v === 'string') ? { key: v } : v;
  } catch {}
  for (const p of Object.keys(PROVIDER_NAMES)) {
    const ev = process.env[p.toUpperCase() + '_API_KEY'];
    if (ev) CLOUD_KEYS[p] = { ...(CLOUD_KEYS[p] || {}), key: ev };
  }
}
loadCloudKeys();
function detectProvider(key) {
  key = (key || '').trim();
  if (key.startsWith('github_pat_') || key.startsWith('ghp_')) return 'github';
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-or-'))  return 'openrouter';
  if (key.startsWith('gsk_'))    return 'groq';
  if (key.startsWith('AIza'))    return 'gemini';
  if (key.startsWith('sk-'))     return 'openai';   // covers sk-proj-… too
  return 'openai';                                   // sensible default for unknown keys
}
// ── Real provider detection: probe the key against each candidate's /models ──
// Prefix narrows the candidates; an actual authenticated request confirms the owner.
const PROBE = {
  openai:     { host:'api.openai.com',                    path:'/v1/models',                    auth:'bearer' },
  deepseek:   { host:'api.deepseek.com',                  path:'/models',                       auth:'bearer' },
  qwen:       { host:'dashscope-intl.aliyuncs.com',       path:'/compatible-mode/v1/models',    auth:'bearer' },
  groq:       { host:'api.groq.com',                      path:'/openai/v1/models',             auth:'bearer' },
  openrouter: { host:'openrouter.ai',                     path:'/api/v1/key',                   auth:'bearer' },
  anthropic:  { host:'api.anthropic.com',                 path:'/v1/models',                    auth:'anthropic' },
  github:     { host:'models.inference.ai.azure.com',     path:'/models',                       auth:'bearer' },
  gemini:     { host:'generativelanguage.googleapis.com', path:'/v1beta/models?key=KEY',        auth:'query' },
};
function candidatesFor(key) {
  key = (key || '').trim();
  if (key.startsWith('github_pat_') || key.startsWith('ghp_')) return ['github'];
  if (key.startsWith('sk-ant-')) return ['anthropic'];
  if (key.startsWith('sk-or-'))  return ['openrouter'];
  if (key.startsWith('gsk_'))    return ['groq'];
  if (key.startsWith('AIza'))    return ['gemini'];
  if (key.startsWith('sk-'))     return ['openai', 'deepseek', 'qwen'];   // ambiguous → probe to disambiguate
  return ['openai', 'deepseek', 'qwen', 'groq', 'openrouter', 'anthropic', 'github', 'gemini'];
}
function httpsStatus(opts) {
  return new Promise(resolve => {
    const r = https.request({ ...opts, method: 'GET', timeout: 8000 }, s => { s.resume(); resolve(s.statusCode || 0); });
    r.on('error', () => resolve(0)); r.on('timeout', () => { r.destroy(); resolve(0); });
    r.end();
  });
}
async function probeProvider(provider, key) {
  const t = PROBE[provider]; if (!t) return 0;
  let path = t.path; const headers = {};
  if (t.auth === 'bearer') headers['authorization'] = 'Bearer ' + key;
  else if (t.auth === 'anthropic') { headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01'; }
  else if (t.auth === 'query') path = path.replace('KEY', encodeURIComponent(key));
  return httpsStatus({ hostname: t.host, path, headers });
}
async function detectKey(key) {
  const cands = candidatesFor(key);
  for (const p of cands) {
    const st = await probeProvider(p, key);
    if (st >= 200 && st < 300) return { provider: p, name: PROVIDER_NAMES[p] || p, verified: true };
  }
  return { provider: cands[0], name: PROVIDER_NAMES[cands[0]] || cands[0], verified: false };
}

// Streams a cloud model's reply, forwarding tokens via onToken. Same contract as askModelStream.
function askCloudStream(cloud, work, onToken, reg) {
  return new Promise((resolve, reject) => {
    const provider = cloud.provider || detectProvider(cloud.key);
    const cfg = CLOUD[provider] || CLOUD.openai;
    // Guard: never let an API key leak into the model field; resolve short aliases.
    let model = (cloud.model || '').trim();
    if (!model || /^(sk-|gsk_|AIza)/.test(model)) model = cfg.model;   // empty or a key → default
    const aliases = MODEL_ALIASES[provider];
    if (aliases && aliases[model.toLowerCase()]) model = aliases[model.toLowerCase()];
    const sys = cloud.system || SYS;              // agent mode passes its own system prompt
    let host = cfg.host, path = cfg.path, headers = { 'content-type': 'application/json' }, body, extract;
    const openaiCompatible = () => {
      headers['authorization'] = 'Bearer ' + cloud.key;
      body = JSON.stringify({ model, stream: true, messages: [{ role: 'system', content: sys }, ...work] });
      extract = j => { try { return j.choices[0].delta.content || ''; } catch { return ''; } };
    };

    if (cloud.baseUrl) {                          // custom OpenAI-compatible endpoint (any sk- provider)
      try { const u = new URL(cloud.baseUrl.replace(/\/+$/, '') + '/chat/completions'); host = u.hostname; path = u.pathname + (u.search || ''); } catch {}
      openaiCompatible();
    } else if (provider === 'anthropic') {
      headers['x-api-key'] = cloud.key;
      headers['anthropic-version'] = '2023-06-01';
      body = JSON.stringify({ model, max_tokens: 4096, system: sys, stream: true, thinking: { type: 'adaptive' },
        messages: work.map(m => ({ role: m.role, content: m.content })) });
      extract = j => (j.type === 'content_block_delta' && j.delta && j.delta.type === 'text_delta') ? j.delta.text : '';
    } else if (provider === 'gemini') {
      path = `/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cloud.key)}`;
      body = JSON.stringify({ systemInstruction: { parts: [{ text: sys }] },
        contents: work.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })) });
      extract = j => { try { return j.candidates[0].content.parts.map(p => p.text || '').join(''); } catch { return ''; } };
    } else { // openai-compatible: openai / openrouter / groq / qwen
      openaiCompatible();
    }
    headers['content-length'] = Buffer.byteLength(body);
    const t0 = Date.now();
    dlog('cloud', 'info', 'cloud model start', { provider, model, host });

    const r = https.request({ hostname: host, path, method: 'POST', headers, timeout: 600000 }, s => {
      let acc = '', buf = '', errBody = '';
      if (s.statusCode >= 400) { s.on('data', c => errBody += c); s.on('end', () => { dlog('cloud', 'error', 'cloud model http error', { provider, model, status: s.statusCode, body: errBody.slice(0, 200) }); reject(new Error(`${provider} ${s.statusCode}: ${errBody.slice(0, 300)}`)); }); return; }
      s.on('data', chunk => {
        buf += chunk.toString(); const lines = buf.split('\n'); buf = lines.pop();
        for (const line of lines) {
          const m = line.match(/^data:\s*(.*)$/); if (!m) continue;
          if (m[1] === '[DONE]') continue;
          try { const j = JSON.parse(m[1]); const t = extract(j); if (t) { acc += t; onToken(t); } } catch {}
        }
      });
      s.on('end', () => { dlog('cloud', 'info', 'cloud model end', { provider, model, ms: Date.now() - t0, chars: acc.length }); resolve(acc); });
    });
    r.on('error', e => { dlog('cloud', 'error', 'cloud model error', { provider, error: e.message }); reject(e); });
    r.on('timeout', () => { dlog('cloud', 'error', 'cloud model timeout', { provider }); r.destroy(); reject(new Error('cloud timeout')); });
    if (reg) reg(r);
    r.write(body); r.end();
  });
}

// Kill whatever process is LISTENING on a TCP port (to stop a model's llama-server).
function killPort(port) {
  try {
    const out = execSync('netstat -ano', { encoding: 'utf8' });
    const pids = new Set(out.split('\n').filter(l => l.includes(':' + port) && /LISTENING/i.test(l)).map(l => l.trim().split(/\s+/).pop()).filter(p => p && p !== '0'));
    for (const pid of pids) { try { execSync('taskkill /F /PID ' + pid, { stdio: 'ignore' }); } catch (e) {} }
  } catch (e) {}
}

// ── Agent mode: multi-step tool loop in a real workspace, model-agnostic ──
const WORKSPACE = path.join(__dirname, 'workspace');
try { fs.mkdirSync(WORKSPACE, { recursive: true }); } catch {}

const AGENT_SYS = [
  'You are an autonomous coding agent working inside a project workspace.',
  'Work in small steps. Each reply MUST contain EXACTLY ONE action as a single fenced code block.',
  'The text after the opening ``` (the info string) selects the action:',
  '  WRITE <path>  — create/overwrite a file; the block body is the full file content.',
  '  RUN <lang>    — execute code now (lang = python or javascript); the body is the code. Files you WROTE are importable (same working dir).',
  '  DONE          — finish; the body is a short summary for the user.',
  'Prove correctness: write a test with asserts and RUN it. Only emit DONE after a test actually passes.',
  'The sandbox is NON-INTERACTIVE with NO stdin: never use input()/prompt()/sys.stdin (they crash with EOF). Drive code with hardcoded values and asserts instead.',
  'After each action you will see its result, then take the next step. Keep prose outside the block minimal.',
].join('\n');

function buildPromptWith(sys, hist) {
  let p = `<|im_start|>system\n${sys}<|im_end|>\n`;
  for (const t of hist) p += `<|im_start|>${t.role}\n${t.content}<|im_end|>\n`;
  return p + `<|im_start|>assistant\n`;
}

// Parse the first fenced block as an agent action. Tolerant: the verb may be in
// the fence info string OR on the first body line (weak models do the latter).
const VERBS = ['WRITE', 'RUN', 'DONE'];
function parseAction(text) {
  const m = text.match(/```([^\n]*)\n([\s\S]*?)```/);
  if (!m) return null;
  const info = m[1].trim(); let body = m[2].replace(/\n$/, '');
  let sp = info.split(/\s+/), verb = (sp[0] || '').toUpperCase();
  if (!VERBS.includes(verb)) {
    const nl = body.indexOf('\n');
    const firstLine = (nl >= 0 ? body.slice(0, nl) : body).trim();
    const fsp = firstLine.split(/\s+/), fverb = (fsp[0] || '').toUpperCase();
    if (VERBS.includes(fverb)) {
      verb = fverb; sp = fsp; body = (nl >= 0 ? body.slice(nl + 1) : '').replace(/^\n/, '');
      // RUN with no lang on its line but a language fence (```python) → use the fence lang
      if (fverb === 'RUN' && !fsp[1] && /^(python|py|javascript|js|node)$/i.test(info)) sp = ['RUN', info];
    }
  }
  if (verb === 'WRITE') return { kind: 'write', arg: sp.slice(1).join(' ') || 'untitled.txt', body };
  if (verb === 'RUN')   return { kind: 'run',   arg: (sp[1] || 'python').toLowerCase(), body };
  if (verb === 'DONE')  return { kind: 'done',  body };
  return null;
}

// Run code in the workspace dir so files the agent WROTE are importable.
function runInWorkspace(lang, code) {
  const l = (lang || '').toLowerCase();
  try {
    if (l === 'javascript' || l === 'js' || l === 'node') {
      fs.writeFileSync(path.join(WORKSPACE, '_run.cjs'), code, 'utf8');
      return { ok: true, output: execSync(`"${JS_RUNTIME}" "_run.cjs"`, { cwd: WORKSPACE, timeout: EXEC_TIMEOUT, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], env: process.env }) };
    }
    if (l === 'python' || l === 'py') {
      fs.writeFileSync(path.join(WORKSPACE, '_run.py'), code, 'utf8');
      return { ok: true, output: execSync(`python "_run.py"`, { cwd: WORKSPACE, timeout: EXEC_TIMEOUT, encoding: 'utf8', stdio: ['pipe','pipe','pipe'], env: PY_ENV }) };
    }
    return { ok: false, error: `RUN supports python or javascript (got "${lang}")` };
  } catch (e) {
    return { ok: false, output: (e.stdout || '').toString(), error: ((e.stderr || '') + '').trim() || e.message };
  }
}

// ── HuggingFace model browser / downloader ──
function hfGetJson(p) {
  return new Promise((resolve, reject) => {
    const r = https.request({ hostname: 'huggingface.co', path: p, headers: { 'User-Agent': 'Quantum' } }, s => {
      let d = ''; s.on('data', c => d += c); s.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    r.on('error', reject); r.end();
  });
}
const AVATAR_CACHE = new Map();   // author -> avatarUrl|null
async function hfAvatar(name) {
  if (AVATAR_CACHE.has(name)) return AVATAR_CACHE.get(name);
  let url = null;
  for (const ep of ['/api/organizations/' + name + '/avatar', '/api/users/' + name + '/avatar']) {
    try { const j = await hfGetJson(ep); if (j && j.avatarUrl) { url = j.avatarUrl; break; } } catch (e) {}
  }
  AVATAR_CACHE.set(name, url); return url;
}
function hfDownload(urlStr, dest, onProgress, reg) {
  return new Promise((resolve, reject) => {
    const get = (u) => {
      let o; try { o = new URL(u); } catch (e) { return reject(e); }
      const rq = https.get({ hostname: o.hostname, path: o.pathname + o.search, headers: { 'User-Agent': 'Quantum' } }, s => {
        if (s.statusCode >= 300 && s.statusCode < 400 && s.headers.location) {
          s.resume(); const loc = s.headers.location;
          return get(loc.startsWith('http') ? loc : ('https://' + o.hostname + loc));
        }
        if (s.statusCode !== 200) { s.resume(); return reject(new Error('HTTP ' + s.statusCode)); }
        const total = parseInt(s.headers['content-length'] || '0', 10); let got = 0;
        const f = fs.createWriteStream(dest);
        s.on('data', c => { got += c.length; onProgress(got, total); });
        s.on('error', reject); f.on('error', reject); f.on('finish', () => f.close(() => resolve()));
        s.pipe(f);
      });
      rq.on('error', reject);
      if (reg) reg(rq);
    };
    get(urlStr);
  });
}

// Minimal live debug viewer (no deps) — open http://127.0.0.1:PORT/debug
const DEBUG_VIEWER = `<!doctype html><html><head><meta charset="utf-8"><title>Quantum · Debug</title>
<style>
 body{margin:0;background:#0b0d11;color:#cbd5e1;font:13px/1.5 ui-monospace,Consolas,monospace}
 header{position:sticky;top:0;background:#11151c;padding:10px 14px;border-bottom:1px solid #1f2733;display:flex;gap:10px;align-items:center}
 header b{color:#5eead4} input{background:#0b0d11;border:1px solid #2a3441;color:#cbd5e1;padding:4px 8px;border-radius:6px}
 button{background:#1f2733;border:1px solid #2a3441;color:#cbd5e1;padding:4px 10px;border-radius:6px;cursor:pointer}
 .row{padding:3px 14px;border-bottom:1px solid #131922;white-space:pre-wrap;word-break:break-word}
 .t{color:#64748b} .cat{display:inline-block;min-width:54px;color:#93c5fd}
 .info{} .warn{color:#fbbf24} .error{color:#f87171}
 .d{color:#7c8aa0}
</style></head><body>
<header><b>⚛ Quantum Debug</b><span id="n">0</span> event<input id="f" placeholder="filter (cat/msg)…"><button onclick="document.getElementById('log').innerHTML='';">clear</button></header>
<div id="log"></div>
<script>
 var log=document.getElementById('log'),f=document.getElementById('f'),n=document.getElementById('n'),c=0;
 function fmt(t){return new Date(t).toLocaleTimeString();}
 function add(e){
   if(f.value && !((e.cat+' '+e.msg).toLowerCase().includes(f.value.toLowerCase()))) return;
   var d=e.data?(' '+JSON.stringify(e.data)):'';
   var div=document.createElement('div');div.className='row '+e.level;
   div.innerHTML='<span class="t">'+fmt(e.t)+'</span> <span class="cat">'+e.cat+'</span> '+e.msg+'<span class="d">'+d+'</span>';
   log.appendChild(div); c++; n.textContent=c;
   window.scrollTo(0,document.body.scrollHeight);
 }
 var es=new EventSource('/debug/stream');
 es.onmessage=function(m){try{add(JSON.parse(m.data));}catch(_){}};
</script></body></html>`;

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  // ── Request trace + debug endpoints ──
  const _path = (req.url || '/').split('?')[0];
  if (req.method === 'POST' && _path !== '/complete' && _path !== '/pycomplete') dlog('http', 'info', 'POST ' + _path);
  if (req.method === 'GET' && _path === '/debug/log') {
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(LOG_RING));
  }
  if (req.method === 'GET' && _path === '/debug/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const w = s => { if (!res.writableEnded) res.write(s); };
    for (const e of LOG_RING.slice(-120)) w('data: ' + JSON.stringify(e) + '\n\n');
    debugSubs.add(w); req.on('close', () => debugSubs.delete(w));
    return;
  }
  if (req.method === 'GET' && _path === '/debug') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(DEBUG_VIEWER);
  }

  // Detect a key's provider by probing each candidate's /models endpoint
  if (req.method === 'POST' && req.url === '/detect-key') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', async () => {
      let out = { provider: 'openai', name: 'OpenAI', verified: false };
      try { const { key } = JSON.parse(body); if (key) out = await detectKey(key); } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
    return;
  }

  // Which cloud providers have a server-side key (names only — never the key itself)
  if (req.method === 'GET' && req.url === '/cloud-providers') {
    const out = Object.keys(CLOUD_KEYS).filter(p => CLOUD_KEYS[p] && CLOUD_KEYS[p].key)
      .map(p => ({ provider: p, name: PROVIDER_NAMES[p] || p, model: CLOUD_KEYS[p].model || (CLOUD[p] || {}).model || '' }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(out));
  }

  // HuggingFace: search GGUF models
  if (req.method === 'GET' && (req.url || '').startsWith('/hf/search')) {
    const q = new URL('http://x' + req.url).searchParams.get('q') || '';
    try {
      const data = await hfGetJson('/api/models?search=' + encodeURIComponent(q) + '&filter=gguf&limit=24&sort=downloads&direction=-1&full=true');
      const arr = Array.isArray(data) ? data : [];
      const authors = [...new Set(arr.map(m => (m.id || '').split('/')[0]).filter(Boolean))];
      await Promise.all(authors.map(a => hfAvatar(a)));
      const SKIP = new Set(['gguf', 'transformers', 'text-generation', 'conversational', 'safetensors', 'endpoints_compatible', 'autotrain_compatible', 'text-generation-inference']);
      const out = arr.map(m => {
        const author = (m.id || '').split('/')[0];
        const tags = (m.tags || []).filter(t => !t.includes(':') && !SKIP.has(t)).slice(0, 3);
        return { id: m.id, author, downloads: m.downloads || 0, likes: m.likes || 0,
          avatar: AVATAR_CACHE.get(author) || null, pipeline: m.pipeline_tag || '',
          library: m.library_name || '', updated: m.lastModified || m.createdAt || '', gated: !!m.gated, tags };
      });
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out));
    } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }
  // HuggingFace: list .gguf files of a repo (with sizes)
  if (req.method === 'GET' && (req.url || '').startsWith('/hf/files')) {
    const id = new URL('http://x' + req.url).searchParams.get('id') || '';
    try {
      const tree = await hfGetJson('/api/models/' + id + '/tree/main');
      const out = (Array.isArray(tree) ? tree : []).filter(f => f.type !== 'directory' && /\.gguf$/i.test(f.path || '')).map(f => ({ path: f.path, size: f.size || 0 }));
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out));
    } catch (e) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: e.message })); }
    return;
  }
  // HuggingFace: download a GGUF → register in config → launch llama-server (SSE progress)
  if (req.method === 'POST' && req.url === '/hf/download') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', async () => {
      let id, file, name; try { ({ id, file, name } = JSON.parse(body)); } catch (e) { res.writeHead(400); return res.end('bad json'); }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      const ev = o => { if (!res.writableEnded) res.write('data: ' + JSON.stringify(o) + '\n\n'); };
      let cancelled = false, dlReq = null, dest = null;
      res.on('close', () => { if (!res.writableFinished) { cancelled = true; if (dlReq) { try { dlReq.destroy(); } catch (e) {} } } });
      try {
        const modelDir = CONFIG.modelDir || path.dirname(CONFIG_PATH);
        const base = path.basename(file);
        dest = path.join(modelDir, base);
        const srcUrl = 'https://huggingface.co/' + id + '/resolve/main/' + file.split('/').map(encodeURIComponent).join('/');
        let lastPct = -1, lastT = 0;
        await hfDownload(srcUrl, dest, (got, total) => {
          const pct = total ? Math.floor(got / total * 100) : 0; const now = Date.now();
          if (pct !== lastPct && now - lastT > 300) { lastPct = pct; lastT = now; ev({ t: 'progress', pct, got, total }); }
        }, (rq) => { dlReq = rq; });
        const used = new Set((CONFIG.models || []).map(m => m.port));
        let port = 8085; while (used.has(port)) port++;
        const entry = { name: name || base.replace(/\.gguf$/i, ''), file: base, url: srcUrl, port };
        CONFIG.models.push(entry);
        try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2)); } catch (e) {}
        const serverExe = path.join(modelDir, 'llama-server.exe');
        const ctx = (CONFIG.llama && CONFIG.llama.ctxSize) || 2048, threads = (CONFIG.llama && CONFIG.llama.threads) || 2;
        try { spawn(serverExe, ['-m', dest, '--host', '127.0.0.1', '--port', String(port), '--ctx-size', String(ctx), '--threads', String(threads), '--mlock'], { detached: true, stdio: 'ignore' }).unref(); } catch (e) {}
        ev({ t: 'done', model: { name: entry.name, port } });
      } catch (e) { if (cancelled) { try { if (dest) fs.rmSync(dest, { force: true }); } catch (e2) {} } else ev({ t: 'err', m: e.message }); }
      if (!res.writableEnded) res.end();
    });
    return;
  }

  // List configured models (UI builds the dropdown from this) — with on-disk size
  if (req.method === 'GET' && req.url === '/models') {
    const md = CONFIG.modelDir || '';
    const out = (CONFIG.models || []).map(m => {
      let size = 0; try { if (m.file) size = fs.statSync(path.join(md, m.file)).size; } catch (e) {}
      return { name: m.name, port: m.port, default: !!m.default, file: m.file || '', size };
    });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(out));
  }

  // Delete a model: stop its llama-server, remove from config, delete the .gguf file
  if (req.method === 'POST' && req.url === '/model/delete') {
    let body = ''; req.on('data', c => body += c);
    req.on('end', () => {
      let port; try { ({ port } = JSON.parse(body)); } catch (e) { res.writeHead(400); return res.end('bad json'); }
      const idx = (CONFIG.models || []).findIndex(m => String(m.port) === String(port));
      if (idx < 0) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: 'model tidak ditemukan' })); }
      const m = CONFIG.models[idx];
      killPort(m.port);
      CONFIG.models.splice(idx, 1);
      try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(CONFIG, null, 2)); } catch (e) {}
      let deleted = false;
      try { if (m.file) { fs.rmSync(path.join(CONFIG.modelDir || '', m.file), { force: true }); deleted = true; } } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, deleted, name: m.name }));
    });
    return;
  }

  // Chat: stream tokens + auto run/fix loop (SSE)
  if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    let cancelled = false, curReq = null;
    res.on('close', () => { if (!res.writableFinished) { cancelled = true; if (curReq) { try { curReq.destroy(); } catch (_) {} } } });
    req.on('data', c => body += c);
    req.on('end', async () => {
      let history, port, cloud;
      try { ({ history, port, cloud } = JSON.parse(body)); } catch (e) { res.writeHead(400); return res.end('bad json'); }
      // Fill the key from server-side storage when the browser sent only a provider.
      if (cloud) {
        cloud.provider = cloud.provider || (cloud.key ? detectProvider(cloud.key) : null);
        if (!cloud.key && cloud.provider && CLOUD_KEYS[cloud.provider]) {
          cloud.key = CLOUD_KEYS[cloud.provider].key;
          cloud.model = cloud.model || CLOUD_KEYS[cloud.provider].model;
        }
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      const ev = o => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(o)}\n\n`); };
      const work = (history || []).slice();
      const useCloud = !!(cloud && cloud.key);
      const sys = pickSystem(work);                       // code-quality prompt for programming tasks
      let reply = '', run = null, attempts = 0;
      dlog('chat', 'info', 'chat start', { mode: useCloud ? (cloud.provider || 'cloud') : 'local', coding: isCodingTask(work) });
      try {
        for (let i = 1; i <= 3; i++) {
          if (cancelled) break;
          attempts = i;
          if (i > 1) { ev({ t: 'retry', n: i }); dlog('chat', 'info', 'retry', { attempt: i }); }
          reply = await (useCloud
            ? askCloudStream({ ...cloud, system: cloud.system || sys }, work, tok => ev({ t: 'tok', c: tok }), r => { curReq = r; })
            : askModelStream(port || CONFIG.models[0].port, [{ role: 'system', content: sys }, ...work], tok => ev({ t: 'tok', c: tok }), r => { curReq = r; }));
          if (cancelled) break;
          const cb = extractCode(reply);
          if (!cb) { run = null; break; }
          const raw = (cb.lang || '').toLowerCase();
          let lang = ALIAS[raw] || raw;                   // start from the explicit fence tag
          if (!RUNNABLE.has(lang)) { run = null; break; } // untagged prose / html / etc -> show, don't auto-run
          const corrected = reconcileLang(lang, cb.code); // fix obvious mislabels (e.g. JS tagged python)
          const wasFixed = corrected !== lang;
          if (wasFixed) { dlog('chat', 'warn', 'language tag corrected', { from: lang, to: corrected }); lang = corrected; }
          run = runByLang(lang, cb.code);
          run.language = lang;
          run.quality = analyzeCode(lang, cb.code);       // code-intelligence verdict alongside execution
          if (wasFixed) run.quality.notes.unshift({ sev: 'warn', msg: `tag fence salah — dijalankan sebagai ${lang}` });
          dlog('chat', run.ok ? 'info' : 'warn', 'verify', { lang, ok: run.ok, attempt: i, quality: run.quality.score, notes: run.quality.notes.length });
          ev({ t: 'run', run });
          if (run.ok) break;
          work.push({ role: 'assistant', content: reply });
          work.push({ role: 'user', content: `The code failed when run. Here is the real error (the actual cause is on the last line):\n${errForModel(run.error)}\nFix the root cause and output only the corrected code block.` });
        }
        if (!cancelled) { ev({ t: 'done', reply, run, attempts }); dlog('chat', 'info', 'chat done', { attempts, verified: !!(run && run.ok), quality: run && run.quality ? run.quality.score : null }); }
      } catch (e) { if (!cancelled) { ev({ t: 'err', m: e.message }); dlog('chat', 'error', 'chat error', { error: e.message }); } }
      if (!res.writableEnded) res.end();
    });
    return;
  }

  // Agent: autonomous WRITE/RUN/DONE loop in the workspace (SSE)
  if (req.method === 'POST' && req.url === '/agent') {
    let body = '';
    let cancelled = false, curReq = null;
    res.on('close', () => { if (!res.writableFinished) { cancelled = true; if (curReq) { try { curReq.destroy(); } catch (_) {} } } });
    req.on('data', c => body += c);
    req.on('end', async () => {
      let history, port, cloud;
      try { ({ history, port, cloud } = JSON.parse(body)); } catch (e) { res.writeHead(400); return res.end('bad json'); }
      if (cloud) {
        cloud.provider = cloud.provider || (cloud.key ? detectProvider(cloud.key) : null);
        if (!cloud.key && cloud.provider && CLOUD_KEYS[cloud.provider]) {
          cloud.key = CLOUD_KEYS[cloud.provider].key; cloud.model = cloud.model || CLOUD_KEYS[cloud.provider].model;
        }
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
      const ev = o => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(o)}\n\n`); };
      const convo = (history || []).slice();
      const MAX = 8;
      try {
        for (let step = 1; step <= MAX; step++) {
          if (cancelled) break;
          ev({ t: 'step', n: step });
          let reply;
          if (cloud && cloud.key) {
            reply = await askCloudStream({ ...cloud, system: AGENT_SYS }, convo, tok => ev({ t: 'tok', c: tok }), r => { curReq = r; });
          } else {
            reply = await askModelStream(port || CONFIG.models[0].port, [{ role: 'system', content: AGENT_SYS }, ...convo], tok => ev({ t: 'tok', c: tok }), r => { curReq = r; });
          }
          if (cancelled) break;
          convo.push({ role: 'assistant', content: reply });
          let act = parseAction(reply), implicitRun = false;
          // Fallback (honors Quantum's thesis): if the model just dumped a code block
          // instead of using the protocol, run it and verify by execution.
          if (!act) {
            const cb = extractCode(reply);
            if (cb) {
              const raw = (cb.lang || '').toLowerCase();
              const lang = ALIAS[raw] || raw;     // only when the fence is EXPLICITLY tagged runnable
              if (lang === 'python' || lang === 'javascript') {   // untagged prose blocks are NOT executed
                const clean = cb.code.split('\n').filter(l => !/^\s*(WRITE\b|RUN\b|DONE\b)/i.test(l)).join('\n');
                act = { kind: 'run', arg: lang, body: clean }; implicitRun = true;
              }
            }
          }
          if (!act || act.kind === 'done') { ev({ t: 'adone', steps: step, summary: act ? act.body : reply }); break; }

          let result;
          if (act.kind === 'write') {
            try {
              const dest = path.resolve(WORKSPACE, act.arg || 'untitled.txt');
              if (!dest.startsWith(WORKSPACE)) throw new Error('path outside workspace');
              fs.mkdirSync(path.dirname(dest), { recursive: true });
              fs.writeFileSync(dest, act.body, 'utf8');
              result = { ok: true, output: `wrote ${act.arg} (${Buffer.byteLength(act.body)} bytes)` };
            } catch (e) { result = { ok: false, error: e.message }; }
          } else { // run
            result = runInWorkspace(act.arg, act.body);
          }
          ev({ t: 'act', kind: act.kind, arg: act.arg, ok: !!result.ok, output: result.output || result.error || '' });
          // A bare code block that ran clean = verified by the CPU → finish.
          if (implicitRun && result.ok) { ev({ t: 'adone', steps: step, summary: '✓ Terverifikasi dengan eksekusi (exit 0).' }); break; }
          convo.push({ role: 'user', content:
            `Result of ${act.kind} ${act.arg || ''} — ${result.ok ? 'OK' : 'FAIL'}:\n${(result.output || result.error || '').slice(0, 1500)}\n` +
            `Continue with the next single action. If the task is complete and a test passed, reply with a DONE block.` });
          if (step === MAX) ev({ t: 'adone', steps: step, summary: 'Mencapai batas langkah (8).' });
        }
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
        let lang = detectLang(language, code || '');
        lang = reconcileLang(lang, code || '');
        r = runByLang(lang, code);
        r.language = lang;
        r.quality = analyzeCode(lang, code || '');
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
      const types = { '.css':'text/css', '.js':'application/javascript', '.jsx':'application/javascript', '.json':'application/json',
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
