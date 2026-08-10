// ── Diagnostik jaringan lewat WSL, TANPA shell bebas ──
//
// KENAPA ADA. Agent tak punya cara memeriksa jaringan. `webExtract` melewati
// penjaga SSRF dan hanya bicara HTTP; tak ada yang menjawab "apakah host ini
// bisa dijangkau", "rutenya ke mana", atau "port ini terbuka?". Satu-satunya
// jalan selama ini adalah `bash` — yang di Windows batasnya cuma pemindaian
// teks, dan sudah terbukti bisa ditembus.
//
// BENTUKNYA SENGAJA BUKAN "jalankan perintah". Tool ini tak menerima perintah;
// ia menerima OPERASI dari daftar tetap, lalu MEMBANGUN argv-nya sendiri.
// Bedanya menentukan: tak ada teks perintah yang perlu dipindai, jadi tak ada
// yang bisa dirakit untuk lolos dari pemindai. Batasnya bukan tebakan atas
// string — ia sifat dari bentuk data yang diterima.
//
// Ini penerapan pola yang sama dengan broker: bukan "kurung shell-nya", tapi
// "jangan beri shell sama sekali, beri kapabilitas bernama".
//
// Dijalankan DI DALAM distro WSL, bukan di Windows. Konsekuensinya nyata dan
// disengaja: proses diagnostik tak pernah menyentuh sistem berkas Windows, dan
// tak bisa — /mnt/c kosong di distro ini.
"use strict";

const { execFile } = require("child_process");
const _penegakan = require("../penegakan.cjs");

const DISTRO = process.env.WOLFSPACE_WSL_DISTRO || "WolfspaceTest";
const BATAS_MS = 20000;
const MAKS_KELUARAN = 8000;

// Host harus berupa nama domain atau IP — tak ada spasi, tak ada karakter yang
// bisa berubah arti di lapisan mana pun. Divalidasi SEBELUM masuk argv, dan
// argv dilewatkan sebagai array (execFile), jadi tak ada shell yang menguraikan.
const HOST_SAH = /^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/;
const PORT_SAH = (p) => Number.isInteger(p) && p > 0 && p < 65536;

/**
 * Operasi yang tersedia. Tiap entri MEMBANGUN argv-nya sendiri dari parameter
 * yang sudah divalidasi — pemanggil tak pernah menyumbang teks mentah.
 * @type {Record<string, {butuhHost?: boolean, butuhPort?: boolean, argv: (a: {host?: string, port?: number}) => string[], jelas: string}>}
 */
const OPERASI = {
  ping: {
    butuhHost: true,
    jelas: "kirim 4 paket ICMP, laporkan hilang/waktu",
    argv: (a) => ["ping", "-c", "4", "-W", "3", String(a.host)],
  },
  rute: {
    jelas: "tabel rute distro (ip route)",
    argv: () => ["ip", "route"],
  },
  antarmuka: {
    // BusyBox ip TIDAK punya -br; memakainya membuat tool mencetak halaman
    // bantuan alih-alih menjawab. Diuji di distro ini, bukan disalin dari ip
    // versi iproute2 penuh.
    jelas: "daftar antarmuka jaringan (ip addr)",
    argv: () => ["ip", "addr"],
  },
  jejak: {
    butuhHost: true,
    jelas: "traceroute, maksimal 12 lompatan",
    argv: (a) => ["traceroute", "-m", "12", "-w", "2", String(a.host)],
  },
  port: {
    butuhHost: true,
    butuhPort: true,
    jelas: "cek satu port TCP terbuka atau tidak",
    argv: (a) => ["nc", "-z", "-w", "4", String(a.host), String(a.port)],
  },
  kepala: {
    butuhHost: true,
    jelas: "ambil header HTTP saja (wget --spider), tanpa mengunduh isi",
    argv: (a) => [
      "wget",
      "--spider",
      "--timeout=8",
      "--tries=1",
      "-S",
      "https://" + String(a.host),
    ],
  },
};

function daftarOperasi() {
  return Object.entries(OPERASI).map(([k, v]) => ({
    operasi: k,
    jelas: v.jelas,
    butuhHost: !!v.butuhHost,
    butuhPort: !!v.butuhPort,
  }));
}

/**
 * @param {{operasi?: string, host?: string, port?: number}} args
 */
function jalankan(args) {
  const nama = String((args && args.operasi) || "").trim();
  const spek = OPERASI[nama];
  if (!spek) {
    return Promise.resolve({
      ok: false,
      output:
        'operasi "' +
        nama +
        '" tak dikenal. Yang tersedia: ' +
        Object.keys(OPERASI).join(", ") +
        ". Tool ini TIDAK menerima perintah bebas — hanya operasi bernama.",
      ..._penegakan.label("kernel", "wsl-daftar-tetap"),
    });
  }

  const host = args && args.host != null ? String(args.host).trim() : "";
  if (spek.butuhHost && !HOST_SAH.test(host)) {
    return Promise.resolve({
      ok: false,
      output:
        'host tak sah: "' +
        host +
        '". Harus nama domain atau IP tanpa spasi/skema/path.',
      ..._penegakan.label("kernel", "wsl-daftar-tetap"),
    });
  }
  const port = args && args.port != null ? Number(args.port) : undefined;
  if (spek.butuhPort && !PORT_SAH(port)) {
    return Promise.resolve({
      ok: false,
      output: "port tak sah: " + String(args && args.port) + " (1-65535)",
      ..._penegakan.label("kernel", "wsl-daftar-tetap"),
    });
  }

  const argv = spek.argv({ host, port });
  return new Promise((resolve) => {
    execFile(
      "wsl.exe",
      ["-d", DISTRO, "--", ...argv],
      { timeout: BATAS_MS, encoding: "utf8", windowsHide: true },
      (err, stdout, stderr) => {
        let teks = String(stdout || "") + String(stderr || "");
        // Banyak alat jaringan keluar dengan kode != 0 justru saat menjawab
        // pertanyaannya (ping ke host mati, nc ke port tertutup). Itu HASIL,
        // bukan kegagalan tool — jadi keluarannya tetap dikembalikan.
        //
        // `nc -z` bahkan tak mencetak APA PUN; jawabannya hanya ada di kode
        // keluar. Mengembalikan "(tak ada keluaran)" untuk itu akan membuat
        // tool tampak bekerja sambil tak menjawab pertanyaannya — kelas cacat
        // yang sama dengan laporan yang terdengar lebih kuat dari kenyataan.
        if (nama === "port") {
          const terbuka = !err;
          teks =
            String(args.host) +
            ":" +
            String(port) +
            " " +
            (terbuka ? "TERBUKA" : "tertutup atau tak menjawab dalam 4 detik") +
            (teks.trim() ? "\n" + teks.trim() : "");
        }
        resolve({
          ok: !err || !!teks.trim(),
          output:
            (teks.trim() || "(tak ada keluaran)").slice(0, MAKS_KELUARAN) +
            (err && err.killed
              ? "\n[dihentikan: lewat " + BATAS_MS + " ms]"
              : ""),
          operasi: nama,
          distro: DISTRO,
          ..._penegakan.label("kernel", "wsl-daftar-tetap"),
        });
      },
    );
  });
}

module.exports = { jalankan, daftarOperasi, OPERASI, HOST_SAH };
