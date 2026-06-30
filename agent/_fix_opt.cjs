const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'self_agent.cjs');
let content = fs.readFileSync(filePath, 'utf8');

// Replace the optimized prompt logic
const oldBlock = `\t  // Use DSpy-optimized system prompt if cached, else fallback to original
\t  let optPrompt = getOptimized();
\t  if (optPrompt) {
\t    dlog('self', 'info', 'using optimized system prompt', { originalChars: SELF_FC_SYS.length, optimizedChars: optPrompt.length });
\t  } else {
\t    // Trigger background optimization for next time (non-blocking)
\t    setImmediate(() => optimizeInBackground(SELF_FC_SYS));
\t  }
\t  const currentSysPrompt = optPrompt || SELF_FC_SYS;`;

const newBlock = `\t  // Use optimized system prompt from config/prompts.json if cached, else fallback to original
\t  let optPrompt = loadSelfAgentOptimized();
\t  if (optPrompt) {
\t    dlog('self', 'info', 'using optimized system prompt', { originalChars: SELF_FC_SYS.length, optimizedChars: optPrompt.length });
\t  } else {
\t    // Trigger background optimization for next time (non-blocking)
\t    const { optimizeInBackground } = require('./sysprompt_opt.cjs');
\t    setImmediate(() => {
\t      optimizeInBackground(SELF_FC_SYS).then(result => {
\t        if (result) saveSelfAgentOptimized(result, SELF_FC_SYS.length);
\t      }).catch(() => {});
\t    });
\t  }
\t  const currentSysPrompt = optPrompt || SELF_FC_SYS;`;

if (content.indexOf(oldBlock) === -1) {
  console.error('ERROR: oldBlock not found');
  // Show first attempt with spaces
  const oldBlock2 = `  // Use DSpy-optimized system prompt if cached, else fallback to original
  let optPrompt = getOptimized();
  if (optPrompt) {
    dlog('self', 'info', 'using optimized system prompt', { originalChars: SELF_FC_SYS.length, optimizedChars: optPrompt.length });
  } else {
    // Trigger background optimization for next time (non-blocking)
    setImmediate(() => optimizeInBackground(SELF_FC_SYS));
  }
  const currentSysPrompt = optPrompt || SELF_FC_SYS;`;
  if (content.indexOf(oldBlock2) >= 0) {
    console.log('Using spaces version');
    content = content.replace(oldBlock2, newBlock.replace(/\t/g, '  '));
  } else {
    // Show surrounding text
    const idx = content.indexOf('Use DSpy-optimized');
    if (idx >= 0) {
      console.log('Found at', idx, 'surrounding:');
      console.log(JSON.stringify(content.slice(idx-10, idx+200)));
    } else {
      console.log('Not found at all. Searching for getOptimized...');
      const idx2 = content.indexOf('getOptimized');
      if (idx2 >= 0) {
        console.log('Found getOptimized at', idx2);
        console.log(JSON.stringify(content.slice(idx2-50, idx2+100)));
      } else {
        console.log('getOptimized not found either');
      }
    }
    process.exit(1);
  }
} else {
  content = content.replace(oldBlock, newBlock);
}

fs.writeFileSync(filePath, content, 'utf8');
const newIdx = content.indexOf('loadSelfAgentOptimized');
console.log('OK: replacement ' + (newIdx >= 0 ? 'found at ' + newIdx : 'NOT FOUND'));
console.log('size=' + fs.statSync(filePath).size);
