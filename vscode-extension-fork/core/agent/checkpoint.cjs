// core/agent/checkpoint.cjs
const fs = require('fs');
const path = require('path');
const DEFAULT_DIR = path.join(process.cwd(), 'data', 'agent-state');
function ensureDir(dir = DEFAULT_DIR) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  return dir;
}
function pathFor(runId, dir = DEFAULT_DIR) {
  if (!runId) throw new Error('checkpoint: runId required');
  if (!/^[A-Za-z0-9_.-]{1,128}$/.test(runId)) throw new Error('checkpoint: bad runId');
  return path.join(ensureDir(dir), runId + '.json');
}
function save(state, opts = {}) {
  if (!state?.runId) throw new Error('checkpoint: state.runId required');
  const file = pathFor(state.runId, opts.dir);
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, file);
  return file;
}
function load(runId, opts = {}) {
  if (!runId) return null;
  const file = pathFor(runId, opts.dir);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}
function list(opts = {}) {
  const dir = ensureDir(opts.dir || DEFAULT_DIR);
  let names = []; try { names = fs.readdirSync(dir); } catch (_) { return []; }
  const out = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    try { const st = fs.statSync(path.join(dir, n)); out.push({ runId: n.replace(/\.json$/, ''), mtime: st.mtimeMs, size: st.size }); } catch (_) {}
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}
function remove(runId, opts = {}) {
  if (!runId) return false;
  try { fs.unlinkSync(pathFor(runId, opts.dir)); return true; } catch (_) { return false; }
}
module.exports = { save, load, list, remove, DEFAULT_DIR };