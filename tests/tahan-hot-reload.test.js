// Hot-reload membuang SELURUH require.cache proyek, dan agent memicunya sendiri.
//
// KENAPA BERKAS INI ADA. electron/main.js memantau agent/, public/, electron/,
// dan scripts/. Pada tiap perubahan ia menjalankan:
//
//   for (const k of Object.keys(require.cache))
//     if (k.startsWith(rootDir)) delete require.cache[k];
//   _core = null; core();
//
// Agent WOLFSPACE menyunting sumbernya sendiri, dan direktori yang dipantau
// PERSIS yang disuntingnya. Jadi siklus itu tidak jarang — ia terjadi berkali-
// kali dalam satu sesi kerja, di tengah run.
//
// DUA AKIBAT YANG TERUKUR, dan keduanya tak terlihat dari perilaku mana pun:
//
//   1. Keadaan tingkat-proses yang disimpan di lingkup MODUL ikut terbuang.
//      Probe ketersediaan AppContainer harganya ~976 ms sekali jalan; disimpan
//      di lingkup modul, ia dibayar ULANG tiap kali agent menyentuh satu
//      berkas. Itu muncul ke user sebagai "jawaban agent makin lama", tanpa
//      satu pun galat untuk ditunjuk.
//
//   2. Handler tingkat-proses yang dipasang saat modul dimuat MENUMPUK.
//      Terukur sebelum diperbaiki: 2, 3, 4, 5 listener pada empat putaran.
//      Handler lama menunjuk struktur data yang sudah dibuang, jadi ia tak
//      membersihkan apa pun -- hanya menumpuk sampai Node memperingatkan.
//
// Uji ini menjalankan siklusnya SUNGGUHAN. Membaca sumber saja tak cukup:
// yang harus dijamin adalah keadaan sesudah cache benar-benar dibuang.

const path = require("path");
const { spawnSync } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
jest.setTimeout(120000);

/** Jalankan N putaran buang-cache + muat-ulang, kembalikan hasil terukurnya. */
function siklus(putaran) {
  const kode = [
    "const path = require('path');",
    "const AKAR = " + JSON.stringify(AKAR) + ";",
    "require(path.join(AKAR, 'scripts', 'ts-register.cjs'));",
    "const T = path.join(AKAR, 'agent', 'tools', 'index.ts');",
    "const AC = path.join(AKAR, 'agent', 'tools', 'appcontainer-jail.ts');",
    "const S = path.join(AKAR, 'agent', 'sandbox.ts');",
    "const hasil = [];",
    "for (let i = 0; i < " + putaran + "; i++) {",
    "  const t = Date.now();",
    "  require(T); require(S); require(AC).tersedia();",
    "  const ms = Date.now() - t;",
    "  const n = process.listenerCount('exit') +",
    "            process.listenerCount('uncaughtException') +",
    "            process.listenerCount('unhandledRejection');",
    "  hasil.push({ ms, n });",
    "  for (const k of Object.keys(require.cache))",
    "    if (k.startsWith(AKAR)) delete require.cache[k];",
    "}",
    "process.stdout.write('<<H>>' + JSON.stringify(hasil) + '<</H>>');",
  ].join("\n");
  const r = spawnSync(process.execPath, ["-e", kode], {
    encoding: "utf8",
    timeout: 90000,
    cwd: AKAR,
  });
  const m = String(r.stdout || "").match(/<<H>>([\s\S]*?)<<\/H>>/);
  expect(m).toBeTruthy();
  return JSON.parse(m[1]);
}

describe("modul tahan terhadap hot-reload", () => {
  const hasil = siklus(4);

  test("handler proses TIDAK menumpuk tiap muat ulang", () => {
    // Ini yang paling mudah lolos tanpa disadari: tak ada galat, tak ada
    // perilaku yang berubah, hanya jumlah handler yang naik pelan-pelan.
    const n = hasil.map((h) => h.n);
    expect(new Set(n).size).toBe(1);
  });

  test("probe mahal TIDAK dibayar ulang sesudah cache dibuang", () => {
    // Putaran pertama boleh mahal (probe sungguhan). Sesudahnya harus murah:
    // fakta "container ini bisa dipakai" tidak berubah karena berkas sumber
    // disunting, jadi ia tak boleh ikut terbuang bersama cache modul.
    const pertama = hasil[0].ms;
    const sisa = hasil.slice(1).map((h) => h.ms);
    const terburuk = Math.max(...sisa);
    expect(terburuk).toBeLessThan(Math.max(300, pertama / 3));
  });

  test("keadaan tingkat proses hidup di globalThis, bukan lingkup modul", () => {
    const fs = require("fs");
    const ac = fs.readFileSync(
      path.join(AKAR, "agent", "tools", "appcontainer-jail.ts"),
      "utf8",
    );
    expect(ac).toMatch(/globalThis\.__wolfspaceAc/);
    const sb = fs.readFileSync(path.join(AKAR, "agent", "sandbox.ts"), "utf8");
    expect(sb).toMatch(/globalThis\.__wolfspaceSandboxExit/);
    const sv = fs.readFileSync(path.join(AKAR, "server.cjs"), "utf8");
    expect(sv).toMatch(/globalThis\.__wolfspaceJejakKeluar/);
  });
});
