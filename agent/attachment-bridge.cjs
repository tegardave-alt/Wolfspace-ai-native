// Jembatan penyerahan berkas: barangnya menyeberang, alamatnya tidak.
//
// MASALAH YANG DITUTUP. Attach hari ini mengunggah berkas ke
// <WOLFSPACE>/public/uploads/ lalu menyisipkan PATH-nya ke pesan agent. Saat
// agent dikurung ke satu worktree, path itu berada di luar cakupan, broker
// menolaknya, dan fitur attach jadi mati justru oleh pengurungan yang benar.
//
// Memberi agent akses ke folder uploads akan "memperbaikinya" dengan cara
// melonggarkan pengurungan — menambah root kedua. Modul ini menempuh jalan
// sebaliknya: pengurungan tak disentuh sama sekali, dan yang diubah adalah APA
// yang menyeberang.
//
// PRINSIPNYA: alamatnya tidak dihapus — ia TAK PERNAH MASUK.
//
// serahkan() hanya menerima ISI dan NAMA. Tak ada parameter path, jadi tak ada
// path yang perlu dibuang, dibersihkan, atau dijaga agar tak bocor. Sesuatu yang
// tak pernah ada tak bisa bocor lewat bug, tak bisa terbawa di log, dan tak bisa
// ditebak oleh pemanggil mana pun. Ini bedanya dengan menyimpan peta
// handle->path lalu menjaganya: peta itu tetap pintu, cuma dijaga.
//
// AKIBAT YANG DISENGAJA. Sesudah penyerahan, tak ada apa pun di sistem yang tahu
// berkas itu berasal dari mana. Permintaan "ambilkan lagi sesuatu dari direktori
// itu" karena itu bukan DITOLAK, melainkan tak punya jalan: tak ada path
// tersimpan, tak ada direktori yang diketahui, tak ada handle untuk berkas yang
// belum diserahkan user. Penolakannya ketiadaan, bukan keputusan.
//
// TEMPAT TINGGAL SALINANNYA: memori proses backend. Di mode Electron backend
// hidup di proses MAIN, sehingga lampiran BERTAHAN melewati reload renderer —
// dan reload cukup sering terjadi di WOLFSPACE (rollback otomatis, hot-reload).
// Ia mati bersama aplikasi. Tak pernah menyentuh disk, jadi tak ada sisa yang
// perlu dibersihkan dan tak ada berkas yang mengotori folder proyek.

"use strict";

const crypto = require("crypto");

// Batas dijaga karena isinya tinggal di memori proses pemilik jendela.
const MAKS_PER_BERKAS = 8 * 1024 * 1024; // 8 MB
const MAKS_TOTAL = 32 * 1024 * 1024; // seluruh sesi
const MAKS_JUMLAH = 50;

// Singleton di globalThis, sama seperti mcp-client: hot-reload backend membuang
// require.cache, dan tanpa ini seluruh lampiran user lenyap di tengah sesi
// hanya karena sebuah berkas sumber tersentuh.
const _G = globalThis;
if (!_G.__wolfspaceLampiran) _G.__wolfspaceLampiran = new Map();
const _simpan = _G.__wolfspaceLampiran;

// Nama file, BUKAN lokasi.
//
// Di renderer Electron, objek File punya `.path` non-standar berisi path absolut
// asli. Sekalipun pemanggil keliru mengirimkannya ke sini sebagai `nama`, fungsi
// ini memotongnya jadi nama berkas saja: huruf drive, pemisah Windows maupun
// POSIX, dan segmen `..` semuanya rontok. Jadi kebocoran alamat tak bergantung
// pada kedisiplinan pemanggil.
function _namaAman(nama) {
  let s = String(nama == null ? "" : nama);
  s = s.replace(/^[A-Za-z]:/, ""); // C:\... -> \...
  s = s.split(/[\\/]/).pop() || ""; // ambil segmen TERAKHIR saja
  s = s.replace(/^\.+/, ""); // ".." / ".hidden" -> buang titik depan
  s = s.replace(/[\x00-\x1f]/g, "").trim();
  return s.slice(0, 120) || "tanpa-nama";
}

function _totalByte() {
  let n = 0;
  for (const v of _simpan.values()) n += v.isi.length;
  return n;
}

/**
 * Menyerahkan satu berkas ke sisi agent.
 *
 * TIDAK ADA parameter path — itu inti modul ini, bukan kelalaian.
 *
 * @param {object} b
 * @param {string} b.nama  nama tampilan; dipotong jadi basename apa pun isinya
 * @param {Buffer|Uint8Array|string} b.isi  ISI berkas, sudah dibaca pemanggil
 * @param {string} [b.tipe] MIME dari pemilih berkas, sekadar keterangan
 * @returns {{ok:boolean, id?:string, nama?:string, bytes?:number, tipe?:string, error?:string}}
 */
function serahkan(b) {
  const nama = _namaAman(b && b.nama);
  const mentah = b && b.isi;
  if (mentah == null) return { ok: false, error: "isi kosong" };

  const isi = Buffer.isBuffer(mentah)
    ? mentah
    : typeof mentah === "string"
      ? Buffer.from(mentah, "utf8")
      : Buffer.from(mentah);

  if (isi.length > MAKS_PER_BERKAS)
    return {
      ok: false,
      error:
        "berkas " +
        Math.round(isi.length / 1024) +
        " KB melebihi batas " +
        MAKS_PER_BERKAS / 1024 / 1024 +
        " MB",
    };
  if (_simpan.size >= MAKS_JUMLAH)
    return { ok: false, error: "lampiran sesi sudah " + MAKS_JUMLAH };
  if (_totalByte() + isi.length > MAKS_TOTAL)
    return {
      ok: false,
      error: "total lampiran sesi melebihi " + MAKS_TOTAL / 1024 / 1024 + " MB",
    };

  // Acak dan panjang: handle adalah kapabilitasnya. Handle yang bisa ditebak
  // sama saja dengan tak ada penjaga — agent tinggal mencoba id berurutan.
  const id = "att_" + crypto.randomBytes(12).toString("hex");

  _simpan.set(id, {
    nama,
    isi,
    tipe: String((b && b.tipe) || "") || null,
    ts: Date.now(),
  });

  // Yang dikembalikan sengaja TIDAK memuat apa pun tentang asal berkas.
  return { ok: true, id, nama, bytes: isi.length, tipe: (b && b.tipe) || null };
}

// Berkas biner tak dikembalikan sebagai teks maupun base64.
//
// PDF 240 KB jadi ~320 KB base64 — sekitar 80 ribu token, membakar seluruh
// jendela konteks untuk sesuatu yang tetap tak terbaca model. Lebih jujur
// mengembalikan keterangan yang bisa ditindaklanjuti.
function _tampakBiner(buf) {
  const n = Math.min(buf.length, 4096);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true; // NUL = biner
  return false;
}

/**
 * Membaca isi lampiran yang SUDAH diserahkan.
 *
 * Yang dibaca adalah SALINAN yang sudah menyeberang, bukan berkas di disk asal —
 * jadi pembacaan berulang tak pernah menyentuh direktori mana pun. Karena itu
 * handle sengaja boleh dipakai berkali-kali: konteks agent kerap terpotong dan
 * ia perlu membaca ulang, sementara membaca ulang di sini tak menambah akses
 * apa pun.
 */
function ambil(id) {
  const a = _simpan.get(String(id || ""));
  if (!a) return { ok: false, error: "lampiran tak dikenal: " + id };
  if (_tampakBiner(a.isi))
    return {
      ok: false,
      biner: true,
      nama: a.nama,
      bytes: a.isi.length,
      error:
        "berkas biner (" +
        a.nama +
        ", " +
        a.isi.length +
        " byte) — tak bisa dibaca sebagai teks",
    };
  return {
    ok: true,
    nama: a.nama,
    bytes: a.isi.length,
    isi: a.isi.toString("utf8"),
  };
}

// Daftar lampiran yang ada. Sengaja hanya metadata — tak ada isi, dan yang
// terpenting tak ada asal. Dipakai UI untuk menampilkan apa yang sudah
// diserahkan.
function daftar() {
  return [..._simpan.entries()].map(([id, a]) => ({
    id,
    nama: a.nama,
    bytes: a.isi.length,
    tipe: a.tipe,
    ts: a.ts,
  }));
}

function lupakan(id) {
  return _simpan.delete(String(id || ""));
}

function bersihkan() {
  _simpan.clear();
}

module.exports = {
  serahkan,
  ambil,
  daftar,
  lupakan,
  bersihkan,
  _namaAman,
  MAKS_PER_BERKAS,
  MAKS_TOTAL,
  MAKS_JUMLAH,
};
