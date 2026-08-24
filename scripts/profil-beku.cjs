#!/usr/bin/env node
// Pengawas beku: merekam SENDIRI saat jendela berhenti menjawab.
//
// KENAPA PENGAWAS, BUKAN PERINTAH SEKALI JALAN. Saat Anda melihat "Not
// Responding" lalu berpindah ke terminal dan mengetik sesuatu, macetnya sudah
// lewat. Profil yang diambil sesudahnya merekam aplikasi yang sedang sehat, dan
// itu tak memberi tahu apa pun. Jadi profiler di sini terus berjalan, dan yang
// ditulis ke disk adalah potongan TEPAT saat macet terjadi.
//
// DUA PROSES DIAWASI, karena keduanya bisa jadi penyebab dan gejalanya sama:
//
//   MAIN     backend hidup di sini (main.js -> core.js -> server.cjs) DAN proses
//            ini memiliki BrowserWindow serta memompa antrian pesan Windows.
//            Kerja sinkron di sini = Windows menandai jendela "Not Responding".
//   RENDERER mem-parse ~9 MB skrip vendor lalu mengompilasi 15 modul dengan
//            Babel DI DALAM browser sebelum satu piksel pun tergambar. Renderer
//            yang tersumbat membuat jendela tampak beku walau OS belum menandai.
//
// Mengukur yang salah satunya adalah kesalahan yang mudah dilakukan dan mahal:
// renderer bisa terlihat sehat sementara main terkunci, dan sebaliknya.
//
// PAKAI:
//   terminal 1:  WOLFSPACE_PROFILE=1 npm run app     (PowerShell: $env:WOLFSPACE_PROFILE=1)
//   terminal 2:  npm run profil
//
// HASILNYA di _profil/:
//   beku.log                        satu baris per kejadian + tersangka teratas
//   beku-<waktu>-<proses>.cpuprofile  profil V8, bisa dibuka di DevTools
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const DIR = path.join(AKAR, "_profil");
const LOG = path.join(DIR, "beku.log");

const PORT_MAIN = Number(process.env.WOLFSPACE_PROFILE_PORT_MAIN || 9333);
const PORT_RENDERER = Number(
  process.env.WOLFSPACE_PROFILE_PORT_RENDERER || 9444,
);

// Ambang. 400 ms dipilih karena di bawah itu manusia belum merasakannya sebagai
// "macet"; di atasnya mulai terasa sebagai kursor yang tak menjawab.
const AMBANG_MS = Number(process.env.WOLFSPACE_PROFILE_AMBANG || 400);
// Sampel rapat: sepuluh blokir 300 ms sama merusaknya dengan satu blokir 3 detik,
// dan sampling yang jarang akan melewatkan bentuk yang pertama.
const INTERVAL_SAMPEL_US = 200;
// Berapa lama menunggu proses yang beku sadar kembali sebelum menyerah. Macet
// 30 detik masih layak direkam; yang lebih lama biasanya berarti hang permanen,
// dan untuk itu profil tak akan pernah datang berapa pun kita menunggu.
const BATAS_TUNGGU_MS = Number(process.env.WOLFSPACE_PROFILE_TUNGGU || 45000);

const T0 = Date.now();
const det = () => ((Date.now() - T0) / 1000).toFixed(1).padStart(7);
const tidur = (ms) => new Promise((r) => setTimeout(r, ms));
const waktuBerkas = () => new Date().toISOString().replace(/[:.]/g, "-");

fs.mkdirSync(DIR, { recursive: true });

function catat(baris) {
  const s = "[" + new Date().toISOString() + "] " + baris;
  console.log(det() + "s  " + baris);
  try {
    fs.appendFileSync(LOG, s + "\n");
  } catch (_) {}
}

// ── klien CDP seperlunya ────────────────────────────────────────────────────
class Cdp {
  constructor(nama, wsUrl) {
    this.nama = nama;
    this.wsUrl = wsUrl;
    this.id = 1;
    this.tunggu = new Map();
    this.ws = null;
  }
  async buka() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = () => rej(new Error("websocket failed: " + this.nama));
    });
    this.ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch (_) {
        return;
      }
      if (m.id && this.tunggu.has(m.id)) {
        this.tunggu.get(m.id)(m);
        this.tunggu.delete(m.id);
      }
    };
    this.ws.onclose = () => {
      this.ws = null;
    };
  }
  kirim(method, params, batasMs) {
    if (!this.ws) return Promise.resolve(null);
    return new Promise((res) => {
      const n = this.id++;
      let selesai = false;
      const tuntas = (v) => {
        if (selesai) return;
        selesai = true;
        this.tunggu.delete(n);
        res(v);
      };
      this.tunggu.set(n, tuntas);
      try {
        this.ws.send(JSON.stringify({ id: n, method, params: params || {} }));
      } catch (_) {
        return tuntas(null);
      }
      // Batas waktu WAJIB: proses yang terkunci tak akan pernah menjawab, dan
      // tanpa ini pengawas ikut menggantung bersama yang diawasinya.
      if (batasMs) setTimeout(() => tuntas(null), batasMs);
    });
  }
}

async function targetList(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(1500),
    });
    return await r.json();
  } catch (_) {
    return null;
  }
}

// ── ringkas profil jadi tersangka ───────────────────────────────────────────
//
// Yang dilaporkan SELF-TIME, bukan total. Total selalu menunjuk ke pemanggil
// paling luar (main, require, dst) dan tak pernah menyebut penyebabnya.
// (idle) dibuang dari daftar tersangka: itu MENUNGGU, bukan bekerja — dan
// kebingungan itulah yang membuat orang mengejar hal yang salah.
function tersangka(profil, n) {
  const node = new Map();
  for (const x of profil.nodes || []) node.set(x.id, x);
  const self = new Map();
  const d = profil.timeDeltas || [];
  const s = profil.samples || [];
  let blokirMaks = 0;
  let blokirDi = "-";
  for (let i = 0; i < s.length; i++) {
    const dt = d[i] || 0;
    const nd = node.get(s[i]);
    if (!nd) continue;
    const cf = nd.callFrame || {};
    const nama = cf.functionName || "(anonim)";
    const berkas = cf.url
      ? path.basename(
          String(cf.url)
            .replace(/^file:\/+/, "")
            .split("?")[0],
        )
      : "-";
    const kunci =
      nama +
      "  " +
      berkas +
      (cf.lineNumber >= 0 ? ":" + (cf.lineNumber + 1) : "");
    self.set(kunci, (self.get(kunci) || 0) + dt);
    // Jarak antar-sampel yang besar = profiler tak sempat mengambil sampel =
    // thread terkunci di dalam SATU panggilan. Inilah bentuk yang membekukan.
    if (dt > blokirMaks) {
      blokirMaks = dt;
      blokirDi = kunci;
    }
  }
  const urut = [...self.entries()]
    .filter(([k]) => !k.startsWith("(idle)"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n || 5);
  return {
    blokirMaksMs: Math.round(blokirMaks / 1000),
    blokirDi,
    atas: urut.map(([k, v]) => ({ di: k, ms: Math.round(v / 1000) })),
  };
}

// ── satu proses yang diawasi ────────────────────────────────────────────────
class Awasi {
  constructor(nama, cdp) {
    this.nama = nama;
    this.cdp = cdp;
    this.jalan = false;
  }
  async mulaiProfil() {
    await this.cdp.kirim("Profiler.enable", {}, 3000);
    await this.cdp.kirim(
      "Profiler.setSamplingInterval",
      { interval: INTERVAL_SAMPEL_US },
      3000,
    );
    const r = await this.cdp.kirim("Profiler.start", {}, 3000);
    this.jalan = r != null;
    return this.jalan;
  }
  /**
   * Tunggu sampai proses ini sanggup menjawab lagi.
   *
   * KENAPA HARUS. Perintah CDP diproses di thread yang SAMA dengan yang sedang
   * terkunci. Jadi selama macet, Profiler.stop tak akan pernah dijawab — dan
   * versi pertama alat ini menyerah setelah 8 detik lalu melaporkan
   * "Profiler.stop TIDAK menjawab". Akibatnya persis kebalikan dari yang
   * dibutuhkan: profil tertulis untuk semua proses KECUALI yang benar-benar
   * beku. Terukur: dua penangkapan, dua-duanya main, nol renderer.
   *
   * Menunggu aman karena sampler V8 berjalan di thread TERPISAH — ia tetap
   * mengambil sampel selama JS terkunci. Jadi profil yang diambil SESUDAH macet
   * berakhir tetap memuat macetnya, lengkap dengan tumpukan pemanggilannya.
   */
  async siapKembali(batasMs) {
    const tenggat = Date.now() + batasMs;
    while (Date.now() < tenggat) {
      const r = await this.cdp.kirim(
        "Runtime.evaluate",
        { expression: "1", returnByValue: true },
        2000,
      );
      if (r !== null) return true;
    }
    return false;
  }

  /** Tulis profil ke disk dan kembalikan ringkasannya. */
  async tangkap(sebab, bekuMs, bekuPada) {
    if (!this.jalan) return null;

    // Tunggu dulu, jangan menyerah. Inilah bedanya antara merekam macetnya dan
    // merekam segalanya kecuali macetnya.
    const sadar = await this.siapKembali(BATAS_TUNGGU_MS);
    if (!sadar) {
      catat(
        `[${this.nama}] still locked after ${BATAS_TUNGGU_MS / 1000} s — ` +
          `a profile cannot be taken from this process`,
      );
      return null;
    }

    const r = await this.cdp.kirim("Profiler.stop", {}, 20000);
    this.jalan = false;
    const profil = r && r.result && r.result.profile;
    if (!profil) {
      catat(
        `[${this.nama}] Profiler.stop failed even though the process answered`,
      );
      await this.mulaiProfil();
      return null;
    }
    const berkas = path.join(
      DIR,
      `beku-${waktuBerkas()}-${this.nama}.cpuprofile`,
    );
    try {
      fs.writeFileSync(berkas, JSON.stringify(profil));
    } catch (e) {
      catat(`[${this.nama}] failed to write the profile: ${e.message}`);
    }
    const t = tersangka(profil, 5);
    // Dua label berbeda, dan bedanya penting: yang BEKU belum tentu yang sedang
    // dilaporkan. Versi pertama alat ini menulis "proses=main" untuk macet yang
    // terjadi di renderer, dan itu menuntun ke arah yang salah.
    catat(
      `BEKU ${bekuMs} ms pada [${bekuPada}] (${sebab}) | profil dari [${this.nama}] | ` +
        `blokir terpanjang ${t.blokirMaksMs} ms di ${t.blokirDi}`,
    );
    for (const a of t.atas)
      catat(`    tersangka: ${String(a.ms).padStart(6)} ms  ${a.di}`);
    catat(`    profile: ${path.relative(AKAR, berkas)}`);
    // Langsung mulai lagi — macet berikutnya bisa datang beberapa detik lagi.
    await this.mulaiProfil();
    return t;
  }
}

// ── pemantau .Responding milik Windows ──────────────────────────────────────
//
// Ini gejala yang BENAR-BENAR DILIHAT user, bukan proksinya. Diambil dari OS,
// bukan disimpulkan dari dalam aplikasi yang sedang bermasalah.
function pantauResponding(onBeku) {
  const PS = `
while ($true) {
  $p = Get-Process electron -ErrorAction SilentlyContinue |
       Where-Object { $_.MainWindowHandle -ne 0 }
  foreach ($x in $p) { Write-Output ("R|{0}|{1}" -f $x.Id, $x.Responding) }
  Start-Sleep -Milliseconds 200
}`;
  const ps = spawn(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", PS],
    { stdio: ["ignore", "pipe", "ignore"] },
  );
  const mulaiBeku = new Map();
  ps.stdout.on("data", (d) => {
    for (const b of String(d).split(/\r?\n/)) {
      const m = b.trim().split("|");
      if (m[0] !== "R" || m.length < 3) continue;
      const pid = m[1];
      const menjawab = m[2] === "True";
      if (!menjawab) {
        if (!mulaiBeku.has(pid)) mulaiBeku.set(pid, Date.now());
      } else if (mulaiBeku.has(pid)) {
        const lama = Date.now() - mulaiBeku.get(pid);
        mulaiBeku.delete(pid);
        if (lama >= AMBANG_MS)
          onBeku(lama, "window .Responding=False, PID " + pid);
      }
    }
  });
  return ps;
}

// ── utama ───────────────────────────────────────────────────────────────────
(async () => {
  console.log("Pengawas beku WOLFSPACE — ambang " + AMBANG_MS + " ms");
  console.log("hasil -> " + path.relative(AKAR, DIR) + "/\n");

  const daftarMain = await targetList(PORT_MAIN);
  const daftarRen = await targetList(PORT_RENDERER);
  if (!daftarMain && !daftarRen) {
    console.error(
      "The debug port is closed. Run the app with profiling on:\n\n" +
        "  PowerShell:  $env:WOLFSPACE_PROFILE=1; npm run app\n" +
        "  bash:        WOLFSPACE_PROFILE=1 npm run app\n\n" +
        "lalu jalankan lagi:  npm run profil",
    );
    process.exit(1);
  }

  const awas = [];
  const pasang = async (nama, daftar, pilih) => {
    const t = (daftar || []).find(pilih);
    if (!t) {
      catat(`[${nama}] target not found — this process is NOT being watched`);
      return;
    }
    const c = new Cdp(nama, t.webSocketDebuggerUrl);
    try {
      await c.buka();
      const a = new Awasi(nama, c);
      if (await a.mulaiProfil()) {
        awas.push(a);
        catat(`[${nama}] diawasi — ${String(t.title || t.url).slice(0, 50)}`);
      } else catat(`[${nama}] profiler menolak start`);
    } catch (e) {
      catat(`[${nama}] failed to connect: ${e.message}`);
    }
  };

  await pasang("main", daftarMain, (x) => !!x.webSocketDebuggerUrl);
  await pasang(
    "renderer",
    daftarRen,
    (x) => x.type === "page" && !!x.webSocketDebuggerUrl,
  );

  if (!awas.length) {
    console.error("Not a single process can be watched.");
    process.exit(1);
  }

  let sedangTangkap = false;
  let tangkapTerakhir = 0;
  const tangkapSemua = async (lamaMs, sebab, bekuPada) => {
    // Satu penangkapan pada satu waktu: dua Profiler.stop bersamaan menghasilkan
    // profil sobek dan saling menimpa.
    if (sedangTangkap) return;
    // Jeda pendek sesudah satu penangkapan. Tanpa ini, SATU macet panjang
    // terdeteksi berkali-kali oleh dua detektor dan menghasilkan tumpukan
    // profil yang isinya kejadian yang sama.
    if (Date.now() - tangkapTerakhir < 5000) return;
    sedangTangkap = true;
    try {
      for (const a of awas) await a.tangkap(sebab, lamaMs, bekuPada);
    } finally {
      tangkapTerakhir = Date.now();
      sedangTangkap = false;
    }
  };

  const ps = pantauResponding(
    (lama, sebab) => void tangkapSemua(lama, sebab, "main/window"),
  );

  // Detektor kedua, dari SISI DALAM: berapa lama renderer membalas evaluate
  // sepele. Ini menangkap renderer yang tersumbat SEBELUM Windows menandainya
  // "Not Responding" — dan macet yang paling sering dikeluhkan justru yang
  // belum sempat ditandai OS.
  const ren = awas.find((a) => a.nama === "renderer");
  if (ren) {
    setInterval(async () => {
      if (sedangTangkap) return;
      const t = Date.now();
      const r = await ren.cdp.kirim(
        "Runtime.evaluate",
        { expression: "1", returnByValue: true },
        15000,
      );
      const lama = Date.now() - t;
      if (r === null) {
        void tangkapSemua(
          15000,
          "renderer did not answer for 15 s",
          "renderer",
        );
      } else if (lama >= AMBANG_MS) {
        void tangkapSemua(lama, "renderer lambat membalas", "renderer");
      }
    }, 1000);
  }

  console.log("\nMengawasi. Pakai aplikasinya seperti biasa.");
  console.log("When the window freezes, its profile is written automatically.");
  console.log("Ctrl+C to stop.\n");

  const bersih = () => {
    try {
      ps.kill();
    } catch (_) {}
    process.exit(0);
  };
  process.on("SIGINT", bersih);
  process.on("SIGTERM", bersih);
})();
