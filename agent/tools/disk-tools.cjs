// Disk exploration (read-only, outside QROOT)
const fs = require('fs');
const path = require('path');
const os = require('os');
const { globToRe, getSemanticValidator } = require('./file-tools.cjs');

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
  const skip = /^(node_modules|_agent_backups|dist-app|build|\.dart_tool|vendor|__pycache__|\.cache|\.vs|\.nuget|packages|Debug|Release|obj|bin|\.next|\.nuxt|target|bower_components|\.terraform|cache)$/i;
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
  const skipEntry = /^(node_modules|__pycache__|\.cache|\.vs|\.nuget|packages|Debug|Release|obj|bin|\.next|target|bower_components|\.terraform|cache)$/i;
  for (const e of ents) {
    if (skipEntry.test(e.name)) continue;
    const fp = path.join(dir, e.name);
    let sz = 0; try { if (e.isFile()) sz = fs.statSync(fp).size; } catch {}
    const icon = e.isDirectory() ? '📁 ' : '📄 ';
    out.push(icon + e.name + (e.isDirectory() ? '/' : ' (' + sz + 'b)'));
  }
  return out.join('\n');
}

function diskGlob(p, pattern, options = {}) {
  const dir = resolveDiskPath(p || DISK_HOME);
  let st; try { st = fs.statSync(dir); } catch { throw new Error('path tidak ada: ' + p); }
  if (!st.isDirectory()) throw new Error('bukan direktori: ' + p);
  // ── Semantic mode ──
  if (options.intent) {
    const sv = getSemanticValidator();
    if (sv && sv.qSemanticSearch) {
      const semantic = sv.qSemanticSearch(options.intent, { intent: options.intent, filePatterns: true });
      if (semantic.intent && semantic.patterns.length > 0) {
        for (const re of semantic.patterns) {
          const hits = diskWalk(dir, null).filter(f => re.test(f.fp.replace(/\\/g, '/')) || re.test(f.rel)).map(f => f.fp.replace(/\\/g, '/'));
          if (hits.length) return hits.slice(0, 200).join('\n');
        }
        return '(tidak ada file cocok)';
      }
    }
  }
  // ── Fallback: lexical glob ──
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

function diskGrep(p, pattern, options = {}) {
  if (!pattern) return 'pola kosong';
  let patternsToSearch = [];
  if (options.intent || options.semantic) {
    const sv = getSemanticValidator();
    if (sv && sv.qSemanticSearch) {
      const semantic = sv.qSemanticSearch(options.intent || pattern, { intent: options.intent });
      if (semantic.intent && semantic.patterns.length > 0) {
        patternsToSearch = semantic.patterns;
      }
    }
  }
  if (patternsToSearch.length === 0) {
    let re; try { re = new RegExp(pattern, 'i'); } catch { return 'regex tidak valid: ' + pattern; }
    patternsToSearch = [re];
  }
  const dir = resolveDiskPath(p || DISK_HOME);
  let st; try { st = fs.statSync(dir); } catch { throw new Error('path tidak ada: ' + p); }
  if (!st.isDirectory()) throw new Error('bukan direktori: ' + p);
  const hits = [];
  const files = diskWalk(dir, /\.(cjs|js|jsx|css|html|json|dart|yaml|yml|md|py|ts|tsx|txt|xml|sql|sh|bat|ps1|log|cfg|ini|toml|go|rs|java|c|cpp|h|hpp|rb|php|swift|kt|scala|r|m|tex|vue|svelte)$/i);
  for (const f of files) {
    if (hits.length >= 150) break;
    let txt; try { txt = fs.readFileSync(f.fp, 'utf8'); } catch { continue; }
    txt.split('\n').forEach((l, i) => {
      if (hits.length >= 150) return;
      for (const re of patternsToSearch) {
        if (re.test(l)) {
          hits.push(f.fp.replace(/\\/g, '/') + ':' + (i + 1) + ': ' + l.trim().slice(0, 160));
          break;
        }
      }
    });
  }
  return hits.length ? hits.join('\n') : '(tidak ada kecocokan)';
}

module.exports = {
  DISK_HOME, DISK_BLOCKED,
  resolveDiskPath, diskWalk, diskList, diskGlob, diskRead, diskGrep
};
