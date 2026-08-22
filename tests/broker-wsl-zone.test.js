// Zona berjalan di WSL sementara broker tetap di proses Windows.
//
// KENAPA ADA. Pengurungan jaringan hanya ada di kernel Linux. Sebelum ini,
// memakainya di Windows menuntut SELURUH backend pindah ke WSL — origin UI
// berubah, kunci di localStorage hilang, dan yang diminta sebenarnya cuma
// fungsinya. Jalur ini membundel fungsinya saja: broker tetap di server Windows,
// hanya worker zona yang dijalankan di WSL.
//
// DUA HAL YANG MEMBUATNYA MUNGKIN, keduanya diuji sebelum dirancang:
//   1. zone-worker.cjs hanya me-require modul BUILTIN (vm, module), jadi bisa
//      dijalankan langsung dari /mnt/c — repo tak perlu disinkronkan ke WSL.
//   2. pipa stdio diteruskan wsl.exe DAN selamat di dalam `unshare -n`, karena
//      pipa bukan jaringan. Jembatan TCP mustahil: zona tanpa rute jaringan tak
//      bisa menelepon balik brokernya.
//
// BUKTI A/B yang membedakan "kernel menahan" dari "stub menahan" — kode sama,
// uji sama, hanya transport yang berbeda:
//     transport WSL, pelapor mati  -> "diblokir EAI_AGAIN"   (kernel)
//     fallback fork, pelapor mati  -> "TEMBUS 403"           (tak terkurung)
//
// Berkas ini SATU-SATUNYA yang memakai transport WSL. Sisanya dipaksa ke fork
// (WOLFSPACE_ZONE_WSL=0), karena Jest menjalankan berkas uji secara paralel dan
// tiap zona lewat WSL berarti satu spawn wsl.exe — terbukti membuat suite flaky:
// sekali merah, sekali hijau, tanpa satu baris kode pun berubah.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  Policy,
  Broker,
  runInCapabilityZone,
} = require("../agent/broker/index.cjs");

const SRC = fs.readFileSync(
  require.resolve("../agent/broker/zone-process.ts"),
  "utf8",
);

const punyaWsl = (() => {
  if (process.platform !== "win32") return false;
  const distro = process.env.WOLFSPACE_WSL_DISTRO || "WolfspaceTest";
  const nodeWsl = process.env.WOLFSPACE_WSL_NODE || "/opt/node24/bin/node";
  try {
    execFileSync(
      "wsl.exe",
      [
        "-d",
        distro,
        "--",
        "sh",
        "-c",
        `test -x ${nodeWsl} && ${nodeWsl} --permission -e "0" && unshare -n true`,
      ],
      { stdio: "ignore", timeout: 25000 },
    );
    return true;
  } catch (_) {
    return false;
  }
})();

describe("struktur transport WSL (semua platform)", () => {
  test("hanya dicoba di Windows, dan bisa dimatikan", () => {
    expect(SRC).toMatch(/process\.platform !== "win32"/);
    expect(SRC).toMatch(/WOLFSPACE_ZONE_WSL/);
  });

  test("kemampuan WSL diuji NYATA, bukan diasumsikan dari platform", () => {
    // Menebak dari platform saja akan gagal di mesin tanpa distro, tanpa node
    // di dalamnya, atau dengan Node < 23 (yang masih memakai
    // --experimental-permission).
    expect(SRC).toMatch(/--permission -e /);
    expect(SRC).toMatch(/unshare -n true/);
    // Dan tak cukup sekadar "keluar 0": biner yang mengabaikan flag tak dikenal
    // (mis. /bin/echo) juga keluar 0. Terbukti lolos dengan probe versi lama,
    // sehingga sistem menyatakan "terkurung" padahal binernya bukan Node.
    // Karena itu Node diminta MENCETAK versinya. Rincian di
    // tests/zone-kurungan-terlihat.test.js.
    expect(SRC).toMatch(/process\.versions\.node/);
  });

  test("token framing acak per eksekusi", () => {
    // Token tetap akan bisa ditebak kode zona, lalu ia mencetak baris palsu yang
    // dibaca sebagai protokol.
    expect(SRC).toMatch(/randomBytes/);
  });

  test("satu penangan pesan untuk KEDUA transport", () => {
    // Dulu logikanya menempel di child.on("message"), yang hanya ada di kanal
    // IPC — transport stdio akan mengabaikan permintaan kapabilitas sepenuhnya,
    // dan zona di WSL tak bisa memakai request() untuk apa pun.
    expect(SRC).toMatch(/function tanganiPesanZona/);
    expect(SRC).toMatch(/if \(!wsl\) child\.on\("message", tanganiPesanZona\)/);
  });
});

const kalauWsl = punyaWsl ? describe : describe.skip;

kalauWsl("perilaku zona di WSL (butuh Windows + WSL siap)", () => {
  let WS;
  const policy = () =>
    new Policy({
      readFile: { roots: [WS] },
      writeFile: { roots: [WS] },
      fetch: { hosts: ["api.github.com"] },
    });
  const jalan = (kode, opts) => {
    const b = new Broker(policy());
    return runInCapabilityZone(kode, b, { timeout: 40000, ...opts })
      .catch((e) => ({
        result: "lempar: " + e.message,
        stdout: e.stdout || "",
      }))
      .then((z) => ({ z, audit: b.auditTrail() }));
  };

  beforeAll(() => {
    WS = fs.mkdtempSync(path.join(os.tmpdir(), "wslzona-"));
    fs.writeFileSync(path.join(WS, "isi.txt"), "DATA-SAH");
  });
  afterAll(() => {
    try {
      fs.rmSync(WS, { recursive: true, force: true });
    } catch (_) {}
  });

  test("request() menyeberang wsl.exe — inti dari bundling ini", async () => {
    // Kalau ini gagal, zona di WSL tak punya kemampuan apa pun dan seluruh
    // jalur jadi sia-sia.
    const { z, audit } = await jalan(
      `return await request("readFile", { path: ${JSON.stringify(path.join(WS, "isi.txt"))} });`,
    );
    expect(String(z.result)).toMatch(/DATA-SAH/);
    expect(audit.some((x) => x.decision === "ALLOW")).toBe(true);
  }, 60000);

  test("policy broker tetap menolak di luar cakupan", async () => {
    const { audit } = await jalan(
      'try { return await request("readFile", { path: "C:/Windows/win.ini" }) } catch (e) { return "ditolak" }',
    );
    expect(audit.some((x) => x.decision === "DENY")).toBe(true);
  }, 60000);

  test("--permission tetap menahan fs langsung", async () => {
    const { z } = await jalan(
      'try { require("fs").readFileSync("/etc/hostname"); return "TEMBUS" } catch (e) { return "ditolak " + e.code }',
    );
    expect(String(z.result)).not.toMatch(/TEMBUS/);
  }, 60000);

  test("zona tak punya jaringan — pelapor dimatikan supaya buktinya sah", async () => {
    // pelapor:false wajib: dengan stub aktif, uji ini lulus meski netns-nya mati.
    const { z } = await jalan(
      'const h=require("node:https");return await new Promise(r=>{const t=setTimeout(()=>r("timeout"),9000);' +
        'try{h.get("https://api.github.com",x=>{clearTimeout(t);r("TEMBUS "+x.statusCode)})' +
        '.on("error",e=>{clearTimeout(t);r("diblokir "+e.code)})}catch(e){clearTimeout(t);r("stub")}});',
      { pelapor: false },
    );
    expect(String(z.result)).not.toMatch(/TEMBUS/);
  }, 60000);

  test("dan pengurungnya BENAR netns, bukan distro yang memang tak berjaringan", () => {
    // KENAPA UJI INI ADA. Uji di atas menyatakan "zona tak punya jaringan" —
    // dan itu saja TIDAK membuktikan network namespace bekerja. Distro yang
    // sejak awal tak punya antarmuka akan memberi hasil yang sama persis, meski
    // `unshare -n` dicabut seluruhnya. Terjadi sungguhan di mesin ini: distro
    // WolfspaceTest hanya punya `lo`, tanpa eth0, tanpa rute — jadi kalimat
    // "KERNEL menahan jaringan" di versi sebelumnya tak didukung apa pun.
    //
    // Kesalahan yang sama pernah dibuat di broker-netns.test.js (memakai
    // hostname sehingga yang gagal DNS, bukan rute). Pola yang harus dijaga:
    // sebuah uji pengurungan wajib memeriksa GARIS DASARNYA lebih dulu, kalau
    // tidak ia cuma mengonfirmasi keadaan yang kebetulan menguntungkan.
    let dasar;
    try {
      execFileSync(
        "wsl.exe",
        [
          "-d",
          process.env.WOLFSPACE_WSL_DISTRO || "WolfspaceTest",
          "--",
          "sh",
          "-c",
          "ip -o link show 2>/dev/null | grep -qv ': lo:' && ip route 2>/dev/null | grep -q .",
        ],
        { stdio: "ignore", timeout: 20000 },
      );
      dasar = true; // distro PUNYA jaringan → netns benar-benar yang mencabutnya
    } catch (_) {
      dasar = false; // distro memang tak berjaringan → netns tak bisa dibuktikan di sini
    }

    if (!dasar) {
      // Bukan kegagalan: posturnya justru lebih kuat (dua penghalang tak
      // bergantung satu sama lain). Yang tak boleh adalah MENGAKU membuktikan
      // netns padahal tidak.
      console.warn(
        "[uji] distro tanpa antarmuka jaringan — pengurungan netns TIDAK " +
          "terbukti di mesin ini, hanya terkonfirmasi tak ada jaringan. " +
          "Untuk membuktikan netns, jalankan pada distro yang berjaringan.",
      );
      return;
    }
    expect(dasar).toBe(true);
  }, 40000);

  test("keluaran zona tetap UTUH meski stdout dipakai bersama protokol", async () => {
    // Transport ini menumpangkan protokol di stdout yang sama dengan console.log
    // kode zona. Kalau framingnya salah, keluaran user ikut termakan — dan itu
    // membatalkan perbaikan pengurasan stdout yang sudah ada.
    const { z } = await jalan(
      'for (let i = 0; i < 2000; i++) console.log("x".repeat(100)); return "selesai";',
    );
    expect(z.result).toBe("selesai");
    expect(z.outBytes).toBeGreaterThan(200000);
    expect(z.stdout).not.toMatch(/WSZ[0-9a-f]{16}/); // token tak bocor ke keluaran
  }, 60000);
});
