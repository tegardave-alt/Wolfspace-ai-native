const fs = require('fs');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <circle cx="16" cy="16" r="14" fill="#7C3AED" stroke="#5B21B6" stroke-width="2"/>
  <text x="16" y="22" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="bold" fill="#FFFFFF">Q</text>
</svg>`;
fs.writeFileSync('C:\\Users\\dave\\Quantum\\quantum-vscode\\quantum-icon.svg', svg);
console.log('SVG created');
