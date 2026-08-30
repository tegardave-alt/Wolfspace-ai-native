// Host yang tak bisa melayani sebuah kanal harus MELEMPAR, bukan menjawab null.
//
// APA YANG TERJADI. Kanal `api` dialihkan ke electron/backend-host.cjs, dan di
// sana ditulis `c.apiCall ? c.apiCall(payload) : null`. Tapi apiCall() hidup di
// electron/main.ts -- ia membangun req/res palsu terhadap handler HTTP
// in-process -- jadi ia tak pernah ada di ekspor core.js.
//
// Hasilnya host mengembalikan NULL dengan ok:true. Main memperlakukannya sebagai
// jawaban sah dan meneruskannya, alih-alih memakai apiCall yang asli. Pemakai
// memasukkan kunci API dan mendapat "Cannot read properties of null (reading
// 'body')" -- pesan yang tak menyebut satu pun kata tentang sebabnya.
//
// DUA hal dijaga di sini, karena satu saja tak cukup: `api` tak boleh dialihkan,
// DAN null dari host tak boleh dihitung sebagai jawaban. Yang kedua menutup
// seluruh kelasnya, bukan hanya kanal yang kebetulan salah kemarin.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const baca = (rel) => fs.readFileSync(path.join(AKAR, rel), "utf8");

describe("jalur backend-host tak menyerahkan null", () => {
  const MAIN = baca("electron/main.ts");
  const HOST = baca("electron/backend-host.cjs");

  test("null dari host TIDAK dihitung sebagai jawaban", () => {
    // Inilah penjaga yang menutup kelasnya. Tanpa `value != null`, setiap kanal
    // yang salah alih akan menyerahkan null ke renderer.
    expect(MAIN).toMatch(/lewatHost\.ok && lewatHost\.value != null/);
  });

  test("api TIDAK dialihkan ke host — apiCall milik proses main", () => {
    const i = MAIN.indexOf("const lewatHost = await backendInvoke");
    expect(i).toBeGreaterThan(-1);
    const blok = MAIN.slice(Math.max(0, i - 700), i);
    expect(blok).not.toMatch(/channel === "api" \|\| channel === "cloudKeys"/);
    // Dan jalur in-process-nya harus tetap ada.
    expect(MAIN).toMatch(/if \(channel === "api"\) return apiCall\(payload\)/);
  });

  test("host tak lagi memuat cabang api yang mengembalikan null", () => {
    // Komentar dibuang dulu: penjelasan di host MENGUTIP baris yang dihapus,
    // supaya alasannya tetap terbaca. Asersi yang membaca prosa akan gagal
    // karena kalimatnya, bukan karena kodenya.
    const kode = HOST.split(String.fromCharCode(10))
      .filter((b) => !b.trim().startsWith("//"))
      .join(" ");
    expect(kode).not.toMatch(/c\.apiCall/);
  });

  test("kanal tak dikenal di host MELEMPAR", () => {
    // Melempar membuat main jatuh ke jalur in-process. Mengembalikan null
    // membuatnya menyebarkan sesuatu yang terlihat seperti jawaban.
    expect(HOST).toMatch(
      /throw new Error\("unknown invoke channel: " \+ channel\)/,
    );
  });
});
