// Zona WSL mengurung BERKAS di kernel, bukan hanya jaringan.
//
// SEBELUM: jalur WSL membungkus worker dengan `unshare -n` saja. Itu mengurung
// jaringan; berkas diserahkan sepenuhnya kepada `--permission` milik Node.
// Satu mekanisme userspace, satu flag, satu titik gagal — dan repo ini sudah
// pernah kehilangan batas userspace sekali (zona berbasis vm.createContext yang
// ditembus; lihat agent/broker/README.md).
//
// Terukur di distro ini, TANPA --permission, supaya yang diuji benar-benar
// pembungkusnya dan bukan flag Node:
//
//   unshare -n saja  ->  tulis /etc TEMBUS,   /mnt 6 entri
//   bwrap            ->  tulis /etc EROFS,    /mnt 0 entri
//
// --tmpfs /mnt adalah bagian yang paling penting. Distro WSL biasa me-mount
// SELURUH drive Windows di /mnt/c. Tanpa masker itu, kuat-lemahnya pengurungan
// zona ditentukan oleh konfigurasi distro — sesuatu yang tak bisa dijamin kode.
// Dengan masker, jaminannya milik kode.
//
// ONGKOSNYA NOL. Terukur -3 ms dibanding node telanjang, yaitu di dalam derau.
// Yang mahal di jalur ini adalah meluncurkan wsl.exe: 183 ms dari total 216 ms.

const { wslZona, statusKurungan } = require("../agent/broker/zone-process.cjs");

const zona = process.platform === "win32" ? wslZona() : null;
const jalankan = zona ? describe : describe.skip;

jalankan("zona WSL: pengurungan berkas", () => {
  test("bwrap DIPERIKSA di distro, tidak diasumsikan", () => {
    // Nilainya boleh true atau false — yang tak boleh adalah undefined, karena
    // itu berarti tak ada yang pernah memeriksanya.
    expect(typeof zona.bwrap).toBe("boolean");
  });

  test("status melaporkan jaminan berkas TERPISAH dari jaringan", () => {
    const st = statusKurungan(null, zona, false);
    expect(st.transport).toBe("wsl-netns");
    expect(st.jaringanTerkurung).toBe(true);
    // Dua jaminan, dua bendera. Satu bendera gabungan akan menyembunyikan
    // keadaan "jaringan terkurung, berkas tidak" — yang justru keadaan nyata
    // pada distro tanpa bwrap.
    expect(typeof st.berkasTerkurung).toBe("boolean");
    expect(st.berkasTerkurung).toBe(!!zona.bwrap);
    expect(["bwrap", "unshare"]).toContain(st.pembungkus);
  });

  test("pembungkus yang dilaporkan COCOK dengan kemampuan distro", () => {
    const st = statusKurungan(null, zona, false);
    expect(st.pembungkus).toBe(zona.bwrap ? "bwrap" : "unshare");
    // Tak boleh mengklaim berkas terkurung sambil memakai unshare — itu persis
    // bentuk laporan yang lebih berbahaya daripada tak melaporkan apa pun.
    if (st.pembungkus === "unshare") expect(st.berkasTerkurung).toBe(false);
  });
});
