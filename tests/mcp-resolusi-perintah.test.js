// Resolusi perintah server MCP dari apa yang diketik user.
//
// KENAPA ADA. Versi lama MENGARANG nama paket dari nama server:
//
//     args = ["-y", `@modelcontextprotocol/server-${cleanType}`]
//
// Scope itu hanya memuat segelintir server resmi, jadi apa pun di luar daftar
// jadi 404 — dengan pesan npm yang tak menyebut bahwa namanya memang dikarang.
// Terekam di log run nyata:
//
//   Memulai server MCP: n8n {"cmd":"npx","args":["-y","@modelcontextprotocol/server-n8n"]}
//   npm error 404 Not Found - GET .../@modelcontextprotocol%2fserver-n8n
//
// Dan karena UI yang melahirkannya, memperbaiki config/mcp.json dari luar tak
// pernah bertahan: begitu user menambahkannya lagi, nama rusak itu lahir kembali.
//
// Logikanya juga DIGANDAKAN di Components.jsx dan Screens.jsx, dan dua salinan
// itu sudah melenceng — satu memakai sse-bridge.cjs lama (hanya bicara SSE,
// server yang cuma menyediakan /mcp gagal senyap), satunya sudah pindah ke
// mcp-http-bridge.cjs; figma cuma ada di salah satu. Pola dua permukaan yang
// sama sudah berkali-kali menggigit repo ini.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");

// Resolver DIAMBIL dari sumber lalu dieksekusi lewat transform yang sama dengan
// index.html — bukan ditulis ulang menurut tafsiran. Kalau seseorang mengubah
// Config.jsx, tes ini ikut berubah hasilnya.
globalThis.self = globalThis;
const Babel = require(path.join(AKAR, "public/vendor/babel.min.js"));
const kode = Babel.transform(
  fs.readFileSync(path.join(AKAR, "public/app/Config.jsx"), "utf8"),
  { presets: ["react"], filename: "/app/Config.jsx" },
).code;
const resolve = new Function(
  "React",
  "localStorage",
  "window",
  kode + "\n; return mcpResolvePerintah;",
)(
  { createElement: () => ({}), Fragment: null },
  { getItem: () => null, setItem: () => {} },
  {},
);

describe("nama paket tidak pernah dikarang", () => {
  test("nama tak dikenal dipakai APA ADANYA sebagai paket", () => {
    // Ini inti perbaikannya. Menganggap yang diketik sebagai nama paket benar
    // untuk kasus paling umum; mengarang scope hampir selalu 404.
    const r = resolve("paket-mcp-antah-berantah");
    expect(r.command).toBe("npx");
    expect(r.args).toEqual(["-y", "paket-mcp-antah-berantah"]);
  });

  test("scope @modelcontextprotocol/server-* TIDAK pernah disusun sendiri", () => {
    for (const t of ["n8n", "n8n1", "apa-saja", "xyz"]) {
      const r = resolve(t);
      expect(r.args.join(" ")).not.toMatch(/@modelcontextprotocol\/server-/);
    }
  });

  test("server resmi tetap terjangkau dengan mengetik nama lengkapnya", () => {
    const r = resolve("@modelcontextprotocol/server-filesystem");
    expect(r.args).toEqual(["-y", "@modelcontextprotocol/server-filesystem"]);
  });
});

describe("alias untuk nama yang sering diketik", () => {
  test.each([
    ["n8n", ["-y", "n8n-mcp"]],
    ["notion", ["-y", "@notionhq/notion-mcp-server"]],
    ["figma", ["-y", "figma-developer-mcp", "--stdio"]],
    ["github", ["-y", "@modelcontextprotocol/server-github"]],
  ])("%s -> npx %s", (masuk, argsHarap) => {
    const r = resolve(masuk);
    expect(r.command).toBe("npx");
    expect(r.args).toEqual(argsHarap);
  });

  test("huruf besar tetap dikenali", () => {
    expect(resolve("N8N").args).toEqual(["-y", "n8n-mcp"]);
  });
});

describe("bentuk masukan lain", () => {
  test("perintah lengkap dipakai apa adanya", () => {
    expect(resolve("npx -y sesuatu")).toEqual({
      command: "npx",
      args: ["-y", "sesuatu"],
    });
    expect(resolve("node skrip.cjs")).toEqual({
      command: "node",
      args: ["skrip.cjs"],
    });
  });

  test("URL lewat jembatan yang mencoba Streamable HTTP dulu", () => {
    // sse-bridge.cjs yang lama HANYA bicara SSE, jadi server yang cuma
    // menyediakan /mcp tak pernah tersambung — dan gagalnya senyap.
    const r = resolve("https://contoh.test/mcp");
    expect(r.command).toBe("node");
    expect(r.args[0]).toBe("scripts/mcp-http-bridge.cjs");
  });
});

describe("satu sumber, bukan dua permukaan", () => {
  const S = fs.readFileSync(path.join(AKAR, "public/app/Screens.jsx"), "utf8");
  const C = fs.readFileSync(
    path.join(AKAR, "public/app/Components.jsx"),
    "utf8",
  );

  test("kedua permukaan memanggil resolver bersama", () => {
    expect(S).toMatch(/mcpResolvePerintah\(type\)/);
    expect(C).toMatch(/mcpResolvePerintah\(type\)/);
  });

  test("tak ada lagi penyusunan nama paket di dalam permukaan", () => {
    for (const src of [S, C]) {
      expect(src).not.toMatch(/@modelcontextprotocol\/server-\$\{/);
    }
  });

  test("jembatan SSE lama tak dipakai lagi di mana pun", () => {
    for (const src of [S, C]) {
      expect(src).not.toMatch(/scripts\/sse-bridge\.cjs/);
    }
  });
});
