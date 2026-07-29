// _killOrphans hanya boleh membunuh proses yang BENAR-BENAR yatim.
//
// MASALAH YANG DIPERBAIKI. config/.mcp-pids.json dipakai BERSAMA semua proses
// Node, dan dulu isinya cuma [pid, pid] — tanpa jejak siapa pemiliknya. Setiap
// proses baru memanggil _killOrphans() saat init dan membunuh SEMUA pid di
// berkas itu, termasuk server yang masih hidup milik proses lain yang sedang
// berjalan.
//
// Terukur pada 3 proses serentak SEBELUM perbaikan:
//     b ->  17 detik, 50 tool
//     c ->  17 detik, 50 tool
//     a -> 127 detik, 26 tool   <- server dibunuh tetangga saat handshake
// Proses a menunggu penuh timeout 120 detik, lalu LANJUT dengan separuh tool
// tanpa error apa pun. Kegagalan senyap: agent kehilangan setengah kemampuan
// MCP dan tak tahu, lalu menyimpulkan sesuatu "tidak tersedia".
// Sesudah perbaikan: ketiganya 21 detik, 50 tool.
//
// Ini BERBEDA dari bug hot-reload di mcp-hot-reload.test.js. Yang itu terjadi
// di DALAM satu proses (require.cache dibuang -> instance baru); singleton
// globalThis menutupnya. Yang ini LINTAS PROSES, dan globalThis tak berlaku
// di sana.

const { spawn } = require("child_process");
const fs = require("fs");
const mcp = require("../agent/mcp-client.cjs");

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
};

// Proses boneka berumur panjang — berdiri sebagai "server MCP" tanpa perlu npx.
function bonekaHidup() {
  const p = spawn(process.execPath, ["-e", "setTimeout(()=>{},120000)"], {
    stdio: "ignore",
  });
  return p;
}

describe("_killOrphans membedakan yatim dari milik proses hidup", () => {
  let dibuat = [];
  let backup = null;

  beforeEach(() => {
    dibuat = [];
    try {
      backup = fs.readFileSync(mcp.PID_FILE, "utf8");
    } catch (_) {
      backup = null;
    }
  });

  afterEach(() => {
    for (const p of dibuat) {
      try {
        process.kill(p.pid);
      } catch (_) {}
    }
    if (backup !== null) fs.writeFileSync(mcp.PID_FILE, backup);
    else
      try {
        fs.unlinkSync(mcp.PID_FILE);
      } catch (_) {}
  });

  test("MEMBUNUH yang pemiliknya sudah mati, MEMBIARKAN yang pemiliknya hidup", (done) => {
    const yatim = bonekaHidup();
    const bertuan = bonekaHidup();
    dibuat.push(yatim, bertuan);

    setTimeout(() => {
      mcp._savePids([
        { pid: yatim.pid, owner: 999999, at: Date.now() }, // owner tak ada
        { pid: bertuan.pid, owner: process.pid, at: Date.now() }, // owner = tes ini
      ]);
      expect(alive(yatim.pid)).toBe(true);
      expect(alive(bertuan.pid)).toBe(true);

      mcp._killOrphans();

      setTimeout(() => {
        expect(alive(yatim.pid)).toBe(false); // yatim dibersihkan
        expect(alive(bertuan.pid)).toBe(true); // INTI perbaikan
        done();
      }, 800);
    }, 400);
  }, 15000);

  test("catatan milik proses hidup DIPERTAHANKAN di berkas", () => {
    // Dulu berkasnya dihapus seluruhnya setelah pembersihan, sehingga server
    // proses lain kehilangan jejaknya dan benar-benar jadi yatim nanti.
    mcp._savePids([
      { pid: 999998, owner: 999999, at: Date.now() },
      { pid: 424242, owner: process.pid, at: Date.now() },
    ]);
    mcp._killOrphans();
    const sisa = mcp._loadPids();
    expect(sisa.some((e) => e.pid === 424242)).toBe(true);
    expect(sisa.some((e) => e.pid === 999998)).toBe(false);
  });

  test("format lama ([pid, pid]) tetap terbaca dan dianggap yatim", () => {
    // Upgrade tak boleh menabrak berkas yang sudah ada di mesin pengguna.
    fs.writeFileSync(mcp.PID_FILE, JSON.stringify([111, 222]));
    const e = mcp._loadPids();
    expect(e).toHaveLength(2);
    expect(e[0]).toMatchObject({ pid: 111, owner: 0 });
  });

  test("handshake gagal jauh lebih cepat dari panggilan tool", () => {
    // getTools() memblokir langkah PERTAMA agent. Dengan 120 detik dan start
    // berurutan, dua server bermasalah = 4 menit diam sebelum agent berbuat apa
    // pun. Panggilan tool nyata tetap boleh 120 detik.
    const src = fs.readFileSync(
      require.resolve("../agent/mcp-client.cjs"),
      "utf8",
    );
    const hs = /HANDSHAKE_TIMEOUT_MS\s*=\s*(\d+)/.exec(src);
    const rq = /REQUEST_TIMEOUT_MS\s*=\s*(\d+)/.exec(src);
    expect(hs).not.toBeNull();
    expect(Number(hs[1])).toBeLessThan(Number(rq[1]));
    expect(Number(hs[1])).toBeLessThanOrEqual(30000);
  });

  test("server dinyalakan PARALEL, bukan berurutan", () => {
    // `await` di dalam loop membuat waktu tunggu = JUMLAH semua server, bukan
    // yang terlama; satu server mati menahan seluruh agent.
    const src = fs.readFileSync(
      require.resolve("../agent/mcp-client.cjs"),
      "utf8",
    );
    const initBody = src.slice(
      src.indexOf("_killOrphans();"),
      src.indexOf("this.initialized = true;"),
    );
    expect(initBody).toMatch(/Promise\.all/);
    expect(initBody).not.toMatch(
      /for\s*\([^)]*\)\s*\{[\s\S]*await this\._startServer/,
    );
  });
});
