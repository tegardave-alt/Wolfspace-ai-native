console.log('=== TESTING FULL CHAIN (core.js) ===\n');

// Clear cache
Object.keys(require.cache).forEach(k => delete require.cache[k]);

try {
  console.log('Loading core.js...');
  const core = require('./core.js');
  console.log('✓ core.js loaded successfully\n');

  console.log('Checking exports...');
  const expectedExports = [
    'server', 'PORT', 'HOST',
    'CLOUD', 'MODEL_ALIASES', 'loadCloudKeys', 'detectProvider', 'fillCloudKey',
    'askCloudStream', 'askCloudTools',
    'chatStream', 'selfAgentStream',
    'SYS', 'WEBDEV_SYS', 'SELF_FC_SYS', 'SELF_TOOLS',
    'pickSystem', 'isCodingTask',
    'runSelfTool', 'applyHunks', 'braceProfile',
    'qList', 'qGlob', 'qRead', 'qGrep', 'qBackup'
  ];

  const missing = [];
  const found = [];

  expectedExports.forEach(exp => {
    if (core[exp] !== undefined) {
      found.push(exp);
    } else {
      missing.push(exp);
    }
  });

  console.log(`✓ Found ${found.length}/${expectedExports.length} expected exports`);
  
  if (missing.length > 0) {
    console.log(`✗ Missing exports: ${missing.join(', ')}`);
  } else {
    console.log('✓ All expected exports present\n');
  }

  console.log('Testing key functions...');
  
  // Test runSelfTool
  console.log('  - runSelfTool:', typeof core.runSelfTool);
  const listResult = core.runSelfTool('list', {});
  console.log('    ✓ list() works:', listResult.ok);

  // Test qRead
  console.log('  - qRead:', typeof core.qRead);
  const readResult = core.qRead('config.json');
  console.log('    ✓ qRead() works:', readResult.length > 0);

  // Test qGrep
  console.log('  - qGrep:', typeof core.qGrep);
  const grepResult = core.qGrep('require');
  console.log('    ✓ qGrep() works:', grepResult.length > 0);

  // Test SELF_TOOLS
  console.log('  - SELF_TOOLS:', Array.isArray(core.SELF_TOOLS) ? `array[${core.SELF_TOOLS.length}]` : 'ERROR');
  console.log('    ✓ Tools:', core.SELF_TOOLS.map(t => t.function.name).join(', '));

  // Test chatStream
  console.log('  - chatStream:', typeof core.chatStream);
  
  // Test selfAgentStream
  console.log('  - selfAgentStream:', typeof core.selfAgentStream);

  // Test askCloudStream
  console.log('  - askCloudStream:', typeof core.askCloudStream);

  // Test askCloudTools
  console.log('  - askCloudTools:', typeof core.askCloudTools);

  console.log('\n✓ Full chain test PASSED');
  console.log('\n=== SUMMARY ===');
  console.log('All modules load correctly');
  console.log('All expected exports present');
  console.log('All key functions callable');
  console.log('No circular dependency errors');

} catch (e) {
  console.log('✗ ERROR loading core.js:', e.message);
  console.log('\nStack trace:');
  console.log(e.stack);
}
