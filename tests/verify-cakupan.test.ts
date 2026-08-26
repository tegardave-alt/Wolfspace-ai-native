// "ok=true" harus membawa CAKUPAN-nya, bukan tampil telanjang.
//
// KENAPA ADA. Loop anti-halu WOLFSPACE menolak DONE tanpa satu eksekusi ok=true
// (server.cjs). Tapi "ok=true" selama ini hanya berarti "proses keluar 0" — tak
// sepatah pun tentang DI MANA ia jalan. `cwd: WORKSPACE` bukan batas, dan
// `env: process.env` mewariskan seluruh lingkungan host ke kode yang diverifikasi.
// Jadi verdict hijau bisa jadi eksekusi yang menyentuh hal di luar cakupan.
//
// v2 menutup itu dengan JUJUR: verdict membawa status cakupannya, dan gerbang
// DONE menyatakannya — "ok=true, terkurung ke X" atau "ok=true, cakupan advisory".
// Di Windows ini attestation, bukan penegakan (tak ada namespace); yang dijaga di
// sini bahwa attestation-nya ADA dan TERPASANG, bukan bahwa Windows menegakkan.
//
// Yang diuji: STRUKTUR di server.cjs (file 5000+ baris tak bisa dimuat utuh di
// Jest tanpa membuka port), plus PERILAKU dua helper murni yang bisa diisolasi.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// Dinormalkan ke LF: repo ini dipakai dengan core.autocrlf=true, jadi server.cjs
// di working tree bisa CRLF atau LF tergantung apakah ia baru lewat checkout
// (termasuk stash/restore lint-staged). Tanpa normalisasi, regex '\n}\n' di bawah
// diam-diam tak cocok dan SEMUA tes struktur di sini gagal karena alasan yang tak
// ada hubungannya dengan yang diuji.
const SRC = fs
  .readFileSync(require.resolve("../server.ts"), "utf8")
  .replace(/\r\n/g, "\n");

// The extracted slices carry TypeScript annotations since server migrated, and
// running them as JavaScript stops at the first colon. esbuild is what
// scripts/ts-register.cjs uses to load this same file at run time, so the slice
// goes through the same conversion the production path does.
const _ts = (kode) =>
  require("esbuild").transformSync(kode, {
    loader: "ts",
    format: "cjs",
    target: "es2022",
  }).code;
// Ambil satu fungsi top-level dari sumber (sampai '}' di kolom 0).
function ambilFungsi(nama) {
  const i = SRC.indexOf("function " + nama);
  if (i < 0) throw new Error("fungsi tak ditemukan: " + nama);
  const sub = SRC.slice(i);
  const m = sub.match(/^[\s\S]*?\n\}\n/);
  return m[0];
}

describe("struktur: verdict membawa cakupan, gerbang DONE menyatakannya", () => {
  test("PY_ENV yang tak terdeklarasi TIDAK dipakai lagi", () => {
    // Dulu `env: PY_ENV` — variabel yang tak pernah ada — membuat SETIAP
    // verifikasi Python melempar ReferenceError dan gagal diam-diam (ok=false).
    expect(SRC).not.toMatch(/env:\s*PY_ENV/);
  });

  test("runInWorkspace mengembalikan kurungan di SEMUA cabang", () => {
    const fn = ambilFungsi("runInWorkspace");
    // dua sukses (js, py) + satu tak-didukung + satu catch = 4 kali minimal
    const jml = (fn.match(/kurungan/g) || []).length;
    expect(jml).toBeGreaterThanOrEqual(4);
  });

  test("gerbang DONE menyatakan cakupan, tak membiarkan ok=true telanjang", () => {
    expect(SRC).toMatch(/verifiedKurungan/);
    expect(SRC).toMatch(/advisory scope/);
    expect(SRC).toMatch(/terkurung ke/);
  });

  test("eksekusi verifikasi TIDAK mewarisi process.env utuh", () => {
    // Vektor yang membuat penjaga bash bocor (%VAR% + warisan rahasia) tak boleh
    // ada di jalur verifikasi. env utuh diganti env terbatas.
    const fn = ambilFungsi("runInWorkspace");
    expect(fn).not.toMatch(/env:\s*process\.env/);
    expect(fn).toMatch(/env,/); // memakai env terbatas yang dibangun di atas
  });
});

describe("perilaku helper murni (diisolasi)", () => {
  // _envVerifikasi dan _cakupanVerifikasi tak menyentuh I/O, jadi bisa dieval
  // sendiri dengan WORKSPACE palsu.
  function muatHelper() {
    const ctx = {
      process: {
        env: { PATH: "/x", SystemRoot: "C:/Windows", RAHASIA: "bocor" },
      },
      WORKSPACE: "/ws",
    };
    vm.createContext(ctx);
    vm.runInContext(
      _ts(ambilFungsi("_envVerifikasi") + ambilFungsi("_cakupanVerifikasi")),
      ctx,
    );
    return ctx;
  }

  test("env terbatas MEMBUANG variabel host yang tak di-allowlist", () => {
    const c = muatHelper();
    const env = c._envVerifikasi();
    expect(env.PATH).toBe("/x"); // yang perlu tetap ada
    expect(env.RAHASIA).toBeUndefined(); // yang tak di-allowlist HILANG
  });

  test("TEMP/TMP diarahkan ke DALAM workspace, bukan Temp host", () => {
    const c = muatHelper();
    const env = c._envVerifikasi();
    expect(env.TEMP).toBe("/ws");
    expect(env.TMP).toBe("/ws");
  });

  test("cakupan jujur: enforced=false di jalur ini (attestation, bukan penegakan)", () => {
    const c = muatHelper();
    const k = c._cakupanVerifikasi();
    expect(k.root).toBe("/ws");
    expect(k.enforced).toBe(false);
    expect(typeof k.mekanisme).toBe("string");
  });
});
