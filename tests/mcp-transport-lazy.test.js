// MCP: kebocoran rahasia, transport remote, dan penyalaan atas permintaan.
//
// Ketiganya berasal dari satu sesi penelusuran yang sama, memakai berkas debug
// nyata (%TEMP%/WOLFSPACE-debug.log) dari pemakaian sungguhan.

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

const mcp = require("../agent/mcp-client.ts");

describe("rahasia tidak ikut tercatat saat server MCP dinyalakan", () => {
  // KENAPA ADA. Argumen server MCP membawa kredensial, dan argumen itu DICATAT
  // ke berkas debug. Terbukti tercetak utuh di log nyata:
  //   Memulai server MCP: figma {"cmd":"npx","args":[...,"--figma-api-key=figd_kQW…"]}
  // Berkas itu tidak gitignored, tidak dibersihkan, dan hanya dirotasi
  // berdasarkan ukuran — jadi rahasianya tinggal di disk sampai tergeser.

  test("nilai flag berbau rahasia DISUNTING, nama flag tetap terlihat", () => {
    const out = mcp._argsAman([
      "-y",
      "figma-developer-mcp",
      "--stdio",
      "--figma-api-key=figd_RAHASIA123456789",
    ]);
    expect(out).toContain("--figma-api-key=***");
    expect(out.join(" ")).not.toContain("figd_RAHASIA123456789");
    // Nama flag dipertahankan: log masih harus berguna untuk mendiagnosis
    // perintah yang salah.
    expect(out.join(" ")).toContain("--figma-api-key");
    expect(out).toContain("figma-developer-mcp");
  });

  test("query string URL dibuang — di situlah token remote berada", () => {
    const out = mcp._argsAman([
      "scripts/mcp-http-bridge.cjs",
      "https://mcp.contoh.io/stream?userToken=eyJhbGciOiJBMjU2S1ciLCJlbmMi",
    ]);
    expect(out[1]).toBe("https://mcp.contoh.io/stream?***");
    expect(out.join(" ")).not.toContain("eyJhbGciOiJBMjU2S1ci");
  });

  test("argumen biasa TIDAK diubah — penyuntingan tak boleh membutakan log", () => {
    const asli = ["-y", "@modelcontextprotocol/server-github", "--stdio"];
    expect(mcp._argsAman(asli)).toEqual(asli);
  });

  test("dipakai di jalur yang benar-benar mencatat", () => {
    const SRC = fs
      .readFileSync(require.resolve("../agent/mcp-client.ts"), "utf8")
      .replace(/\r\n/g, "\n");
    expect(SRC).toMatch(
      /Memulai server MCP[\s\S]{0,120}args: _argsAman\(conf\.args\)/,
    );
    // env memang tak pernah dicatat; kalau suatu saat ikut dicatat, ia harus
    // lewat penyunting yang sama.
    expect(SRC).not.toMatch(/args: conf\.args/);
  });
});

describe("nama server MCP tidak diturunkan dari URL mentah", () => {
  // Rumus lama: type.split("/").pop().replace(/[^a-zA-Z0-9-]/g,"").
  // Untuk URL remote berkredensial, potongan terakhirnya adalah
  // "stream?user=...&token=eyJ...", dan pembuangan karakter non-alfanumerik
  // MERAPATKAN token itu jadi satu kata yang lolos sebagai nama. Terbukti di
  // log nyata: entri bernama "streamuserTokeneyJhbGciOiJBMjU2S1ci..." — JWT
  // utuh, tersimpan ke config/mcp.json dan tercetak berulang ke berkas debug.
  const SRC = fs
    .readFileSync(require.resolve("../public/app/Components.tsx"), "utf8")
    .replace(/\r\n/g, "\n");

  test("URL -> hanya HOSTNAME yang dipakai", () => {
    expect(SRC).toMatch(/if \(\/\^https\?:\/i\.test\(type\)\)/);
    expect(SRC).toMatch(/new URL\(type\)\.hostname/);
  });

  test("rumus lama tak lagi diterapkan pada URL", () => {
    // Rumus lama boleh tetap ada untuk non-URL, tapi harus berada di cabang
    // `else` — bukan dijalankan tanpa syarat seperti dulu.
    const i = SRC.indexOf('.replace("server-", "")');
    expect(i).toBeGreaterThan(-1);
    const sebelum = SRC.slice(Math.max(0, i - 400), i);
    expect(sebelum).toMatch(/\} else \{/);
  });

  test("nama kosong tetap menghasilkan sesuatu yang sah", () => {
    expect(SRC).toMatch(/if \(!name\) name = "mcp-" \+ Date\.now\(\)/);
  });
});

describe("jembatan remote bicara Streamable HTTP, bukan cuma SSE lama", () => {
  // Ekosistem MCP memakai TIGA transport, dan banyak server menyediakan lebih
  // dari satu sekaligus. Terbukti di log nyata (figma-developer-mcp), meski
  // diluncurkan --stdio ia tetap membuka:
  //   [INFO] StreamableHTTP endpoint available at http://127.0.0.1:3333/mcp
  //   [INFO] StreamableHTTP endpoint available at http://127.0.0.1:3333/sse (backward compat)
  // Jembatan lama (sse-bridge.cjs) HANYA bicara SSE, sehingga server yang cuma
  // menyediakan /mcp tak pernah tersambung — dan gagalnya senyap.
  const BRIDGE = path.join(__dirname, "..", "scripts", "mcp-http-bridge.cjs");

  test("berkasnya ada dan dipakai oleh UI", () => {
    expect(fs.existsSync(BRIDGE)).toBe(true);
    // Resolusi perintah MCP sekarang SATU sumber di Config.tsx. Sebelumnya ia
    // digandakan di Components.tsx dan Screens.tsx, dan dua salinan itu sudah
    // melenceng — satu masih memakai sse-bridge.cjs lama. Tes ini dulu menunjuk
    // salah satu salinan; sekarang menunjuk sumbernya.
    const CFG = fs.readFileSync(
      require.resolve("../public/app/Config.tsx"),
      "utf8",
    );
    expect(CFG).toContain("scripts/mcp-http-bridge.cjs");

    // Dan permukaannya benar-benar memakai resolver itu, bukan menyusun sendiri.
    for (const f of [
      "../public/app/Components.tsx",
      "../public/app/Screens.tsx",
    ]) {
      const UI = fs.readFileSync(require.resolve(f), "utf8");
      expect(UI).toMatch(/mcpResolvePerintah\(type\)/);
    }
  });

  // Server uji NYATA (bukan mock): satu endpoint POST yang berperilaku sesuai
  // spesifikasi — 202 untuk notifikasi, application/json atau text/event-stream
  // untuk request — plus endpoint SSE lama untuk menguji jalur cadangan.
  let srv, PORT;
  beforeAll(async () => {
    srv = http.createServer((req, res) => {
      if (req.url === "/mcp" && req.method === "POST") {
        let b = "";
        req.on("data", (c) => (b += c));
        req.on("end", () => {
          const m = JSON.parse(b);
          if (m.id === undefined) return res.writeHead(202).end();
          const balas = {
            jsonrpc: "2.0",
            id: m.id,
            result:
              m.method === "initialize"
                ? { serverInfo: { name: "uji" } }
                : { tools: [{ name: "ping" }] },
          };
          if (m.method === "initialize") {
            res.writeHead(200, {
              "Content-Type": "text/event-stream",
              "Mcp-Session-Id": "sesi-1",
            });
            res.end("event: message\ndata: " + JSON.stringify(balas) + "\n\n");
          } else {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(balas));
          }
        });
        return;
      }
      if (req.url === "/lama" && req.method === "POST")
        return res.writeHead(405).end();
      if (req.url === "/lama" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "text/event-stream" });
        res.write("event: endpoint\ndata: /lama/pesan\n\n");
        srv._sse = res;
        return;
      }
      if (req.url === "/lama/pesan" && req.method === "POST") {
        let b = "";
        req.on("data", (c) => (b += c));
        req.on("end", () => {
          const m = JSON.parse(b);
          res.writeHead(202).end();
          if (srv._sse && m.id !== undefined)
            srv._sse.write(
              "event: message\ndata: " +
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: m.id,
                  result: { via: "sse-lama" },
                }) +
                "\n\n",
            );
        });
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    PORT = srv.address().port;
  });
  afterAll(() => srv && srv.close());

  const jalankan = (url, pesan, ms) =>
    new Promise((resolve) => {
      const p = spawn(process.execPath, [BRIDGE, url], { stdio: "pipe" });
      const keluar = [];
      p.stdout.on("data", (d) =>
        d
          .toString()
          .split("\n")
          .filter(Boolean)
          .forEach((l) => keluar.push(l.trim())),
      );
      p.stderr.on("data", () => {});
      setTimeout(
        () => pesan.forEach((m) => p.stdin.write(JSON.stringify(m) + "\n")),
        250,
      );
      setTimeout(() => {
        p.kill();
        resolve(keluar);
      }, ms);
    });

  test("Streamable HTTP: balasan SSE MAUPUN JSON sama-sama diteruskan", async () => {
    const out = await jalankan(
      "http://127.0.0.1:" + PORT + "/mcp",
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
        { jsonrpc: "2.0", method: "notifications/initialized", params: {} },
        { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
      ],
      2600,
    );
    expect(
      out.some((l) => l.includes('"id":1') && l.includes("serverInfo")),
    ).toBe(true);
    expect(out.some((l) => l.includes('"id":2') && l.includes("ping"))).toBe(
      true,
    );
  }, 15000);

  test("server yang MENOLAK streamable -> jatuh ke SSE lama, bukan mati", async () => {
    const out = await jalankan(
      "http://127.0.0.1:" + PORT + "/lama",
      [{ jsonrpc: "2.0", id: 7, method: "initialize", params: {} }],
      4200,
    );
    expect(out.some((l) => l.includes("sse-lama"))).toBe(true);
  }, 15000);
});

describe("server MCP dinyalakan saat CONNECT, bukan saat aplikasi start", () => {
  // KENAPA BERUBAH. init() dulu men-spawn SETIAP server yang tak di-disable,
  // dan ia dipanggil getTools() — yaitu di langkah PERTAMA run agent. Terukur:
  // run diam 60,3 detik tanpa satu pun event, karena tiap server harus `npx`
  // dulu dan handshake boleh sampai HANDSHAKE_TIMEOUT_MS. Ongkos itu dibayar
  // setiap sesi, untuk server yang mungkin tak dipakai sama sekali.
  const SRC = fs
    .readFileSync(require.resolve("../agent/mcp-client.ts"), "utf8")
    .replace(/\r\n/g, "\n");

  test("init() TIDAK lagi men-spawn apa pun", () => {
    const i = SRC.indexOf("async init()");
    const blok = SRC.slice(i, SRC.indexOf("async connectServer", i));
    expect(blok).not.toMatch(/_startServer/);
    // Pembersihan proses yatim TETAP dilakukan: tanpa itu, Connect berikutnya
    // menambah duplikat alih-alih menggantikan.
    expect(blok).toMatch(/_killOrphans\(\)/);
  });

  test("connectServer idempoten — yang sudah siap tak di-spawn ulang", () => {
    const i = SRC.indexOf("async connectServer");
    const blok = SRC.slice(i, i + 900);
    expect(blok).toMatch(
      /if \(ada && ada\.ready\) return \{ ok: true, already: true \}/,
    );
    // Server yang setengah jalan dibersihkan dulu, kalau tidak prosesnya jadi
    // yatim dan tak tercatat di this.servers.
    expect(blok).toMatch(/if \(ada && ada\.proc\) this\.stopServer\(name\)/);
  });

  test("toggle menyalakan lewat connectServer, bukan _startServer langsung", () => {
    // Diiris sampai AKHIR fungsi, bukan sejumlah karakter tetap. Jendela tetap
    // pernah membuat tes ini merah hanya karena komentar di dalam fungsinya
    // bertambah — kegagalan yang tak ada hubungannya dengan sifat yang dijaga.
    const i = SRC.indexOf("async toggleServer");
    const j = SRC.indexOf("\n  }", i);
    const blok = SRC.slice(i, j > i ? j : i + 2400);
    expect(blok).toMatch(/await this\.connectServer\(name\)/);
    expect(blok).not.toMatch(/await this\._startServer/);
  });

  test("backend menyediakan /mcp/connect", () => {
    const S = fs
      .readFileSync(require.resolve("../server.cjs"), "utf8")
      .replace(/\r\n/g, "\n");
    expect(S).toMatch(/_path === "\/mcp\/connect" && req\.method === "POST"/);
    // Tanpa `name` -> semua; dengan `name` -> satu saja.
    expect(S).toMatch(
      /payload\.name\s*\n?\s*\?\s*await mcpClient\.connectServer\(payload\.name\)/,
    );
    expect(S).toMatch(/await mcpClient\.connectAll\(\)/);
  });

  // DUA daftar MCP, bukan satu: panel di Composer (Components.tsx) dan layar
  // pemilih (Screens.tsx). Perubahan pertama hanya menyentuh yang pertama, dan
  // log run nyata membuktikannya — klik di layar kedua menghasilkan
  // `POST /mcp/toggle`, bukan `POST /mcp/connect`. Keduanya diuji di sini
  // supaya perilaku aplikasi tak bergantung pada layar mana yang dipakai.
  test.each([
    ["Components.tsx", "../public/app/Components.tsx"],
    ["Screens.tsx", "../public/app/Screens.tsx"],
  ])("%s memisahkan CONNECT dari toggle enable/disable", (_nama, modul) => {
    const UI = fs
      .readFileSync(require.resolve(modul), "utf8")
      .replace(/\r\n/g, "\n");
    // Sekadar menyambungkan server TIDAK BOLEH ikut menulis `disabled` ke
    // mcp.json — itu dua maksud yang berbeda.
    //
    // Spasi dirapatkan dulu: prettier bebas memenggal ekspresi ini di mana pun,
    // dan tes yang terkunci pada satu bentuk pemenggalan akan merah karena
    // PEMFORMATAN, bukan karena perilakunya berubah. (Sudah terjadi sekali di
    // pre-commit sesi ini.)
    const rapat = UI.replace(/\s+/g, " ");
    expect(rapat).toContain(
      "const perluConnect = !srv.active && !(srv.status && srv.status.disabled);",
    );
    expect(rapat).toContain(
      'const jalur = perluConnect ? "/mcp/connect" : "/mcp/toggle";',
    );
  });

  test("PERILAKU: getTools() tak menyalakan proses apa pun", async () => {
    // Ini sifat yang paling mudah rusak diam-diam kalau nanti ada yang
    // menambahkan connectAll() ke dalam getTools() demi kenyamanan.
    const sebelum = Object.keys(mcp.servers || {}).length;
    const t0 = Date.now();
    const tools = await mcp.getTools();
    const ms = Date.now() - t0;
    expect(Array.isArray(tools)).toBe(true);
    expect(Object.keys(mcp.servers || {}).length).toBe(sebelum);
    // Dulu panggilan ini menanggung cold start `npx` semua server.
    expect(ms).toBeLessThan(3000);
  }, 15000);
});
