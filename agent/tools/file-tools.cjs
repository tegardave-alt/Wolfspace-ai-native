// File operations for Quantum source code
const fs = require('fs');
const path = require('path');
const util = require('util');
const { exec } = require('child_process');
const execP = util.promisify(exec);

// ── Quantum source root + guardrails ──
const QROOT = path.resolve(__dirname, '..');
const Q_ALLOWED = /^(server\.cjs|[\w-]+(?:\.[\w-]+)*\.cjs|[\w-]+(?:\.[\w-]+)*[\\/][\w-]+(?:\.[\w-]+)*\.cjs|agent[\\/][\w-]+(?:\.[\w-]+)*[\\/][\w-]+(?:\.[\w-]+)*\.cjs|config\.json|config[\\/][\w-]+(?:\.[\w-]+)*\.json|public[\\/].+\.(jsx|css|html|js|json))$/;
const Q_FORBID = /(^|[\\/])(cloud-keys\.json|node_modules|_agent_backups|dist-app|build|\.dart_tool|workspace)([\\/]|$)/;
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
  const skip = /^(node_modules|_agent_backups|dist-app|workspace|build|\.dart_tool|vendor)$/;
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
function qGlob(pattern, options = {}) {
  let patternsToSearch = [];

  // ── Semantic mode: use intent-based file-name/file-path patterns ──
  if (options.intent) {
    const sv = getSemanticValidator();
    if (sv && sv.qSemanticSearch) {
      const semantic = sv.qSemanticSearch(options.intent, { intent: options.intent, filePatterns: true });
      if (semantic.intent && semantic.patterns.length > 0) {
        patternsToSearch = semantic.patterns;
      }
    }
  }

  // ── Fallback: pure lexical glob ──
  if (patternsToSearch.length === 0) {
    let re; try { re = globToRe((pattern||'*').trim()); } catch { return 'pola tidak valid'; }
    patternsToSearch = [re];
  }

  const hits = qWalk(null).filter(f => {
    for (const re of patternsToSearch) {
      if (re.test(f.rel) || re.test(f.rel.split('/').pop())) return true;
    }
    return false;
  }).map(f => f.rel);

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

function qGrep(pattern, options = {}) {
  if (!pattern) return 'pola kosong';

  let patternsToSearch = [];

  // ── Semantic mode: expand query into multiple intent-based patterns ──
  if (options.intent || options.semantic) {
    const sv = getSemanticValidator();
    if (sv && sv.qSemanticSearch) {
      const semantic = sv.qSemanticSearch(options.intent || pattern, { intent: options.intent });
      if (semantic.intent && semantic.patterns.length > 0) {
        patternsToSearch = semantic.patterns;
      }
    }
  }

  // ── Fallback/fast-path: pure lexical mode ──
  if (patternsToSearch.length === 0) {
    let re; try { re = new RegExp(pattern, 'i'); } catch { return 'regex tidak valid: ' + pattern; }
    patternsToSearch = [re];
  }

  const hits = [];
  const files = qWalk(/\.(cjs|js|jsx|css|html|json|dart|yaml|md)$/i);
  for (const f of files) {
    if (hits.length >= 150) break;
    let txt; try { txt = fs.readFileSync(f.fp, 'utf8'); } catch { continue; }
    txt.split('\n').forEach((l, i) => {
      if (hits.length >= 150) return;
      for (const re of patternsToSearch) {
        if (re.test(l)) {
          hits.push(f.rel + ':' + (i+1) + ': ' + l.trim().slice(0,160));
          break; // avoid duplicate hits from multiple patterns on same line
        }
      }
    });
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
    if (ext === '.json') {
      JSON.parse(fs.readFileSync(absPath, 'utf8'));
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

// ── Semantic file intent helper ──
// Uses sandbox-validator's intent detection for semantic-aware file operations
let _semanticModule = null;
function getSemanticValidator() {
  if (!_semanticModule) {
    try { _semanticModule = require('./sandbox-validator.cjs'); } catch (e) { _semanticModule = null; }
  }
  return _semanticModule;
}

/**
 * Check file intent semantically (name + path + optional content analysis)
 * @param {string} filePath - file path to analyze
 * @param {string} [contentPreview] - optional content preview for deeper analysis
 * @returns {{ intents: Array, blocking: Array }}
 */
function qSemanticCheck(filePath, contentPreview) {
  const sv = getSemanticValidator();
  if (!sv || !sv.detectFileIntent) return { intents: [], blocking: [] };
  const normalized = (filePath || '').replace(/\\/g, '/');
  const intents = sv.detectFileIntent(normalized, contentPreview || '');
  const blocking = intents.filter(i => i.block && i.confidence >= 0.6);
  return { intents, blocking };
}

/**
 * Get human-readable description of file intent
 * @param {string} filePath
 * @returns {string}
 */
function qIntentDescription(filePath) {
  const { intents } = qSemanticCheck(filePath, '');
  if (intents.length === 0) return 'unknown / not classified';
  return intents.map(i => `${i.intent} (${Math.round(i.confidence * 100)}%)`).join(', ');
}

module.exports = {
  QROOT, Q_ALLOWED, Q_FORBID,
  qResolve, qWalk, qList, qGlob, qRead, qGrep, qBackup, qSyntaxOk, globToRe,
  qSemanticCheck, qIntentDescription
};
