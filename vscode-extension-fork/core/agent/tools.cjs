// Self-edit agent tools — complete implementation extracted from server.cjs
const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');
const { exec, spawn } = require('child_process');
const execP = util.promisify(exec);
const { dlog } = require('./debug.cjs');
const trace = require('./trace.cjs');
const { runByLang, detectLang } = require('./runners.cjs');
const { webSearch, webFetch } = require('./web.cjs');
let term;
try { term = require('../terminal.cjs'); } catch (_) { term = null; }

// ── Quantum source root + guardrails ──
const QROOT = path.resolve(__dirname, '..');
const Q_ALLOWED = /^(server\.cjs|[\w.-]+\.cjs|[\w.-]+[\\/][\w.-]+\.cjs|config\.json|public[\\/].+\.(jsx|css|html|js|json)|studio[\\/]lib[\\/].+\.dart|studio[\\/](pubspec\.yaml|web[\\/]index\.html))$/;
const Q_FORBID = /(^|[\\/])(cloud-keys\.json|node_modules|\.git|_agent_backups|dist-app|build|\.dart_tool|workspace)([\\/]|$)/;
function qResolve(p, mustBeEditable) {
  const rel = (p||'').trim().replace(/^[`"']+|[`"']+$/g,'').replace(/^\//,'');
  const dest = path.resolve(QROOT, rel);
  if (dest !== QROOT && !dest.startsWith(QROOT + path.sep))
    throw new Error('path di luar root Quantum');
  const relNorm = path.relative(QROOT, dest).replace(/\\/g, '/');
  if (Q_FORBID.test(relNorm)) throw new Error('path terlarang: ' + relNorm);
  if (mustBeEditable && !Q_ALLOWED.test(relNorm) && !Q_ALLOWED.test(relNorm.replace(/\//g, '\\\\')))
    throw new Error('path tidak boleh ditulis: ' + relNorm);
  return dest;
}
function qWalk(filterRe) {
  const skip = /^(node_modules|\.git|_agent_backups|dist-app|workspace|build|\.dart_tool|vendor)$/;
  const secret = /(cloud-keys\.json|\.env|\.pem$|\.key$|secret|credential|token)/i;
  const out = [];
  (function walk(dir, depth) {
    if (out.length > 600 || depth > 5) return;
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (skip.test(e.name)) continue;
      if (e.isFile() && secret.test(e.name)) continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp, depth + 1);
      else { const r = path.relative(QROOT, fp).replace(/\\/g, '/'); if (!filterRe || filterRe.test(r)) out.push({ rel: r, fp }); }
    }
  })(QROOT, 0);
  return out;
}
function qList() { return qWalk(null).slice(0, 400).map(f => { let sz = 0; try { sz = fs.statSync(f.fp).size; } catch {} return f.rel + ' (' + sz + 'b)'; }).join('\n'); }

function globToRe(p) {
  const esc = c => c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  let rx = '', i = 0;
  while (i < p.length) {
    const c = p[i];
    if (c === '*') {
      if (p[i+1] === '*') { if (p[i+2] === '/') { rx += '(?:.*/)?'; i += 3; } else { rx += '.*'; i += 2; } }
      else { rx += '[^/]*'; i++; }
    } else if (c === '?') { rx += '[^/]'; i++; }
    else { rx += esc(c); i++; }
  }
  return new RegExp('^' + rx + '$', 'i');
}
function qGlob(pattern) {
  let re; try { re = globToRe((pattern||'*').trim()); } catch { return 'pola tidak valid'; }
  const hits = qWalk(null).filter(f => re.test(f.rel) || re.test(f.rel.split('/').pop())).map(f => f.rel);
  return hits.length ? hits.slice(0, 200).join('\n') : '(tidak ada file cocok)';
}

function qRead(p, near) {
  const fp = qResolve(p, false);
  let st; try { st = fs.statSync(fp); } catch { throw new Error('file tidak ada: ' + p); }
  if (st.isDirectory()) return '(ini direktori) isi:\n' + fs.readdirSync(fp).slice(0,100).join('\n');
  const lines = fs.readFileSync(fp, 'utf8').split('\n');
  const N = lines.length;
  near = parseInt(near);
  let a = 0, b = Math.min(N, 800);
  if (Number.isFinite(near) && near > 0) { a = Math.max(0, near - 40); b = Math.min(N, near + 40); }
  const shown = lines.slice(a,b).map((l,i) => (a+i+1) + '\t' + l).join('\n');
  const head = (a > 0 || b < N) ? `(baris ${a+1}-${b} dari ${N})\n` : '';
  return head + shown;
}

function qGrep(pattern) {
  if (!pattern) return 'pola kosong';
  let re; try { re = new RegExp(pattern, 'i'); } catch { return 'regex tidak valid: ' + pattern; }
  const hits = [];
  const files = qWalk(/\.(cjs|js|jsx|css|html|json|dart|yaml|md)$/i);
  for (const f of files) {
    if (hits.length >= 150) break;
    let txt; try { txt = fs.readFileSync(f.fp, 'utf8'); } catch { continue; }
    txt.split('\n').forEach((l, i) => { if (hits.length < 150 && re.test(l)) hits.push(f.rel + ':' + (i+1) + ': ' + l.trim().slice(0,160)); });
  }
  return hits.length ? hits.join('\n') : '(tidak ada kecocokan)';
}

async function qSyntaxOk(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  try {
    if (ext === '.cjs' || ext === '.js') {
      await execP(`"${process.execPath}" --check "${absPath}"`, { timeout: 15000, stdio: 'pipe', windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
      return { ok: true };
    }
    return { ok: true };
  } catch (e) { return { ok: false, error: (((e.stderr||'')+'').trim() || e.message).slice(0, 500) }; }
}

function qBackup() {
  const dir = path.join(QROOT, '_agent_backups', 'bak-' + new Date().toISOString().replace(/[:.]/g,'-'));
  fs.mkdirSync(dir, { recursive: true });
  let n = 0;
  for (const f of qWalk(/\.(cjs|js|jsx|css|html|json|dart|yaml)$/i)) {
    if (n > 200) break;
    const relSeg = f.rel.replace(/\//g, path.sep);
    if (!(Q_ALLOWED.test(relSeg) || Q_ALLOWED.test(f.rel))) continue;
    try { const d = path.join(dir, f.rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(f.fp, d); n++; } catch {}
  }
  return dir;
}

// ── Local disk exploration (read-only, outside QROOT) ──
const DISK_HOME = os.homedir();
const DISK_BLOCKED = /^[A-Za-z]:[\\\/](Windows|Program Files|Program Files \(x86\)|ProgramData|System Volume Information|\$Recycle\.Bin)/i;

function resolveDiskPath(p) {
  const raw = (p||'').trim().replace(/^[`"']+|[`"']+$/g, '');
  if (/^[A-Za-z]:[\\\/]/.test(raw)) {
    const dest = path.resolve(raw);
    if (DISK_BLOCKED.test(dest)) throw new Error('path sistem ditolak: ' + raw);
    return dest;
  }
  if (/^[\/]/.test(raw)) {
    const dest = path.resolve(raw);
    if (DISK_BLOCKED.test(dest)) throw new Error('path sistem ditolak: ' + raw);
    return dest;
  }
  const dest = path.resolve(DISK_HOME, raw);
  if (DISK_BLOCKED.test(dest)) throw new Error('path sistem ditolak: ' + raw);
  return dest;
}

function diskWalk(dir, filterRe, maxDepth) {
  const skip = /^(node_modules|\.git|_agent_backups|dist-app|build|\.dart_tool|vendor|__pycache__|\.cache|\.vs|\.nuget|packages|Debug|Release|obj|bin|\.next|\.nuxt|target|bower_components|\.terraform|vendor|cache)$/i;
  const secret = /(\.env|\.pem$|\.key$|\.secret|credentials?|token|cloud-keys|\.lock$)/i;
  const out = [];
  (function walk(d, depth) {
    if (out.length > 800 || depth > (maxDepth || 7)) return;
    let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (skip.test(e.name)) continue;
      if (e.isFile() && secret.test(e.name)) continue;
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp, depth + 1);
      else { const r = path.relative(dir, fp).replace(/\\/g, '/'); if (!filterRe || filterRe.test(fp.replace(/\\/g, '/')) || filterRe.test(r)) out.push({ rel: r, fp }); }
    }
  })(dir, 0);
  return out;
}

function diskList(p) {
  const dir = resolveDiskPath(p || DISK_HOME);
  let st; try { st = fs.statSync(dir); } catch { throw new Error('path tidak ada: ' + p); }
  if (!st.isDirectory()) throw new Error('bukan direktori: ' + p);
  const out = [];
  let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { throw new Error('tidak bisa akses: ' + p); }
  const skipEntry = /^(node_modules|\.git|__pycache__|\.cache|\.vs|\.nuget|packages|Debug|Release|obj|bin|\.next|target|bower_components|\.terraform|cache)$/i;
  for (const e of ents) {
    if (skipEntry.test(e.name)) continue;
    const fp = path.join(dir, e.name);
    let sz = 0; try { if (e.isFile()) sz = fs.statSync(fp).size; } catch {}
    const icon = e.isDirectory() ? '📁 ' : '📄 ';
    out.push(icon + e.name + (e.isDirectory() ? '/' : ' (' + sz + 'b)'));
  }
  return out.join('\n');
}

function diskGlob(p, pattern) {
  const dir = resolveDiskPath(p || DISK_HOME);
  let st; try { st = fs.statSync(dir); } catch { throw new Error('path tidak ada: ' + p); }
  if (!st.isDirectory()) throw new Error('bukan direktori: ' + p);
  let re; try { re = globToRe((pattern||'*').trim()); } catch { return 'pola tidak valid'; }
  const hits = diskWalk(dir, re).map(f => f.fp.replace(/\\/g, '/'));
  return hits.length ? hits.slice(0, 200).join('\n') : '(tidak ada file cocok)';
}

function diskRead(p, near) {
  const fp = resolveDiskPath(p);
  let st; try { st = fs.statSync(fp); } catch { throw new Error('file tidak ada: ' + p); }
  if (st.isDirectory()) return '(ini direktori) isi:\n' + fs.readdirSync(fp).slice(0, 100).join('\n');
  const lines = fs.readFileSync(fp, 'utf8').split('\n');
  const N = lines.length;
  near = parseInt(near);
  let a = 0, b = Math.min(N, 800);
  if (Number.isFinite(near) && near > 0) { a = Math.max(0, near - 40); b = Math.min(N, near + 40); }
  const shown = lines.slice(a, b).map((l, i) => (a + i + 1) + '\t' + l).join('\n');
  const head = (a > 0 || b < N) ? `(baris ${a + 1}-${b} dari ${N})\n` : '';
  return head + shown;
}

function diskGrep(p, pattern) {
  if (!pattern) return 'pola kosong';
  let re; try { re = new RegExp(pattern, 'i'); } catch { return 'regex tidak valid: ' + pattern; }
  const dir = resolveDiskPath(p || DISK_HOME);
  let st; try { st = fs.statSync(dir); } catch { throw new Error('path tidak ada: ' + p); }
  if (!st.isDirectory()) throw new Error('bukan direktori: ' + p);
  const hits = [];
  const files = diskWalk(dir, /\.(cjs|js|jsx|css|html|json|dart|yaml|yml|md|py|ts|tsx|txt|xml|sql|sh|bat|ps1|log|cfg|ini|toml|go|rs|java|c|cpp|h|hpp|rb|php|swift|kt|scala|r|m|tex|vue|svelte)$/i);
  for (const f of files) {
    if (hits.length >= 150) break;
    let txt; try { txt = fs.readFileSync(f.fp, 'utf8'); } catch { continue; }
    txt.split('\n').forEach((l, i) => { if (hits.length < 150 && re.test(l)) hits.push(f.fp.replace(/\\/g, '/') + ':' + (i + 1) + ': ' + l.trim().slice(0, 160)); });
  }
  return hits.length ? hits.join('\n') : '(tidak ada kecocokan)';
}

// ── Workspace helpers ──
const WORKSPACE = path.join(QROOT, 'workspace');
try { fs.mkdirSync(WORKSPACE, { recursive: true }); } catch {}
function wsResolve(p) {
  const dest = path.resolve(WORKSPACE, (p||'').replace(/^[\\/]+/,''));
  if (dest !== WORKSPACE && !dest.startsWith(WORKSPACE + path.sep)) throw new Error('path di luar workspace');
  return dest;
}
function wsList(sub) {
  const root = wsResolve(sub||''); const out = [];
  (function walk(dir, depth) {
    if (out.length > 300 || depth > 8) return;
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (/^(node_modules|\.git)$/.test(e.name)) continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) walk(fp, depth + 1);
      else { let sz = 0; try { sz = fs.statSync(fp).size; } catch {} out.push(path.relative(WORKSPACE, fp).replace(/\\/g,'/') + ' (' + sz + 'b)'); }
    }
  })(root);
  return out.length ? out.join('\n') : '(workspace kosong)';
}
async function runInWorkspace(lang, code) {
  const l = (lang||'').toLowerCase();
  try {
    if (l === 'javascript' || l === 'js') {
      fs.writeFileSync(path.join(WORKSPACE, '_run.cjs'), code, 'utf8');
      const out = await new Promise((resolve, reject) => {
        exec(`"${process.execPath}" _run.cjs`, { cwd: WORKSPACE, timeout: 120000, encoding: 'utf8', maxBuffer: 200 * 1024 }, (error, stdout, stderr) => {
          if (error) reject(error); else resolve(stdout);
        });
      });
      return { ok: true, output: (out || '').slice(0, 4000) };
    }
    if (l === 'python' || l === 'py') {
      fs.writeFileSync(path.join(WORKSPACE, '_run.py'), code, 'utf8');
      const out = await new Promise((resolve, reject) => {
        exec('python _run.py', { cwd: WORKSPACE, timeout: 120000, encoding: 'utf8', maxBuffer: 200 * 1024 }, (error, stdout, stderr) => {
          if (error) reject(error); else resolve(stdout);
        });
      });
      return { ok: true, output: out };
    }
    return { ok: false, error: 'RUN supports python or javascript (got "' + lang + '")' };
  } catch (e) {
    return { ok: false, output: (e.stdout||'').toString(), error: ((e.stderr||'')+'').trim() || e.message };
  }
}

// ── Tool definitions (OpenAI function-calling format) ──
const SELF_TOOLS = [
  { type: 'function', function: { name: 'task', description: 'Spawn a focused SUB-AGENT to handle ONE self-contained sub-task.', parameters: { type: 'object', properties: { goal: { type: 'string', description: 'one clear, self-contained sub-task' } }, required: ['goal'] } } },
  { type: 'function', function: { name: 'list', description: 'List project source files.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'glob', description: 'Find files by wildcard (e.g. public/**/*.jsx, *agent*).', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'read', description: 'Read a file with line numbers. Pass near=<line> for ±40 lines context.', parameters: { type: 'object', properties: { path: { type: 'string' }, near: { type: 'number' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'grep', description: 'Search all project source files for a regex pattern.', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } } },
  { type: 'function', function: { name: 'edit', description: 'Replace an exact substring. old_string must match verbatim.', parameters: { type: 'object', properties: { path: { type: 'string' }, old_string: { type: 'string' }, new_string: { type: 'string' } }, required: ['path', 'old_string', 'new_string'] } } },
  { type: 'function', function: { name: 'write', description: 'Create or overwrite a file.', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } } },
  { type: 'function', function: { name: 'bash', description: 'Run a PowerShell command. Supports cwd parameter to set working directory. NOT for editing files.', parameters: { type: 'object', properties: { command: { type: 'string' }, cwd: { type: 'string', description: 'working directory (absolute path, e.g. "C:\\Users\\dave\\project")' } }, required: ['command'] } } },
  { type: 'function', function: { name: 'web_search', description: 'Search the web via StackOverflow+GitHub+npm+Wikipedia+DDG. Returns top results with title/URL/snippet.', parameters: { type: 'object', properties: { query: { type: 'string', description: 'search query' } }, required: ['query'] } } },
  { type: 'function', function: { name: 'web_fetch', description: 'Fetch text from a URL using Microsoft Edge headless (bypasses bot detection). Returns clean text up to 8KB.', parameters: { type: 'object', properties: { url: { type: 'string', description: 'full URL to fetch' } }, required: ['url'] } } },
  { type: 'function', function: { name: 'dspy', description: 'Use DSpy (native JS ChainOfThought) to optimize prompts via Quantum\'s cloud LLM.', parameters: { type: 'object', properties: { prompt: { type: 'string', description: 'the prompt to optimize' } }, required: ['prompt'] } } },
  { type: 'function', function: { name: 'todowrite', description: 'Maintain a structured task list to track multi-step work. Update status as you progress (pending → in_progress → completed). Use for tasks with 3+ steps.', parameters: { type: 'object', properties: { todos: { type: 'array', items: { type: 'object', properties: { content: { type: 'string', description: 'brief task description' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'cancelled'] }, priority: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['content', 'status'] }, description: 'list of tasks with current status' } }, required: ['todos'] } } },
  { type: 'function', function: { name: 'terminal_open', description: 'Open a persistent PTY terminal session in the workspace. Returns session id.', parameters: { type: 'object', properties: { cwd: { type: 'string', description: 'working directory (default: workspace)' }, shell: { type: 'string', description: 'shell override' } } } } },
  { type: 'function', function: { name: 'terminal_write', description: 'Write text to a terminal session (stdin). Use \\\\n for newline.', parameters: { type: 'object', properties: { id: { type: 'string', description: 'session id from terminal_open' }, data: { type: 'string', description: 'text to send (add \\\\n to execute command)' } }, required: ['id', 'data'] } } },
  { type: 'function', function: { name: 'terminal_read', description: 'Read accumulated output from a terminal session (non-destructive unless clear=true).', parameters: { type: 'object', properties: { id: { type: 'string', description: 'session id' }, clear: { type: 'boolean', description: 'clear buffer after reading' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'terminal_close', description: 'Close and kill a terminal session.', parameters: { type: 'object', properties: { id: { type: 'string', description: 'session id' } }, required: ['id'] } } },
  { type: 'function', function: { name: 'question', description: 'Ask the user a clarifying question when the request is ambiguous or you need more information. Use when you cannot proceed without user input.', parameters: { type: 'object', properties: { question: { type: 'string', description: 'the question to ask the user' }, choices: { type: 'array', items: { type: 'string' }, description: 'optional list of suggested answers' } }, required: ['question'] } } },
  { type: 'function', function: { name: 'disk_list', description: 'List contents of ANY directory on the local disk. Use absolute paths like "C:\\Users\\dave\\project". Returns files and folders with sizes.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'absolute directory path (e.g. "C:\\Users\\dave\\Downloads")' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'disk_read', description: 'Read ANY file on the local disk by absolute path. Supports near=<line> for context around a line number.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'absolute file path on local disk' }, near: { type: 'number', description: 'line number to center on (±40 lines)' } }, required: ['path'] } } },
  { type: 'function', function: { name: 'disk_glob', description: 'Find files by wildcard pattern in ANY directory on the local disk.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'absolute directory path to search in' }, pattern: { type: 'string', description: 'glob pattern (e.g. "*.py", "**/*.tsx")' } }, required: ['path', 'pattern'] } } },
  { type: 'function', function: { name: 'disk_grep', description: 'Search file contents by regex in ANY directory on the local disk.', parameters: { type: 'object', properties: { path: { type: 'string', description: 'absolute directory path to search in' }, pattern: { type: 'string', description: 'regex pattern to search for' } }, required: ['path', 'pattern'] } } },
  { type: 'function', function: { name: 'git', description: 'Git version control: diff, status, add, commit, log, branch, revert. Pass git_op + optional file/msg/action/name/limit.', parameters: { type: 'object', properties: { git_op: { type: 'string', enum: ['diff', 'status', 'add', 'commit', 'log', 'branch', 'revert'] }, file: { type: 'string' }, msg: { type: 'string' }, action: { type: 'string' }, name: { type: 'string' }, limit: { type: 'number' } }, required: ['git_op'] } } },
  { type: 'function', function: { name: 'edit_batch', description: 'Atomically edit multiple files. If any fails, ALL rollback. Pass edits array: [{path, old_string, new_string}, ...]', parameters: { type: 'object', properties: { edits: { type: 'array', items: { type: 'object' } } }, required: ['edits'] } } },
  { type: 'function', function: { name: 'run_tests', description: 'Run project tests. Auto-detects npm/python/dart/etc. Optional filter for specific test files.', parameters: { type: 'object', properties: { filter: { type: 'string' }, cwd: { type: 'string' } }, required: [] } } },
];

// ── Helper: Git operations ──
function gitTool(args) {
  const cmd = args.git_op;
  const file = args.file ? qResolve(args.file) : null;
  const msg = args.msg || '';
  const name = args.name || '';
  const limit = args.limit || 10;
  try {
    if (cmd === 'diff') {
      const f = file ? path.relative(QROOT, file) : null;
      const c = f ? `git diff "${f}"` : 'git diff';
      const out = require('child_process').execSync(c, { cwd: QROOT, encoding: 'utf8', maxBuffer: 1e6 }).trim();
      return { ok: true, output: out || '(no changes)' };
    }
    if (cmd === 'status') {
      const out = require('child_process').execSync('git status --short', { cwd: QROOT, encoding: 'utf8' }).trim();
      return { ok: true, output: out || '(working tree clean)' };
    }
    if (cmd === 'add' && file) {
      const f = path.relative(QROOT, file);
      require('child_process').execSync(`git add "${f}"`, { cwd: QROOT });
      return { ok: true, output: `staged: ${f}` };
    }
    if (cmd === 'commit' && msg) {
      const out = require('child_process').execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, { cwd: QROOT, encoding: 'utf8' }).trim();
      return { ok: true, output: out };
    }
    if (cmd === 'log') {
      const f = file ? path.relative(QROOT, file) : null;
      const c = f ? `git log --oneline -${limit} "${f}"` : `git log --oneline -${limit}`;
      const out = require('child_process').execSync(c, { cwd: QROOT, encoding: 'utf8' }).trim();
      return { ok: true, output: out };
    }
    if (cmd === 'branch') {
      if (args.action === 'list') {
        const out = require('child_process').execSync('git branch -a', { cwd: QROOT, encoding: 'utf8' }).trim();
        return { ok: true, output: out };
      }
      if (args.action === 'create' && name) {
        require('child_process').execSync(`git branch "${name}"`, { cwd: QROOT });
        return { ok: true, output: `created branch: ${name}` };
      }
      if (args.action === 'delete' && name) {
        require('child_process').execSync(`git branch -D "${name}"`, { cwd: QROOT });
        return { ok: true, output: `deleted branch: ${name}` };
      }
    }
    if (cmd === 'revert' && file) {
      const f = path.relative(QROOT, file);
      require('child_process').execSync(`git checkout -- "${f}"`, { cwd: QROOT });
      return { ok: true, output: `reverted: ${f}` };
    }
    return { ok: false, output: 'invalid git operation' };
  } catch (e) {
    return { ok: false, output: 'git error: ' + e.message };
  }
}

// ── Helper: Test runner (auto-detect npm/python/dart) ──
function runTests(cwd, filter) {
  try {
    let cmd = null;
    // Detect project type
    if (fs.existsSync(path.join(cwd, 'package.json'))) {
      cmd = filter ? `npm test -- "${filter}"` : 'npm test';
    } else if (fs.existsSync(path.join(cwd, 'pytest.ini')) || fs.existsSync(path.join(cwd, 'pyproject.toml'))) {
      cmd = filter ? `python -m pytest "${filter}"` : 'python -m pytest';
    } else if (fs.existsSync(path.join(cwd, 'pubspec.yaml'))) {
      cmd = filter ? `dart test "${filter}"` : 'dart test';
    } else if (fs.existsSync(path.join(cwd, 'pom.xml'))) {
      cmd = 'mvn test';
    } else if (fs.existsSync(path.join(cwd, 'build.gradle'))) {
      cmd = 'gradle test';
    }
    if (!cmd) return { ok: false, output: 'no test framework detected (npm/python/dart/maven/gradle)' };
    const out = require('child_process').execSync(cmd, { cwd, encoding: 'utf8', maxBuffer: 2e6, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    return { ok: true, output: out };
  } catch (e) {
    // Non-zero exit from tests
    const out = e.stdout ? e.stdout.toString() : e.message;
    return { ok: false, output: `tests failed (exit ${e.status}):\n${out}` };
  }
}

// ── Core tool dispatcher ──
// Returns string (sync) or Promise<{ok,output[,edited]}> for async tools like web_search
function runSelfTool(name, args, emit) {
  const t0 = Date.now();
  trace.emit('tool_exec_start', 'tools', { tool: name });
  try {
    if (name === 'list') {
      const result = { ok: true, output: qList() };
      trace.emit('tool_exec_done', 'tools', { tool: name, ms: Date.now() - t0, ok: true });
      return result;
    }
    if (name === 'glob') {
      const result = { ok: true, output: qGlob(args.pattern) };
      trace.emit('tool_exec_done', 'tools', { tool: name, ms: Date.now() - t0, ok: true });
      return result;
    }
    if (name === 'read') {
      const result = { ok: true, output: qRead(args.path, args.near) };
      trace.emit('tool_exec_done', 'tools', { tool: name, ms: Date.now() - t0, ok: true });
      return result;
    }
    if (name === 'grep') {
      const result = { ok: true, output: qGrep(args.pattern) };
      trace.emit('tool_exec_done', 'tools', { tool: name, ms: Date.now() - t0, ok: true });
      return result;
    }
    if (name === 'edit') {
      const dest = qResolve(args.path, true);
      const old = fs.readFileSync(dest, 'utf8');
      if (!old.includes(args.old_string)) return { ok: false, output: 'old_string tidak ditemukan di file — read ulang & salin persis.' };
      if (args.old_string === args.new_string) return { ok: false, output: 'NOOP: old_string sama dengan new_string — edit dibatalkan.' };
      const patched = old.replace(args.old_string, args.new_string);
      if (old === patched) return { ok: false, output: 'NOOP: replace tidak mengubah konten (old_string tidak match atau sudah sama).' };
      fs.writeFileSync(dest, patched, 'utf8');
      return qSyntaxOk(dest).then(chk => {
        if (!chk.ok) { fs.writeFileSync(dest, old, 'utf8'); return { ok: false, output: 'DITOLAK (sintaks rusak, dikembalikan):\n' + chk.error }; }
        return { ok: true, edited: true, output: 'edited ' + args.path + ' (' + old.length + '->' + patched.length + ' b, sintaks OK)' };
      });
    }
    if (name === 'write') {
      const dest = qResolve(args.path, true);
      const existed = fs.existsSync(dest); const prev = existed ? fs.readFileSync(dest, 'utf8') : null;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, args.content || '', 'utf8');
      return qSyntaxOk(dest).then(chk => {
        if (!chk.ok) { if (existed) fs.writeFileSync(dest, prev, 'utf8'); else fs.rmSync(dest, { force: true }); return { ok: false, output: 'DITOLAK (sintaks rusak):\n' + chk.error }; }
        return { ok: true, edited: true, output: (existed ? 'overwrote' : 'created') + ' ' + args.path + ' (sintaks OK)' };
      });
    }
    if (name === 'bash') {
      const cmd = (args.command || '').trim();
      if (/\brm\s+-rf\b|\bdel\s+\/|\bformat\b|\bmkfs\b|shutdown|\breboot\b|:\(\)\s*\{|>\s*\/dev\/sd|\bcurl\b[^|]*\|\s*(sh|bash)|\bgit\s+push\b/i.test(cmd))
        return { ok: false, output: 'perintah berbahaya ditolak' };
      let cwd = QROOT;
      if (args.cwd) {
        try { const resolved = resolveDiskPath(args.cwd); const st = fs.statSync(resolved); if (st.isDirectory()) cwd = resolved; } catch {}
      }
      // Use spawn for streaming output — no more execSync blocking
      return new Promise(resolve => {
        const child = spawn('cmd.exe', ['/d', '/c', cmd], {
          cwd,
          windowsHide: true,
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        });
        let stdout = '', stderr = '', timedOut = false;
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, 60000);
        child.stdout.on('data', chunk => {
          const text = chunk.toString();
          stdout += text;
          if (emit) emit({ t: 'act', kind: 'bash', arg: cmd.slice(0, 60), ok: true, output: text.slice(0, 1000) });
        });
        child.stderr.on('data', chunk => {
          const text = chunk.toString();
          stderr += text;
          if (emit) emit({ t: 'act', kind: 'bash', arg: cmd.slice(0, 60), ok: true, output: text.slice(0, 1000) });
        });
        child.on('close', code => {
          clearTimeout(timer);
          if (timedOut) return resolve({ ok: false, output: 'TIMEOUT (60s): ' + cmd.slice(0, 100) });
          const full = (stdout || stderr || '').trim();
          if (code !== 0 && stderr) {
            resolve({ ok: false, output: 'exit ' + code + ':\n' + (stderr.trim() || stdout.trim() || '(no output)').slice(0, 4000) });
          } else {
            resolve({ ok: true, output: full.slice(0, 4000) || '(exit ' + code + ')' });
          }
        });
        child.on('error', err => {
          clearTimeout(timer);
          resolve({ ok: false, output: 'spawn error: ' + err.message });
        });
      });
    }
    if (name === 'todowrite') {
      const todos = args.todos || [];
      const summary = todos.map(t => {
        const icon = t.status === 'completed' ? '✓' : t.status === 'in_progress' ? '→' : t.status === 'cancelled' ? '✗' : '○';
        return `${icon} [${t.priority || 'medium'}] ${t.content}`;
      }).join('\n');
      return { ok: true, output: `Task list updated (${todos.length} items):\n${summary}` };
    }
    if (name === 'question') {
      const q = args.question || '';
      const choices = args.choices || [];
      const choicesText = choices.length ? '\n\nSuggested answers:\n' + choices.map((c, i) => `${i + 1}. ${c}`).join('\n') : '';
      return { ok: true, output: `Question: ${q}${choicesText}`, needsAnswer: true, question: q, choices };
    }
    if (name === 'terminal_open') {
      if (!term) return { ok: false, output: 'terminal tidak tersedia (node-pty tidak terinstall)' };
      const r = term.create(args.cwd || undefined, args.shell || undefined);
      return { ok: true, output: 'terminal opened: ' + r.id + ' (pid ' + r.pid + ')' };
    }
    if (name === 'terminal_write') {
      if (!term) return { ok: false, output: 'terminal tidak tersedia' };
      if (!args.id) return { ok: false, output: 'parameter id wajib' };
      const ok = term.write(args.id, args.data);
      return { ok, output: ok ? 'written' : 'session not found: ' + args.id };
    }
    if (name === 'terminal_read') {
      if (!term) return { ok: false, output: 'terminal tidak tersedia' };
      if (!args.id) return { ok: false, output: 'parameter id wajib' };
      // Wait briefly for output (up to 2s) so agent doesn't read empty buffer immediately after write
      return new Promise(resolve => {
        let waited = 0;
        const poll = () => {
          const buf = term.readBuffer(args.id, false);
          if (buf && buf.trim()) {
            const out = term.readBuffer(args.id, args.clear) || buf;
            return resolve({ ok: true, output: out || '(no output yet)' });
          }
          waited += 100;
          if (waited >= 2000) return resolve({ ok: true, output: buf || '(no output yet)' });
          setTimeout(poll, 100);
        };
        poll();
      });
    }
    if (name === 'terminal_close') {
      if (!term) return { ok: false, output: 'terminal tidak tersedia' };
      if (!args.id) return { ok: false, output: 'parameter id wajib' };
      const ok = term.destroy(args.id);
      return { ok, output: ok ? 'session closed: ' + args.id : 'session not found: ' + args.id };
    }
    if (name === 'web_search') return webSearch(args.query).then(r => ({ ok: true, output: r }), e => ({ ok: false, output: e.message }));
    if (name === 'web_fetch')  return webFetch(args.url).then(r => ({ ok: true, output: r }), e => ({ ok: false, output: e.message }));
    if (name === 'dspy') {
      // Real DSpy optimization via native JS (Quantum's cloud LLM, no Python)
      const dspyTool = require('./dspy_tool.cjs');
      return dspyTool.run(args);
    }
    if (name === 'disk_list') return { ok: true, output: diskList(args.path) };
    if (name === 'disk_read') return { ok: true, output: diskRead(args.path, args.near) };
    if (name === 'disk_glob') return { ok: true, output: diskGlob(args.path, args.pattern) };
    if (name === 'disk_grep') return { ok: true, output: diskGrep(args.path, args.pattern) };
    if (name === 'git') return gitTool(args);
    if (name === 'edit_batch') {
      const edits = args.edits || [];
      const backups = [];
      for (const e of edits) {
        const dest = qResolve(e.path, true);
        const orig = fs.readFileSync(dest, 'utf8');
        backups.push({ ...e, dest, orig });
      }
      for (const b of backups) {
        if (!b.orig.includes(b.old_string)) return { ok: false, output: `ABORT: old_string not found in ${b.path}; no changes applied.` };
      }
      for (const b of backups) {
        const patched = b.orig.replace(b.old_string, b.new_string);
        fs.writeFileSync(b.dest, patched, 'utf8');
      }
      return { ok: true, edited: true, output: `edited ${backups.length} file(s) atomically` };
    }
    if (name === 'run_tests') {
      const cwd = args.cwd ? resolveDiskPath(args.cwd) : QROOT;
      return runTests(cwd, args.filter || '');
    }
    trace.emit('tool_exec_done', 'tools', { tool: name, ms: Date.now() - t0, ok: false });
    return { ok: false, output: 'unknown tool: ' + name };
  } catch (e) {
    trace.emit('tool_exec_error', 'tools', { tool: name, ms: Date.now() - t0, error: (e && e.message || String(e)).slice(0, 200) });
    return { ok: false, output: 'error: ' + e.message };
  }
}

module.exports = {
  QROOT, Q_ALLOWED, Q_FORBID,
  SELF_TOOLS, runSelfTool,
  qWalk, qList, qGlob, qRead, qGrep, qBackup, qSyntaxOk, qResolve,
  diskList, diskRead, diskGlob, diskGrep, resolveDiskPath,
  wsResolve, wsList, runInWorkspace,
};
