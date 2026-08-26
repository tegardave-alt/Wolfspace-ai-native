// Pelacakan PID MCP: satu berkas per pemilik, bukan satu berkas bersama.
//
// MASALAH ASLI. config/.mcp-pids.json dipakai BERSAMA semua proses Node dan
// isinya cuma [pid, pid] — tanpa jejak pemilik. Tiap proses baru memanggil
// _killOrphans() saat init dan membunuh SEMUA pid di berkas itu, termasuk
// server hidup milik proses lain. Terukur pada 3 proses serentak:
//     b ->  17 detik, 50 tool
//     c ->  17 detik, 50 tool
//     a -> 127 detik, 26 tool   <- server dibunuh tetangga saat handshake
// Proses a menunggu penuh timeout 120 detik lalu LANJUT dengan separuh tool
// tanpa error apa pun. Sesudah perbaikan: ketiganya 22 detik, 50 tool.
//
// KENAPA SATU BERKAS PER PEMILIK. Menambahkan field owner ke berkas bersama
// menutup pembunuhan silangnya, tapi menyisakan balapan baca-ubah-tulis: dua
// proses yang membaca bersamaan saling menimpa, satu catatan hilang, dan server
// yang tak tercatat itu belakangan dibunuh sebagai "yatim" padahal bertuan.
// Dengan berkas per pemilik, tak ada proses yang pernah menulis berkas milik
// proses lain — balapannya hilang tanpa perlu kunci berkas (yang di Windows
// membawa masalah kunci basi).
//
// BERBEDA dari mcp-hot-reload.test.js: yang itu di DALAM satu proses
// (require.cache dibuang -> instance baru), ditutup singleton globalThis. Yang
// ini LINTAS PROSES, tempat globalThis tak berlaku.

const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const mcp = require("../agent/mcp-client.ts");

const ROOT = path.resolve(__dirname, "..");
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
};

// Proses boneka berumur panjang — berdiri sebagai "server MCP" tanpa perlu npx.
const bonekaHidup = () =>
  spawn(process.execPath, ["-e", "setTimeout(()=>{},120000)"], {
    stdio: "ignore",
  });

const tulisBerkasPemilik = (owner, pids) => {
  fs.mkdirSync(mcp.PID_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(mcp.PID_DIR, owner + ".json"),
    JSON.stringify(pids),
  );
};

describe("pelacakan PID MCP per pemilik", () => {
  let boneka = [];

  beforeEach(() => {
    boneka = [];
    try {
      fs.rmSync(mcp.PID_DIR, { recursive: true, force: true });
    } catch (_) {}
    try {
      fs.unlinkSync(mcp.LEGACY_PID_FILE);
    } catch (_) {}
  });

  afterEach(() => {
    for (const p of boneka) {
      try {
        process.kill(p.pid);
      } catch (_) {}
    }
    try {
      fs.rmSync(mcp.PID_DIR, { recursive: true, force: true });
    } catch (_) {}
  });

  test("MEMBUNUH server milik pemilik mati, MEMBIARKAN milik pemilik hidup", (done) => {
    const yatim = bonekaHidup();
    const bertuan = bonekaHidup();
    boneka.push(yatim, bertuan);

    setTimeout(() => {
      tulisBerkasPemilik(999999, [yatim.pid]); // pemilik tak ada -> yatim
      tulisBerkasPemilik(process.pid, [bertuan.pid]); // pemilik = tes ini

      expect(alive(yatim.pid)).toBe(true);
      expect(alive(bertuan.pid)).toBe(true);

      mcp._killOrphans();

      setTimeout(() => {
        expect(alive(yatim.pid)).toBe(false);
        expect(alive(bertuan.pid)).toBe(true); // INTI perbaikan
        // Berkas pemilik hidup tetap ada; berkas yatim dibuang.
        expect(
          fs.existsSync(path.join(mcp.PID_DIR, process.pid + ".json")),
        ).toBe(true);
        expect(fs.existsSync(path.join(mcp.PID_DIR, "999999.json"))).toBe(
          false,
        );
        done();
      }, 800);
    }, 400);
  }, 15000);

  // Nomor PID bukan identitas. Sistem operasi memakainya ulang, jadi catatan
  // yang tertinggal dari sesi yang mati mendadak bisa menunjuk ke proses milik
  // ORANG LAIN yang kebetulan mewarisi nomor itu. Membunuhnya akan tercatat di
  // log sebagai "MCP orphan PID N dihentikan" — terbaca seperti pembersihan
  // yang berhasil, padahal proses asing yang mati. Waktu-mulai memisahkannya:
  // proses kita mulai pada atau sebelum saat kita mencatatnya.
  test("PID yang nomornya DIDAUR ULANG tidak dibunuh", (done) => {
    const asing = bonekaHidup(); // proses nyata, hidup, bukan milik kita
    boneka.push(asing);

    setTimeout(() => {
      // Catatan seolah dibuat KEMARIN oleh pemilik yang sudah mati: bentuk
      // persis yang tertinggal sesudah WOLFSPACE mati mendadak.
      tulisBerkasPemilik(999999, [
        { pid: asing.pid, ts: Date.now() - 24 * 3600 * 1000 },
      ]);

      mcp._killOrphans();

      setTimeout(() => {
        expect(alive(asing.pid)).toBe(true); // INTI: proses asing selamat
        done();
      }, 800);
    }, 400);
  }, 15000);

  test("yatim ASLI tetap dibunuh — verifikasi tidak melumpuhkan pembersihan", (done) => {
    const yatim = bonekaHidup();
    boneka.push(yatim);

    setTimeout(() => {
      // ts sekarang: waktu-mulai proses cocok, jadi ia memang milik kita.
      tulisBerkasPemilik(999999, [{ pid: yatim.pid, ts: Date.now() }]);

      mcp._killOrphans();

      setTimeout(() => {
        expect(alive(yatim.pid)).toBe(false);
        done();
      }, 1200);
    }, 400);
  }, 15000);

  // Tanpa pencabutan, berkas pemilik hanya bertambah: tiap PID mati yang
  // tertinggal adalah calon korban daur-ulang pada pembersihan berikutnya.
  // Jadi pencabutan bukan sekadar kerapian — ia yang menjaga daftarnya kecil.
  test("catatan PID DICABUT saat server berhenti, bukan menumpuk", () => {
    const p1 = bonekaHidup();
    const p2 = bonekaHidup();
    boneka.push(p1, p2);

    mcp._recordPid(p1.pid);
    mcp._recordPid(p2.pid);
    const sesudahCatat = JSON.parse(fs.readFileSync(mcp._ownFile(), "utf8"));
    expect(sesudahCatat.map((e) => e.pid).sort()).toEqual(
      [p1.pid, p2.pid].sort(),
    );
    expect(typeof sesudahCatat[0].ts).toBe("number"); // ts ikut tersimpan

    mcp._forgetPid(p1.pid);
    const sisa = JSON.parse(fs.readFileSync(mcp._ownFile(), "utf8"));
    expect(sisa.map((e) => e.pid)).toEqual([p2.pid]);

    // Entri terakhir dicabut -> berkasnya ikut hilang, bukan tertinggal kosong.
    mcp._forgetPid(p2.pid);
    expect(fs.existsSync(mcp._ownFile())).toBe(false);
  });

  test("BALAPAN: penulisan serentak banyak proses tak menghilangkan catatan", () => {
    // Inilah alasan pindah dari berkas bersama. Tiap proses anak mencatat 40
    // PID ke berkasnya SENDIRI, semuanya bersamaan. Dengan berkas bersama,
    // baca-ubah-tulis akan saling menimpa dan catatan hilang.
    const N_PROC = 5;
    const N_PID = 40;
    const kode = `
      require(${JSON.stringify(path.join(ROOT, "scripts/ts-register.cjs"))});
      const mcp = require(${JSON.stringify(path.join(ROOT, "agent/mcp-client.ts"))});
      const base = Number(process.argv[1]) * 100000;
      for (let i = 0; i < ${N_PID}; i++) mcp._recordPid(base + i);
    `;
    const anak = [];
    for (let k = 1; k <= N_PROC; k++) {
      anak.push(
        new Promise((res) => {
          const p = spawn(process.execPath, ["-e", kode, String(k)], {
            cwd: ROOT,
            stdio: "ignore",
          });
          p.on("close", () => res(p.pid));
        }),
      );
    }

    return Promise.all(anak).then((pids) => {
      let totalTercatat = 0;
      for (const owner of pids) {
        const isi = mcp._readOwn(owner);
        // Tiap pemilik harus punya SEMUA catatannya — tak ada yang hilang.
        expect(isi).toHaveLength(N_PID);
        totalTercatat += isi.length;
      }
      expect(totalTercatat).toBe(N_PROC * N_PID);
    });
  }, 30000);

  test("berkas format LAMA dimigrasi lalu dibuang", () => {
    // Tanpa jejak pemilik, isinya tak bisa diklaim siapa pun -> yatim.
    fs.mkdirSync(path.dirname(mcp.LEGACY_PID_FILE), { recursive: true });
    fs.writeFileSync(mcp.LEGACY_PID_FILE, JSON.stringify([999997, 999998]));
    mcp._killOrphans();
    expect(fs.existsSync(mcp.LEGACY_PID_FILE)).toBe(false);
  });

  test("handshake gagal lebih cepat dari panggilan tool, tapi TIDAK terlalu ketat", () => {
    // getTools() memblokir langkah PERTAMA agent, jadi handshake tak boleh
    // memakai timeout panggilan tool yang penuh.
    //
    // Batas bawahnya juga dijaga: percobaan dengan 25 detik REGRESI — pada 4
    // proses dingin serentak `npx` berebut cache npm dan handshake tak selesai,
    // hasilnya 24/0/24/24 tool dari 50. Satu proses sendirian butuh 13 detik.
    const src = fs.readFileSync(
      require.resolve("../agent/mcp-client.ts"),
      "utf8",
    );
    const hs = Number(/HANDSHAKE_TIMEOUT_MS\s*=\s*(\d+)/.exec(src)[1]);
    const rq = Number(/REQUEST_TIMEOUT_MS\s*=\s*(\d+)/.exec(src)[1]);
    expect(hs).toBeLessThan(rq);
    expect(hs).toBeGreaterThanOrEqual(45000); // margin untuk cold start npx
  });

  test("server dinyalakan PARALEL, bukan berurutan", () => {
    // `await` di dalam loop membuat waktu tunggu = JUMLAH semua server, bukan
    // yang terlama; satu server mati menahan seluruh agent.
    //
    // Sifat ini PINDAH, bukan hilang. init() dulu men-spawn semua server dan
    // dipanggil getTools() di langkah pertama run agent — terukur 60,3 detik
    // diam tanpa satu pun event. Sekarang penyalaan adalah tindakan eksplisit
    // user (Connect), dan yang menyalakan banyak server sekaligus adalah
    // connectAll(). Di situlah paralelisme sekarang harus dijaga.
    const src = fs.readFileSync(
      require.resolve("../agent/mcp-client.ts"),
      "utf8",
    );
    const body = src.slice(
      src.indexOf("async connectAll()"),
      src.indexOf(
        "_startServer(name, conf)",
        src.indexOf("async connectAll()"),
      ),
    );
    expect(body).toMatch(/Promise\.all/);
    expect(body).not.toMatch(
      /for\s*\([^)]*\)\s*\{[\s\S]*await this\.connectServer/,
    );
  });

  test("init() tak lagi menyalakan server — itu tugas Connect", () => {
    // Penjaga arah: kalau suatu saat ada yang menambahkan connectAll() ke
    // dalam init() demi kenyamanan, cold start 60 detik itu kembali dan
    // gejalanya (run agent diam di awal) sangat sulit ditelusuri balik ke sini.
    const src = fs.readFileSync(
      require.resolve("../agent/mcp-client.ts"),
      "utf8",
    );
    const initBody = src.slice(
      src.indexOf("async init()"),
      src.indexOf("async connectServer"),
    );
    expect(initBody).not.toMatch(/_startServer|connectAll/);
    expect(initBody).toMatch(/_killOrphans\(\)/);
  });
});
