var fs=require('fs');var c=fs.readFileSync('agent/public/app.jsx');var idx=c.indexOf('    </aside>');console.log(JSON.stringify(c.slice(idx-100,idx+100))); 
