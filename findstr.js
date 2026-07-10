var fs=require('fs');var c=fs.readFileSync('agent/public/app.jsx','utf8');var idx=c.indexOf('    </aside>');var target=c.slice(idx-200,idx+5);console.log(JSON.stringify(target)); 
