var fs=require('fs');var c=fs.readFileSync('agent/public/app.jsx','utf8');var s='Live agent process';var idx=c.indexOf(s);console.log('found at:',idx); 
