// Regresi: koneksi MCP mati di tengah pemakaian lalu hidup sendiri.
//
// SEBAB YANG DIPERBAIKI. Watcher backend di electron/main.js membuang SELURUH
// require.cache di bawah root tiap kali berkas .cjs berubah — kejadian rutin
// pada aplikasi yang menyunting dirinya sendiri. agent/mcp-client.ts ikut
// terbuang, sehingga require berikutnya membuat MCPClient BARU dengan
// initialized=false. init() lalu memanggil _killOrphans(), yang membaca
// .mcp-pids.json dan MEMBUNUH proses MCP yang masih melayani permintaan.
// Terreproduksi dengan server sungguhan: 2 dari 2 proses hidup terbunuh.
//
// KENAPA LEWAT PROSES ANAK, BUKAN DI DALAM JEST.
// Versi pertama tes ini memanggil `delete require.cache[...]` langsung di dalam
// Jest, lalu require ulang dan membandingkan identitas. Ia HIJAU — tapi juga
// tetap hijau setelah perbaikannya sengaja dibalikkan, jadi ia tak menjaga apa
// pun. Sebabnya Jest memakai registry modul sendiri, sehingga require.cache
// Node tak berperan seperti di proses Electron nyata.
//
// Jadi mekanismenya diuji di `node` polos lewat proses anak: satu-satunya tempat
// require.cache berperilaku seperti di produksi. Diverifikasi menangkap regresi —
// dengan singleton globalThis dilepas, tes ini MERAH.

const { execFileSync } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const MCP = path.join(ROOT, "agent", "mcp-client.ts").replace(/\\/g, "/");

// Meniru electron/main.js:866-868 persis, lalu melaporkan hasilnya sebagai JSON.
// Hook .ts dipasang DULU. Subprocess ini node polos, bukan Jest, jadi ia tak
// lewat transformer di package.json. Node 24 kebetulan melucuti tipe sendiri
// sehingga tanpa baris ini pun hijau di mesin pengembang — tapi CI memakai
// Node 20, yang tidak bisa, dan uji ini akan merah hanya di sana.
const TS_REG = path
  .join(ROOT, "scripts", "ts-register.cjs")
  .replace(/\\/g, "/");

const PROBE = `
  require(${JSON.stringify(TS_REG)});
  const path = require("path");
  const ROOT = ${JSON.stringify(ROOT.replace(/\\/g, "/"))};
  const first = require(${JSON.stringify(MCP)});
  first.initialized = true;
  first.servers.__probe = { marker: true };

  let removed = 0;
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(path.resolve(ROOT))) { delete require.cache[k]; removed++; }
  }

  const second = require(${JSON.stringify(MCP)});
  process.stdout.write(JSON.stringify({
    removed,
    sameInstance: second === first,
    initializedKept: second.initialized === true,
    serversKept: !!(second.servers && second.servers.__probe),
  }));
`;

function runProbe() {
  const out = execFileSync(process.execPath, ["-e", PROBE], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 30000,
  });
  return JSON.parse(out.trim());
}

describe("mcp-client bertahan melewati hot-reload backend", () => {
  const r = runProbe();

  test("pembuangan require.cache benar-benar terjadi (menjaga relevansi tes)", () => {
    expect(r.removed).toBeGreaterThan(0);
  });

  test("require setelah cache dibuang mengembalikan instance yang SAMA", () => {
    // Inti perbaikannya. Kalau gagal, instance baru menjalankan _killOrphans()
    // dan membunuh server MCP yang sedang hidup.
    expect(r.sameInstance).toBe(true);
  });

  test("initialized bertahan, sehingga init() tak mengulang _killOrphans", () => {
    expect(r.initializedKept).toBe(true);
  });

  test("handle proses di this.servers tidak hilang saat reload", () => {
    expect(r.serversKept).toBe(true);
  });
});
