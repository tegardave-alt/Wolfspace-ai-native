const { createSnapshot, rollback, listSnapshots } = require('./agent/snapshot.cjs');
const { safeWriteFile } = require('./agent/safe-edit.cjs');
const fs = require('fs');
const path = require('path');

const testFile = path.join(__dirname, 'test_safedit.py');

// Setup: buat file awal
fs.writeFileSync(testFile, 'print("hello world")', 'utf8');

console.log('=== Test 1: Tulis kode VALID ===');
const r1 = safeWriteFile(testFile, 'print("updated and valid")');
console.log('ok:', r1.ok, '| snapshotId:', r1.snapshotId);

console.log('\n=== Test 2: Tulis kode RUSAK (syntax error) ===');
const badCode = 'def broken(\nprint("ini syntax error"';
const r2 = safeWriteFile(testFile, badCode);
console.log('ok:', r2.ok);
console.log('error:', r2.error ? r2.error.split('\n')[0] : '-');
console.log('quarantineFile:', r2.quarantineFile || '-');

console.log('\n=== Test 3: Verifikasi isi file TIDAK berubah setelah edit rusak ===');
const contents = fs.readFileSync(testFile, 'utf8');
console.log('Isi file:', contents.trim());
const passed = contents.trim() === 'print("updated and valid")';
console.log('Test ROLLBACK PASSED?', passed ? 'YA ✅' : 'TIDAK ❌');

console.log('\n=== Test 4: Daftar snapshots ===');
const snaps = listSnapshots();
console.log('Jumlah snapshots tersimpan:', snaps.length);
snaps.slice(0, 3).forEach(s => console.log(' -', s.id, '|', s.label, '| files:', s.files.join(',')));

// Bersihkan
fs.rmSync(testFile, { force: true });
console.log('\n=== Semua test selesai ===');
