const fs = require('fs');  
let c = fs.readFileSync('../web/app.jsx', 'utf8');  
const old1 = 'const [theme, setTheme] = useState(() => { try { return localStorage.getItem(\"quantum_theme\") || \"dark\"; } catch(e){ return \"dark\"; } });';  
const new1 = old1 + '\n  const [mode, setMode] = useState(() => { try { return localStorage.getItem(\"quantum_mode\") || \"plan\"; } catch (e) { return \"plan\"; } });';  
if (c.includes(old1)) { c = c.replace(old1, new1); console.log('Change 3 OK'); } else { console.log('Change 3 SKIP'); }  
const old2 = 'await streamSelfAgent({ history:newHist, cloud:getCloud(), port:modelVal }, (j)=>{';  
const new2 = 'await streamSelfAgent({ history:newHist, cloud:getCloud(), port:modelVal, mode }, (j)=>{';  
if (c.includes(old2)) { c = c.replace(old2, new2); console.log('Change 4 OK'); } else { console.log('Change 4 SKIP'); }  
fs.writeFileSync('../web/app.jsx', c);  