#!/usr/bin/env node
// Look INSIDE the built package and refuse to ship one machine's state.
//
// WHY THIS EXISTS. release.yml already scans for credentials, and it does that
// by FILENAME (cloud-keys.json, .env, .pem, .key). That scan passed honestly
// for v0.2.0 while the installer shipped config.json containing the author's
// own machine paths:
//
//     ww.root     "C:/Users/<pembuat>/Desktop/project"
//     runners.c   "C:/langs/<toolchain>/bin/gcc.exe"    (and seven more)
//
// config.json is a legitimate config file, so no filename rule could have
// caught it. What was wrong was its CONTENTS. A local build was worse still:
// electron-builder packages the working directory rather than the git tree, so
// twelve files from public/uploads -- screenshots, diagrams, 3D models -- went
// in too. The user found both after installing.
//
// So this reads the package that was actually produced, and fails on state
// rather than on names.
"use strict";
const path = require("path");
const asar = require("@electron/asar");

const ASAR = process.argv[2] || "dist-app/win-unpacked/resources/app.asar";

const BS = String.fromCharCode(92);
/** An absolute path belonging to whoever built this. */
function jalurMesin(s) {
  if (typeof s !== "string") return false;
  if (/^[A-Za-z]:/.test(s)) return true;
  if (s.includes(":" + BS)) return true;
  if (s.includes(":/") && !/^[a-z]+:\/\//i.test(s)) return true; // not a URL
  return s.startsWith("/home/") || s.startsWith("/Users/");
}

function nilaiBersarang(o, jalur) {
  const keluar = [];
  if (typeof o === "string") return [{ jalur, nilai: o }];
  if (o && typeof o === "object") {
    for (const k of Object.keys(o)) {
      keluar.push(...nilaiBersarang(o[k], jalur ? jalur + "." + k : k));
    }
  }
  return keluar;
}

const galat = [];
let daftar;
try {
  daftar = asar
    .listPackage(ASAR)
    .map((f) => f.split(BS).join("/").replace(/^\//, ""));
} catch (e) {
  console.error("::error::tidak bisa membaca " + ASAR + ": " + e.message);
  process.exit(1);
}
const milik = daftar.filter((f) => f && !f.includes("node_modules/"));
console.log("entri di paket        : " + daftar.length);
console.log("di luar node_modules  : " + milik.length);

// 1. Runtime upload directory must not ship at all.
const unggahan = milik.filter((f) => f.startsWith("public/uploads/"));
if (unggahan.length) {
  galat.push(
    "public/uploads ikut terpaket (" +
      unggahan.length +
      " berkas) — itu unggahan pemakai, bukan sumber: " +
      unggahan.slice(0, 5).join(", "),
  );
}

// 2. Every shipped JSON is read, and its VALUES checked.
const json = milik.filter((f) => f.toLowerCase().endsWith(".json"));
const LEWATI = /(^|\/)(package(-lock)?\.json|tsconfig\.json|jsconfig\.json)$/;
for (const f of json) {
  if (LEWATI.test(f)) continue;
  let d;
  try {
    d = JSON.parse(asar.extractFile(ASAR, f).toString("utf8"));
  } catch (e) {
    continue; // not an object we can judge
  }
  for (const x of nilaiBersarang(d, "")) {
    if (x.jalur.endsWith("_note")) continue; // documentation may cite examples
    if (jalurMesin(x.nilai)) {
      galat.push(f + " -> " + x.jalur + " berisi jalur mesin: " + x.nilai);
    }
    if (/key|token|secret|password/i.test(x.jalur) && x.nilai !== "") {
      galat.push(f + " -> " + x.jalur + " tidak kosong");
    }
  }
}

console.log("json diperiksa isinya : " + json.length);

// 3. RAHASIA BERBENTUK KUNCI, di berkas APA PUN — bukan hanya JSON.
//
// Diuji dan terbukti perlu: sebuah kunci ditanam di agent/rag.ts, paket dikemas
// ulang, dan pemeriksa ini menyatakannya bersih. Pemeriksaan isi JSON menutup
// kebocoran cloud-keys.json yang asli, tapi kunci yang tertulis di berkas KODE
// lolos begitu saja — dan agent ini menulis kode ke repo pemakainya.
const POLA_RAHASIA = [
  ["OpenAI/Anthropic", /sk-[A-Za-z0-9_-]{20,}/],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{20,}/],
  ["GitHub PAT", /github_pat_[A-Za-z0-9_]{20,}/],
  ["Google API", /AIza[A-Za-z0-9_-]{30,}/],
  ["xAI", /xai-[A-Za-z0-9]{20,}/],
  ["HuggingFace", /hf_[A-Za-z0-9]{20,}/],
  ["NVIDIA", /nvapi-[A-Za-z0-9_-]{20,}/],
  ["Tavily", /tvly-[A-Za-z0-9_-]{16,}/],
  ["AWS access key", /AKIA[A-Z0-9]{16}/],
  ["Slack", /xox[baprs]-[A-Za-z0-9-]{20,}/],
];
// node_modules DILEWATI untuk pola. Ia berisi fixture dan dokumentasi pihak
// ketiga yang memuat kunci contoh, dan sebuah penjaga yang selalu merah adalah
// penjaga yang akan dimatikan orang. Ia TETAP diperiksa oleh pencocokan nilai
// di bawah, yang tak mungkin salah tuduh.
for (const f of milik) {
  let isi;
  try {
    isi = asar.extractFile(ASAR, f).toString("latin1");
  } catch (e) {
    continue;
  }
  for (const [nama, pola] of POLA_RAHASIA) {
    const m = isi.match(pola);
    if (m) {
      galat.push(
        f +
          " memuat sesuatu berbentuk " +
          nama +
          " (" +
          m[0].slice(0, 6) +
          "…)",
      );
    }
  }
}
console.log("berkas dipindai pola  : " + milik.length);

// 4. NILAI KREDENSIAL NYATA, kalau mesin ini memilikinya.
//
// Tak berlaku di runner (berkasnya tak pernah ada di sana), dan itu memang
// benar: ini pengaman untuk installer yang dibangun DI MESIN SENDIRI, yang
// justru jalur kebocoran aslinya. Dicocokkan sebagai NILAI, jadi ia tak bisa
// salah tuduh, dan karena itu ia mencakup node_modules sekalian.
const fsx = require("fs");
const nilaiNyata = new Set();
for (const kf of ["server/cloud-keys.json", ".wolfspace/cloud-keys.json"]) {
  try {
    const d = JSON.parse(fsx.readFileSync(kf, "utf8"));
    for (const x of nilaiBersarang(d, "")) {
      if (/key|token|secret/i.test(x.jalur) && x.nilai.length >= 20) {
        nilaiNyata.add(x.nilai);
      }
    }
  } catch (e) {}
}
if (nilaiNyata.size) {
  const mentah = fsx.readFileSync(ASAR).toString("latin1");
  let cocok = 0;
  for (const v of nilaiNyata) if (mentah.includes(v)) cocok++;
  console.log(
    "kunci mesin ini dicek : " + nilaiNyata.size + " nilai, cocok " + cocok,
  );
  if (cocok) {
    galat.push(cocok + " kunci NYATA dari mesin ini ada di dalam paket");
  }
} else {
  console.log("kunci mesin ini dicek : 0 (tak ada cloud-keys.json di sini)");
}

if (galat.length) {
  console.log("");
  for (const g of galat) console.error("::error::" + g);
  console.error("PAKET MEMBAWA KEADAAN SATU MESIN — rilis dihentikan.");
  process.exit(1);
}
console.log("  ok      paket tidak membawa keadaan satu mesin");
