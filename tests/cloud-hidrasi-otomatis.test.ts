// A provider the app picked for you is not a provider you chose.
//
// WHAT WENT WRONG. loadModels() in public/app.tsx asks /cloud-providers which
// providers the SERVER holds keys for, picks one, and writes it to
// localStorage so the rest of the app knows which one to use. The object it
// wrote — provider, name, model, no key — is byte-for-byte what an explicit
// choice looks like.
//
// So a machine that had ever run WOLFSPACE showed a configured provider and a
// model on a fresh install, with no key beside them and no way to tell it apart
// from something typed in by hand. The user reported it as the installer
// shipping a preset; it was not. The profile directory
// (%APPDATA%\WOLFSPACE-<hash>) survives an uninstall, and the entry was still
// in it.
//
// WHY IT IS STILL WRITTEN. Not writing was the obvious fix and it is wrong.
// agent/cloud.ts resolves the provider as
//
//     cloud.provider || (cloud.key ? detectProvider(cloud.key) : null)
//
// so with neither a provider nor a key it gives up. The client naming the
// provider IS the mechanism by which a server-side key gets used; dropping the
// write would break chat for everyone relying on one.
//
// The fix is the mark, not the removal.

const fs = require("fs");
const path = require("path");

const AKAR = path.resolve(__dirname, "..");
const baca = (rel) => fs.readFileSync(path.join(AKAR, rel), "utf8");

describe("hidrasi cloud otomatis dibedakan dari pilihan pengguna", () => {
  test("app.tsx menandai entri hasil hidrasi dengan otomatis: true", () => {
    const src = baca("public/app.tsx");
    const i = src.indexOf("const provs = await");
    expect(i).toBeGreaterThan(-1);
    // Sliced to the end of the enclosing callback rather than a fixed window:
    // a fixed count of characters has already made a test in this repo red for
    // no reason but a comment growing.
    const j = src.indexOf("\n  }, [", i);
    const blok = src.slice(i, j > i ? j : i + 2600);
    expect(blok).toMatch(/setCloudLS\(cloud\)/);
    expect(blok).toMatch(/otomatis:\s*true/);
  });

  test("layar setelan memperlakukan entri otomatis sebagai BELUM dipilih", () => {
    const src = baca("public/app/Views.tsx");
    // The stored value is filtered before it reaches the form state, so the
    // provider select falls back to "auto" and the model box stays empty.
    expect(src).toMatch(
      /tersimpan\s*&&\s*tersimpan\.otomatis\s*\?\s*null\s*:\s*tersimpan/,
    );
    expect(src).toMatch(
      /useState\(\s*stored \? \(stored\.baseUrl \? "custom" : stored\.provider\) : "auto"/,
    );
  });

  test("menyimpan secara eksplisit MENGHAPUS tandanya", () => {
    // The save path writes a fresh object with no `otomatis` field, so picking a
    // provider by hand clears the mark by construction rather than by an extra
    // line someone has to remember.
    const src = baca("public/app/Views.tsx");
    const i = src.indexOf("setCloudLS({ key: k");
    expect(i).toBeGreaterThan(-1);
    const baris = src.slice(i, src.indexOf("\n", i));
    expect(baris).not.toMatch(/otomatis/);
  });

  test("penggunanya diberi tahu asal pilihan itu, bukan dibiarkan menebak", () => {
    // Hiding the automatic entry without saying anything would trade one
    // confusion for another: the app would be talking to a provider the screen
    // does not mention at all.
    const src = baca("public/app/Views.tsx");
    expect(src).toMatch(/from a key stored on the server/i);
  });
});

describe("pemilih model ikut menghormati tanda otomatis", () => {
  // Perbaikan pertama hanya setengah. Tanda `otomatis` dipasang, dan LAYAR
  // SETELAN memakainya — tapi loadModels tak pernah melihatnya. Entri yang
  // sama lalu terbaca sebagai "belum dipilih" di satu layar dan sebagai model
  // pilihan pemakai di layar lain.
  //
  // Yang dilihat pemakai pada pemasangan baru: sebuah nama model terpampang
  // tanpa satu pun kunci di belakangnya. Persis rupa "semuanya sudah
  // terpasang".
  test("label menyebut kuncinya milik server, bukan pilihan pemakai", () => {
    const src = baca("public/app.tsx");
    const i = src.indexOf('value: "cloud",');
    expect(i).toBeGreaterThan(-1);
    const blok = src.slice(i, i + 1400);
    expect(blok).toMatch(/cloud\.otomatis/);
    expect(blok).toMatch(/server key/);
  });

  test("entrinya TIDAK dibuang — kunci server itu nyata", () => {
    // Menjatuhkannya akan mematahkan chat bagi siapa pun yang kuncinya memang
    // di server: agent/cloud.ts butuh cloud.provider untuk menjangkaunya.
    const src = baca("public/app.tsx");
    expect(src).toMatch(
      /const hasCloud = cloud && \(cloud\.key \|\| cloud\.provider\)/,
    );
  });

  test("kunci milik pemakai sendiri tetap ditandai empat digit", () => {
    const src = baca("public/app.tsx");
    expect(src).toMatch(/cloud\.key\.slice\(-4\)/);
  });
});
