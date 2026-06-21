const path = require('path');

console.log('=== TESTING ALL 12 TOOLS INDIVIDUALLY ===\n');

// Clear cache
Object.keys(require.cache).forEach(k => delete require.cache[k]);

const tools = require('./agent/tools.cjs');
const { runSelfTool, SELF_TOOLS } = tools;

const tests = [
  { name: 'list', args: {} },
  { name: 'glob', args: { pattern: '*.cjs' } },
  { name: 'read', args: { path: 'config.json' } },
  { name: 'grep', args: { pattern: 'require' } },
  { name: 'bash', args: { command: 'echo "test"' } },
  { name: 'todowrite', args: { todos: [{ content: 'Test task', status: 'pending' }] } },
  { name: 'question', args: { question: 'Test question?', choices: ['Yes', 'No'] } },
];

console.log('Testing sync tools...\n');

tests.forEach(test => {
  try {
    const result = runSelfTool(test.name, test.args);
    
    // Handle Promise results
    if (result && typeof result.then === 'function') {
      console.log(`⏳ ${test.name} - returned Promise (async)`);
    } else {
      const ok = result.ok ? '✓' : '✗';
      const output = (result.output || '').slice(0, 80).replace(/\n/g, ' ');
      console.log(`${ok} ${test.name} - ok:${result.ok}, edited:${!!result.edited}, output:"${output}..."`);
    }
  } catch (e) {
    console.log(`✗ ${test.name} - ERROR: ${e.message}`);
  }
});

console.log('\n=== TESTING ASYNC TOOLS ===\n');

async function testAsyncTools() {
  // Test web_search
  try {
    console.log('Testing web_search...');
    const result = await runSelfTool('web_search', { query: 'node.js test' });
    const ok = result.ok ? '✓' : '✗';
    const output = (result.output || '').slice(0, 100).replace(/\n/g, ' ');
    console.log(`${ok} web_search - ok:${result.ok}, output:"${output}..."`);
  } catch (e) {
    console.log(`✗ web_search - ERROR: ${e.message}`);
  }

  // Test web_fetch
  try {
    console.log('Testing web_fetch...');
    const result = await runSelfTool('web_fetch', { url: 'https://example.com' });
    const ok = result.ok ? '✓' : '✗';
    const output = (result.output || '').slice(0, 100).replace(/\n/g, ' ');
    console.log(`${ok} web_fetch - ok:${result.ok}, output:"${output}..."`);
  } catch (e) {
    console.log(`✗ web_fetch - ERROR: ${e.message}`);
  }
}

testAsyncTools().then(() => {
  console.log('\n=== TESTING WRITE/EDIT (with safety) ===\n');
  
  // Test write (create temp file)
  try {
    const result = runSelfTool('write', { 
      path: 'public/test-temp.js', 
      content: 'console.log("test");' 
    });
    const ok = result.ok ? '✓' : '✗';
    console.log(`${ok} write - ok:${result.ok}, edited:${!!result.edited}, output:"${result.output}"`);
  } catch (e) {
    console.log(`✗ write - ERROR: ${e.message}`);
  }

  // Test edit (modify temp file)
  try {
    const result = runSelfTool('edit', { 
      path: 'public/test-temp.js',
      old_string: 'console.log("test");',
      new_string: 'console.log("edited");'
    });
    const ok = result.ok ? '✓' : '✗';
    console.log(`${ok} edit - ok:${result.ok}, edited:${!!result.edited}, output:"${result.output}"`);
  } catch (e) {
    console.log(`✗ edit - ERROR: ${e.message}`);
  }

  // Cleanup
  try {
    const fs = require('fs');
    fs.unlinkSync(path.join(__dirname, 'public', 'test-temp.js'));
    console.log('✓ Cleanup - removed test-temp.js');
  } catch (e) {
    console.log(`✗ Cleanup - ERROR: ${e.message}`);
  }

  console.log('\n=== SELF_TOOLS DEFINITIONS ===\n');
  console.log(`Total tools defined: ${SELF_TOOLS.length}`);
  SELF_TOOLS.forEach(t => {
    console.log(`  - ${t.function.name}: ${t.function.description.slice(0, 60)}...`);
  });

  console.log('\n=== ALL TESTS COMPLETE ===');
});
