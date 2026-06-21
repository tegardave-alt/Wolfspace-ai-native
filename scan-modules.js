const fs = require('fs');
const path = require('path');

console.log('=== SCANNING ALL AGENT MODULES ===\n');

const agentDir = path.join(__dirname, 'agent');
const files = fs.readdirSync(agentDir).filter(f => f.endsWith('.cjs'));

const results = [];

for (const file of files) {
  const filePath = path.join(agentDir, file);
  try {
    // Clear cache
    Object.keys(require.cache).forEach(k => delete require.cache[k]);
    
    const mod = require(filePath);
    const exports = Object.keys(mod);
    
    results.push({
      file,
      status: 'OK',
      exports: exports.length,
      exportNames: exports.slice(0, 10).join(', ') + (exports.length > 10 ? '...' : '')
    });
  } catch (e) {
    results.push({
      file,
      status: 'ERROR',
      error: e.message
    });
  }
}

results.forEach(r => {
  if (r.status === 'OK') {
    console.log('✓', r.file, '-', r.exports, 'exports:', r.exportNames);
  } else {
    console.log('✗', r.file, '-', r.error);
  }
});

console.log('\n=== SUMMARY ===');
console.log('Total files:', files.length);
console.log('OK:', results.filter(r => r.status === 'OK').length);
console.log('Errors:', results.filter(r => r.status === 'ERROR').length);
