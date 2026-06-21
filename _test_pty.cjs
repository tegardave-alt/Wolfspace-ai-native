const pty = require('./node_modules/node-pty');
console.log('node-pty loaded, spawn type:', typeof pty.spawn);
const proc = pty.spawn('cmd.exe', [], {name:'xterm', cols:80, rows:30});
proc.onData(d => process.stdout.write(d));
proc.write('echo HELLO_FROM_PTY\r\n');
setTimeout(() => { proc.kill(); process.exit(0); }, 1000);
