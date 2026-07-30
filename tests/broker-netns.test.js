// Pengurungan jaringan zona lewat network namespace.
//
// KENAPA ADA. `--permission` menutup berkas tapi TIDAK menyentuh jaringan —
// model permission Node memang tak punya dimensi itu (diperiksa di node
// v24.16.0: yang ada hanya fs, child-process, worker, addons, inspector, wasi).
// Jadi kode zona bisa memanggil https.get() langsung dan berhasil. Itu satu-
// satunya baris tabel serangan README yang lolos.
//
// KENAPA BUKAN DITAMBAL DARI DALAM ZONA. Mengganti http/https/net/tls/dgram di
// require.cache lalu diserang:
//     tertahan  require('https')
//     TEMBUS    require('node:https')            <- kunci cache berbeda
//     tertahan  Module._load('https')
//     TEMBUS    process.binding('tcp_wrap')      <- di BAWAH lapisan modul
//     tertahan  require('net') via createRequire
// 2 dari 5, percobaan pertama. Itu kesalahan yang sama dengan versi
// vm.createContext dulu: menyembunyikan referensi, bukan mencabut kemampuan.
//
// BATASNYA DI KERNEL. `unshare -n` memberi namespace jaringan kosong. Kanal IPC
// SELAMAT karena socketpair-nya sudah terbuka sebelum proses masuk namespace,
// jadi request() tetap bekerja — broker ada di host yang punya jaringan.
// Terukur di WSL2 (kernel 6.18, node v24.16.0), kode broker yang sama:
//     https.get() langsung : Windows "status 403"  -> Linux "EAI_AGAIN"
//     request('fetch')     : Windows "status 403"  -> Linux "status 403"
//     ongkos spawn         : 78,3 ms vs 95,0 ms median, rentang tumpang tindih
//
// Windows tak punya padanannya: aturan firewall per-executable, dan zona adalah
// node.exe yang SAMA dengan host. Karena itu uji PERILAKU di bawah hanya jalan
// di Linux; di Windows yang diuji struktur kodenya, supaya penjaganya tak
// terhapus diam-diam oleh orang yang mengembangkan di Windows.

const fs = require("fs");
const { execFileSync } = require("child_process");
const {
  Policy,
  Broker,
  runInCapabilityZone,
} = require("../agent/broker/index.cjs");

const SRC = fs.readFileSync(
  require.resolve("../agent/broker/zone-process.cjs"),
  "utf8",
);

const punyaNetns = (() => {
  if (process.platform !== "linux") return false;
  try {
    execFileSync("unshare", ["-n", "true"], { stdio: "ignore", timeout: 3000 });
    return true;
  } catch (_) {
    return false;
  }
})();

describe("struktur penjaga jaringan (jalan di semua platform)", () => {
  test("netns HANYA dicoba di Linux", () => {
    // Kalau penjaga platform ini hilang, Windows akan mencoba spawn `unshare`
    // yang tak ada, dan SEMUA eksekusi zona gagal.
    expect(SRC).toMatch(/process\.platform === "linux"/);
  });

  test("memakai spawn saat netns aktif, fork saat tidak", () => {
    // fork tak bisa disisipi pembungkus perintah, jadi jalur netns wajib spawn.
    expect(SRC).toMatch(/spawn\(\s*ns\s*,\s*\[\s*"-n"/);
    expect(SRC).toMatch(/fork\(WORKER/);
  });

  test("kanal ipc dipertahankan di KEDUA jalur", () => {
    // Tanpa 'ipc' di stdio, request() mati total.
    const jml = (SRC.match(/"ignore", "pipe", "pipe", "ipc"/g) || []).length;
    expect(jml).toBeGreaterThanOrEqual(2);
  });

  test("deteksi unshare di-cache, tidak diulang tiap eksekusi", () => {
    // execFileSync per pemanggilan akan menambah syscall di jalur panas.
    expect(SRC).toMatch(/_netnsCache/);
  });
});

const kalauLinux = punyaNetns ? describe : describe.skip;

kalauLinux("perilaku pengurungan jaringan (butuh Linux + unshare)", () => {
  const policy = new Policy({ fetch: { hosts: ["api.github.com"] } });
  // pelapor: false WAJIB di berkas ini. Stub pelapor jaringan (lihat
  // tests/broker-net-report.test.js) melempar SEBELUM soket dibuat, jadi dengan
  // pelapor aktif uji di bawah akan lulus meski network namespace-nya mati —
  // buktinya jadi palsu. Dimatikan, percobaannya benar-benar sampai ke kernel,
  // dan itulah yang berkas ini uji.
  const zona = (code, opts) =>
    runInCapabilityZone(code, new Broker(policy), {
      timeout: 15000,
      pelapor: false,
      ...opts,
    });

  test("https.get() LANGSUNG dari zona diblokir", async () => {
    const z = await zona(
      'const h=require("node:https");' + // specifier yang menembus monkeypatch
        'return await new Promise((res)=>{const t=setTimeout(()=>res("timeout"),8000);' +
        'h.get("https://api.github.com",r=>{clearTimeout(t);res("TEMBUS "+r.statusCode)})' +
        '.on("error",e=>{clearTimeout(t);res("diblokir "+e.code)})});',
    );
    expect(String(z.result)).not.toMatch(/TEMBUS/);
  }, 30000);

  test("request('fetch') lewat broker TETAP hidup", async () => {
    // Inti rancangannya: zona tak punya rute, tapi pintu yang diaudit terbuka.
    // Kalau ini ikut mati, pengurungannya tak ada gunanya.
    const z = await zona(
      'const r = await request("fetch", { url: "https://api.github.com" }); return "status " + r.status;',
    );
    expect(String(z.result)).toMatch(/^status \d+$/);
  }, 30000);

  test("opts.netns=false mematikan pengurungan (jalan keluar darurat)", async () => {
    const z = await zona('return "jalan";', { netns: false });
    expect(z.result).toBe("jalan");
  }, 30000);
});
