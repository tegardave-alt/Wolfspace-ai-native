// Jembatan stdio<->HTTP: aliran SSE tidak boleh memblokir antrean.
//
// KENAPA ADA. Versi pertama menunggu aliran SSE selesai sebelum memproses pesan
// berikutnya. Streamable HTTP MEMBOLEHKAN server menahan aliran tetap terbuka
// untuk pesan susulan yang ia mulai sendiri — jadi "selesai" tak pernah datang,
// dan semua pesan sesudah `initialize` mengantre selamanya.
//
// Gejalanya menyesatkan: connect BERHASIL (initialize dibalas), lalu tools/list
// timeout. Itu terbaca seperti server yang lambat atau rusak, padahal permintaan
// yang sama lewat curl dijawab seketika. Terukur pada @penpot/mcp:
//
//   sebelum : connect ok 1,1 s -> tools/list TIMEOUT 60 s -> 0 tool
//   sesudah : connect ok 0,7 s -> 5 tool -> tools/call ok
//
// Tes ini memakai server SSE tiruan yang SENGAJA menahan alirannya terbuka,
// persis perilaku yang dulu membuat jembatan macet.

const http = require("http");
const path = require("path");
const { spawn } = require("child_process");

const AKAR = path.resolve(__dirname, "..");
const JEMBATAN = path.join(AKAR, "scripts", "mcp-http-bridge.cjs");

let srv;
let PORT;

beforeAll(async () => {
  srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      let m = {};
      try {
        m = JSON.parse(body || "{}");
      } catch (_) {}
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "mcp-session-id": "sesi-uji",
      });
      const balas = (obj) =>
        res.write("event: message\ndata: " + JSON.stringify(obj) + "\n\n");

      if (m.method === "initialize") {
        balas({
          jsonrpc: "2.0",
          id: m.id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "uji", version: "1" },
          },
        });
      } else if (m.method === "tools/list") {
        balas({
          jsonrpc: "2.0",
          id: m.id,
          result: { tools: [{ name: "halo", description: "uji" }] },
        });
      } else if (m.id != null) {
        balas({ jsonrpc: "2.0", id: m.id, result: {} });
      }
      // SENGAJA TIDAK res.end(): inilah perilaku yang dulu membuat jembatan
      // menunggu selamanya. Server yang sah boleh melakukannya.
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  PORT = srv.address().port;
});

afterAll(async () => {
  if (srv) await new Promise((r) => srv.close(r));
});

describe("aliran SSE yang ditahan terbuka tidak memacetkan antrean", () => {
  test("initialize DAN tools/list dua-duanya dibalas", async () => {
    const proc = spawn(
      process.execPath,
      [JEMBATAN, `http://127.0.0.1:${PORT}/mcp`],
      { cwd: AKAR, stdio: ["pipe", "pipe", "pipe"] },
    );

    const balasan = [];
    let buf = "";
    proc.stdout.on("data", (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const b = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!b) continue;
        try {
          balasan.push(JSON.parse(b));
        } catch (_) {}
      }
    });

    const kirim = (o) => proc.stdin.write(JSON.stringify(o) + "\n");
    kirim({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {} },
    });
    // Dikirim SEGERA sesudahnya, tanpa menunggu apa pun. Versi lama jembatan
    // menahan pesan ini di antrean karena aliran pertama belum ditutup.
    await new Promise((r) => setTimeout(r, 400));
    kirim({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

    // 8 detik: jauh di bawah timeout 60 detik yang dulu terjadi, jadi kalau tes
    // ini lulus, macetnya memang hilang — bukan sekadar lebih cepat.
    const tenggat = Date.now() + 8000;
    while (Date.now() < tenggat && balasan.length < 2) {
      await new Promise((r) => setTimeout(r, 150));
    }
    try {
      proc.kill();
    } catch (_) {}

    const id1 = balasan.find((b) => b.id === 1);
    const id2 = balasan.find((b) => b.id === 2);
    expect(id1).toBeTruthy();
    expect(id2).toBeTruthy(); // inilah yang dulu TIDAK pernah datang
    expect(id2.result.tools[0].name).toBe("halo");
  }, 30000);

  test("aliran SSE diteruskan tanpa await, dan alasannya tertulis", () => {
    const fs = require("fs");
    const SRC = fs.readFileSync(JEMBATAN, "utf8");
    // Bentuk lama `await teruskanSSE(res)` tak boleh kembali.
    expect(SRC).not.toMatch(/await\s+teruskanSSE\(/);
    expect(SRC).toMatch(/teruskanSSE\(res\)\.catch\(/);
    expect(SRC).toMatch(/JANGAN di-await/);
  });
});

describe("mcp-client meneruskan cwd", () => {
  // Sebelum ini field `cwd` di konfigurasi diam-diam diabaikan. Akibatnya nyata:
  // server MCP Penpot mencari data/initial_instructions.md relatif terhadap cwd,
  // jadi ia selalu mencarinya di akar WOLFSPACE dan mati saat start. Field yang
  // ada tapi tak berpengaruh lebih buruk daripada field yang tak ada — ia
  // membuat konfigurasi terlihat benar sambil tetap gagal.
  const fs = require("fs");
  const SRC = fs.readFileSync(
    require.resolve("../agent/mcp-client.ts"),
    "utf8",
  );

  test("spawn memakai conf.cwd", () => {
    // Anchored on `const proc =` rather than on `const proc = spawn(`. There are
    // TWO spawn calls now — one through cmd.exe for .cmd/.bat targets, one
    // direct — and the old anchor matched neither, so this went red over a
    // formatting change while the behaviour it guards was intact. Both branches
    // must forward cwd, so the count is asserted instead of a single hit.
    const i = SRC.indexOf("const proc =");
    expect(i).toBeGreaterThan(-1);
    const blok = SRC.slice(i, i + 900);
    const jumlah = (blok.match(/cwd: conf\.cwd \|\| undefined/g) || []).length;
    expect(jumlah).toBe((blok.match(/\bspawn\(/g) || []).length);
    expect(jumlah).toBeGreaterThan(0);
  });

  test("alasannya tertulis, supaya tak dihapus lagi", () => {
    // The anchor follows the comment's wording: mcp-client migrated to
    // TypeScript and its comments were translated, so "cwd DITERUSKAN" became
    // "cwd IS FORWARDED". What this guards is unchanged — that the REASON stays
    // written down, so nobody drops the cwd forwarding a second time.
    expect(SRC).toMatch(/cwd IS FORWARDED/);
  });
});
