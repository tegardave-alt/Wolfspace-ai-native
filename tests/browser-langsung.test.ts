// A browser the agent drives, kept alive between steps.
//
// WHY IT IS A SESSION AND NOT ANOTHER web_extract. web_extract opens a page,
// takes what it was asked for, and lets the browser go. That covers reading;
// it cannot cover signing in on one step and clicking through on the next,
// because nothing survives in between. This tool keeps the page.
//
// WHAT IS EASY TO GET WRONG HERE:
//
//   1. THE DESTINATION GUARD. Every other network path in agent/web.ts refuses
//      loopback and private ranges. A browser that skipped that check would be
//      a clean way around it — a model that cannot webFetch 127.0.0.1:8090
//      could just open it in the browser and read the answer off the page.
//   2. THE WINDOW. It is headed on purpose; a live browser nobody can see is
//      not a live browser. The headless switch is opt-in so that forgetting it
//      cannot silently hide the thing the tool exists to show.
//   3. TEARDOWN. The browser is a module singleton holding a real OS process.
//      Without closing it, Jest reports "a worker process has failed to exit
//      gracefully" for the whole run — the lesson already recorded for the
//      extraction browser in agent/web.ts.

const http = require("http");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));

// Opt in BEFORE the module is loaded: both are read at call time, but setting
// them here keeps the intent next to the reason.
process.env.WOLFSPACE_BROWSER_HEADLESS = "1";
const W = require(path.join(AKAR, "agent", "web.ts"));

const HTML =
  "<html><body><h1 id=judul>Halo</h1>" +
  "<input id=kotak />" +
  "<button id=tombol onclick=\"document.getElementById('judul').textContent='Diklik'\">Klik</button>" +
  "</body></html>";

let srv: any;
let PORT: number;

beforeAll(async () => {
  srv = http.createServer((_q: any, s: any) => {
    s.writeHead(200, { "Content-Type": "text/html" });
    s.end(HTML);
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  PORT = srv.address().port;
});

afterAll(async () => {
  try {
    await W.tutupSesi();
  } catch (_) {}
  if (srv) await new Promise((r) => srv.close(r));
});

const url = () => "http://127.0.0.1:" + PORT + "/";
const lokal = (on: boolean) => {
  if (on) process.env.WOLFSPACE_WEB_IZINKAN_LOKAL = "1";
  else delete process.env.WOLFSPACE_WEB_IZINKAN_LOKAL;
};

describe("penjaga tujuan berlaku untuk browser juga", () => {
  test("loopback ditolak tanpa jalan keluar uji", async () => {
    // Without this the tool is a bypass for every other guard in the file.
    lokal(false);
    await expect(
      W.browserLangsung({ action: "open", url: url() }),
    ).rejects.toThrow(/destination refused/);
  });

  test("skema non-web ditolak", async () => {
    lokal(false);
    await expect(
      W.browserLangsung({ action: "open", url: "file:///c:/windows/win.ini" }),
    ).rejects.toThrow(/destination refused/);
  });
});

describe("aksi divalidasi sebelum browser dinyalakan", () => {
  test("aksi tak dikenal menyebutkan yang sah", async () => {
    // Naming them costs nothing and saves a round trip of guessing.
    await expect(W.browserLangsung({ action: "terbang" })).rejects.toThrow(
      /unknown action: terbang.*open, goto, click, type, read, screenshot, close/s,
    );
  });

  test("click tanpa selector ditolak", async () => {
    lokal(true);
    await expect(W.browserLangsung({ action: "click" })).rejects.toThrow(
      /selector is required/,
    );
  });

  test("argumen yang kurang TIDAK menyalakan browser", async () => {
    // The check above runs before any window opens, so this returns at once.
    // Closing after it is therefore instant -- if a browser had been started
    // just to reject the call, this would sit here for seconds.
    const t0 = Date.now();
    await expect(W.browserLangsung({ action: "close" })).resolves.toMatch(
      /closed/,
    );
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});

describe("PERILAKU: sesi yang benar-benar hidup", () => {
  test("open memuat halaman dan mengembalikan isinya", async () => {
    lokal(true);
    const r = await W.browserLangsung({ action: "open", url: url() });
    expect(r).toMatch(/^url: http:\/\/127\.0\.0\.1:/);
    expect(r).toMatch(/Halo/);
  }, 60000);

  test("halaman BERTAHAN ke panggilan berikutnya", async () => {
    // The whole reason this is not web_extract. No url is passed here.
    lokal(true);
    const r = await W.browserLangsung({ action: "read", selector: "#judul" });
    expect(r).toMatch(/Halo/);
  }, 60000);

  test("type mengisi kolom, dan isinya tetap ada", async () => {
    lokal(true);
    await W.browserLangsung({
      action: "type",
      selector: "#kotak",
      text: "kata uji",
    });
    const r = await W.browserLangsung({ action: "read", selector: "#kotak" });
    // innerText of an input is empty; the value is what matters, so this only
    // asserts the action completed and the session is still usable.
    expect(typeof r).toBe("string");
  }, 60000);

  test("click benar-benar menjalankan JS halaman", async () => {
    lokal(true);
    await W.browserLangsung({ action: "click", selector: "#tombol" });
    const r = await W.browserLangsung({ action: "read", selector: "#judul" });
    expect(r).toMatch(/Diklik/);
  }, 60000);

  test("selector yang tak cocok dilaporkan sebagai selector", async () => {
    lokal(true);
    await expect(
      W.browserLangsung({ action: "read", selector: "#tidak-ada" }),
    ).rejects.toThrow(/selector matched nothing/);
  }, 60000);

  test("screenshot melaporkan ukuran, bukan base64 halaman", async () => {
    // Inline base64 of a page fills the model's context for no gain.
    lokal(true);
    const r = await W.browserLangsung({ action: "screenshot" });
    expect(r).toMatch(/screenshot taken: \d+ bytes/);
    expect(r).not.toMatch(/[A-Za-z0-9+/]{200}/);
  }, 60000);

  test("close mengakhiri sesi, dan open berikutnya memulai yang baru", async () => {
    lokal(true);
    await W.browserLangsung({ action: "close" });
    const r = await W.browserLangsung({ action: "open", url: url() });
    // Fresh page: the click from earlier is gone.
    expect(r).toMatch(/Halo/);
    expect(r).not.toMatch(/Diklik/);
    await W.browserLangsung({ action: "close" });
  }, 90000);
});

describe("target dalam: panel live di dalam WOLFSPACE", () => {
  test("penjaga tujuan berlaku SEBELUM permintaan dikirim ke main", async () => {
    // The guard runs on this side so both browsers are held to one rule by one
    // piece of code. A copy in the main process would be a second one to drift.
    //
    // Asserted together with the call count: "it threw" alone would also pass
    // if the request had already gone out and main had refused it.
    lokal(false);
    let dikirim = 0;
    (globalThis as any).__wolfspaceMintaMain = async () => {
      dikirim++;
      return "";
    };
    try {
      await expect(
        W.browserDalam({ action: "open", url: url() }),
      ).rejects.toThrow(/destination refused/);
      expect(dikirim).toBe(0);
    } finally {
      delete (globalThis as any).__wolfspaceMintaMain;
    }
  });

  test("di luar aplikasi desktop, ia mengatakannya", async () => {
    // A utilityProcess has no handle to a WebContents; in a plain server run
    // there is no main process to ask at all.
    lokal(true);
    const asli = (globalThis as any).__wolfspaceMintaMain;
    delete (globalThis as any).__wolfspaceMintaMain;
    try {
      await expect(W.browserDalam({ action: "read" })).rejects.toThrow(
        /no host-to-main bridge in this process/,
      );
    } finally {
      if (asli) (globalThis as any).__wolfspaceMintaMain = asli;
    }
  });

  test("argumen divalidasi sebelum main diganggu", async () => {
    lokal(true);
    const dipanggil: any[] = [];
    (globalThis as any).__wolfspaceMintaMain = async (apa: any, args: any) => {
      dipanggil.push({ apa, args });
      return "ok";
    };
    try {
      await expect(W.browserDalam({ action: "click" })).rejects.toThrow(
        /selector is required/,
      );
      await expect(W.browserDalam({ action: "terbang" })).rejects.toThrow(
        /unknown action/,
      );
      expect(dipanggil).toEqual([]);
    } finally {
      delete (globalThis as any).__wolfspaceMintaMain;
    }
  });

  test("close TIDAK menutup panel milik pengguna", async () => {
    // The panel is the user's window. A tool that closed it would be taking
    // something that was never the agent's to take.
    lokal(true);
    (globalThis as any).__wolfspaceMintaMain = async () => "TIDAK BOLEH";
    try {
      const r = await W.browserDalam({ action: "close" });
      expect(r).toMatch(/nothing to close/);
    } finally {
      delete (globalThis as any).__wolfspaceMintaMain;
    }
  });

  test("target dalam diarahkan ke jalur itu, bukan ke browser luar", async () => {
    lokal(true);
    let kena = false;
    (globalThis as any).__wolfspaceMintaMain = async () => {
      kena = true;
      return "url: x | title: y ";
    };
    try {
      await W.browserLangsung({ action: "read", target: "dalam" });
      expect(kena).toBe(true);
    } finally {
      delete (globalThis as any).__wolfspaceMintaMain;
    }
  });
});

describe("jembatan host -> main", () => {
  const fs = require("fs");
  const HOST = fs.readFileSync(
    path.join(AKAR, "electron", "backend-host.cjs"),
    "utf8",
  );
  const MAIN = fs.readFileSync(path.join(AKAR, "electron", "main.ts"), "utf8");

  test("host bisa meminta, dan jawabannya dicocokkan dengan id", () => {
    // The channel was one-directional: main asked, the host only replied.
    expect(HOST).toMatch(/kind: "minta-main"/);
    expect(HOST).toMatch(/kind === "jawab-main"/);
    expect(HOST).toMatch(/_mintaTertunda/);
  });

  test("permintaan yang tak dijawab tidak menggantung selamanya", () => {
    expect(HOST).toMatch(/main did not answer/);
  });

  test("main hanya melayani daftar operasi yang tetap", () => {
    // A general "run this in main" channel would put the agent back on the
    // window thread, which is what splitting the processes was for.
    expect(MAIN).toMatch(/function _layaniMintaMain/);
    expect(MAIN).toMatch(/unknown main request: /);
  });

  test("panelnya dicari lewat pegangan yang dimiliki main, bukan ditebak", () => {
    // THE BUG THIS RECORDS. The first version looked for a WebContents whose
    // getType() is "webview" and found nothing, so it told the user their
    // panel was closed while it was open in front of them. The panel has not
    // been a <webview> tag for some time -- it is a WebContentsView created in
    // main.ts and floated above the window, and that file already holds it in
    // `_br`. Searching for what the module itself owns was the mistake.
    const i = MAIN.indexOf("async function _browserDalam");
    const blok = MAIN.slice(i, MAIN.indexOf("function _layaniMintaMain", i));
    expect(blok).toMatch(/_br && _br\.tampil && _br\.tampil\.webContents/);
    expect(blok).not.toMatch(/getType\(\) === "webview"/);
  });

  test("kegagalan melaporkan keadaan yang dilihat main, bukan klaim", () => {
    // "The panel is not open" was reported to a user looking straight at an
    // open panel. A message that asserts a state it never checked is how two
    // different causes end up wearing the same words.
    const i = MAIN.indexOf("async function _browserDalam");
    const blok = MAIN.slice(i, MAIN.indexOf("function _layaniMintaMain", i));
    expect(blok).toMatch(/_brKeadaan\(\)/);
    expect(blok).toMatch(/Main reports: /);
  });

  test("penyebab paling mungkin disebutkan, bukan dibiarkan ditebak", () => {
    // The view exists only for an EXTERNAL site; a local file preview renders
    // in an iframe and has no WebContentsView at all.
    const i = MAIN.indexOf("async function _browserDalam");
    const blok = MAIN.slice(i, MAIN.indexOf("function _layaniMintaMain", i));
    expect(blok).toMatch(/EXTERNAL site/);
    expect(blok).toMatch(/iframe/);
  });

  test("panel tertutup dan panel kosong dibedakan", () => {
    // "Nothing there" and "nothing loaded" need different answers: one asks the
    // user to open a panel, the other asks the agent to navigate.
    const i = MAIN.indexOf("async function _browserDalam");
    const blok = MAIN.slice(i, MAIN.indexOf("function _layaniMintaMain", i));
    expect(blok).toMatch(/no live browser view to drive/);
    expect(blok).toMatch(/no page loaded/);
  });

  test("agent tidak membuka panel sendiri", () => {
    // The panel floats above the user's UI and the renderer feeds it its
    // bounds. Creating one from the agent's side would put a view over their
    // window that nothing had positioned.
    const i = MAIN.indexOf("async function _browserDalam");
    const blok = MAIN.slice(i, MAIN.indexOf("function _layaniMintaMain", i));
    expect(blok).not.toMatch(/_brBuat\(/);
  });

  test("selector masuk sebagai DATA, bukan sumber", () => {
    // Pasting a selector into script lets it close the string and become code.
    const i = MAIN.indexOf("async function _browserDalam");
    const blok = MAIN.slice(i, MAIN.indexOf("function _layaniMintaMain", i));
    expect(blok).toMatch(/JSON\.stringify\(sel\)/);
    expect(blok).not.toMatch(/querySelector\('" \+ sel/);
  });
});

describe("terdaftar dan digerbang", () => {
  const fs = require("fs");
  const DEF = fs.readFileSync(
    path.join(AKAR, "agent", "tools", "tool-definitions.ts"),
    "utf8",
  );
  const IDX = fs.readFileSync(
    path.join(AKAR, "agent", "tools", "index.ts"),
    "utf8",
  );

  test("ada di daftar tool model", () => {
    expect(DEF).toMatch(/name: "browser"/);
  });

  test("lewat admission CommandChain, dan penolakan dicatat", () => {
    // Reaches further than web_extract — it clicks and types — so it cannot be
    // less gated than the tool that only reads.
    const i = IDX.indexOf('if (name === "browser") {');
    expect(i).toBeGreaterThan(-1);
    const blok = IDX.slice(i, IDX.indexOf('if (name === "web_extract")', i));
    expect(blok).toMatch(/cc\.periksa\(cc\.sesiRuleset\(\), "network:https"\)/);
    expect(blok).toMatch(/decision: "DENY"/);
    expect(blok).toMatch(/browser refused: /);
  });

  test("berjendela kecuali diminta sebaliknya", () => {
    const WEB = fs.readFileSync(path.join(AKAR, "agent", "web.ts"), "utf8");
    expect(WEB).toMatch(
      /headless: process\.env\.WOLFSPACE_BROWSER_HEADLESS === "1"/,
    );
  });
});
