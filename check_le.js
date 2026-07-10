var fs=require('fs');var c=fs.readFileSync('agent/public/app.jsx');console.log('has CRLF:',c.indexOf('\r\n'));console.log('has LF only:',c.indexOf('\n')); 
