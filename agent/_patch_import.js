const fs = require('fs');  
const path = require('path');  
const file = path.join(__dirname, '..', 'server', 'server.cjs');  
let c = fs.readFileSync(file, 'utf8');  
const old = \"const { selfAgentStream } = require('../core/agent/self_agent.cjs');\";  
const neu = \"const { selfAgentStream } = require('../agent/self_agent.cjs');\";  
if (c.includes(old)) { c = c.replace(old, neu); fs.writeFileSync(file, c); console.log('OK'); } else { console.log('SKIP or ERROR'); }  
