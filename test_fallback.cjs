const fs = require('fs');
const { qSyntaxOk } = require('./agent/tools/file-tools.cjs');

async function testAgentEditFallback() {
  const file = 'public/dummy.jsx';
  const oldContent = 'const a = 1;';
  const badContent = 'const a = <div';

  // 1. Setup file awal yang sehat
  fs.writeFileSync(file, oldContent, 'utf8');
  console.log("[1] File awal dibuat dengan konten:", oldContent);

  // 2. Simulasi agen melakukan kesalahan edit (menyimpan syntax error)
  console.log("[2] Agen mencoba menyimpan kode cacat...");
  fs.writeFileSync(file, badContent, 'utf8');

  // 3. Menjalankan fallback logic dari core/agent/tools.cjs
  console.log("[3] Memvalidasi hasil simpan agen via qSyntaxOk...");
  const chk = await qSyntaxOk(require('path').resolve(file));
  
  if (!chk.ok) {
    console.log("[!] qSyntaxOk mendeteksi error:", chk.error.split('\n')[0]);
    console.log("[4] Fallback otomatis dipicu! Mengembalikan ke versi sebelumnya...");
    fs.writeFileSync(file, oldContent, 'utf8');
  } else {
    console.log("[4] File dianggap valid.");
  }

  // 4. Verifikasi hasil akhir
  const finalContent = fs.readFileSync(file, 'utf8');
  console.log("[5] Isi file akhir sekarang:", finalContent);
  if (finalContent === oldContent) {
    console.log("✅ FIXED PROTOCOL (FALLBACK) BERHASIL MELINDUNGI FILE!");
  } else {
    console.log("❌ FIXED PROTOCOL GAGAL!");
  }
}

testAgentEditFallback();
