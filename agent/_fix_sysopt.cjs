const fs = require('fs');
const path = require('path');

const filePath = path.join(process.cwd(), 'sysprompt_opt.cjs');
let content = fs.readFileSync(filePath, 'utf8');

// Replace loadCache function
const oldCache = [
  'function loadCache() {',
  '  try {',
  '    if (fs.existsSync(CACHE_FILE)) {',
  '      const data = JSON.parse(fs.readFileSync(CACHE_FILE, \'utf8\'));',
  '      if (data.optimized && data.timestamp && (Date.now() - data.timestamp) < CACHE_TTL_MS) {',
  '        console.log(\'[sysprompt] loaded cached optimized prompt (\' + data.optimized.length + \' chars, saved \' + (data.originalLength - data.optimized.length) + \' chars)\');',
  '        return data.optimized;',
  '      }',
  '    }',
  '  } catch (_) {}',
  '  return null;',
  '}',
].join('\r\n');

const newCache = [
  'function loadCache() {',
  '  try {',
  '    if (fs.existsSync(CACHE_FILE)) {',
  '      const data = JSON.parse(fs.readFileSync(CACHE_FILE, \'utf8\'));',
  '      const opt = data.prompts && data.prompts.self_agent && data.prompts.self_agent.metadata && data.prompts.self_agent.metadata.optimized;',
  '      if (opt && opt.text && opt.timestamp && (Date.now() - opt.timestamp) < CACHE_TTL_MS) {',
  '        console.log(\'[sysprompt] loaded cached optimized prompt (\' + opt.text.length + \' chars, saved \' + (opt.originalLength - opt.text.length) + \' chars)\');',
  '        return opt.text;',
  '      }',
  '    }',
  '  } catch (_) {}',
  '  return null;',
  '}',
].join('\r\n');

if (content.indexOf(oldCache) < 0) {
  console.error('ERROR: oldCache not found');
  // Try without \r
  const oldCache2 = oldCache.replace(/\r\n/g, '\n');
  const idx = content.indexOf('function loadCache()');
  console.log('loadCache at index:', idx);
  if (idx >= 0) {
    console.log('Surrounding:', JSON.stringify(content.slice(idx, idx+50)));
  }
  process.exit(1);
}

content = content.replace(oldCache, newCache);

// Replace saveCache function
const oldSave = [
  'function saveCache(optimized, originalLength) {',
  '  try {',
  '    fs.writeFileSync(CACHE_FILE, JSON.stringify({',
  '      optimized,',
  '      originalLength,',
  '      timestamp: Date.now()',
  '    }, null, 2), \'utf8\');',
  '    console.log(\'[sysprompt] cached optimized prompt to disk\');',
  '  } catch (_) {}',
  '}',
].join('\r\n');

const newSave = [
  'function saveCache(optimized, originalLength) {',
  '  try {',
  '    let cfg = {};',
  '    try { cfg = JSON.parse(fs.readFileSync(CACHE_FILE, \'utf8\')); } catch (_) {}',
  '    if (!cfg.prompts) cfg.prompts = {};',
  '    if (!cfg.prompts.self_agent) cfg.prompts.self_agent = { active: true, text: \'\', metadata: {} };',
  '    if (!cfg.prompts.self_agent.metadata) cfg.prompts.self_agent.metadata = {};',
  '    cfg.prompts.self_agent.metadata.optimized = {',
  '      text: optimized,',
  '      originalLength: originalLength,',
  '      timestamp: Date.now()',
  '    };',
  '    cfg.updatedAt = Date.now();',
  '    fs.writeFileSync(CACHE_FILE, JSON.stringify(cfg, null, 2), \'utf8\');',
  '    console.log(\'[sysprompt] cached optimized prompt to \' + CACHE_FILE);',
  '  } catch (_) {}',
  '}',
].join('\r\n');

if (content.indexOf(oldSave) < 0) {
  console.error('ERROR: oldSave not found');
  process.exit(1);
}

content = content.replace(oldSave, newSave);

fs.writeFileSync(filePath, content, 'utf8');
console.log('OK: sysprompt_opt.cjs updated, size=' + fs.statSync(filePath).size);
