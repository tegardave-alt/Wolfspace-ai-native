// The model picker shows a model only when the user configured one.
//
// WHAT THIS FILE USED TO GUARD, AND WHY IT CHANGED.
//
// loadModels() used to ask the server which providers it held keys for, pick
// one, and write it into the stored cloud object marked `otomatis`. Earlier
// work here made that entry *labelled* — "(server key)" in the picker, treated
// as "not chosen" on the settings screen — because a fresh install otherwise
// read as pre-configured.
//
// Labelling was not enough. The settings screen showed no key and no model
// while the picker showed a model running: one state, reported as 0 in one
// place and 1 in the other. That is a contradiction a user cannot resolve by
// reading more carefully, and it was reported as exactly that.
//
// WHY THE ENTRY COULD NOT SIMPLY BE DROPPED BEFORE. agent/cloud.ts resolved a
// provider from `cloud.provider` or from a key, and with neither it gave up —
// so removing the entry broke chat for anyone whose keys live in the keys file
// rather than the browser. The picker was inventing a provider because nothing
// else would.
//
// THE FIX moves that question to where the keys are: _providerBawaan() in
// agent/cloud.ts fills in a provider when a request names none. The UI then
// stops claiming a configuration that does not exist, and chat still works.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const baca = (rel: string) => fs.readFileSync(path.join(AKAR, rel), "utf8");

describe("pemilih model hanya menampilkan konfigurasi pemakai", () => {
  test("app.tsx tidak lagi mengarang provider", () => {
    const src = baca("public/app.tsx");
    // The whole hydrate-and-store block is gone, not merely relabelled.
    expect(src).not.toMatch(/otomatis:\s*true/);
    expect(src).not.toMatch(/server key/);
  });

  test("entri lama hasil perilaku sebelumnya dibersihkan", () => {
    // Without this an install that already stored one keeps showing a model
    // forever — the fix would not reach anybody who had run the old version.
    const src = baca("public/app.tsx");
    expect(src).toMatch(/if \(cloud && cloud\.otomatis\) \{/);
    expect(src).toMatch(/setCloudLS\(null\)/);
  });

  test("sebuah model muncul hanya untuk kunci atau baseUrl milik pemakai", () => {
    // A bare provider name is what the invented entry looked like, so it no
    // longer counts as configuration.
    const src = baca("public/app.tsx");
    expect(src).toMatch(
      /const hasCloud = cloud && \(cloud\.key \|\| cloud\.baseUrl\)/,
    );
    expect(src).not.toMatch(
      /const hasCloud = cloud && \(cloud\.key \|\| cloud\.provider\)/,
    );
  });

  test("tanpa konfigurasi, daftarnya kosong dan mengatakannya", () => {
    const src = baca("public/app.tsx");
    expect(src).toMatch(/label: "No models yet"/);
  });
});

describe("chat tetap jalan dengan kunci di berkas", () => {
  test("backend menentukan providernya sendiri saat klien tak menyebut", () => {
    // This is what makes the empty picker safe. Without it, dropping the
    // invented entry leaves cloud.provider null, no key gets filled, and the
    // request fails for everyone whose keys are server-side.
    const src = baca("agent/cloud.ts");
    expect(src).toMatch(/function _providerBawaan\(\)/);
    expect(src).toMatch(/_providerBawaan\(\)/);
  });

  test("urutannya sama dengan yang dulu dipakai UI", () => {
    // Kept deliberately: the same provider is chosen as before, so this change
    // does not silently move anyone to a different model.
    const src = baca("agent/cloud.ts");
    expect(src).toMatch(
      /URUTAN_BAWAAN = \["opencode", "nvidia", "gemini", "puter"\]/,
    );
  });

  test("hanya provider yang benar-benar punya kunci yang dipilih", () => {
    const src = baca("agent/cloud.ts");
    const i = src.indexOf("function _providerBawaan()");
    const blok = src.slice(i, src.indexOf("function fillCloudKey", i));
    expect(blok).toMatch(/typeof e === "string" \? e : e\.key/);
  });

  test("PERILAKU: providernya benar-benar terisi dari berkas kunci", () => {
    // The one assertion here that runs the code rather than reading it.
    require(path.join(AKAR, "scripts", "ts-register.cjs"));
    const cloud = require(path.join(AKAR, "agent", "cloud.ts"));
    const kunciAda = Object.values(cloud.CLOUD_KEYS || {}).some(
      (e: any) => e && (typeof e === "string" ? e : e.key),
    );
    const c: any = {};
    cloud.fillCloudKey(c);
    if (kunciAda) {
      expect(typeof c.provider).toBe("string");
      expect(c.provider.length).toBeGreaterThan(0);
    } else {
      // No keys configured on this machine: nothing to fall back to, and
      // inventing one would be the very thing this change removed.
      expect(c.provider == null).toBe(true);
    }
  });
});

describe("layar setelan", () => {
  test("entri otomatis tetap tidak dianggap pilihan pemakai", () => {
    // Defensive: a stored entry can still be read here before app.tsx clears
    // it, and it must not present itself as something the user picked.
    const src = baca("public/app/Views.tsx");
    expect(src).toMatch(
      /tersimpan\s*&&\s*tersimpan\.otomatis\s*\?\s*null\s*:\s*tersimpan/,
    );
    expect(src).toMatch(/const \[key, setKey\] = useState\(""\)/);
  });

  test("menyimpan secara eksplisit menulis objek tanpa tanda otomatis", () => {
    const src = baca("public/app/Views.tsx");
    expect(src).toMatch(
      /setCloudLS\(\{ key: k, provider: prov, name, model: mdl, baseUrl: bu \}\)/,
    );
  });
});
