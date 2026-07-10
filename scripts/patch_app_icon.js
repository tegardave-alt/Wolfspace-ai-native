const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'public', 'app.jsx');
let t = fs.readFileSync(file, 'utf8');
const old = `              <span\n                className="ar-fs-icon"\n                style={((id) =>\n                  id === "WOLFSPACE"\n                    ? {\n                        background: "rgba(139,109,255,0.12)",\n                        color: "#8b6dff",\n                        padding: "6px",\n                        borderRadius: "8px",\n                        display: "inline-flex",\n                      }\n                    : id === "opencode"\n                      ? {\n                          background: "rgba(16,185,129,0.12)",\n                          color: "#10b981",\n                          padding: "6px",\n                          borderRadius: "8px",\n                          display: "inline-flex",\n                        }\n                    : id === "claude"\n                        ? {\n                            background: "rgba(217,119,87,0.12)",\n                            color: "#D97757",\n                            padding: "6px",\n                            borderRadius: "8px",\n                            display: "inline-flex",\n                          }\n                        : {})(fsId)}\n              >\n                {((id) =>\n                  id === "WOLFSPACE"\n                    ? SB.quantumAgent\n                    : id === "opencode"\n                      ? SB.opencode\n                      : id === "claude"\n                        ? SB.claude\n                        : SB.runner)(fsId)({ width: 22, height: 22 })}\n              </span>\n`;
const rep = `              <span className="ar-fs-icon" style={getAgentStyle(fsId)}>\n                {getAgentIcon(fsId)({ width: 22, height: 22 })}\n              </span>\n`;
if (t.indexOf(old) === -1) {
  console.error('Old block not found; aborting');
  process.exit(1);
}
const nt = t.replace(old, rep);
fs.writeFileSync(file, nt, 'utf8');
console.log('patched');

