// View Logic: pohon berkas di kiri, isi berkasnya di kanan — tata letak VS Code.
//
// Sebelumnya panel berkas mengisi seluruh view dan mengklik berkas tak
// melakukan apa pun: daftar nama tanpa cara melihat isinya.
//
// Yang dijaga di sini adalah hal-hal yang mudah rusak tanpa terlihat rusak:
//   - editor memuat SUMBER, bukan hasil preview yang sudah ditulis ulang
//   - editor dibuat SEKALI, modelnya yang diganti tiap pindah berkas
//   - node pohon membawa PATH, bukan cuma nama
//   - berkas aktif ditandai TETAP, bukan cuma saat hover

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const APP = fs.readFileSync(path.join(AKAR, "public", "app.jsx"), "utf8");
const SRV = fs.readFileSync(path.join(AKAR, "server.cjs"), "utf8");

describe("split berkas + editor di view Logic", () => {
  test("keduanya dirender berdampingan, pohon dulu baru editor", () => {
    const iPohon = APP.indexOf("<LogicFileTree");
    const iKode = APP.indexOf("<LogicCodePane");
    expect(iPohon).toBeGreaterThan(0);
    expect(iKode).toBeGreaterThan(iPohon);
  });

  test("editor memuat SUMBER, bukan hasil preview", () => {
    // /preview-file biasa menyuntikkan <base> ke berkas HTML supaya link
    // relatifnya resolve saat di-preview. Benar untuk preview, SALAH untuk
    // editor: yang tampil bukan lagi isi berkasnya, dan pemakai membaca satu
    // baris yang tidak ada di disk.
    expect(APP).toMatch(/\/preview-file\?raw=1&path=/);
    expect(SRV).toMatch(/qs\.get\("raw"\) === "1"/);
    // Dan mode mentah harus keluar SEBELUM penulisan ulang HTML dilakukan.
    const iRaw = SRV.indexOf('qs.get("raw") === "1"');
    const iBase = SRV.indexOf("const baseTag =");
    expect(iRaw).toBeGreaterThan(0);
    expect(iBase).toBeGreaterThan(iRaw);
  });

  test("editor dibuat SEKALI, modelnya yang diganti", () => {
    // Membuat ulang editor tiap klik menumpuk observer Monaco — jalur yang
    // persis sudah pernah meledak di repo ini (monaco-dekat-layar.test.js).
    const i = APP.indexOf("function LogicCodePane(");
    const blok = APP.slice(i, i + 3000);
    expect(blok).toMatch(
      /if \(dibuang \|\| !hostRef\.current \|\| edRef\.current\) return;/,
    );
    expect(blok).toMatch(/ed\.setModel\(window\.monaco\.editor\.createModel\(/);
    // Model lama dibuang SESUDAH yang baru dipasang.
    const iSet = blok.indexOf("ed.setModel(");
    const iDispose = blok.indexOf("lama.dispose()");
    expect(iDispose).toBeGreaterThan(iSet);
  });

  test("node pohon membawa path, bukan cuma nama", () => {
    // Dua "index.html" di folder berbeda tak terbedakan lewat nama saja.
    expect(APP).toMatch(/rel: pre \+ f\.name/);
    expect(APP).toMatch(/walk\(rootNode, 0, ""\)/);
  });

  test("berkas hanya bisa diklik kalau ia berkas, bukan folder", () => {
    expect(APP).toMatch(
      /n\.type !== "folder" && onPilih && onPilih\(n\.rel \|\| n\.name\)/,
    );
  });

  test("berkas aktif ditandai TETAP, bukan cuma saat hover", () => {
    // Begitu tetikus bergerak, tanpa ini tak ada lagi yang memberi tahu isi
    // editor di kanan milik berkas yang mana.
    expect(APP).toMatch(
      /n\.rel && n\.rel === terpilih \? "#1b2431" : "transparent"/,
    );
  });

  test("state berkas terpilih dipegang bersama, bukan di dalam pohon", () => {
    // Dua panel memakainya: pohon untuk menandai, editor untuk memuat.
    expect(APP).toMatch(
      /const \[logicBerkas, setLogicBerkas\] = useState\(""\)/,
    );
    expect(APP).toMatch(/terpilih=\{logicBerkas\}/);
    expect(APP).toMatch(/rel=\{logicBerkas\}/);
  });
});

describe("ikon per bahasa di pohon berkas", () => {
  test("tanpa pustaka ikon — tabel kecil, nol dependensi", () => {
    // Tema ikon seperti Seti/Material berisi ratusan SVG, sementara aplikasi
    // ini mem-vendor semua asetnya sendiri. Menariknya masuk berarti menambah
    // ratusan berkas demi belasan ekstensi yang benar-benar muncul.
    expect(APP).toMatch(/const BAHASA_IKON = \{/);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(AKAR, "package.json"), "utf8"),
    );
    const dep = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const d of dep)
      expect(d).not.toMatch(/icon-theme|vscode-icons|devicon|file-icons/);
  });

  test("bahasa yang lazim dipakai punya ikonnya", () => {
    for (const e of ["js", "ts", "jsx", "py", "html", "css", "json", "md"])
      if (e !== "md")
        expect(APP).toMatch(new RegExp("\\b" + e + ": \\{ teks:"));
  });

  test("nama khusus menang atas ekstensi", () => {
    // README.md tetap ikon info, bukan monogram — namanya lebih memberi tahu
    // daripada ekstensinya.
    const i = APP.indexOf("function tsjFileType(");
    const blok = APP.slice(i, i + 900);
    expect(blok.indexOf('return "info"')).toBeLessThan(
      blok.indexOf('return "lang:" + ext'),
    );
  });

  test("penyorot Monaco terpisah dari ikon", () => {
    // Keduanya menjawab pertanyaan berbeda: "ikon apa" vs "penyorot mana".
    expect(APP).toMatch(/function bahasaMonaco\(nama\)/);
  });
});
