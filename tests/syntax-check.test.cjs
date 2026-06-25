const { qSyntaxOk } = require('../agent/tools.cjs');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpFiles = [];

afterEach(() => {
  while (tmpFiles.length) {
    const f = tmpFiles.pop();
    try { fs.unlinkSync(f); } catch {}
  }
});

function tmpFile(ext, content) {
  const p = path.join(os.tmpdir(), `qsyn-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  fs.writeFileSync(p, content, 'utf8');
  tmpFiles.push(p);
  return p;
}

describe('qSyntaxOk', () => {
  it('file JS valid return { ok: true }', async () => {
    const res = await qSyntaxOk(path.resolve(__dirname, '../agent/tools.cjs'));
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('file JS dengan syntax error return { ok: false } + error message', async () => {
    const p = tmpFile('.js', 'const x = ;');
    const res = await qSyntaxOk(p);
    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe('string');
    expect(res.error.length).toBeGreaterThan(0);
  });

  it('file JSON valid return { ok: true }', async () => {
    const p = tmpFile('.json', '{"a":1,"b":2}');
    const res = await qSyntaxOk(p);
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('file JSON invalid return { ok: false }', async () => {
    const p = tmpFile('.json', '{a:1, b:2,}');
    const res = await qSyntaxOk(p);
    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe('string');
    expect(res.error.length).toBeGreaterThan(0);
  });
});