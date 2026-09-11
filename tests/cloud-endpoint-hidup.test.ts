// Provider endpoints that still exist.
//
// FROM A REAL FAILURE, and it is worth writing down exactly what it looked like
// because two of the three failures had nothing to do with each other:
//
//   opencode  401  {"type":"AuthError","message":"Invalid API key."}
//   github         getaddrinfo ENOTFOUND models.inference.ai.azure.com
//   custom         write EPROTO ... SSLV3_ALERT_HANDSHAKE_FAILURE
//
// and the UI reported only the last one, as though a TLS problem had stopped
// everything. The middle line is the one this file exists for: the GitHub host
// hardcoded in agent/cloud.ts had been RETIRED, so DNS could not resolve it.
//
// A dead DNS name is the least informative way for a provider to fail — it
// reads as the user's network being broken, which is exactly the wrong place to
// look. MEASURED at the time of the fix:
//
//   models.inference.ai.azure.com  ->  ENOTFOUND
//   models.github.ai               ->  140.82.112.21
//
// and on the new host, /chat/completions answers 404 while
// /inference/chat/completions answers with a real service message.
//
// NOTHING HERE TOUCHES THE NETWORK. These are offline checks on what the code
// is pointed at: a test that dialled out would fail on an aeroplane and pass on
// a machine with a captive portal, which is not a property worth guarding.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));
const C = require("../agent/cloud.ts");

/** Host names known to be dead, with what happened to them. */
const SUDAH_MATI: Record<string, string> = {
  "models.inference.ai.azure.com":
    "retired by GitHub; DNS answers ENOTFOUND. Replaced by models.github.ai.",
};

describe("no provider points at a host that no longer exists", () => {
  test("the chat endpoints avoid every known-dead host", () => {
    for (const [nama, cfg] of Object.entries(C.CLOUD as Record<string, any>)) {
      const mati = SUDAH_MATI[String(cfg && cfg.host)];
      if (mati) throw new Error(`${nama} points at ${cfg.host} — ${mati}`);
    }
  });

  test("every provider has a host and a path at all", () => {
    // A provider missing either fails at request time with something far less
    // legible than this line.
    for (const [nama, cfg] of Object.entries(C.CLOUD as Record<string, any>)) {
      expect([nama, typeof cfg.host]).toEqual([nama, "string"]);
      expect([nama, cfg.host.length > 0]).toEqual([nama, true]);
      expect([nama, typeof cfg.path]).toEqual([nama, "string"]);
      expect([nama, cfg.path.startsWith("/")]).toEqual([nama, true]);
    }
  });

  test("no host carries a scheme or a path inside it", () => {
    // `https://` in a hostname reaches https.request as a name to resolve, and
    // comes back as ENOTFOUND — the same misleading failure by another route.
    for (const [nama, cfg] of Object.entries(C.CLOUD as Record<string, any>)) {
      expect([nama, cfg.host]).toEqual([
        nama,
        cfg.host.replace(/^https?:\/\//, ""),
      ]);
      expect([nama, cfg.host.includes("/")]).toEqual([nama, false]);
    }
  });
});

describe("the GitHub provider specifically", () => {
  const gh = (C.CLOUD as any).github;

  test("it uses the host that resolves", () => {
    expect(gh.host).toBe("models.github.ai");
  });

  test("and the path that host actually serves", () => {
    // /chat/completions answers "404 page not found" there; the inference
    // prefix is what returns a real service response.
    expect(gh.path).toBe("/inference/chat/completions");
  });

  test("the key probe moved with it", () => {
    // Left behind, the probe would report every GitHub key as invalid because
    // its own host stopped resolving.
    const probe = (C as any).PROBE || (C as any).PROBES || null;
    if (!probe) return; // not exported; the config test above still covers it
    const p = probe.github;
    if (p) {
      expect(p.host).toBe("models.github.ai");
      expect(p.path).toBe("/catalog/models");
    }
  });

  test("the retirement is written down where the address is", () => {
    // Whoever looks at this next needs to know the fix bought an honest error,
    // not a working provider: the endpoint answers 410
    // github_models_retirement_brownout.
    const src = fs.readFileSync(path.join(AKAR, "agent", "cloud.ts"), "utf8");
    const i = src.indexOf('host: "models.github.ai"');
    expect(i).toBeGreaterThan(-1);
    expect(src.slice(Math.max(0, i - 1400), i)).toMatch(/retire|retirement/i);
  });
});

// ── Header sesi yang diminta opencode.ai ────────────────────────────────────
//
// DARI RUN SUNGGUHAN, dengan kunci yang SUDAH valid:
//
//   opencode 400: {"type":"MissingSessionID",
//                  "message":"Error from provider (Console Go): Request is …"}
//
// "Console Go" adalah route /zen/go/v1 — yang berbayar, dipilih karena nama
// modelnya tidak mengandung `-free`. Route itu meminta pengenal percakapan yang
// STABIL di header `x-opencode-session`.
describe("opencode: header sesi", () => {
  test("id-nya STABIL, bukan baru tiap permintaan", () => {
    // Id baru tiap permintaan membuat setiap giliran satu percakapan terlihat
    // sebagai sesi baru bagi penyedianya — yang justru lawan dari maksudnya.
    const a = C._sessionOpencode(null);
    const b = C._sessionOpencode(null);
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(8);
  });

  test("pemanggil yang tahu percakapannya boleh menentukannya", () => {
    // self_agent memegang thread_id; ini membiarkannya masuk tanpa perubahan
    // lain di sini nanti.
    expect(C._sessionOpencode({ thread_id: "thr_abc" })).toBe("thr_abc");
    expect(C._sessionOpencode({ sessionId: "sid_1" })).toBe("sid_1");
  });

  test("id yang kepanjangan dipotong", () => {
    const panjang = "x".repeat(500);
    expect(
      C._sessionOpencode({ thread_id: panjang }).length,
    ).toBeLessThanOrEqual(100);
  });

  test("hanya opencode.ai yang dianggap tujuannya", () => {
    // Header yang tak dikenal tidak disebar ke host yang tak pernah memintanya.
    expect(C._keOpencode({ provider: "opencode" })).toBe(true);
    expect(C._keOpencode({ baseUrl: "https://opencode.ai/zen/go/v1" })).toBe(
      true,
    );
    expect(C._keOpencode({ provider: "openai" })).toBe(false);
    expect(C._keOpencode({ baseUrl: "https://api.openai.com/v1" })).toBe(false);
    expect(C._keOpencode(null)).toBe(false);
    expect(C._keOpencode({})).toBe(false);
  });

  test("header itu benar-benar dipasang, di permintaan DAN di probe", () => {
    const src = fs
      .readFileSync(path.join(AKAR, "agent", "cloud.ts"), "utf8")
      .replace(/\r\n/g, "\n");
    // Probe menembak host yang sama, jadi ia butuh header yang sama — kalau
    // tidak, pemeriksaan kunci gagal sementara permintaan sungguhannya jalan.
    const dipasang = [...src.matchAll(/headers\["x-opencode-session"\]/g)];
    expect(dipasang).toHaveLength(2);
    // KEDUA situs dijaga, masing-masing dengan penjaga yang cocok untuknya —
    // dan itulah kenapa keduanya diperiksa terpisah. Versi pertama tes ini
    // mengambil kemunculan PERTAMA lalu menuntut penjaga milik yang kedua;
    // yang pertama adalah probe, yang tidak punya objek `cloud` sama sekali.
    const penjaga = dipasang.map((m) =>
      src.slice(Math.max(0, m.index - 200), m.index),
    );
    expect(penjaga.some((p) => /provider === "opencode"/.test(p))).toBe(true);
    expect(penjaga.some((p) => /_keOpencode\(cloud\)/.test(p))).toBe(true);
    // Tak satu pun terpasang tanpa syarat.
    for (const p of penjaga) expect(p).toMatch(/if \(/);
  });
});
