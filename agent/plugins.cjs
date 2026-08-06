// Sistem plugin — penemuan, manifest, dan izin.
//
// SATU ATURAN yang membentuk seluruh berkas ini:
//
//   siapa yang MEMASANG  ≠  apa yang boleh DIJANGKAU agent
//
// User bebas memasang apa pun, dari mana pun. Itu mesinnya. Yang diatur bukan
// pemasangannya, melainkan apa yang bisa dipanggil agent dan dengan kapabilitas
// apa. Pemisahan itu ada karena satu perbedaan dengan VS Code: di sana manusia
// yang menekan tombol, di sini MODEL yang memilih tool — dan model membaca isi
// berkas, keluaran tool, dan halaman web, yang semuanya bisa memuat kalimat
// berbunyi seperti perintah.
//
// Karena itu plugin yang izinnya belum disetujui tetap TERPASANG dan tetap
// terlihat di UI. Ia hanya tak punya tool sama sekali di mata model — bukan
// ditolak saat dipanggil, melainkan tak pernah muncul untuk dipanggil.
//
// BEDANYA DENGAN skills.cjs. Modul lama itu me-`require()` kode plugin ke dalam
// proses main — proses yang juga memiliki jendela Electron — lalu menjaga akses
// berkasnya dengan `startsWith(homedir())` sendiri, di luar broker. Di sini
// plugin adalah PERINTAH yang dijalankan sebagai server MCP di proses terpisah.
// Modul ini sengaja tidak pernah memuat kode plugin.

"use strict";

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const DIR_PLUGIN = path.join(AKAR, "plugins");

// Kapabilitas yang BOLEH diminta plugin. Sengaja daftar tertutup, bukan string
// bebas: kosakata ini harus sepadan dengan KOSAKATA_DEFAULT di
// broker/commandchain.cjs. Izin di luar daftar ditolak saat manifest dibaca,
// bukan diam-diam diabaikan lalu jadi kejutan waktu dipanggil.
const IZIN_DIKENAL = Object.freeze([
  "readFile",
  "writeFile",
  "fetch",
  "network:http",
  "network:https",
  "network:net",
  "network:tls",
  "network:dgram",
  "attachment.read",
]);

// proc.raw SENGAJA tak ada di daftar di atas. Plugin adalah proses terpisah yang
// sudah menjalankan perintahnya sendiri; memberinya shell mentah berarti
// menyerahkan lagi jalur yang justru dikurung sisa sistem ini.

function _amanNama(s) {
  return /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(String(s || ""));
}

/**
 * Baca dan VALIDASI satu manifest. Tak pernah melempar — manifest rusak adalah
 * keadaan biasa (user menyalin folder dari mana saja), bukan kecelakaan.
 *
 * @param {string} dir folder plugin
 * @returns {{ok: true, plugin: Plugin} | {ok: false, error: string}}
 */
function bacaManifest(dir) {
  const berkas = path.join(dir, "manifest.json");
  let mentah;
  try {
    mentah = fs.readFileSync(berkas, "utf8");
  } catch (e) {
    return { ok: false, error: "manifest.json tak terbaca: " + e.message };
  }

  let m;
  try {
    m = JSON.parse(mentah);
  } catch (e) {
    return { ok: false, error: "manifest.json bukan JSON valid: " + e.message };
  }

  const nama = m && m.nama;
  if (!_amanNama(nama)) {
    return {
      ok: false,
      error: "nama tak sah (huruf/angka/._- , maksimal 64): " + String(nama),
    };
  }

  // command WAJIB. Plugin dijalankan, bukan di-require — tak ada jalur "entry
  // file" yang dimuat ke dalam proses ini.
  if (!m.command || typeof m.command !== "string") {
    return { ok: false, error: "field 'command' wajib (perintah server MCP)" };
  }
  if (m.args != null && !Array.isArray(m.args)) {
    return { ok: false, error: "field 'args' harus array bila ada" };
  }

  const izin = Array.isArray(m.izin) ? m.izin : [];
  const asing = izin.filter((z) => !IZIN_DIKENAL.includes(z));
  if (asing.length) {
    return {
      ok: false,
      error:
        "izin tak dikenal: " +
        asing.join(", ") +
        " (yang sah: " +
        IZIN_DIKENAL.join(", ") +
        ")",
    };
  }

  return {
    ok: true,
    plugin: {
      nama,
      versi: String(m.versi || "0.0.0"),
      ket: String(m.ket || m.description || ""),
      command: m.command,
      args: m.args || [],
      izin,
      dir,
      // Diputuskan USER lewat UI, bukan oleh manifest. Manifest hanya MEMINTA.
      disetujui: false,
    },
  };
}

/**
 * Pindai folder plugins/. Yang manifestnya rusak TIDAK dibuang diam-diam — ia
 * ikut dikembalikan sebagai `rusak`, supaya UI bisa menunjukkan apa yang salah.
 * Plugin yang hilang tanpa jejak adalah persis cara skills.cjs jadi terlupakan.
 *
 * @returns {{plugin: Plugin[], rusak: {dir: string, error: string}[]}}
 */
function pindai() {
  const plugin = [];
  const rusak = [];
  let isi;
  try {
    isi = fs.readdirSync(DIR_PLUGIN, { withFileTypes: true });
  } catch (_) {
    return { plugin, rusak }; // folder belum ada: bukan galat
  }
  for (const d of isi) {
    if (!d.isDirectory() || d.name.startsWith(".")) continue;
    const dir = path.join(DIR_PLUGIN, d.name);
    const r = bacaManifest(dir);
    if (r.ok) plugin.push(r.plugin);
    else rusak.push({ dir: d.name, error: r.error });
  }
  plugin.sort((a, b) => a.nama.localeCompare(b.nama));
  return { plugin, rusak };
}

/**
 * Nama kapabilitas untuk satu plugin. Satu plugin = satu kapabilitas di kosakata
 * genesis, jadi `buatRuleset({ tanpa: ["plugin.kaggle"] })` mengunci plugin itu
 * untuk seluruh sesi — tak bisa dilonggarkan di tengah jalan.
 *
 * @param {string} nama
 * @returns {string}
 */
function kapabilitas(nama) {
  return "plugin." + String(nama);
}

// Berkas persetujuan. Ditulis UI saat user menyetujui izin sebuah plugin.
// Sengaja TERPISAH dari manifest: manifest ditulis penulis plugin dan hanya
// MEMINTA; berkas ini ditulis user dan MEMBERI. Menggabungkan keduanya berarti
// penulis plugin bisa menyetujui dirinya sendiri.
const BERKAS_SETUJU = path.join(DIR_PLUGIN, "_disetujui.json");

/**
 * Nama plugin yang izinnya sudah disetujui user. Tak pernah melempar: berkas
 * belum ada berarti belum ada yang disetujui — deny-by-default, sama seperti
 * ruleset kosong di CommandChain.
 *
 * @returns {string[]}
 */
function disetujui() {
  try {
    const j = JSON.parse(fs.readFileSync(BERKAS_SETUJU, "utf8"));
    const d = Array.isArray(j) ? j : j && j.disetujui;
    return Array.isArray(d) ? d.filter(_amanNama) : [];
  } catch (_) {
    return [];
  }
}

/**
 * Kapabilitas plugin yang layak masuk kosakata genesis.
 *
 * Syaratnya DUA, dan keduanya harus terpenuhi: plugin itu benar-benar ada di
 * disk dengan manifest sah, DAN user sudah menyetujuinya. Nama yang tercantum
 * di berkas persetujuan tapi plugin-nya sudah dihapus tidak menghasilkan
 * kapabilitas apa pun — persetujuan basi tak boleh menghidupkan sesuatu.
 *
 * @returns {string[]}
 */
function kapabilitasDisetujui() {
  const ada = new Set(pindai().plugin.map((p) => p.nama));
  return disetujui()
    .filter((n) => ada.has(n))
    .map(kapabilitas);
}

/**
 * Konfigurasi server MCP untuk plugin yang SUDAH DISETUJUI, dalam bentuk yang
 * sama dengan config/mcp.json.
 *
 * KENAPA BEGINI. mcp-client.cjs sudah menyelesaikan bagian yang sulit: spawn,
 * framing JSON-RPC, handshake, pembersihan proses yatim, berkas PID, lazy start,
 * dan bertahan melewati hot-reload backend. Menulis ulang semua itu untuk plugin
 * berarti mengulang "pola dua permukaan" yang sudah berkali-kali menggigit repo
 * ini — dua salinan yang harus diperbaiki bersamaan, dan salah satunya pasti
 * terlupa.
 *
 * Jadi plugin tidak punya peluncur sendiri. Ia menumpang jalur MCP yang sudah
 * ada, dan yang ditambahkan cuma gerbangnya.
 *
 * `cwd` sengaja diisi akar repo: manifest menulis args relatif
 * ("agent/mcp-servers/kaggle-mcp.cjs"), dan tanpa cwd tetap, perintahnya
 * bergantung pada dari mana WOLFSPACE dijalankan.
 *
 * @returns {Record<string, {command: string, args: string[], cwd: string, _plugin: true}>}
 */
function konfigMcp() {
  const out = {};
  const setuju = new Set(disetujui());
  for (const p of pindai().plugin) {
    if (!setuju.has(p.nama)) continue; // belum disetujui = tak pernah dinyalakan
    out[p.nama] = {
      command: p.command,
      args: p.args,
      cwd: AKAR,
      // Penanda supaya mcp-client tahu entri ini WAJIB lewat admission, beda
      // dari entri lama di config/mcp.json.
      _plugin: true,
    };
  }
  return out;
}

/**
 * Apakah nama server MCP ini berasal dari sebuah plugin (bukan config/mcp.json).
 *
 * SENGAJA memakai pindai(), BUKAN konfigMcp(). Perbedaannya menentukan arah
 * kegagalan: konfigMcp() hanya memuat yang DISETUJUI, jadi mencabut persetujuan
 * akan membuat fungsi ini menjawab `false` — dan pemanggilnya menyimpulkan
 * "bukan plugin, tak perlu digerbang". Mencabut izin justru MEMBUKA gerbangnya.
 *
 * Fungsi ini menjawab "apakah ia plugin", bukan "apakah ia boleh". Dua
 * pertanyaan berbeda, dan mencampurnya menghasilkan fail-open.
 *
 * @param {string} nama
 * @returns {boolean}
 */
function adalahPlugin(nama) {
  const n = String(nama);
  return pindai().plugin.some((p) => p.nama === n);
}

module.exports = {
  DIR_PLUGIN,
  BERKAS_SETUJU,
  IZIN_DIKENAL,
  bacaManifest,
  pindai,
  kapabilitas,
  disetujui,
  kapabilitasDisetujui,
  konfigMcp,
  adalahPlugin,
};
