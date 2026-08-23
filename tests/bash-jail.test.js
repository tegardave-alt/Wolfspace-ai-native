// Pengurungan bash lewat namespace Linux — pengganti kontainer Docker.
//
// KENAPA MENGGANTI DOCKER. Pengurungan workspace untuk `bash` hanya punya dua
// tingkat: kontainer Docker sekali-pakai bila daemon-nya hidup, atau penjaga
// regex yang kode-nya sendiri melabeli "bocor". Docker menuntut daemon yang
// harus dipasang DAN dinyalakan; di mesin pengembangan ini ia mati, sehingga
// yang benar-benar berjalan sehari-hari adalah penjaga regex itu — pengurungan
// terkuat justru yang paling jarang aktif.
//
// Kernel memberi bahan yang sama tanpa daemon. Padanan satu-per-satu dari
// argumen `docker run` lama:
//     --network none         -> unshare -n
//     -v <ws>:/work          -> mount --bind (hanya folder itu terlihat)
//     --read-only            -> bind sistem + remount ro
//     --tmpfs /tmp:size=64m  -> mount -t tmpfs -o size=64m
//     --pids-limit           -> unshare -p -f + ulimit -u
//
// BATAS YANG JUJUR: ulimit bukan padanan penuh cgroup — `ulimit -v` membatasi
// ruang alamat per proses, bukan RSS satu grup seperti `--memory`. Yang dijamin
// di sini adalah batas AKSES (berkas & jaringan), dan itu alasan pengurungan
// ini ada.
//
// Uji PERILAKU butuh Linux + hak membuat mount namespace, jadi dilewati di
// Windows. Uji STRUKTUR tetap jalan di mana pun supaya penjaganya tak terhapus
// diam-diam oleh orang yang mengembangkan di Windows.

const fs = require("fs");
const os = require("os");
const path = require("path");
const jail = require("../agent/tools/bash-jail.ts");

const SRC = fs.readFileSync(
  require.resolve("../agent/tools/bash-jail.ts"),
  "utf8",
);

describe("struktur pengurungan (semua platform)", () => {
  test("hanya aktif di Linux", () => {
    expect(SRC).toMatch(/process\.platform === "linux"/);
  });

  test("kemampuan diuji NYATA, bukan ditebak dari uid", () => {
    // Menebak dari uid akan salah di container rootless dan di distro yang
    // mengizinkan user namespace tanpa root.
    expect(SRC).toMatch(/execFileSync\(\s*"unshare"/);
  });

  test("membawa keempat jaminan Docker yang lama", () => {
    expect(SRC).toMatch(/"-n"/); // jaringan kosong
    expect(SRC).toMatch(/mount --bind \$\{root\}/); // hanya ws terlihat
    expect(SRC).toMatch(/remount,ro,bind/); // sistem read-only
    expect(SRC).toMatch(/mount -t tmpfs -o size=\$\{TMPFS_SIZE\}/); // /tmp tmpfs
  });

  test("/dev disediakan node-per-node, BUKAN bind seluruhnya", () => {
    // Bind /dev utuh akan memperlihatkan disk mentah — persis yang disembunyikan.
    // Tapi tanpa /dev/null sama sekali, `cmd > /dev/null` gagal dan pengurungan
    // yang benar pun jadi tak terpakai karena merusak perintah lazim.
    expect(SRC).toMatch(/DEV_NODES/);
    expect(SRC).toMatch(/"null"/);
    expect(SRC).not.toMatch(/mount --bind \/dev\s+\$\{jail\}\/dev(?!\/)/);
  });

  test("perintah user lewat stdin, tidak ditempel ke skrip", () => {
    // Menempelkannya berarti kutip atau $(...) di perintah user bisa memecah
    // skrip pembungkus dan lolos sebelum sempat terkurung.
    expect(SRC).toMatch(/__WOLFSPACE_CMD__/);
    expect(SRC).toMatch(/\/bin\/sh -s/);
  });
});

const bisa = jail.tersedia();
const kalauBisa = bisa ? describe : describe.skip;

kalauBisa("perilaku pengurungan (butuh Linux + namespace)", () => {
  let WS;
  const RAHASIA_HOST = path.join(os.tmpdir(), "wolfspace-uji-host.txt");

  beforeAll(() => {
    WS = fs.mkdtempSync(path.join(os.tmpdir(), "wolfspace-ws-"));
    fs.writeFileSync(path.join(WS, "didalam.txt"), "isi-workspace");
    // Isi dan NAMA berkas sengaja berbeda: versi pertama uji ini keliru karena
    // polanya cocok dengan nama berkas di pesan error, bukan isinya.
    fs.writeFileSync(RAHASIA_HOST, "ZIRKONIA-RAHASIA");
  });
  afterAll(() => {
    try {
      fs.rmSync(WS, { recursive: true, force: true });
      fs.unlinkSync(RAHASIA_HOST);
    } catch (_) {}
  });

  const jalan = (cmd) => jail.jalankan(cmd, WS, { timeout: 20000 });

  test("kerja SAH tetap jalan: baca, tulis, pipa, /dev/null", async () => {
    // Pengurungan yang merusak perintah biasa akan dimatikan orang, jadi ini
    // sama pentingnya dengan blokirnya.
    expect((await jalan("cat didalam.txt")).output).toMatch(/isi-workspace/);
    expect((await jalan("echo baru > h.txt && cat h.txt")).output).toMatch(
      /baru/,
    );
    expect((await jalan(`echo "a b" | tr ' ' '-'`)).output).toMatch(/a-b/);
    expect((await jalan("echo x > /dev/null && echo LULUS")).output).toMatch(
      /LULUS/,
    );
  }, 60000);

  test("tulisan di dalam jail SAMPAI ke workspace host", async () => {
    await jalan("echo tembus > sampai.txt");
    expect(fs.existsSync(path.join(WS, "sampai.txt"))).toBe(true);
  }, 30000);

  test("MEMBLOKIR isi berkas host di luar workspace", async () => {
    const r = await jalan(`cat ${RAHASIA_HOST}`);
    expect(r.output).not.toMatch(/ZIRKONIA-RAHASIA/);
  }, 30000);

  test("MEMBLOKIR /etc dan naik direktori", async () => {
    expect((await jalan("cat /etc/passwd")).output).not.toMatch(/root:/);
    // Yang terlihat hanya isi jail, bukan filesystem host.
    expect((await jalan("ls /work/../..")).output).not.toMatch(/home|mnt|proc/);
  }, 30000);

  test("MEMBLOKIR tulis di direktori sistem", async () => {
    expect((await jalan("touch /bin/jahat && echo BISA")).output).not.toMatch(
      /BISA/,
    );
  }, 30000);

  test("MEMBLOKIR jaringan — diuji di level TCP, bukan DNS", async () => {
    // Versi pertama uji ini memakai `wget https://<nama-host>` dan LULUS bahkan
    // setelah `unshare -n` dilepas — bukan karena isolasi bekerja, melainkan
    // karena chroot tak punya /etc/resolv.conf sehingga DNS gagal. Uji itu
    // memberi rasa aman palsu terhadap justru jaminan yang paling penting.
    //
    // Sekarang: soket TCP nyata ke ALAMAT IP (tanpa DNS sama sekali), pada
    // listener yang dinyalakan uji ini sendiri — hermetis, tak bergantung
    // internet. Pembedanya terbukti: dengan -n "gagal-tcp", tanpa -n
    // "TEMBUS-TCP".
    const net = require("net");
    const srv = net.createServer((s) => s.end("halo"));
    await new Promise((r) => srv.listen(0, "0.0.0.0", r));
    const port = srv.address().port;

    // IP distro, bukan 127.0.0.1: loopback tetap ada di dalam netns kosong,
    // jadi memakainya akan menguji hal yang salah.
    let ip = null;
    for (const iface of Object.values(os.networkInterfaces()))
      for (const a of iface || [])
        if (a.family === "IPv4" && !a.internal) ip = ip || a.address;

    try {
      if (!ip) return; // tak ada antarmuka non-loopback: tak ada yang bisa diuji
      const probe = `nc -w 4 ${ip} ${port} </dev/null >/dev/null 2>&1 && echo TEMBUS-TCP || echo gagal-tcp`;
      const r = await jalan(probe);
      expect(r.output).toMatch(/gagal-tcp/);
      expect(r.output).not.toMatch(/TEMBUS-TCP/);
    } finally {
      srv.close();
    }
  }, 40000);

  test("mount jail TIDAK bocor ke namespace host", async () => {
    // CATATAN JUJUR: uji ini TIDAK membedakan ada-tidaknya flag `-m`. Diperiksa
    // langsung — melepas `-m` pun mount tetap tak bocor, karena `--mount-proc`
    // sudah menyiratkan mount namespace. Jadi ia menjaga INVARIANNYA ("tak ada
    // sisa mount di host"), bukan mekanisme tertentu; kalau suatu saat
    // --mount-proc dilepas juga, uji inilah yang menangkapnya.
    const sebelum = fs.readFileSync("/proc/self/mounts", "utf8");
    await jalan("echo x > bocor.txt");
    const sesudah = fs.readFileSync("/proc/self/mounts", "utf8");
    const jailMounts = sesudah
      .split("\n")
      .filter((l) => l.includes("wolfspace-jail-"));
    expect(jailMounts).toHaveLength(0);
    expect(sesudah.split("\n").length).toBe(sebelum.split("\n").length);
  }, 30000);

  test("MEMBLOKIR upaya memecah heredoc pembungkus", async () => {
    const r = await jalan(`echo '__WOLFSPACE_CMD__'; cat ${RAHASIA_HOST}`);
    expect(r.output).not.toMatch(/ZIRKONIA-RAHASIA/);
  }, 30000);
});
