const fs = require("fs");
const p = "agent/public/app.jsx";
let d = fs.readFileSync(p, "utf8");
// Replace the line with just whitespace and </span>
let lines = d.split(/\r?\n/);
let out = [];
for (let l of lines) {
  if (l.trim() === "\x3c/span\x3e") continue;
  out.push(l);
}
fs.writeFileSync(p, out.join("\r\n"), "utf8");
console.log("done");
