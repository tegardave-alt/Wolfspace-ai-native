const fs = require('fs');  
const f = '../web/app.jsx';  
let c = fs.readFileSync(f, 'utf8');  
let changed = false; 
