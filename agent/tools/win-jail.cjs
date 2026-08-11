// ── Shell terkurung ACL di Windows: jalankan sebagai akun berhak-sedikit ──
//
// MASALAH YANG DIPECAHKAN. Tool `bash` di Windows hanya bisa MEMINDAI TEKS
// perintah, dan itu terbukti bisa ditembus: path yang dirakit saat jalan lolos
// scan dan benar-benar membuat folder di C:\Users\dave\Desktop.
//
// Jalur ini memakai penegak yang sudah ada di Windows sejak awal: NTFS ACL.
// Perintah dijalankan sebagai akun terpisah yang hanya punya Modify di folder
// workspace. Penolakan terjadi saat panggilan berkas, bukan saat teks dibaca —
// jadi tak peduli path ditulis langsung, dirakit dari kode karakter, atau
// datang dari program apa pun.
//
// TERUKUR, dijalankan sebagai akun itu:
//   TULIS Desktop dave      ditolak
//   BACA  Documents\oi      ditolak
//   BACA  cloud-keys.json   ditolak
//   TULIS di WOLFSPACE      BISA
//   BACA  WOLFSPACE         BISA
//
// KENAPA INI, BUKAN WSL. Perintahnya tetap PowerShell — tak ada perubahan
// semantik. WSL memberi batas yang sama kuatnya, tapi menggantinya jadi `sh`
// POSIX, sehingga setiap perintah yang sudah ditulis model patah.
//
// SANDI. Men-spawn sebagai akun lain menuntut kredensial saat berjalan. Ia
// disimpan TERENKRIPSI DPAPI, terikat ke akun dave dan mesin ini. Agent yang
// berjalan sebagai akun terkurung TIDAK BISA mendekripsinya — kunci DPAPI-nya
// milik dave, bukan miliknya. Jadi ia tak bisa mencuri sandi yang dipakai untuk
// mengurungnya sendiri.
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const _penegakan = require("../penegakan.cjs");

const AKUN = process.env.WOLFSPACE_WIN_JAIL_USER || "wolfmnt";
const BERKAS_KRED = path.join(os.homedir(), ".wolfspace", "win-jail.cred");

// PATH DISETEL EKSPLISIT, tidak diwarisi.
//
// Dua alasan. Pertama, PATH milik dave memuat C:\langs\node yang tak ada di
// PATH sistem — akun lain tak akan menemukannya, dan gejalanya menyesatkan
// ("'node' is not recognized" terbaca seperti node tak terpasang). Kedua,
// lingkungan yang diwarisi tak bisa diprediksi: apa yang kebetulan ada di PATH
// hari ini menentukan apa yang bisa dijalankan agent.
function _path() {
  const bawaan = [
    "C:\\langs\\node",
    "C:\\Windows\\System32",
    "C:\\Windows",
    "C:\\Windows\\System32\\Wbem",
    "C:\\Windows\\System32\\WindowsPowerShell\\v1.0",
    "C:\\Program Files\\Git\\cmd",
  ];
  const tambahan = (process.env.WOLFSPACE_WIN_JAIL_PATH || "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  return bawaan.concat(tambahan).join(";");
}

let _siapCache = null;

/** @returns {{siap: boolean, alasan: string}} */
function tersedia() {
  if (_siapCache) return _siapCache;
  if (process.platform !== "win32") {
    _siapCache = { siap: false, alasan: "hanya untuk Windows" };
    return _siapCache;
  }
  if (!fs.existsSync(BERKAS_KRED)) {
    _siapCache = {
      siap: false,
      alasan:
        "kredensial tak ada di " +
        BERKAS_KRED +
        " — jalankan skrip penyiapan sebagai Administrator lebih dulu",
    };
    return _siapCache;
  }
  _siapCache = { siap: true, alasan: "" };
  return _siapCache;
}

// Skrip PowerShell yang menjalankan perintah sebagai akun terkurung.
//
// Start-Process -Credential TIDAK BISA menyalurkan stdout ke pipa, jadi
// keluarannya harus lewat berkas. Berkas itu ditaruh DI DALAM workspace, satu-
// satunya tempat yang akun terkurung boleh tulis — menaruhnya di %TEMP% milik
// dave akan gagal senyap, dan itu persis kesalahan yang menghabiskan satu
// putaran saat menguji jalur ini.
// Dijalankan dengan -File, BUKAN -Command.
//
// `powershell -Command "<skrip>" a b c` TIDAK mengisi $args — argumen
// posisional hanya sampai lewat -File. Gejalanya menyesatkan: skripnya jalan,
// tapi $u/$ws/$credF semuanya kosong, dan error yang muncul menunjuk ke
// PSCredential alih-alih ke cara pemanggilannya.
const PS_PELUNCUR = [
  "param($u,$ws,$cmdFile,$outF,$errF,$credF,$pathEnv)",
  "$ErrorActionPreference='Stop'",
  "$sec = Get-Content $credF | ConvertTo-SecureString",
  "$c = New-Object PSCredential($u,$sec)",
  // Pembungkus menyetel PATH lalu memanggil berkas perintah. Perintahnya lewat
  // BERKAS, bukan argumen — argumen ber-kutip/ber-newline rusak berlapis.
  "$wrap = Join-Path $ws ('_wj_wrap_' + [guid]::NewGuid().ToString('N') + '.ps1')",
  "@(\"`$env:PATH = '$pathEnv'\", \"Set-Location -LiteralPath '$ws'\", \"& '$cmdFile'\") | Out-File $wrap -Encoding ASCII",
  "try {",
  "  Start-Process powershell -Credential $c -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',$wrap -RedirectStandardOutput $outF -RedirectStandardError $errF -WorkingDirectory $ws -Wait",
  "} finally {",
  "  Remove-Item $wrap -Force -ErrorAction SilentlyContinue",
  "}",
].join("\r\n");

/**
 * Jalankan perintah PowerShell sebagai akun terkurung.
 * @param {string} perintah
 * @param {{cwd?: string, timeout?: number}} [opts]
 */
async function jalankan(perintah, opts) {
  const o = opts || {};
  const siap = tersedia();
  if (!siap.siap) {
    return {
      ok: false,
      output: "jalur ACL Windows tak tersedia: " + siap.alasan,
      ..._penegakan.label("penasihat", "tak-tersedia"),
    };
  }
  const ws = path.resolve(o.cwd || process.cwd());
  const tag =
    "_wj_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
  const fCmd = path.join(ws, tag + ".ps1");
  const fOut = path.join(ws, tag + ".out");
  const fErr = path.join(ws, tag + ".err");
  const fLuncur = path.join(ws, tag + "_luncur.ps1");
  const bersih = () => {
    for (const f of [fCmd, fOut, fErr, fLuncur]) {
      try {
        fs.rmSync(f, { force: true });
      } catch (_) {}
    }
  };
  try {
    fs.writeFileSync(fCmd, perintah, "ascii");
    fs.writeFileSync(fLuncur, PS_PELUNCUR, "ascii");
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        fLuncur,
        AKUN,
        ws,
        fCmd,
        fOut,
        fErr,
        BERKAS_KRED,
        _path(),
      ],
      {
        timeout: o.timeout || 120000,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const out = fs.existsSync(fOut) ? fs.readFileSync(fOut, "utf8") : "";
    const err = fs.existsSync(fErr) ? fs.readFileSync(fErr, "utf8") : "";
    const teks = (out + (err.trim() ? "\n" + err : "")).trim();
    return {
      ok: !err.trim(),
      output: (teks || "(tak ada keluaran)").slice(0, 8000),
      ..._penegakan.label("kernel", "windows-acl"),
    };
  } catch (e) {
    const out = fs.existsSync(fOut) ? fs.readFileSync(fOut, "utf8") : "";
    const err = fs.existsSync(fErr) ? fs.readFileSync(fErr, "utf8") : "";
    return {
      ok: false,
      output: ((out + err).trim() || String(e.message)).slice(0, 8000),
      ..._penegakan.label("kernel", "windows-acl"),
    };
  } finally {
    bersih();
  }
}

module.exports = { tersedia, jalankan, AKUN, BERKAS_KRED };
