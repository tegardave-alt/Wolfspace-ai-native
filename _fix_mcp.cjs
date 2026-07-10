const fs = require('fs');
const path = require('path');

const files = [
  'C:\\Users\\dave\\WOLFSPACE\\public\\app.jsx',
  'C:\\Users\\dave\\WOLFSPACE\\agent\\public\\app.jsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace the Terminal button in public/app.jsx (uses setTerminalOpen)
  const old1 = content.match(/<button\s*\n\s*className="topbar-btn"\s*\n\s*onClick=\{\(\) => setTerminalOpen\(!terminalOpen\)\}\s*\n\s*title="Terminal"\s*\n\s*style=\{.*?\}\s*\n\s*>\s*\n\s*<Icon\.terminal style=\{.*?\}\s*\/>\s*\n\s*<\/button>/);
  
  if (old1) {
    console.log('Found Terminal button in public/app.jsx');
    const replacement = `<button
        className="topbar-btn"
        onClick={() => {}}
        title="MCP Server"
        style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: "6px" }}
      >
        <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18 }}>
          <rect x="2" y="2" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
          <rect x="14" y="2" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
          <rect x="2" y="14" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
          <rect x="14" y="14" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />
          <path d="M10 6h4M6 10v4M18 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>`;
    
    // Preserve the original indentation
    const indent = old1[0].match(/^([ \t]+)/);
    if (indent) {
      const lines = replacement.split('\n');
      const replaced = lines.map((line, i) => i === 0 ? line : indent[1] + line.trimStart()).join('\n');
      content = content.replace(old1[0], replaced);
    } else {
      content = content.replace(old1[0], replacement);
    }
    console.log('Replaced in public/app.jsx');
  }
  
  // Replace the Terminal button in agent/public/app.jsx (uses setTab("terminal"))
  const old2 = content.match(/<button\s*\n\s*className="topbar-btn"\s*\n\s*onClick=\{\(\) => setTab\("terminal"\)\}\s*\n\s*title="Terminal"\s*\n\s*style=\{.*?\}\s*\n\s*>\s*\n\s*<Icon\.terminal style=\{.*?\}\s*\/>\s*\n\s*<\/button>/);
  
  if (old2) {
    console.log('Found Terminal button in agent/public/app.jsx');
    // Already handled in the same content replacement above
  }
  
  fs.writeFileSync(file, content, 'utf8');
  console.log('Saved:', file);
}

console.log('Done');

