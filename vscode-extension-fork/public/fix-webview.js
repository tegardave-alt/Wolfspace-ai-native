const fs = require('fs');
const path = require('path');
const filePath = path.join(__dirname, '..', 'quantum-vscode', 'src', 'webviewProvider.ts');
let content = fs.readFileSync(filePath, 'utf8');
const oldStr = '/```(\\w*)\\n?([\\s\\S]*?)```/g';
const newStr = '/\\x60\\x60\\x60(\\w*)\\n?([\\s\\S]*?)\\x60\\x60\\x60/g';
content = content.replace(oldStr, newStr);
fs.writeFileSync(filePath, content, 'utf8');
console.log('done');
