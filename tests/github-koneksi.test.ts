// Connecting a GitHub account: where the token lives, and what never leaves.
//
// THE COLLISION THIS EXISTS TO PREVENT. This app already has a provider called
// "github" — GitHub MODELS, an LLM endpoint whose keys live in
// cloud-keys.json. Both credentials carry the same prefixes (`ghp_`,
// `github_pat_`), and server.ts decides a provider from exactly those:
//
//     if (key.startsWith("github_pat_") || key.startsWith("ghp_")) return "github";
//
// A repository token written into that file would be read back as an LLM
// provider key and could silently replace the model the user is talking to.
// Nothing would error; the answers would just start coming from somewhere else.
// So the two live in different files, and this pins that apart.

const fs = require("fs");
const path = require("path");
const AKAR = path.resolve(__dirname, "..");
require(path.join(AKAR, "scripts", "ts-register.cjs"));

const GH = require(path.join(AKAR, "agent", "github.ts"));
const SRC = fs.readFileSync(path.join(AKAR, "agent", "github.ts"), "utf8");

/**
 * Source with its comments removed.
 *
 * Assertions about what a module DOES must not read what it SAYS. The first
 * version of the check below matched "cloud-keys" and went red against the very
 * comment explaining why this module keeps away from that file -- the fourth
 * time in this codebase that a test has been failed by its own documentation.
 */
const KODE = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*/g, " ");
const RUTE = fs.readFileSync(
  path.join(AKAR, "server", "routes", "github.ts"),
  "utf8",
);
const SRV = fs.readFileSync(path.join(AKAR, "server.ts"), "utf8");
const UI = fs.readFileSync(
  path.join(AKAR, "public", "app", "Components.tsx"),
  "utf8",
);

describe("kredensialnya terpisah dari GitHub Models", () => {
  test("it is stored in its own file", () => {
    expect(path.basename(GH.BERKAS())).toBe("github.json");
    expect(GH.BERKAS()).not.toMatch(/cloud-keys\.json$/);
  });

  test("it never touches the cloud key store", () => {
    expect(KODE).not.toMatch(/cloud-keys/);
    expect(KODE).not.toMatch(/resolveKeysPath/);
    // The directory is shared, which is right -- one place for secrets. The
    // FILE is what must differ.
    expect(KODE).toMatch(/keysDir/);
  });

  test("the file sits inside a gitignored directory", () => {
    // A token in a tracked file is a token in the history forever.
    const rel = path.relative(AKAR, GH.BERKAS()).split(path.sep).join("/");
    expect(rel.startsWith(".wolfspace/")).toBe(true);
    const ignore = fs.readFileSync(path.join(AKAR, ".gitignore"), "utf8");
    expect(ignore).toMatch(/^\.wolfspace\/$/m);
  });
});

describe("token tidak pernah keluar lagi", () => {
  test("status reports connectedness, not the credential", () => {
    // A status response carrying the token would put it into every log and
    // devtools panel that ever displayed it.
    // Asserted as "no credential escapes", not as an exact key list. The list
    // form broke the moment a legitimate field was added, which trains people
    // to update the expectation without reading it -- exactly the habit that
    // lets a real leak through one day.
    const k = GH.keadaan();
    expect(typeof k.tersambung).toBe("boolean");
    expect(typeof k.bisaMasuk).toBe("boolean");
    for (const nama of Object.keys(k)) {
      expect([nama, /token|secret|key|code/i.test(nama)]).toEqual([
        nama,
        false,
      ]);
    }
    expect(JSON.stringify(k)).not.toMatch(/gh[pousr]_|github_pat_/);
  });

  test("no route hands the token back", () => {
    expect(RUTE).not.toMatch(/token:/);
    expect(RUTE).toMatch(/GH\.keadaan\(\)/);
  });
});

describe("sambungan diverifikasi sebelum disimpan", () => {
  test("an empty token is refused without a network call", async () => {
    await expect(GH.sambung("")).rejects.toThrow(/token is required/);
  });

  test("connect calls /user before writing", () => {
    // Writing first and verifying later leaves a bad token on disk looking
    // exactly like a good one, and the failure then surfaces somewhere else
    // entirely.
    const blok = SRC.slice(
      SRC.indexOf("async function sambung"),
      SRC.indexOf("function putus"),
    );
    expect(blok.indexOf("await akun(t)")).toBeLessThan(
      blok.indexOf("tulis(s)"),
    );
  });

  test("reads refuse when nothing is connected", async () => {
    // Only meaningful when this machine has no token stored; when it has one,
    // the call would really hit GitHub, which a unit test must not do.
    if (GH.keadaan().tersambung) return;
    await expect(GH.daftarRepo()).rejects.toThrow(/not connected/);
    await expect(GH.daftarCabang("a", "b")).rejects.toThrow(/not connected/);
  });
});

describe("masuk dengan akun, bukan menempel token", () => {
  test("device flow needs no client secret", () => {
    // Widely misremembered, and GitHub's own docs are explicit: "the
    // client_secret is not needed for the device flow". Embedding one in a
    // desktop app would simply publish it.
    // KODE, not SRC: the header comment quotes GitHub's own sentence about
    // client_secret, and matching the source would fail against the very
    // documentation of why there is none.
    // Scoped to the DEVICE functions. The browser flow further down does send
    // a client_secret, because GitHub requires one to exchange an
    // authorization code -- that is a different flow, not a contradiction.
    const blokDev = KODE.slice(
      KODE.indexOf("async function mulaiMasuk"),
      KODE.indexOf("const PORT_CALLBACK"),
    );
    expect(blokDev).not.toMatch(/client_secret/);
    expect(blokDev).toMatch(/client_id: id/);
  });

  test("it asks for JSON, or both endpoints answer in form-encoded text", () => {
    const blok = SRC.slice(
      SRC.indexOf("function kirimForm"),
      SRC.indexOf("function clientId"),
    );
    expect(blok).toMatch(/accept: "application\/json"/);
  });

  test("polling is ONE attempt, never a wait loop", () => {
    // A request that sat here until the user finished typing in their browser
    // would hold the backend for minutes -- the failure this repo has already
    // chased twice.
    const blok = SRC.slice(
      SRC.indexOf("async function lanjutMasuk"),
      SRC.indexOf("/** The signed-in account"),
    );
    expect(blok).not.toMatch(/while \(|setInterval|for \(;;\)/);
  });

  test("pending and slow_down are NOT failures", () => {
    // They are the flow working. Reporting them as errors makes a normal wait
    // look like a problem every few seconds.
    expect(SRC).toMatch(/authorization_pending/);
    expect(SRC).toMatch(/slow_down/);
    const i = SRC.indexOf("authorization_pending");
    expect(SRC.slice(i, i + 120)).toMatch(/selesai: false/);
  });

  test("a declined or expired sign-in clears the attempt", () => {
    // Leaving a dead device code stored makes the next attempt fail with a
    // message about the previous one.
    expect(SRC).toMatch(/access_denied/);
    expect(SRC).toMatch(/expired_token/);
  });

  test("no sign-in is offered without a client ID", () => {
    // Otherwise the panel shows a button that could only ever fail.
    expect(SRC).toMatch(/bisaMasuk: Boolean\(clientId\(\)\)/);
  });

  test("starting refuses early when nothing is configured", async () => {
    if (GH.clientId()) return; // configured on this machine; would call GitHub
    await expect(GH.mulaiMasuk()).rejects.toThrow(/no OAuth client ID/);
  });

  test("polling refuses when nothing is in progress", async () => {
    await expect(GH.lanjutMasuk()).rejects.toThrow(/no sign-in is in progress/);
  });

  test("the token path survives, demoted", () => {
    // Pasting a token is a credential the user manages themselves -- the shape
    // MCP already offers. It stays available, but it is no longer the front
    // door for what is an ACCOUNT sign-in.
    expect(UI).toMatch(/Sign in with GitHub/);
    expect(UI).toMatch(/Use a personal access token instead/);
  });
});

describe("taut repo", () => {
  test("all three parts are required", () => {
    expect(() => GH.taut({ owner: "a", repo: "", branch: "main" })).toThrow(
      /owner, repo and branch/,
    );
  });
});

describe("permintaan ke GitHub berbentuk benar", () => {
  test("it sends a User-Agent, which GitHub requires", () => {
    // GitHub refuses requests without one, and the failure reads as a generic
    // 403 rather than as a missing header.
    expect(SRC).toMatch(/"user-agent": UA/);
  });

  test("errors carry GitHub's own message", () => {
    // "Bad credentials" and "Not Found" each name a different fix; "request
    // failed" names none.
    expect(SRC).toMatch(/j && j\.message/);
    expect(SRC).toMatch(/rate limit exhausted/);
  });
});

describe("terpasang di server", () => {
  test("the /github/ routes are dispatched", () => {
    expect(SRV).toMatch(/require\("\.\/server\/routes\/github\.ts"\)/);
    expect(SRV).toMatch(/startsWith\("\/github\/"\)/);
  });

  test("the dispatcher is not held for the round trip", () => {
    // Every route here makes a network call. Awaiting it in the dispatcher
    // would block the backend for the duration, which is the failure this repo
    // has chased more than once.
    const i = SRV.indexOf('startsWith("/github/")');
    const blok = SRV.slice(i - 400, i + 400);
    expect(blok).toMatch(/ruteGithub\(req, res\)\.catch\(/);
    expect(blok).not.toMatch(/await _githubRoutes/);
  });
});

// ── THE BROWSER SIGN-IN ──────────────────────────────────────────────────────
//
// This is the flow that opens GitHub's own Authorize page. Everything asserted
// here is a property that, if lost, turns a working sign-in into a security
// problem rather than a visible bug -- which is exactly the kind that survives
// manual testing.
describe("masuk lewat peramban", () => {
  const BLOK = KODE.slice(KODE.indexOf("const PORT_CALLBACK"));

  test("the callback listens on the loopback address only", () => {
    // Without the second argument, Node binds every interface and the callback
    // becomes reachable from the network for as long as it is open.
    expect(BLOK).toMatch(/srv\.listen\(PORT_CALLBACK, "127\.0\.0\.1"/);
    expect(GH.ALAMAT_CALLBACK.startsWith("http://127.0.0.1:")).toBe(true);
  });

  test("it uses PKCE with S256", () => {
    expect(BLOK).toMatch(/createHash\("sha256"\)/);
    expect(BLOK).toMatch(/code_challenge_method", "S256"/);
    expect(BLOK).toMatch(/code_verifier: verifier/);
  });

  test("the state is generated and checked", () => {
    // A callback that accepted any state would take a code from any page that
    // could send the browser here.
    expect(BLOK).toMatch(/searchParams\.set\("state", state\)/);
    expect(BLOK).toMatch(/searchParams\.get\("state"\) !== state/);
  });

  test("the listener is closed on every outcome", () => {
    // Success, failure and timeout. A port left open outlives the few seconds
    // of work it was opened for.
    expect((BLOK.match(/srv\.close\(\)/g) || []).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(BLOK).toMatch(/sign-in timed out/);
  });

  test("it refuses to start without an OAuth App", () => {
    expect(BLOK).toMatch(/if \(!id \|\| !rahasia\)/);
  });

  test("the secret is never returned over a route", () => {
    const rute = fs.readFileSync(
      path.join(AKAR, "server", "routes", "github.ts"),
      "utf8",
    );
    expect(rute).not.toMatch(/clientSecret: /);
    expect(GH.keadaan()).not.toHaveProperty("clientSecret");
  });

  test("main will only open GitHub's authorize page", () => {
    // shell.openExternal hands a string to the operating system. A general
    // "open this URL" request from the backend would be the widest channel in
    // the app.
    const m = fs.readFileSync(path.join(AKAR, "electron", "main.ts"), "utf8");
    const blok = m.slice(
      m.indexOf("function _bukaMasukGithub"),
      m.indexOf("function _layaniMintaMain"),
    );
    expect(blok).toMatch(/hostname !== "github\.com"/);
    expect(blok).toMatch(/pathname !== "\/login\/oauth\/authorize"/);
    expect(blok).toMatch(/protocol !== "https:"/);
  });

  test("starting does not hold the request until the user finishes", () => {
    // masukWeb kicks the flow off and returns; the panel polls. Awaiting the
    // sign-in here would hold the backend for minutes.
    const b = KODE.slice(KODE.indexOf("function masukWeb"));
    expect(b.slice(0, b.indexOf("function keadaanWeb"))).not.toMatch(/await /);
  });
});

// ── THE OAUTH APP IS SHIPPED, NOT ASKED FOR ──────────────────────────────────
//
// The first version of this feature opened a form asking the person installing
// WOLFSPACE to register an OAuth App. That is the wrong party: the app is
// registered once by whoever ships it, which is how comparable tools work --
// GitHub's own MCP server ships "with a registered GitHub OAuth application
// baked in", and GitHub Desktop "needs to be bundled with a Client ID and
// Secret". These pin the shape so it cannot quietly revert.
describe("aplikasi OAuth ikut dikirim, bukan diminta", () => {
  const APPSRC = fs.readFileSync(
    path.join(AKAR, "agent", "github-app.ts"),
    "utf8",
  );

  test("there is a place for built-in credentials", () => {
    const APP = require(path.join(AKAR, "agent", "github-app.ts"));
    const b = APP.appBawaan();
    expect(typeof b.clientId).toBe("string");
    expect(typeof b.clientSecret).toBe("string");
  });

  test("the built-in app is used unless one was deliberately saved", () => {
    // baca().clientId FIRST, built-in second: a stored value is an opt-out, and
    // nothing is stored until someone chooses their own app.
    const blok = KODE.slice(
      KODE.indexOf("function clientId()"),
      KODE.indexOf("function simpanClientId"),
    );
    expect(blok).toMatch(
      /baca\(\)\.clientId \|\| APP\.appBawaan\(\)\.clientId/,
    );
    expect(blok).toMatch(
      /baca\(\)\.clientSecret \|\| APP\.appBawaan\(\)\.clientSecret/,
    );
  });

  test("a build can inject the credentials without editing source", () => {
    expect(APPSRC).toMatch(/WOLFSPACE_GITHUB_CLIENT_ID/);
    expect(APPSRC).toMatch(/WOLFSPACE_GITHUB_CLIENT_SECRET/);
  });

  test("the callback URL in the instructions is the one actually used", () => {
    // These have to match character for character or GitHub refuses the
    // redirect, and the comment is what someone registers the app from.
    expect(APPSRC).toContain(GH.ALAMAT_CALLBACK);
  });

  test("the panel does not open on a setup form when an app is shipped", () => {
    const ui = fs.readFileSync(
      path.join(AKAR, "public", "app", "Components.tsx"),
      "utf8",
    );
    // The form is reached only when there is no usable app, or when the user
    // asked for it. Anything else puts a form in front of signing in.
    expect(ui).toMatch(/\{!keadaan\.bisaWeb \|\| pakaiAppSendiri \? \(/);
    expect(ui).toMatch(/Sign in with GitHub/);
  });

  test("status says whether the shipped app is in use", () => {
    expect(GH.keadaan()).toHaveProperty("appBawaan");
  });
});

// ── THE FIXED PORT IS A PREFERENCE, NOT A REQUIREMENT ────────────────────────
//
// GitHub's docs, for loopback redirects: "The redirect_uri does not need to
// match the port specified in the callback URL for the app." That is what lets
// a busy 8121 on somebody else's machine stop being a sign-in that can never
// succeed.
describe("port callback bisa berpindah", () => {
  const BLOK = KODE.slice(KODE.indexOf("function mulaiWeb"));

  test("a taken port falls back to one the OS picks", () => {
    expect(BLOK).toMatch(/EADDRINUSE/);
    expect(BLOK).toMatch(/srv\.listen\(0, "127\.0\.0\.1", siap\)/);
  });

  test("the fallback still binds loopback only", () => {
    // Every listen() in here names 127.0.0.1. One that did not would put the
    // callback on the network for the length of a sign-in.
    const semua = BLOK.match(/srv\.listen\([^)]*\)/g) || [];
    expect(semua.length).toBeGreaterThanOrEqual(2);
    for (const s of semua) expect(s).toContain('"127.0.0.1"');
  });

  test("the redirect_uri is the port actually bound, not the preferred one", () => {
    // GitHub checks the code against the redirect_uri it was issued for, so
    // sending the registered address after binding a different port would fail
    // the exchange with a message about the redirect, not the port.
    // SRC, not KODE: the comment stripper eats the "//" inside the URL
    // literal itself, so the stripped copy cannot match an address at all.
    const asli = SRC.slice(SRC.indexOf("function mulaiWeb"));
    expect(asli).toMatch(/alamatDipakai = "http:/);
    expect(BLOK).toMatch(/redirect_uri: alamatDipakai/);
    expect(BLOK).toMatch(/"redirect_uri", alamatDipakai/);
  });

  test("the listen callback runs once even though it is passed twice", () => {
    // MEASURED: a failed listen() does not consume its one-shot "listening"
    // listener, so the retry leaves two attached and both fire on success --
    // two browser tabs, and a second run against a null address.
    expect(BLOK).toMatch(/if \(sudahSiap\) return;/);
    expect(BLOK).toMatch(/if \(!alamat\) return;/);
  });
});

// ── HOW THE SHIPPED CREDENTIALS REACH AN INSTALL ─────────────────────────────
//
// The near-miss worth pinning: a build-time environment variable CANNOT carry
// them. agent/** ships as source and is read by ts-register on the user's
// machine, so appBawaan() runs there — a variable set on the build machine is
// long gone, and every install would fall back to the setup form with nothing
// to show for it. An untracked JSON file beside the module does reach them.
describe("kredensial terkirim sampai ke pemasangan", () => {
  const APPSRC = fs.readFileSync(
    path.join(AKAR, "agent", "github-app.ts"),
    "utf8",
  );
  const LOKAL = path.join(AKAR, "agent", "github-app.local.json");

  test("the local file is read from beside the module, not the cwd", () => {
    // __dirname, because the working directory of an installed app is not the
    // app's own folder.
    expect(APPSRC).toMatch(
      /path\.join\(__dirname, "github-app\.local\.json"\)/,
    );
  });

  test("the local file is gitignored but not excluded from the installer", () => {
    const ig = fs.readFileSync(path.join(AKAR, ".gitignore"), "utf8");
    expect(ig).toMatch(/agent\/github-app\.local\.json/);
    const files = require(path.join(AKAR, "package.json")).build.files;
    expect(files).toContain("agent/**");
    // The exclusions in build.files are by extension; .json must not be one.
    for (const f of files) {
      if (typeof f === "string" && f.startsWith("!agent/")) {
        expect(f.endsWith(".json")).toBe(false);
      }
    }
  });

  test("a missing local file is not an error", () => {
    // Every checkout that has not set one up must still load and run.
    const ada = fs.existsSync(LOKAL);
    if (ada) return;
    const A = require(path.join(AKAR, "agent", "github-app.ts"));
    expect(() => A.appBawaan()).not.toThrow();
  });
});

// ── GANTI AKUN ───────────────────────────────────────────────────────────────
//
// The feature was unusable for a reason worth recording: /github/disconnect
// existed and worked, and NOTHING in the panel ever called it. There was no way
// to sign out, so there was no way to sign in as anyone else.
describe("ganti akun", () => {
  const UI = fs.readFileSync(
    path.join(AKAR, "public", "app", "Components.tsx"),
    "utf8",
  );

  test("the panel can actually sign out", () => {
    expect(UI).toMatch(/fetch\("\/github\/disconnect", \{ method: "POST" \}\)/);
    expect(UI).toMatch(/Sign out/);
    expect(UI).toMatch(/Switch/);
  });

  test("signing out clears everything belonging to that account", () => {
    const blok = KODE.slice(
      KODE.indexOf("function putus()"),
      KODE.indexOf("async function daftarRepo"),
    );
    for (const k of ["token", "taut", "akun", "device"]) {
      expect(blok).toMatch(new RegExp("delete s\\." + k + ";"));
    }
    // A sign-in still in flight would otherwise land afterwards and reconnect.
    expect(blok).toMatch(/_web = \{ keadaan: "diam" \}/);
  });

  test("the panel drops the previous account's repositories", () => {
    // They are already rendered. Leaving them would show one account's private
    // repository names to whoever signs in next.
    const blok = UI.slice(UI.indexOf("const putus = async"));
    const akhir = blok.indexOf("const mulaiWeb");
    expect(blok.slice(0, akhir)).toMatch(/setRepo\(\[\]\)/);
    expect(blok.slice(0, akhir)).toMatch(/setPilih\(null\)/);
  });

  test("switching asks GitHub for the account picker", () => {
    // Signing out here does not sign the browser out of GitHub, so without
    // this the next sign-in silently returns the SAME account.
    expect(KODE).toMatch(/if \(ganti\)[\s\S]{0,60}"prompt", "select_account"/);
  });

  test("the ordinary sign-in does NOT ask for the picker", () => {
    // It would add a click to the common case for no reason.
    const blok = KODE.slice(KODE.indexOf("function mulaiWeb"));
    const baris = blok
      .split("\n")
      .filter((l: string) => l.includes("select_account"));
    expect(baris.length).toBe(1);
    expect(baris[0]).toMatch(/if \(ganti\)/);
  });

  test("the click event is never mistaken for the switch flag", () => {
    // onClick={mulaiWeb} would pass a MouseEvent as `ganti`, which is truthy --
    // every plain sign-in would then open the account picker.
    expect(UI).not.toMatch(/onClick=\{mulaiWeb\}/);
    expect(UI).toMatch(/onClick=\{\(\) => mulaiWeb\(\)\}/);
  });
});

// ── BUAT REPOSITORY ──────────────────────────────────────────────────────────
//
// The one write in this feature. These pin both that it works and that its
// limits are still the stated ones.
describe("buat repository", () => {
  test("it POSTs to /user/repos and asks for an initial commit", () => {
    const blok = KODE.slice(KODE.indexOf("async function buatRepo"));
    expect(blok).toMatch(/panggil\("\/user\/repos", t, \{/);
    expect(blok).toMatch(/metode: "POST"/);
    // WITHOUT auto_init the repository has no commits, so it has no branches,
    // so there is nothing to link -- it would appear and be unusable.
    expect(blok).toMatch(/auto_init:/);
  });

  test("a bad name is refused before any request is made", async () => {
    await expect(GH.buatRepo({ nama: "" })).rejects.toThrow(/name is required/);
    await expect(GH.buatRepo({ nama: "bad name" })).rejects.toThrow(
      /letters, numbers/,
    );
    await expect(GH.buatRepo({ nama: "oops!" })).rejects.toThrow(
      /letters, numbers/,
    );
  });

  test("creating is a POST while listing stays a GET", () => {
    const rute = fs.readFileSync(
      path.join(AKAR, "server", "routes", "github.ts"),
      "utf8",
    );
    expect(rute).toMatch(/req\.method === "GET" && url === "\/github\/repos"/);
    expect(rute).toMatch(/req\.method === "POST" && url === "\/github\/repos"/);
  });

  test("GitHub's real reason is not swallowed", () => {
    // GitHub answers a rejected name with a generic `message` and the actual
    // cause in `errors` -- reporting only the first tells the user nothing.
    const blok = KODE.slice(
      KODE.indexOf("function panggil("),
      KODE.indexOf("function kirimForm"),
    );
    expect(blok).toMatch(/j\.errors/);
  });

  test("the file no longer claims nothing is written", () => {
    // The claim was true until buatRepo existed. Leaving it would be a comment
    // that contradicts the code beneath it.
    expect(SRC.slice(0, SRC.indexOf("import "))).toMatch(
      /buatRepo\(\)\s+creates a repository/,
    );
    const ui = fs.readFileSync(
      path.join(AKAR, "public", "app", "Components.tsx"),
      "utf8",
    );
    expect(ui).not.toMatch(/nothing is cloned and nothing is written/);
  });
});

// ── AKUN LAMA TETAP TERBACA ──────────────────────────────────────────────────
//
// A connection made before the account was recorded has a token and no name.
// The panel cannot offer to switch away from an account it cannot name, so an
// existing connection would have shown an empty header until it was rebuilt.
describe("koneksi lama diisi ulang", () => {
  test("fetching the account stores it when it is the connected one", () => {
    const blok = KODE.slice(
      KODE.indexOf("async function akun("),
      KODE.indexOf("async function sambung"),
    );
    expect(blok).toMatch(/s\.token === t && !s\.akun/);
    expect(blok).toMatch(/s\.akun = a;/);
  });

  test("it does not overwrite an account that is already recorded", () => {
    // `!s.akun` is what keeps a /user call from rewriting the file on every
    // status check.
    const blok = KODE.slice(
      KODE.indexOf("async function akun("),
      KODE.indexOf("async function sambung"),
    );
    expect(blok).toMatch(/!s\.akun/);
  });

  test("the panel asks for it only when it is missing", () => {
    const ui = fs.readFileSync(
      path.join(AKAR, "public", "app", "Components.tsx"),
      "utf8",
    );
    expect(ui).toMatch(/if \(j\.tersambung && !j\.akun\)/);
    expect(ui).toMatch(/fetch\("\/github\/account"\)/);
  });
});

// ── A REJECTED TOKEN IS NOT A CONNECTION ─────────────────────────────────────
//
// REPORTED FROM THE RUNNING APP: "GitHub: Bad credentials", and the repository
// list stayed empty — while the panel still said connected and offered no way
// back in.
//
// keadaan() reported `tersambung` from the mere PRESENCE of a token string. It
// never asked whether the token still worked, so a revoked credential looked
// exactly like a live one.
//
// DIAGNOSED, not guessed, against GitHub's own check endpoint —
// POST /applications/{client_id}/token with the app credentials as basic auth:
//
//   HTTP 404  Not Found
//
// 401 there would have meant the OAuth App itself was wrong. 404 means the app
// is fine and the TOKEN is no longer one of its own: revoked or expired.
//
// VERIFIED end to end against the real stored credential:
//   before  tersambung:true   akun:{login:"tegardave-alt"}
//   call    "GitHub: Bad credentials — the stored sign-in is no longer valid…"
//   after   tersambung:false  akun:null   taut kept   clientId/Secret kept
describe("kredensial mati tidak boleh terlihat tersambung", () => {
  const SRC401 = fs.readFileSync(path.join(AKAR, "agent", "github.ts"), "utf8");

  test("a 401 drops the stored token", () => {
    // At the one place every call passes through, so no route can forget it.
    const i = SRC401.indexOf("if (s.statusCode === 401) {");
    expect(i).toBeGreaterThan(0);
    const blok = SRC401.slice(i, i + 420);
    expect(blok).toMatch(/delete simpan\.token/);
    expect(blok).toMatch(/delete simpan\.akun/);
  });

  test("it keeps the OAuth App and the linked repository", () => {
    // The app is not the problem, and an expired token is not an account
    // switch: the same person signs back in and should not have to pick their
    // repository again.
    const i = SRC401.indexOf("if (s.statusCode === 401) {");
    const blok = SRC401.slice(i, i + 420);
    expect(blok).not.toMatch(/delete simpan\.taut/);
    expect(blok).not.toMatch(/delete simpan\.clientId/);
    expect(blok).not.toMatch(/delete simpan\.clientSecret/);
  });

  test("a bad PASTED token cannot sign out a working session", () => {
    // sambung() verifies a pasted token by calling here with it. Without the
    // guard, one bad paste would end a session that was fine.
    const i = SRC401.indexOf("if (s.statusCode === 401) {");
    expect(SRC401.slice(i, i + 420)).toMatch(
      /simpan\.token && simpan\.token === token/,
    );
  });

  test("the message says what to do about it", () => {
    // "Bad credentials" alone tells a user nothing they can act on.
    expect(SRC401).toMatch(
      /the stored sign-in is no longer valid; sign in again/,
    );
  });

  test("the panel falls back to signing in, with no extra branch", () => {
    // tersambung goes false, and the existing !keadaan.tersambung branch does
    // the rest — the recovery is one click and needed no new UI.
    const ui = fs.readFileSync(
      path.join(AKAR, "public", "app", "Components.tsx"),
      "utf8",
    );
    expect(ui).toMatch(/!keadaan\.tersambung \?/);
    expect(ui).toMatch(/Sign in with GitHub/);
  });

  test("the agent's reader refuses clearly once the token is gone", () => {
    const blok = SRC401.slice(SRC401.indexOf("function _tautWajib"));
    expect(blok.slice(0, 400)).toMatch(/sign in to GitHub first/);
  });
});

// ── CHOOSING THE REPOSITORY TYPE AND ITS BRANCH ──────────────────────────────
//
// VERIFIED IN GITHUB'S DOCUMENTATION FIRST, because a guess here would have
// produced a field that is silently ignored: POST /user/repos has NO parameter
// for the initial branch name. `default_branch` exists only on
// PATCH /repos/{owner}/{repo}, and the name a new repository actually gets
// comes from the account's own setting.
//
// So the branch is renamed AFTERWARDS via
// POST /repos/{owner}/{repo}/branches/{branch}/rename — and only when it is not
// already what was asked for. Most accounts default to `main`, so the ordinary
// case makes no extra request at all.
//
// ── A NOTE ON HOW THESE TESTS ARE WRITTEN ──
//
// Every case below uses a repository name that CANNOT PASS VALIDATION, so no
// test here can reach the network. That rule exists because a probe written the
// other way — a valid name with an invalid branch — really did create a
// repository on the developer's GitHub account while checking branch rules.
describe("jenis repo dan nama cabang", () => {
  const NAMA_MUSTAHIL = "tidak boleh ada spasi";

  // ── THE BRANCH RULE IS TESTED DIRECTLY ──
  //
  // Not through buatRepo(), because buatRepo CREATES A REPOSITORY. Twice while
  // building this feature a probe written that way put a real repository on a
  // real GitHub account: the repo name happened to be valid, so the call sailed
  // past validation and straight into the API. A rule that can only be tested
  // by performing the action it guards WILL be tested by performing it.
  //
  // namaCabangSah() needs no network, no token and no account, so nothing here
  // can reach GitHub however the checks inside buatRepo are later ordered.
  test("git's rules are enforced", () => {
    for (const c of [
      "my branch",
      ".x",
      "a..b",
      "x.lock",
      "a?b",
      "a[b]",
      "a\\b",
      "-x",
      "x/",
      "a@{b",
      "~x",
    ]) {
      const r = GH.namaCabangSah(c);
      expect(r.sah).toBe(false);
      expect(r.sebab).toMatch(/branch name cannot/);
    }
  });

  test("ordinary names pass", () => {
    for (const c of ["main", "master", "dev/x", "v1.2", "release-2", "fix_1"]) {
      expect(GH.namaCabangSah(c)).toEqual({ sah: true });
    }
  });

  test("an empty name is allowed - it means whatever GitHub gives", () => {
    expect(GH.namaCabangSah("")).toEqual({ sah: true });
    expect(GH.namaCabangSah(undefined)).toEqual({ sah: true });
  });

  test("buatRepo uses that function rather than its own copy", () => {
    const blok = SRC.slice(SRC.indexOf("async function buatRepo"));
    expect(blok).toMatch(/namaCabangSah\(cabangMau\)/);
  });

  test("the rename only happens when the name differs", () => {
    const blok = SRC.slice(SRC.indexOf("async function buatRepo"));
    expect(blok).toMatch(/if \(mau && mau !== cabang\)/);
    expect(blok).toMatch(/\/rename/);
    expect(blok).toMatch(/new_name: mau/);
  });

  test("a failed rename does not report the creation as a failure", () => {
    // The repository exists and is usable; only its branch carries a different
    // name. Throwing would leave the user believing nothing was created.
    const blok = SRC.slice(SRC.indexOf("async function buatRepo"));
    const i = blok.indexOf("/rename");
    expect(blok.slice(i, i + 700)).toMatch(/catch \(e: any\)/);
    expect(blok.slice(i, i + 700)).toMatch(/_catatanCabang/);
  });

  test("rename needs a commit, so auto_init stays on", () => {
    const blok = SRC.slice(SRC.indexOf("async function buatRepo"));
    expect(blok).toMatch(/auto_init:/);
  });
});

describe("visibilitas dipilih, bukan dilewatkan", () => {
  const UI = fs.readFileSync(
    path.join(AKAR, "public", "app", "Components.tsx"),
    "utf8",
  );

  test("both options are shown, each saying what it means", () => {
    // It was a "Private" checkbox: public was what you got by NOT doing
    // something, and publishing code is not a state to arrive at by omission.
    expect(UI).toMatch(/judul: "Private"/);
    expect(UI).toMatch(/judul: "Public"/);
    expect(UI).toMatch(/Anyone on the internet can see it/);
    expect(UI).toMatch(/Only you can see it/);
  });

  test("the old checkbox is gone", () => {
    const i = UI.indexOf('className="gh-buat"');
    const blok = UI.slice(i, i + 3000);
    expect(blok).not.toMatch(/type="checkbox"/);
  });

  test("the choice is announced to assistive tech", () => {
    expect(UI).toMatch(/aria-pressed=\{pribadiBaru === o\.nilai\}/);
  });

  test("the branch field ships prefilled with main", () => {
    expect(UI).toMatch(/useState\("main"\)/);
    expect(UI).toMatch(/cabang: cabangBaru\.trim\(\)/);
  });

  test("private is the default, not public", () => {
    // A new repository nobody thought about should not be visible to everyone.
    expect(UI).toMatch(
      /const \[pribadiBaru, setPribadiBaru\] = useState\(true\)/,
    );
  });
});

// ── RENAMING AND DELETING ────────────────────────────────────────────────────
//
// VERIFIED IN GITHUB'S DOCUMENTATION, and then on the live token:
//
//   rename  PATCH /repos/{owner}/{repo} with `name` — needs the `repo` scope,
//           which this app has always requested. GitHub redirects the old name,
//           so existing clones keep working.
//   delete  DELETE /repos/{owner}/{repo} — "OAuth app tokens and personal
//           access tokens (classic) need the delete_repo scope".
//
// MEASURED on the token already in use, from the X-OAuth-Scopes header that
// GitHub returns on every response:
//
//     X-OAuth-Scopes: read:user, repo
//
// So every sign-in made before delete_repo was added to the request CANNOT
// delete, and no code change grants it: a token's scopes are fixed when it is
// issued. That is why bisaHapus is reported separately.
//
// ── HOW THESE TESTS ARE WRITTEN, AND WHY ─────────────────────────────────────
//
// Every call below fails on a check that runs BEFORE any network use, and the
// confirmation string is always wrong on purpose. That rule is not caution: a
// probe written the other way — a valid name, an invalid branch — really did
// create two repositories on a live GitHub account while this feature was being
// built. Deleting is worse than creating, so nothing here may be one typo away
// from performing it.
describe("ganti nama dan hapus repository", () => {
  // ── THE CONFIRMATION RULE IS TESTED DIRECTLY ──
  //
  // Not through hapusRepo(), because hapusRepo DELETES. Written the other way,
  // this test came within one existing owner of destroying a real repository:
  // the case "jarvis " was expected to be refused, was trimmed to a match, and
  // went through to DELETE. It answered 404 only because the owner used in the
  // test did not exist.
  //
  // konfirmasiCocok() needs no token, no network and no account.
  test("only the exact name confirms", () => {
    // A yes/no box is answered by reflex, and the reflex is yes.
    for (const salah of ["", "  ", "jarvi", "jarvis2", "o/jarvis"]) {
      expect(GH.konfirmasiCocok("jarvis", salah)).toBe(false);
    }
  });

  test("case is not ignored", () => {
    // `Jarvis` and `jarvis` can both exist and are different repositories.
    expect(GH.konfirmasiCocok("jarvis", "JARVIS")).toBe(false);
    expect(GH.konfirmasiCocok("Jarvis", "jarvis")).toBe(false);
  });

  test("a pasted trailing space is forgiven, and nothing else is", () => {
    // A name copied from GitHub often carries one, and refusing that teaches
    // nobody anything. It is the ONLY transformation applied.
    expect(GH.konfirmasiCocok("jarvis", "jarvis ")).toBe(true);
    expect(GH.konfirmasiCocok("jarvis", " jarvis")).toBe(true);
    expect(GH.konfirmasiCocok("jarvis", "jar vis")).toBe(false);
  });

  test("hapusRepo uses that function rather than its own copy", () => {
    const blok = SRC.slice(SRC.indexOf("async function hapusRepo"));
    expect(blok.slice(0, 900)).toMatch(/!konfirmasiCocok\(repo, konfirmasi\)/);
  });

  test("owner and repo are both required", async () => {
    await expect(GH.hapusRepo("", "x", "x")).rejects.toThrow(/both required/);
    await expect(GH.hapusRepo("o", "", "")).rejects.toThrow(/both required/);
  });

  test("the confirmation is checked in the FUNCTION, not only in the UI", () => {
    // A route that deleted on the strength of an earlier "are you sure" would
    // delete whatever the client names next, and the client is the part most
    // likely to be wrong about which row the user meant.
    const blok = SRC.slice(SRC.indexOf("async function hapusRepo"));
    expect(blok.slice(0, 900)).toMatch(/!konfirmasiCocok\(repo, konfirmasi\)/);
    const rute = fs.readFileSync(
      path.join(AKAR, "server", "routes", "github.ts"),
      "utf8",
    );
    expect(rute).toMatch(/konfirmasi: b\.konfirmasi|b\.konfirmasi/);
  });

  test("a missing scope is named, not passed through as a bare 403", () => {
    const blok = SRC.slice(SRC.indexOf("async function hapusRepo"));
    expect(blok.slice(0, 1600)).toMatch(/delete_repo/);
    expect(blok.slice(0, 1600)).toMatch(/sign in again/);
  });

  test("the sign-in now asks for delete_repo", () => {
    expect(SRC).toMatch(/const SCOPE = "repo read:user delete_repo"/);
    // Both flows, so a device sign-in is not quietly narrower than a web one.
    expect(SRC).toMatch(/scope: SCOPE/);
    expect(SRC).toMatch(/searchParams\.set\("scope", SCOPE\)/);
  });

  test("what the token may do is read from GitHub, not remembered", () => {
    // A copy stored at sign-in would still claim delete_repo after the user
    // narrowed the grant on github.com.
    expect(SRC).toMatch(/x-oauth-scopes/);
    expect(SRC).toMatch(/bisaHapus: _scopeTerakhir\.includes\("delete_repo"\)/);
  });

  test("renaming validates the new name before any request", async () => {
    for (const n of ["", "  ", "bad name", "oops!"]) {
      await expect(GH.gantiNamaRepo("o", "r", n)).rejects.toThrow(
        /required|letters, numbers/,
      );
    }
  });

  test("renaming to the same name is a no-op, not a request", async () => {
    // Nothing to change, and a PATCH for it would be a write for no reason.
    await expect(GH.gantiNamaRepo("o", "same", "same")).resolves.toEqual({
      owner: "o",
      repo: "same",
      penuh: "o/same",
    });
  });

  test("the link follows a rename and goes with a delete", () => {
    // A link pointing at a name that no longer exists fails on every read, and
    // the reason looks like a network problem rather than a renamed repo.
    // READ TO THE END OF THE FUNCTION, not a guessed number of characters. The
    // window versions were 1400 and 2200, and adding four lines of comment
    // inside gantiNamaRepo pushed the line being checked past the first — red
    // for a change that did not touch what the test guards. `\n}` at column
    // zero is where a top-level function ends in this file.
    const sampaiAkhir = (nama: string) => {
      const i = SRC.indexOf("async function " + nama);
      expect(i).toBeGreaterThan(-1);
      return SRC.slice(i, SRC.indexOf("\n}", i) + 2);
    };
    expect(sampaiAkhir("gantiNamaRepo")).toMatch(
      /s\.taut = \{ \.\.\.s\.taut, repo: r\.name \}/,
    );
    expect(sampaiAkhir("hapusRepo")).toMatch(/delete s\.taut/);
  });

  test("the file states its writes exactly", () => {
    // This header has twice said something about writing that later stopped
    // being true.
    const kepala = SRC.slice(0, SRC.indexOf("import "));
    expect(kepala).toMatch(/hapusRepo\(\)\s+DELETES one/);
    expect(kepala).toMatch(/gantiNamaRepo\(\)/);
    expect(kepala).toMatch(/NO CONTENT is/);
  });

  test("none of this is reachable from an agent tool", () => {
    // The agent's reader is read-only; these three exist for the panel, driven
    // by a person.
    const alat = fs.readFileSync(
      path.join(AKAR, "agent", "tools", "index.ts"),
      "utf8",
    );
    const i = alat.indexOf('if (name === "github_repo")');
    const blok = alat.slice(i, i + 900);
    expect(blok).not.toMatch(/hapusRepo|gantiNamaRepo|buatRepo/);
  });
});

describe("menu klik kanan", () => {
  const UI = fs.readFileSync(
    path.join(AKAR, "public", "app", "Components.tsx"),
    "utf8",
  );

  test("a right-click on a repository opens it", () => {
    expect(UI).toMatch(/onContextMenu=\{\(e: any\) => \{/);
    expect(UI).toMatch(/e\.preventDefault\(\)/);
    expect(UI).toMatch(
      /setMenu\(\{ x, atas: e\.clientY, kiri: e\.clientX \}\)/,
    );
  });

  test("it closes on Escape and on a click elsewhere", () => {
    // A menu that outlives the click that opened it ends up floating over an
    // unrelated part of the panel.
    expect(UI).toMatch(/gh-menu-tirai/);
    expect(UI).toMatch(/e\.key !== "Escape"/);
    expect(UI).toMatch(/removeEventListener\("keydown", h\)/);
  });

  test("delete is disabled until the typed name matches", () => {
    expect(UI).toMatch(/ketikNama\.trim\(\) !== hapus\.repo/);
  });

  test("the confirmation says what is lost and that it is final", () => {
    expect(UI).toMatch(/cannot be undone/);
    expect(UI).toMatch(/issues,\s*\n?\s*releases, history/);
  });

  test("a sign-in that cannot delete says so in the menu", () => {
    // Better than a control that can only fail.
    expect(UI).toMatch(/keadaan\.bisaHapus === false/);
    expect(UI).toMatch(/Deleting needs a new sign-in/);
  });
});

// ── "SIGN IN AGAIN" IS ONLY RIGHT SOMETIMES ──────────────────────────────────
//
// REPORTED: signing out and back in, and still getting
// "this sign-in cannot delete repositories — it was granted read:user, repo".
//
// MEASURED, and the timestamps settle it. GitHub's token-check endpoint
// (POST /applications/{client_id}/token) reported:
//
//     scopes  : read:user, repo
//     created : 2026-09-06T07:24:53Z
//
// while delete_repo was added to the requested scope at 21:18Z — FOURTEEN HOURS
// LATER. The sign-in was real and recent; it was served by the still-running
// build, whose scope string did not mention delete_repo. Signing in again
// inside that build produces the same narrow token every time, which reads
// exactly like the fix not working.
//
// So the two causes are told apart, and each gets the advice that can actually
// help: restart first, or sign in again.
describe("nasihat scope harus benar untuk sebabnya", () => {
  test("status reports what the token has AND what the build asks for", () => {
    // One list alone cannot distinguish the two cases.
    const k = GH.keadaan();
    expect(Array.isArray(k.scope)).toBe(true);
    expect(Array.isArray(k.scopeDiminta)).toBe(true);
    expect(k.scopeDiminta).toContain("delete_repo");
  });

  test("bisaHapus follows the token, never the request", () => {
    // Asking for a scope is not having it.
    expect(SRC).toMatch(/bisaHapus: _scopeTerakhir\.includes\("delete_repo"\)/);
  });

  test("the refusal names the cause that applies", () => {
    const blok = SRC.slice(SRC.indexOf("async function hapusRepo"));
    expect(blok).toMatch(/const bisaMinta = SCOPE\.split/);
    expect(blok).toMatch(/Sign out and sign in again/);
    expect(blok).toMatch(/restart WOLFSPACE first/);
  });

  test("the panel says it BEFORE the click, not after", () => {
    const ui = fs.readFileSync(
      path.join(AKAR, "public", "app", "Components.tsx"),
      "utf8",
    );
    expect(ui).toMatch(/scopeDiminta \|\| \[\]\)\.includes\("delete_repo"\)/);
    expect(ui).toMatch(/does not ask for delete access yet/);
  });
});

// ── THE MENU LANDED IN THE WRONG PLACE ───────────────────────────────────────
//
// REPORTED with a screenshot: right-clicking a repository opened the menu far
// away, at the bottom right, outside the panel.
//
// THE CAUSE is invisible from either file on its own. styles.css gives .page
// `will-change: transform, opacity` for the page transition, and per the CSS
// spec that makes .page a CONTAINING BLOCK for fixed-positioned descendants —
// exactly as a real transform would. So `position: fixed` stopped meaning
// "relative to the viewport" while clientX/clientY still were.
//
// MEASURED in a real browser, reproducing the app's layout: an element asking
// for top 300 / left 600 landed at 344 / 832 — thrown by exactly the sidebar
// width (232px) and the topbar height (44px). Removing will-change put it back
// at 300 / 600.
//
// VERIFIED AGAIN after the fix, two menus asked for the identical point:
//   inside .page        -> off by { atas: 44, kiri: 232 }
//   portalled to body   -> off by { atas: 0,  kiri: 0 }
describe("posisi menu klik kanan", () => {
  const UI = fs.readFileSync(
    path.join(AKAR, "public", "app", "Components.tsx"),
    "utf8",
  );
  const CSS = fs.readFileSync(path.join(AKAR, "public", "styles.css"), "utf8");

  test("the menu is portalled out of the page", () => {
    // Not moved, not offset-corrected: rendered somewhere that has no
    // containing block above it.
    expect(UI).toMatch(/ReactDOM\.createPortal\(/);
    expect(UI).toMatch(/document\.body,/);
  });

  test("the rule that caused it is still there, and still explained", () => {
    // will-change is not a mistake — it is there for the page transition. The
    // comment is what stops someone "fixing" the menu by deleting it.
    const NL = String.fromCharCode(10);
    const i = CSS.indexOf(NL + ".page {");
    expect(CSS.slice(i, CSS.indexOf(NL + "}", i))).toMatch(/will-change/);
    const j = UI.indexOf("DRAWN INTO document.body");
    expect(UI.slice(j, j + 1200)).toMatch(/will-change/);
    expect(UI.slice(j, j + 1200)).toMatch(/CONTAINING BLOCK/);
  });

  test("it is kept on screen, measured rather than guessed", () => {
    // A menu's real size is only known once it exists, and it changes with the
    // note about delete access.
    expect(UI).toMatch(/useLayoutEffect\(\(\) => \{/);
    expect(UI).toMatch(/menuRef\.current\.getBoundingClientRect\(\)/);
    expect(UI).toMatch(/window\.innerWidth - r\.width/);
    expect(UI).toMatch(/window\.innerHeight/);
  });

  test("no room below flips it above, rather than shoving it up", () => {
    // A menu that overlaps the row it belongs to hides what it is acting on.
    expect(UI).toMatch(/muatBawah/);
    expect(UI).toMatch(/menu\.atas - r\.height/);
  });

  test("the correction happens before paint", () => {
    // useEffect would run after, and the menu would visibly jump.
    const i = UI.indexOf("KEEPING THE MENU ON SCREEN");
    expect(UI.slice(i, i + 1400)).toMatch(/useLayoutEffect/);
  });

  test("useLayoutEffect is actually available to the modules", () => {
    // These files are concatenated into one scope and read React's hooks off a
    // single destructuring in app.tsx; a hook missing there is a runtime error,
    // not a type error.
    const app = fs.readFileSync(path.join(AKAR, "public", "app.tsx"), "utf8");
    expect(app).toMatch(/useLayoutEffect/);
  });
});
