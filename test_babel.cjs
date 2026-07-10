const fileTools = require('./agent/tools/file-tools.cjs');
const fs = require('fs');

async function test() {
  // Buat file temp_test.jsx yang sintaksnya cacat
  fs.writeFileSync('temp_test.jsx', 'const a = <div');
  
  console.log("Memulai pengujian Babel...");
  const result = await fileTools.qSyntaxOk(require('path').resolve('temp_test.jsx'));
  console.log("Hasil qSyntaxOk:", result);
}
test();
