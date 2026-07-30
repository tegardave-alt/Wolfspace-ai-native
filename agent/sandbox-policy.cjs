// Satu sumber kebenaran untuk "apakah eksekusi ini harus dikurung?".
//
// CATATAN SEJARAH: dulu pengurungannya SELALU Docker, dan latar di bawah ditulis
// dengan asumsi itu. Docker kini sudah dihapus seluruhnya dari jalur produksi —
// pengurungan bash memakai namespace Linux (agent/tools/bash-jail.cjs) dan zona
// kapabilitas memakai --permission + unshare -n (agent/broker/). Modul ini tetap
// hidup karena yang dijaganya adalah KEPUTUSANNYA, bukan mekanismenya; parameter
// keduanya karena itu bernama `pengurunganTersedia`, bukan lagi `hasDocker`.
// Latar di bawah dipertahankan karena ia menjelaskan MENGAPA tri-state ini ada.
//
// LATAR: dulu ada DUA gerbang yang saling tak sepakat --
//   - server.cjs/runners.cjs : CONFIG.sandbox === true && hasDocker()
//       -> "sandbox" tak pernah diset di config.json MAUPUN config.docker.json,
//          jadi jalur ini mati total; dan menyetel false pun tak berbeda.
//   - agent/tools/index.cjs  : _hasDocker() saja
//       -> menyala sendiri kalau Docker hidup, dan MENGABAIKAN sandbox:false.
// Akibatnya "sandbox: false" tidak benar-benar mematikan sandbox, dan
// "sandbox: true" tidak benar-benar menjaminnya. Modul ini menyatukan aturannya.
//
// TRI-STATE (bukan boolean), supaya niat user bisa dinyatakan eksplisit:
//   "on"   -> WAJIB sandbox. Pemanggil gagal-tertutup (fail closed) bila Docker
//             tak ada -- lebih baik menolak jalan daripada diam-diam native.
//   "off"  -> JANGAN sandbox, walau Docker tersedia.
//   "auto" -> pakai Docker bila tersedia, jika tidak pakai jalur cadangan.
//
// Presedensi: env WOLFSPACE_SANDBOX > config.json "sandbox" > default pemanggil.
// Default sengaja BEDA per jalur agar perilaku lama tak berubah diam-diam:
//   - eksekusi kode Python/JS -> default "off"  (sandbox-nya --network none;
//     menyalakannya otomatis akan mematahkan kode yang butuh jaringan)
//   - bash terkurung workspace -> default "auto" (memang sudah begitu)
"use strict";
const fs = require("fs");
const path = require("path");

const ON = ["on", "1", "true", "force", "yes"];
const OFF = ["off", "0", "false", "never", "no"];

function envMode() {
  const v = String(process.env.WOLFSPACE_SANDBOX || "")
    .trim()
    .toLowerCase();
  if (!v) return null;
  if (ON.includes(v)) return "on";
  if (OFF.includes(v)) return "off";
  if (v === "auto") return "auto";
  return null; // nilai tak dikenal -> abaikan, jangan ubah perilaku diam-diam
}

// cfgSandbox = nilai CONFIG.sandbox (true | false | undefined)
// fallback   = default jalur pemanggil ("off" | "auto")
function resolveMode(cfgSandbox, fallback) {
  const e = envMode();
  if (e) return e;
  if (cfgSandbox === true) return "on";
  if (cfgSandbox === false) return "off";
  return fallback;
}

function shouldSandbox(cfgSandbox, pengurunganTersedia, fallback) {
  const m = resolveMode(cfgSandbox, fallback);
  if (m === "off") return false;
  if (m === "on") return true; // pemanggil yang memutuskan cara gagal-tertutup
  return !!pengurunganTersedia;
}

// Untuk pemanggil yang tak memuat CONFIG sendiri (mis. agent/tools/index.cjs).
// Dibaca sekali lalu di-cache; config.json tak berubah saat proses hidup.
let _cfgCache;
function configSandbox() {
  if (_cfgCache !== undefined) return _cfgCache;
  try {
    const p = path.join(__dirname, "..", "config.json");
    _cfgCache = JSON.parse(fs.readFileSync(p, "utf8")).sandbox;
  } catch {
    _cfgCache = undefined;
  }
  return _cfgCache;
}

module.exports = { resolveMode, shouldSandbox, configSandbox };
