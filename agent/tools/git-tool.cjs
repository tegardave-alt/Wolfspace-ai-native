// ── git sebagai KAPABILITAS BERNAMA, bukan sebagai perintah shell ──
//
// KENAPA ADA. git TIDAK BISA jalan di dalam AppContainer, dan itu bukan sesuatu
// yang bisa ditambal. git memanggil sanitize_stdfds() saat start, yang membuka
// /dev/null dengan O_RDWR TANPA SYARAT -- bukan hanya kalau fd standar hilang.
// Di dalam container, perangkat NUL bisa DITULIS tapi tidak bisa DIBACA
// (terukur: `cmd /c echo x > NUL` berhasil, `[IO.File]::OpenRead('NUL')`
// ditolak). Jadi setiap perintah git apa pun mati sebelum menjalankan apa pun.
//
// Sesudah bash jadi terkurung kernel, itu berarti agent coding kehilangan git
// sepenuhnya. Melubangi kurungannya untuk git akan membatalkan seluruh gunanya:
// perintah yang boleh keluar adalah perintah yang bisa dipakai untuk keluar.
//
// BENTUKNYA MENGIKUTI net-diag.cjs: tool ini tidak menerima perintah. Ia
// menerima OPERASI dari daftar tetap lalu MEMBANGUN argv-nya sendiri. Tak ada
// teks perintah yang perlu dipindai, jadi tak ada yang bisa dirakit untuk
// lolos -- batasnya sifat dari bentuk datanya, bukan tebakan atas string.
//
// JUJUR SOAL BATASNYA. Proses git berjalan DI LUAR AppContainer, jadi jalur ini
// BUKAN pengurungan kernel dan tidak dilabeli begitu. Yang membatasinya adalah
// bentuk API-nya:
//   - operasi dari daftar tetap; tak ada `-c`, `--exec-path`, `--upload-pack`
//   - setiap path divalidasi harus berada DI DALAM workspace
//   - `-C <workspace>` dipaksa, jadi repo lain tak bisa disasar
//   - tanpa jaringan sama sekali: push/pull/fetch/clone/remote-set TIDAK ADA
//   - pager, editor, dan prompt kredensial dimatikan supaya tak pernah
//     menggantung menunggu manusia yang tak ada
//
// HOOK ADALAH LUBANGNYA, dan itu disebut terang-terangan. `commit` dan
// `checkout` menjalankan hook milik repo, dan hook adalah berkas di dalam
// workspace yang bisa ditulis agent. Jadi operasi TULIS memang bisa
// mengeksekusi kode di luar kurungan. Hook TIDAK dimatikan -- mematikannya
// akan membuat commit melewati gerbang mutu yang justru dipasang orang dengan
// sengaja. Sebagai gantinya operasi tulis melewati admission CommandChain
// (kapabilitas `proc.raw`), jadi ia bisa dicabut per sesi dan tercatat di
// ledger. Operasi BACA tidak menjalankan hook sama sekali, jadi tidak digerbang.
"use strict";

const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");
const _penegakan = require("../penegakan.cjs");

const BATAS_MS = 60000;
const MAKS_KELUARAN = 12000;

/** Nama ref/branch: tanpa spasi, tanpa `-` di depan (supaya tak jadi opsi). */
const REF_SAH = /^[A-Za-z0-9._\/][A-Za-z0-9._\/-]{0,200}$/;

/**
 * Operasi. `tulis: true` berarti ia bisa mengubah repo DAN bisa menjalankan
 * hook, jadi ia digerbang admission.
 * @type {Record<string, {tulis?: boolean, argv: (a: any, ws: string) => string[], jelas: string}>}
 */
const OPERASI = {
  status: {
    jelas: "keadaan pohon kerja, ringkas",
    argv: () => ["status", "--porcelain=v1", "--branch"],
  },
  diff: {
    jelas: "perubahan; pakai bertahap:true untuk yang sudah di-stage",
    argv: (a) => [
      "diff",
      ...(a.bertahap ? ["--staged"] : []),
      "--no-color",
      ...(a.berkas && a.berkas.length ? ["--", ...a.berkas] : []),
    ],
  },
  log: {
    jelas: "riwayat commit, satu baris per commit",
    argv: (a) => [
      "log",
      "--oneline",
      "--no-color",
      "-n",
      String(Math.min(Math.max(Number(a.jumlah) || 20, 1), 200)),
      ...(a.berkas && a.berkas.length ? ["--", ...a.berkas] : []),
    ],
  },
  show: {
    jelas: "isi satu commit (ringkasan perubahan)",
    argv: (a) => ["show", "--stat", "--no-color", a.ref || "HEAD"],
  },
  berkas: { jelas: "berkas yang dilacak git", argv: () => ["ls-files"] },
  cabang: {
    jelas: "daftar cabang lokal",
    argv: () => ["branch", "--list", "--no-color"],
  },
  kepala: { jelas: "commit HEAD saat ini", argv: () => ["rev-parse", "HEAD"] },
  blame: {
    jelas: "siapa mengubah tiap baris satu berkas",
    argv: (a) => ["blame", "--no-color", "--", a.berkas[0]],
  },

  tambah: {
    tulis: true,
    jelas: "stage berkas (setara git add)",
    argv: (a) => ["add", "--", ...a.berkas],
  },
  commit: {
    tulis: true,
    jelas: "commit yang sudah di-stage; hook repo IKUT JALAN",
    argv: (a) => ["commit", "-m", String(a.pesan)],
  },
  pulihkan: {
    tulis: true,
    jelas: "buang perubahan pada berkas (setara git restore)",
    argv: (a) => ["restore", "--", ...a.berkas],
  },
  cabang_baru: {
    tulis: true,
    jelas: "buat cabang baru lalu pindah ke sana",
    argv: (a) => ["checkout", "-b", String(a.ref)],
  },
  pindah: {
    tulis: true,
    jelas: "pindah ke cabang yang sudah ada; hook checkout IKUT JALAN",
    argv: (a) => ["checkout", String(a.ref)],
  },
};

/**
 * Lingkungan git. Ketiganya mencegah git MENGGANTUNG menunggu manusia yang tak
 * ada -- kegagalan yang dari luar tampak persis seperti hang tanpa sebab.
 * @param {string} ws
 */
function _env(ws) {
  return {
    ...process.env,
    GIT_PAGER: "cat",
    PAGER: "cat",
    GIT_EDITOR: "true",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "",
    GIT_DIR: undefined,
    GIT_WORK_TREE: undefined,
    GIT_CONFIG_GLOBAL: process.env.GIT_CONFIG_GLOBAL,
    HOME: process.env.HOME || process.env.USERPROFILE,
    LC_ALL: "C",
  };
}

/**
 * Path harus berada DI DALAM workspace. Ini pemeriksaan yang sama yang tak bisa
 * dilakukan pemindai teks: di sini path sudah jadi nilai, bukan potongan string
 * yang mungkin dirakit belakangan.
 * @param {string[]} daftar
 * @param {string} ws
 * @returns {{ok: true, berkas: string[]} | {ok: false, alasan: string}}
 */
function _validasiBerkas(daftar, ws) {
  const keluar = [];
  for (const p of daftar) {
    if (typeof p !== "string" || !p.trim())
      return { ok: false, alasan: "path kosong" };
    if (p.startsWith("-"))
      return { ok: false, alasan: "path tak boleh diawali '-': " + p };
    const abs = path.resolve(ws, p);
    const rel = path.relative(ws, abs);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel))
      return { ok: false, alasan: "path di luar workspace: " + p };
    keluar.push(rel.split(path.sep).join("/"));
  }
  return { ok: true, berkas: keluar };
}

/**
 * @param {{operasi?: string, berkas?: string[], ref?: string, pesan?: string, bertahap?: boolean, jumlah?: number}} args
 * @param {string} workspace
 */
async function jalankan(args, workspace) {
  const a = args || {};
  const ws = path.resolve(workspace || process.cwd());
  const nama = String(a.operasi || "");
  const op = OPERASI[nama];
  if (!op) {
    return {
      ok: false,
      ..._penegakan.label("penasihat", "kapabilitas-git"),
      output:
        "operasi '" +
        nama +
        "' tak dikenal. Yang ada:\n" +
        Object.entries(OPERASI)
          .map(([k, v]) => "  " + k.padEnd(13) + v.jelas)
          .join("\n") +
        "\nTIDAK ADA operasi jaringan (push/pull/fetch/clone) di tool ini.",
    };
  }

  // Validasi SEBELUM apa pun dijalankan.
  const b = { ...a };
  if (a.berkas && a.berkas.length) {
    const v = _validasiBerkas(a.berkas, ws);
    if (!v.ok)
      return {
        ok: false,
        ..._penegakan.label("penasihat", "kapabilitas-git"),
        output: "DITOLAK: " + v.alasan,
      };
    b.berkas = v.berkas;
  }
  if (nama === "blame" && (!b.berkas || !b.berkas.length))
    return {
      ok: false,
      ..._penegakan.label("penasihat", "kapabilitas-git"),
      output: "blame butuh tepat satu berkas",
    };
  if (a.ref !== undefined && !REF_SAH.test(String(a.ref)))
    return {
      ok: false,
      ..._penegakan.label("penasihat", "kapabilitas-git"),
      output: "ref '" + a.ref + "' tak sah (tanpa spasi, tak diawali '-')",
    };
  if (nama === "commit" && !String(a.pesan || "").trim())
    return {
      ok: false,
      ..._penegakan.label("penasihat", "kapabilitas-git"),
      output: "commit butuh 'pesan'",
    };
  if (!fs.existsSync(path.join(ws, ".git")))
    return {
      ok: false,
      ..._penegakan.label("penasihat", "kapabilitas-git"),
      output: ws + " bukan repo git (tak ada .git)",
    };

  // Operasi TULIS bisa menjalankan hook milik repo, dan hook adalah berkas yang
  // bisa ditulis agent. Jadi ia melewati pintu yang sama dengan eksekusi proses
  // mentah: bisa dicabut per sesi, dan tercatat.
  if (op.tulis) {
    const gerbang = _admission(nama);
    if (gerbang) return gerbang;
  }

  const argv = ["-C", ws, "--no-pager", ...op.argv(b, ws)];
  return new Promise((res) => {
    execFile(
      "git",
      argv,
      {
        cwd: ws,
        encoding: "utf8",
        timeout: BATAS_MS,
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
        env: _env(ws),
      },
      (err, stdout, stderr) => {
        const teks = String(stdout || "") + String(stderr || "");
        const label = _penegakan.label("penasihat", "kapabilitas-git");
        if (err && !stdout && !stderr) {
          return res({
            ok: false,
            ...label,
            output:
              "git gagal: " +
              String(err.message).slice(0, 300) +
              (err.killed ? "\n[dihentikan: lewat batas waktu]" : ""),
          });
        }
        res({
          // Kode keluar bukan-nol adalah HASIL yang sah untuk sebagian operasi
          // (diff menemukan perbedaan, commit tanpa perubahan). Keluarannya
          // tetap dikembalikan apa adanya.
          ok: !err,
          ...label,
          output: teks.trim().slice(0, MAKS_KELUARAN) || "(tak ada keluaran)",
        });
      },
    );
  });
}

/**
 * Admission CommandChain untuk operasi tulis. Ketiadaan pemeriksa MENUTUP,
 * bukan membuka -- prinsip yang sama dengan sandbox_run.
 * @param {string} nama
 */
function _admission(nama) {
  try {
    const cc = require("../broker/commandchain.cjs");
    const rs = cc.sesiRuleset();
    const adm = cc.periksa(rs, "proc.raw");
    if (!adm.allow) {
      cc.catat({
        capability: "proc.raw",
        decision: "DENY",
        reason: adm.alasan,
        params: { git: nama },
      });
      return {
        ok: false,
        ..._penegakan.label("penasihat", "admission"),
        output:
          "Sesi ini dikunci tanpa eksekusi proses mentah, dan operasi git '" +
          nama +
          "' bisa menjalankan hook repo di luar kurungan.\nAlasan teknis: " +
          adm.alasan,
      };
    }
    return null;
  } catch (_) {
    return {
      ok: false,
      ..._penegakan.label("penasihat", "admission"),
      output:
        "git '" +
        nama +
        "' ditolak: CommandChain tak tersedia untuk memeriksa admission, dan " +
        "operasi ini bisa menjalankan hook repo di luar kurungan.",
    };
  }
}

module.exports = { jalankan, OPERASI };
