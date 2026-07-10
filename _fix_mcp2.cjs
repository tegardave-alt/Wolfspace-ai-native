const fs = require('fs');

// Fix agent/public/app.jsx - uses CRLF line endings
let c = fs.readFileSync('C:\\Users\\dave\\WOLFSPACE\\agent\\public\\app.jsx', 'utf8');

const oldBtn = '<button\r\n        className="topbar-btn"\r\n        onClick={() => setTab("terminal")}\r\n        title="Terminal"\r\n        style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: "6px" }}\r\n      >\r\n        <Icon.terminal style={{ width: 18, height: 18 }} />\r\n      </button>';

const newBtn = '<button\r\n        className="topbar-btn"\r\n        onClick={() => {}}\r\n        title="MCP Server"\r\n        style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: "6px" }}\r\n      >\r\n        <svg viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18 }}>\r\n          <rect x="2" y="2" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />\r\n          <rect x="14" y="2" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />\r\n          <rect x="2" y="14" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />\r\n          <rect x="14" y="14" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="2" />\r\n          <path d="M10 6h4M6 10v4M18 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />\r\n        </svg>\r\n      </button>';

if (c.includes(oldBtn)) {
  c = c.replace(oldBtn, newBtn);
  fs.writeFileSync('C:\\Users\\dave\\WOLFSPACE\\agent\\public\\app.jsx', c, 'utf8');
  console.log('agent/public/app.jsx: REPLACED successfully!');
} else {
  console.log('agent/public/app.jsx: exact match not found');
  // Debug: show what's around that area
  let idx = c.indexOf('className="topbar-btn"');
  if (idx >= 0) {
    console.log('Found topbar-btn at idx', idx);
    let snippet = c.substring(idx, idx + 350);
    console.log('Snippet bytes:', Buffer.from(snippet).toString('hex').substring(0, 200));
  }
}

