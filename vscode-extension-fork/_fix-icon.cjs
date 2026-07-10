const fs = require('fs');
let c = fs.readFileSync('C:\\Users\\dave\\Quantum\\quantum-vscode\\package.json', 'utf8');
c = c.replace('\"icon\": \"icon.png\"', '\"icon\": \"quantum-icon.svg\"');
fs.writeFileSync('C:\\Users\\dave\\Quantum\\quantum-vscode\\package.json', c);
console.log('package.json updated');
