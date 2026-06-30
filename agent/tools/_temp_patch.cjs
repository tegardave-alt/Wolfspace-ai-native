const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'index.cjs');
let content = fs.readFileSync(filePath, 'utf8');

// Add import after SELF_TOOLS line
const targetLine = "const { SELF_TOOLS } = require('./tool-definitions.cjs');";
const insertLine = "const { validateOperation } = require('./sandbox-validator.cjs');";

if (!content.includes(insertLine)) {
  content = content.replace(targetLine, targetLine + '\n' + insertLine);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Added validateOperation import');
} else {
  console.log('Import already exists');
}
