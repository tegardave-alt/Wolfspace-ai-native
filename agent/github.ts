// Connecting a GitHub account, and picking a repository and branch.
//
// WHAT THIS IS FOR. Linking a repo to a session so the agent can READ it when
// it needs to — the shape of Claude's own GitHub connector: nothing is cloned,
// nothing is downloaded up front. That is a deliberate limit, not a shortcut:
// agent/tools/git-tool.ts has no network operations AT ALL, and its own comment
// says so ("no network at all: push/pull/fetch/clone/remote-set DO NOT EXIST").
// Reading over the API leaves that decision untouched.
//
// ── THE WRITES, NAMED HERE RATHER THAN BURIED ────────────────────────────────
//
// This file has said two things about writing that later stopped being true,
// so the list is kept exact rather than reassuring:
//
//   buatRepo()       creates a repository
//   gantiNamaRepo()  renames one (GitHub redirects the old name, so clones live)
//   hapusRepo()      DELETES one, and there is no undo
//
// What still holds, and is the part that matters for the agent: NO CONTENT is
// ever touched. No push, no commit, no branch, no file, no settings beyond the
// name. agent/tools/git-tool.ts still has no network operations at all, and the
// agent's own reader (github_repo) is read-only — none of the three above is
// reachable from a tool. They exist for the panel, driven by a person.
//
// hapusRepo() additionally needs the delete_repo scope, which a token issued
// before that scope was requested does not have and can never gain. keadaan()
// reports bisaHapus so the panel can say so instead of offering a control that
// only fails.
//
// ── THE TOKEN IS STORED APART FROM cloud-keys.json, AND THAT IS THE POINT ────
//
// This app already has a provider called "github" — GitHub MODELS, an LLM
// endpoint — and its keys live in cloud-keys.json. Both credentials carry the
// SAME prefixes (`ghp_`, `github_pat_`), and server.ts detects a provider from
// exactly those:
//
//     if (key.startsWith("github_pat_") || key.startsWith("ghp_")) return "github";
//
// So a repository token written into that file would be read back as an LLM
// provider key and could silently replace the model the user is talking to.
// Two different services that happen to share a prefix must not share a drawer.

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import * as crypto from "crypto";
const { keysDir } = require("./keys-path.ts");
const APP = require("./github-app.ts");

const BERKAS = () => path.join(keysDir(), "github.json");

/**
 * The scopes the LIVE token was granted, learned from the last response.
 *
 * Empty until the first call: a fresh process has not spoken to GitHub yet and
 * must not claim to know. The panel treats "unknown" as "not yet", which is
 * honest and self-correcting — one status call fills it in.
 */
let _scopeTerakhir: string[] = [];

/** GitHub requires a User-Agent and refuses requests without one. */
const UA = "WOLFSPACE";

interface Simpanan {
  token?: string;
  /** OAuth App client ID. Public by design — not a secret. */
  clientId?: string;
  /**
   * OAuth App client secret. Required by GitHub to exchange an authorization
   * code, so the browser sign-in cannot work without it. It belongs to the
   * user's own OAuth App and never leaves this machine.
   */
  clientSecret?: string;
  /**
   * Who is signed in. Stored rather than fetched on every status check: the
   * panel needs a name to show before it can offer to switch away from it, and
   * a request to GitHub for that on every render would be a request per render.
   */
  akun?: { login: string; name: string; avatar: string };
  /** A sign-in in progress: the device code and when it stops being valid. */
  device?: { code: string; kedaluwarsa: number };
  /** The linked repository, as chosen by the user. */
  taut?: { owner: string; repo: string; branch: string };
}

function baca(): Simpanan {
  try {
    const j = JSON.parse(fs.readFileSync(BERKAS(), "utf8"));
    return j && typeof j === "object" ? j : {};
  } catch (_) {
    return {};
  }
}

function tulis(isi: Simpanan) {
  const dir = path.dirname(BERKAS());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(BERKAS(), JSON.stringify(isi, null, 2));
  return isi;
}

/**
 * One request to the GitHub API.
 *
 * Errors carry GitHub's own message. "Request failed" tells a user nothing they
 * can act on; "Bad credentials" and "Not Found" each name a different fix.
 */
function panggil(
  jalur: string,
  token: string,
  opsi?: { metode?: string; badan?: any },
): Promise<any> {
  const metode = (opsi && opsi.metode) || "GET";
  const isi =
    opsi && opsi.badan !== undefined ? JSON.stringify(opsi.badan) : null;
  return new Promise((selesai, gagal) => {
    const kepala: any = {
      authorization: "Bearer " + token,
      accept: "application/vnd.github+json",
      "user-agent": UA,
      "x-github-api-version": "2022-11-28",
    };
    if (isi !== null) {
      kepala["content-type"] = "application/json";
      kepala["content-length"] = Buffer.byteLength(isi);
    }
    const r = https.request(
      {
        hostname: "api.github.com",
        path: jalur,
        method: metode,
        headers: kepala,
        timeout: 20000,
      },
      (s) => {
        let b = "";
        s.on("data", (c) => (b += c));
        s.on("end", () => {
          let j: any = null;
          try {
            j = JSON.parse(b);
          } catch (_) {}
          if ((s.statusCode || 0) >= 400) {
            let pesan = (j && j.message) || "HTTP " + s.statusCode;
            // GitHub puts the ACTUAL reason in `errors`, not in `message`. A
            // rejected repository name answers "Repository creation failed."
            // in message and "name already exists on this account" in errors --
            // showing only the first tells the user nothing they can act on.
            const rinci = (j && j.errors) || [];
            if (Array.isArray(rinci) && rinci.length) {
              const teks = rinci
                .map((x: any) => x && (x.message || x.field + " " + x.code))
                .filter(Boolean)
                .join("; ");
              if (teks) pesan += " (" + teks + ")";
            }
            // ── A REJECTED TOKEN IS NOT A CONNECTION ──
            //
            // REPORTED, and reproduced exactly: every call answering "GitHub:
            // Bad credentials" while the panel still said connected and the
            // repository list stayed empty. keadaan() reported `tersambung`
            // from the mere PRESENCE of a token string — it never asked whether
            // the token still worked — so a revoked credential looked
            // identical to a live one, and the panel offered no way back in.
            //
            // Diagnosed against GitHub's own check endpoint,
            // POST /applications/{client_id}/token with the app credentials as
            // basic auth: it answered 404, not 401. 401 would have meant the
            // OAuth App itself was wrong; 404 means the app is fine and THE
            // TOKEN is no longer one of its own. Revoked or expired.
            //
            // So a 401 drops the dead token here, at the one place every call
            // passes through. The panel then falls back to "Sign in with
            // GitHub" by itself, which is the actual fix and is one click.
            //
            // WHAT IS KEPT: clientId, clientSecret and the linked repository.
            // The app is not the problem, and an expired token is not an
            // account switch — the same person signs back in and should not
            // have to pick their repository again. Only putus() clears those.
            //
            // GUARDED on the token being the STORED one: sambung() verifies a
            // pasted token by calling here with it, and a bad paste must not
            // sign the user out of a session that was working.
            if (s.statusCode === 401) {
              try {
                const simpan = baca();
                if (simpan.token && simpan.token === token) {
                  delete simpan.token;
                  delete simpan.akun;
                  tulis(simpan);
                }
              } catch (_) {}
            }
            // The rate-limit case is worth naming: it is temporary, and a user
            // told only "403" will go looking for a permissions problem.
            const sisa = s.headers["x-ratelimit-remaining"];
            gagal(
              new Error(
                "GitHub: " +
                  pesan +
                  (s.statusCode === 401
                    ? " — the stored sign-in is no longer valid; sign in again"
                    : "") +
                  (sisa === "0" ? " (rate limit exhausted)" : ""),
              ),
            );
            return;
          }
          // WHAT THIS TOKEN MAY DO, straight from the response.
          //
          // GitHub returns the granted scopes on every API response, so this
          // costs nothing and is always current — unlike a copy stored at
          // sign-in, which would still claim delete_repo after the user
          // narrowed the grant on github.com.
          const sc = s.headers["x-oauth-scopes"];
          if (typeof sc === "string") {
            _scopeTerakhir = sc
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean);
          }
          selesai(j);
        });
      },
    );
    r.on("error", (e) => gagal(new Error("GitHub unreachable: " + e.message)));
    r.on("timeout", () => r.destroy(new Error("GitHub timed out")));
    if (isi !== null) r.write(isi);
    r.end();
  });
}

// ══ SIGNING IN WITH A GITHUB ACCOUNT (OAuth device flow) ═════════════════════
//
// WHY NOT A PERSONAL ACCESS TOKEN. A PAT is a credential the user creates and
// manages themselves, and this app already has that path for MCP. Signing in to
// an ACCOUNT is a different thing: no password is ever typed here, GitHub does
// the authenticating, the grant is scoped, and the user can revoke it from
// their GitHub settings without touching this app.
//
// VERIFIED AGAINST GITHUB'S OWN DOCUMENTATION, because this is widely
// misremembered: the device flow needs NO CLIENT SECRET.
//
//   "For the device flow, you must pass your app's client ID... The
//    client_secret is not needed for the device flow."
//
// That is what makes it usable in a desktop app at all — there is no server to
// keep a secret on, and embedding one would simply publish it.
//
// WHAT IT STILL NEEDS is a client_id, which comes from registering an OAuth App
// once. A client_id is public by design, so it is stored beside the rest of
// this and would be safe to ship. Registering is the one step nobody else can
// do on the user's behalf: the app belongs to their account.
// ── WHY delete_repo IS IN THE SCOPE LIST ─────────────────────────────────────
//
// Deleting a repository needs it, and nothing else does. GitHub's own words:
// "OAuth app tokens and personal access tokens (classic) need the delete_repo
// scope". Without it DELETE answers 403 and the button looks broken.
//
// MEASURED on the token this app was already using — the X-OAuth-Scopes header
// on any response says what a token really carries:
//
//     X-OAuth-Scopes: read:user, repo
//
// So every sign-in made before this line existed CANNOT delete, and no code
// change gives it the right: a token's scopes are fixed when it is issued. That
// is why keadaan() reports bisaHapus separately, and why the panel says "sign
// in again" rather than showing a control that can only fail.
const SCOPE = "repo read:user delete_repo";
const DEV_KODE = "https://github.com/login/device/code";
const DEV_TOKEN = "https://github.com/login/oauth/access_token";

/**
 * POST to github.com (not the API host) expecting JSON back.
 *
 * Accept: application/json is REQUIRED. Without it these two endpoints answer
 * in form-encoded text, which parses as nothing and looks like an empty reply.
 */
function kirimForm(url: string, data: Record<string, string>): Promise<any> {
  const badan = new URLSearchParams(data).toString();
  const u = new URL(url);
  return new Promise((selesai, gagal) => {
    const r = https.request(
      {
        hostname: u.hostname,
        path: u.pathname,
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
          "content-length": Buffer.byteLength(badan),
          "user-agent": UA,
        },
        timeout: 20000,
      },
      (s) => {
        let b = "";
        s.on("data", (c) => (b += c));
        s.on("end", () => {
          try {
            selesai(JSON.parse(b));
          } catch (_) {
            gagal(new Error("GitHub returned an unreadable reply"));
          }
        });
      },
    );
    r.on("error", (e) => gagal(new Error("GitHub unreachable: " + e.message)));
    r.on("timeout", () => r.destroy(new Error("GitHub timed out")));
    r.write(badan);
    r.end();
  });
}

// ── WHOSE OAUTH APP THIS SIGNS IN AS ─────────────────────────────────────────
//
// The app WOLFSPACE ships with, unless someone deliberately saved their own.
// The order matters and is the whole fix for a bad first version: the built-in
// app comes FIRST in practice, because nothing is stored until a user opts out
// of it. Asking the person installing the app to register an OAuth App made
// signing in start with a form instead of GitHub.
function clientId(): string {
  return String(baca().clientId || APP.appBawaan().clientId || "");
}

/** Never returned over a route — only used here, to sign in. */
function clientSecret(): string {
  return String(baca().clientSecret || APP.appBawaan().clientSecret || "");
}

/** Whether the shipped app is what will be used — i.e. nothing to set up. */
function pakaiAppBawaan(): boolean {
  const s = baca();
  return !s.clientId && Boolean(APP.appBawaan().clientId);
}

function simpanClientId(id: string, rahasia?: string) {
  const s = baca();
  s.clientId = String(id || "").trim();
  // The secret is OPTIONAL here: only the browser sign-in needs one, and an
  // empty value must not wipe a secret that was already saved.
  if (rahasia !== undefined && String(rahasia).trim()) {
    s.clientSecret = String(rahasia).trim();
  }
  tulis(s);
  return { ok: true };
}

/** Step one: ask GitHub for a code the user will type into their browser. */
async function mulaiMasuk() {
  const id = clientId();
  if (!id) {
    throw new Error(
      "no OAuth client ID configured — register an OAuth App with device flow enabled and save its Client ID",
    );
  }
  // `repo` covers private repositories; read:user is what shows whose account
  // this is. Nothing here writes, which is what the feature promises.
  const j = await kirimForm(DEV_KODE, {
    client_id: id,
    scope: SCOPE,
  });
  if (j.error) throw new Error("GitHub: " + (j.error_description || j.error));
  const s = baca();
  s.device = {
    code: j.device_code,
    kedaluwarsa: Date.now() + (j.expires_in || 900) * 1000,
  };
  tulis(s);
  return {
    kode: j.user_code,
    alamat: j.verification_uri || "https://github.com/login/device",
    jeda: j.interval || 5,
    kedaluwarsaDetik: j.expires_in || 900,
  };
}

/**
 * Step two: ONE poll. The caller repeats it on the interval GitHub gave.
 *
 * Deliberately not a loop that waits for the user. A request that sat here
 * until someone finished typing in their browser would hold the backend for
 * minutes — the exact failure this repo has already chased twice.
 */
async function lanjutMasuk() {
  const id = clientId();
  const s = baca();
  const d = s.device;
  if (!id || !d || !d.code) throw new Error("no sign-in is in progress");
  if (Date.now() > (d.kedaluwarsa || 0)) {
    delete s.device;
    tulis(s);
    throw new Error("the code expired — start again");
  }
  const j = await kirimForm(DEV_TOKEN, {
    client_id: id,
    device_code: d.code,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  });
  if (j.access_token) {
    const t = j.access_token;
    const a = await akun(t);
    const simpan = baca();
    simpan.token = t;
    simpan.akun = a;
    delete simpan.device;
    tulis(simpan);
    return { selesai: true, akun: a };
  }
  // These three are NOT failures: they are the flow working. Treating them as
  // errors is how a device flow ends up reporting a problem every few seconds
  // while it waits perfectly normally.
  if (j.error === "authorization_pending") return { selesai: false };
  if (j.error === "slow_down")
    return { selesai: false, jeda: j.interval || 10 };
  if (j.error === "expired_token") {
    const x = baca();
    delete x.device;
    tulis(x);
    throw new Error("the code expired — start again");
  }
  if (j.error === "access_denied") {
    const x = baca();
    delete x.device;
    tulis(x);
    throw new Error("sign-in was declined on GitHub");
  }
  throw new Error("GitHub: " + (j.error_description || j.error || "unknown"));
}

// ══ SIGNING IN THROUGH THE BROWSER (authorization code flow + PKCE) ══════════
//
// This is the flow people mean by "log in with GitHub": the browser opens
// GitHub's own Authorize page, you approve, and you land back here. No code to
// read off a screen and retype.
//
// THREE THINGS WERE CHECKED IN GITHUB'S DOCUMENTATION FIRST, because each one
// decides whether this is possible at all in a desktop app:
//
//   1. A LOOPBACK REDIRECT IS ALLOWED. "http://127.0.0.1:1234/path" is a
//      documented, permitted redirect_uri -- and the docs prefer the literal
//      address: "OAuth RFC recommends not to use localhost, but instead to use
//      loopback literal 127.0.0.1". So a desktop app can catch the callback
//      itself, with no site of its own.
//   2. PKCE IS SUPPORTED. code_challenge with S256, and code_verifier on the
//      exchange. An authorization code intercepted on the way back is useless
//      without the verifier, which never leaves this process.
//   3. client_secret IS STILL REQUIRED for the exchange. That is why the OAuth
//      App is registered by the USER: the secret is theirs, stays on their
//      machine, and is never shipped. Embedding ONE shared secret in a
//      distributed binary is the thing that would be wrong; a per-user secret
//      on their own machine is just a credential, like the token they would
//      otherwise have pasted -- but scoped, and revocable from GitHub.
//
// THE PORT IS FIXED, deliberately. The redirect URI has to match what was
// registered character for character, so a random port would mean re-editing
// the OAuth App before every sign-in.
const PORT_CALLBACK = 8121;
const ALAMAT_CALLBACK =
  "http://127.0.0.1:" + PORT_CALLBACK + "/github/callback";
const WEB_AUTH = "https://github.com/login/oauth/authorize";

function _acak(n: number) {
  return crypto.randomBytes(n).toString("base64url");
}

function _halaman(judul: string, pesan: string) {
  const gaya =
    "font:14px system-ui;background:#0b0d11;color:#e7e9ee;" +
    "display:grid;place-items:center;height:100vh;margin:0";
  return (
    "<!doctype html><meta charset=utf-8><title>" +
    judul +
    "</title><body style='" +
    gaya +
    "'><div style='text-align:center'><h2 style='font-weight:600'>" +
    judul +
    "</h2><p style='color:#8b98a9'>" +
    pesan +
    "</p></div>"
  );
}

/**
 * Opens the browser at GitHub's Authorize page and waits for the callback.
 *
 * The listener is opened ONLY for this sign-in and closed the moment it has an
 * answer -- on success, on failure, and on timeout. A port left open afterwards
 * would be a permanent door held for a few seconds of work.
 */
function mulaiWeb(bukaDi: (url: string) => void, ganti?: boolean) {
  const id = clientId();
  const rahasia = clientSecret();
  if (!id || !rahasia) {
    return Promise.reject(
      new Error(
        "sign-in needs an OAuth App: save its Client ID and Client Secret first",
      ),
    );
  }
  const verifier = _acak(48);
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  const state = _acak(16);

  return new Promise((selesai, gagal) => {
    let sudah = false;
    // The address the callback ACTUALLY landed on, which is not always the one
    // above — see the port note below. The token exchange has to be told the
    // same address the code came back to, so it is recorded here rather than
    // assumed.
    let alamatDipakai = ALAMAT_CALLBACK;
    // ONCE, even though it is passed to listen() twice.
    //
    // MEASURED, not assumed: a listen() callback is registered as a one-shot
    // "listening" listener, and a listen() that fails with EADDRINUSE never
    // consumes it. So the retry below leaves TWO of them attached, both fire on
    // the successful bind, and the second one runs after close() with a null
    // address. The visible symptom would be two browser tabs and a crash.
    let sudahSiap = false;
    const siap = () => {
      if (sudahSiap) return;
      const alamat: any = srv.address();
      if (!alamat) return;
      sudahSiap = true;
      alamatDipakai = "http://127.0.0.1:" + alamat.port + "/github/callback";
      const u = new URL(WEB_AUTH);
      u.searchParams.set("client_id", id);
      u.searchParams.set("redirect_uri", alamatDipakai);
      u.searchParams.set("scope", SCOPE);
      u.searchParams.set("state", state);
      u.searchParams.set("code_challenge", challenge);
      u.searchParams.set("code_challenge_method", "S256");
      // ── ASKING FOR THE ACCOUNT PICKER ─────────────────────────────────────
      //
      // Signing out here does NOT sign the browser out of GitHub, and does not
      // revoke the grant. So a plain sign-in after switching accounts comes
      // straight back with the SAME account, without ever showing a page --
      // which reads as the switch being broken.
      //
      // GitHub's authorize endpoint documents the fix: prompt "Forces the
      // account picker to appear if set to `select_account`." Sent only when
      // switching, so the ordinary first sign-in stays one click.
      if (ganti) u.searchParams.set("prompt", "select_account");
      bukaDi(u.toString());
    };

    const tutup = (fn: () => void) => {
      if (sudah) return;
      sudah = true;
      setTimeout(() => srv.close(), 200);
      fn();
    };
    const srv = http.createServer(async (q: any, sres: any) => {
      const u = new URL(q.url || "/", "http://127.0.0.1");
      if (u.pathname !== "/github/callback") {
        sres.writeHead(404).end();
        return;
      }
      const balas = (judul: string, pesan: string) => {
        sres.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        sres.end(_halaman(judul, pesan));
      };
      // STATE IS CHECKED. Without it, any page could send the browser to this
      // callback carrying a code of its own choosing.
      if (u.searchParams.get("state") !== state) {
        balas("Sign-in failed", "The request did not match this session.");
        tutup(() =>
          gagal(new Error("state mismatch - sign-in was not started here")),
        );
        return;
      }
      const galatGh = u.searchParams.get("error");
      if (galatGh) {
        balas(
          "Sign-in cancelled",
          u.searchParams.get("error_description") || galatGh,
        );
        tutup(() => gagal(new Error("GitHub: " + galatGh)));
        return;
      }
      try {
        const j = await kirimForm(DEV_TOKEN, {
          client_id: id,
          client_secret: rahasia,
          code: u.searchParams.get("code") || "",
          redirect_uri: alamatDipakai,
          code_verifier: verifier,
        });
        if (!j.access_token) {
          throw new Error(
            j.error_description || j.error || "no token returned",
          );
        }
        const a = await akun(j.access_token);
        const simpan = baca();
        simpan.token = j.access_token;
        simpan.akun = a;
        tulis(simpan);
        balas("Signed in", "You can close this tab and return to WOLFSPACE.");
        tutup(() => selesai(a));
      } catch (e: any) {
        balas("Sign-in failed", e.message);
        tutup(() => gagal(e));
      }
    });
    // ── IF THE PORT IS TAKEN, ANY OTHER PORT WILL DO ─────────────────────────
    //
    // GitHub's documentation makes this explicit for loopback redirects: "The
    // redirect_uri does not need to match the port specified in the callback
    // URL for the app." Registered as http://127.0.0.1:8121/github/callback,
    // the redirect may still come back on any port.
    //
    // WHY IT MATTERS FOR EVERY MACHINE BUT THIS ONE. 8121 is free here; on
    // somebody else's machine it may not be, and a fixed port would turn
    // "another program happens to use this number" into a sign-in that can
    // never succeed. Falling back to an ephemeral port removes that failure
    // entirely, and the OS picks one that is free by definition.
    let sudahGanti = false;
    srv.on("error", (e: any) => {
      if (e && e.code === "EADDRINUSE" && !sudahGanti) {
        sudahGanti = true;
        srv.listen(0, "127.0.0.1", siap);
        return;
      }
      gagal(
        new Error(
          "could not listen for GitHub's reply on 127.0.0.1 (" +
            (e && e.message) +
            ")",
        ),
      );
    });
    // 127.0.0.1 ONLY. Binding wider would put the callback on the network.
    srv.listen(PORT_CALLBACK, "127.0.0.1", siap);
    // Nobody finished. Closing here is what stops the port outliving the
    // attempt that opened it.
    const jam = setTimeout(
      () => {
        if (sudah) return;
        sudah = true;
        srv.close();
        gagal(new Error("sign-in timed out"));
      },
      5 * 60 * 1000,
    );
    if (jam.unref) jam.unref();
  });
}

// ── THE SIGN-IN RUNS IN THE BACKGROUND, AND IS POLLED ────────────────────────
//
// mulaiWeb only settles once the user has finished on GitHub, which can be
// minutes. Answering the HTTP request with that promise would hold the backend
// for the whole time — the same failure this file already avoids in the device
// flow. So the flow is started, the request returns at once, and the panel asks
// how it went.
let _web: { keadaan: string; akun?: any; galat?: string } = {
  keadaan: "diam",
};

function masukWeb(ganti?: boolean) {
  if (_web.keadaan === "menunggu") return { keadaan: "menunggu" };
  const buka = (globalThis as any).__wolfspaceMintaMain;
  if (typeof buka !== "function") {
    throw new Error("the browser can only be opened from the desktop app");
  }
  _web = { keadaan: "menunggu" };
  mulaiWeb((url) => buka("buka-masuk-github", { url }), ganti).then(
    (a: any) => (_web = { keadaan: "selesai", akun: a }),
    (e: any) => (_web = { keadaan: "gagal", galat: e.message }),
  );
  return { keadaan: "menunggu" };
}

/** Reading a finished result clears it, so the next sign-in starts clean. */
function keadaanWeb() {
  const k = _web;
  if (k.keadaan === "selesai" || k.keadaan === "gagal")
    _web = { keadaan: "diam" };
  return k;
}

/** The signed-in account. Doubles as the check that a token actually works. */
async function akun(token?: string) {
  const t = token || baca().token;
  if (!t) throw new Error("not connected — no GitHub token stored");
  const u = await panggil("/user", t);
  const a = { login: u.login, name: u.name || "", avatar: u.avatar_url || "" };
  // BACKFILL. Connections made before the account was recorded have a token and
  // no name, and the panel cannot offer to switch away from an account it
  // cannot name. Storing what was just fetched fixes those in place, once.
  const s = baca();
  if (s.token && s.token === t && !s.akun) {
    s.akun = a;
    tulis(s);
  }
  return a;
}

/**
 * Stores the token only AFTER it has been proven to work.
 *
 * Writing first and verifying later leaves a bad token on disk looking exactly
 * like a good one, and the failure then surfaces somewhere unrelated.
 */
async function sambung(token: string) {
  const t = String(token || "").trim();
  if (!t) throw new Error("token is required");
  const a = await akun(t);
  const s = baca();
  s.token = t;
  s.akun = a;
  tulis(s);
  return a;
}

/**
 * Signing out, and the state that has to go with the token.
 *
 * EVERYTHING BELONGING TO THAT ACCOUNT, not just the credential. A leftover
 * `taut` would point the next account at a repository it may not even be able
 * to see, and a leftover `akun` would keep showing the previous person's name
 * on a panel that is signed out. A half-finished `device` attempt would let a
 * poll from before the sign-out complete afterwards and silently reconnect.
 *
 * WHAT THIS DOES NOT DO, deliberately: it does not revoke the grant on GitHub.
 * Removing the app's access is the user's call and belongs on their GitHub
 * settings page, where they can see every app at once. What it DOES mean is
 * that signing in again would come straight back with the same account, which
 * is why switching asks GitHub for the account picker — see mulaiWeb.
 */
function putus() {
  const s = baca();
  delete s.token;
  delete s.taut;
  delete s.akun;
  delete s.device;
  tulis(s);
  // A sign-in already in flight would otherwise land after this and reconnect.
  _web = { keadaan: "diam" };
  return { ok: true };
}

/** Repositories the account can reach, newest activity first. */
async function daftarRepo(batas = 100) {
  const t = baca().token;
  if (!t) throw new Error("not connected — no GitHub token stored");
  const per = Math.min(batas, 100);
  const j = await panggil(
    "/user/repos?per_page=" +
      per +
      "&sort=updated&affiliation=owner,collaborator,organization_member",
    t,
  );
  return (Array.isArray(j) ? j : []).map((r: any) => ({
    owner: r.owner && r.owner.login,
    repo: r.name,
    penuh: r.full_name,
    pribadi: Boolean(r.private),
    cabangUtama: r.default_branch || "main",
    ket: r.description || "",
  }));
}

/**
 * Whether a branch name is one git will accept.
 *
 * A SEPARATE FUNCTION, and that is not tidiness. Checking this rule inside
 * buatRepo() meant the only way to test it was to CALL buatRepo — and buatRepo
 * creates a repository. Twice while building this feature a probe written that
 * way put a real repository on a real GitHub account, because the repo name
 * happened to be valid and the call sailed past validation into the API.
 *
 * A rule that can only be tested by performing the action it guards is a rule
 * that will be tested by performing it. Pulled out here, it is checkable with
 * no network, no token and no account.
 *
 * git's rules, which are stricter than a repository name's: no whitespace, none
 * of ~ ^ : ? * [ ] or a backslash, no leading - . or /, no trailing . or /, no
 * "..", no "@{", and not ending in ".lock".
 */
function namaCabangSah(nama: string): { sah: boolean; sebab?: string } {
  const c = String(nama || "").trim();
  if (!c) return { sah: true }; // absent means "whatever GitHub gives"
  // A plain character list rather than a regex character class: the class needs
  // both "]" and "\" escaped inside it, and every layer this file has passed
  // through has mangled one of them at least once. A string has no escaping to
  // get wrong.
  const HARAM = " \t\n~^:?*[]\\";
  if ([...c].some((x) => HARAM.includes(x))) {
    return {
      sah: false,
      sebab: "a branch name cannot contain spaces or ~ ^ : ? * [ ] backslash",
    };
  }
  if (/^[-./]|[./]$|\.\.|@\{|\.lock$/.test(c)) {
    return {
      sah: false,
      sebab:
        "a branch name cannot start with - . or /, end with . or /, " +
        "contain .. or @{, or end with .lock",
    };
  }
  return { sah: true };
}

/**
 * Creates a repository on the signed-in account.
 *
 * ── THIS IS THE ONE WRITE, AND IT IS WORTH BEING EXPLICIT ABOUT ──────────────
 *
 * Everything else here reads. Creating a repository does not, so the promise
 * this feature used to make -- "nothing is written" -- is no longer true and
 * has been corrected wherever it was stated rather than left standing next to
 * code that contradicts it.
 *
 * WHAT DOES NOT CHANGE: agent/tools/git-tool.ts still has no network
 * operations at all, nothing is cloned, and no existing repository is modified.
 * This creates a NEW, empty repository and touches nothing that already exists.
 *
 * The `repo` scope the sign-in already asks for covers this; no wider access is
 * requested for it.
 */
async function buatRepo(pilihan: {
  nama: string;
  pribadi?: boolean;
  ket?: string;
  awali?: boolean;
  /** The branch to end up with. Renamed after creation — see below for why. */
  cabang?: string;
}) {
  // THE NAME IS CHECKED FIRST, before the credential.
  //
  // A bad name is a bad name whether or not anyone is signed in, and telling
  // someone "not connected" when what they actually typed was "my repo" sends
  // them to fix the wrong thing. This ordering also makes the guarantee true in
  // every state: refused before any request, not merely before any request that
  // a signed-in user would have made.
  const nama = String((pilihan && pilihan.nama) || "").trim();
  if (!nama) throw new Error("a repository name is required");
  // Checked here rather than left to GitHub: the API's rejection for a bad
  // name is generic, and this says exactly which character was the problem.
  if (!/^[A-Za-z0-9._-]+$/.test(nama)) {
    throw new Error(
      "a repository name may only contain letters, numbers, and . _ -",
    );
  }
  const cabangMau = String(pilihan.cabang || "").trim();
  const cek = namaCabangSah(cabangMau);
  if (!cek.sah) throw new Error(cek.sebab!);
  const t = baca().token;
  if (!t) throw new Error("not connected — sign in to GitHub first");
  const r = await panggil("/user/repos", t, {
    metode: "POST",
    badan: {
      name: nama,
      private: Boolean(pilihan.pribadi),
      description: String(pilihan.ket || ""),
      // WITHOUT THIS THE REPOSITORY HAS NO BRANCHES. An empty repo has no
      // commits, so /branches comes back as an empty list and there is nothing
      // to link to -- the new repo would appear and immediately be unusable.
      auto_init: pilihan.awali === false ? false : true,
    },
  });

  // ── THE DEFAULT BRANCH NAME ──────────────────────────────────────────────
  //
  // VERIFIED IN GITHUB'S DOCUMENTATION FIRST, because this is where a guess
  // would have produced a silently ignored field: POST /user/repos has NO
  // parameter for the initial branch name. `default_branch` exists only on
  // PATCH /repos/{owner}/{repo}. The name GitHub actually uses comes from the
  // account's own setting.
  //
  // So the branch is renamed AFTERWARDS, and only when it is not already what
  // was asked for. Most accounts default to `main`, which means the ordinary
  // case costs no extra request at all — and a request nobody needs is a
  // request that can fail for nobody's benefit.
  //
  // auto_init is what makes this possible: rename needs a branch, and a branch
  // needs a commit. On an empty repository there is nothing to rename.
  const mau = cabangMau;
  let cabang = r.default_branch || "main";
  if (mau && mau !== cabang) {
    try {
      const b = await panggil(
        "/repos/" +
          _q(r.owner.login) +
          "/" +
          _q(r.name) +
          "/branches/" +
          _q(cabang) +
          "/rename",
        t,
        { metode: "POST", badan: { new_name: mau } },
      );
      cabang = (b && b.name) || mau;
    } catch (e: any) {
      // NOT FATAL, and this is the honest call. The repository exists and is
      // usable; only its branch carries a different name than requested.
      // Throwing here would report a failure for something that succeeded, and
      // leave the user believing nothing was created.
      cabang = r.default_branch || "main";
      (r as any)._catatanCabang =
        "created, but the branch is still '" +
        cabang +
        "': " +
        (e && e.message);
    }
  }

  return {
    owner: r.owner && r.owner.login,
    repo: r.name,
    penuh: r.full_name,
    pribadi: Boolean(r.private),
    cabangUtama: cabang,
    ket: r.description || "",
    catatan: (r as any)._catatanCabang || "",
  };
}
async function daftarCabang(owner: string, repo: string) {
  const t = baca().token;
  if (!t) throw new Error("not connected — no GitHub token stored");
  const j = await panggil(
    "/repos/" +
      encodeURIComponent(owner) +
      "/" +
      encodeURIComponent(repo) +
      "/branches?per_page=100",
    t,
  );
  return (Array.isArray(j) ? j : []).map((b: any) => b.name);
}

// ══ READING THE LINKED REPOSITORY ════════════════════════════════════════════
//
// WHAT WAS MISSING. Linking a repo wrote a line into github.json and nothing
// else. agent/github.ts was required by exactly ONE file -- server/routes/
// github.ts, the panel -- so nothing in agent/ could reach the link at all. The
// agent knew only its own workspace, because the workspace confinement message
// was the only place it was ever told where anything was. Picking a repository
// looked like it connected the agent to it; it did not.
//
// READS ONLY, over the API. Nothing is cloned, and agent/tools/git-tool.ts
// still has no network operations at all.

/** The linked repo, or a clear refusal. Every read below starts here. */
function _tautWajib() {
  const s = baca();
  if (!s.token) throw new Error("not connected — sign in to GitHub first");
  if (!s.taut) {
    throw new Error(
      "no repository is linked — pick one in the GitHub panel first",
    );
  }
  return { t: s.token, ...s.taut };
}

const _q = encodeURIComponent;

/**
 * The file tree of the linked branch, in ONE request.
 *
 * `recursive=1` returns the whole tree at once instead of a request per
 * directory. GitHub caps that, and says so with `truncated` — which is reported
 * rather than swallowed: a silently partial tree would have the agent conclude
 * a file does not exist when it simply did not fit.
 */
async function daftarBerkas(awalan?: string, batas = 400) {
  const { t, owner, repo, branch } = _tautWajib();
  const j = await panggil(
    "/repos/" +
      _q(owner) +
      "/" +
      _q(repo) +
      "/git/trees/" +
      _q(branch) +
      "?recursive=1",
    t,
  );
  const pre = String(awalan || "").replace(/^\/+/, "");
  let isi = (Array.isArray(j.tree) ? j.tree : [])
    .filter((n: any) => n.type === "blob")
    .filter((n: any) => !pre || String(n.path).startsWith(pre));
  const total = isi.length;
  isi = isi.slice(0, batas);
  return {
    repo: owner + "/" + repo,
    branch,
    total,
    ditampilkan: isi.length,
    // TWO different kinds of incompleteness, kept apart. GitHub's own cap is
    // not the same thing as this function's, and a user who cannot tell them
    // apart cannot act on either.
    dipotongGitHub: Boolean(j.truncated),
    dipotongDiSini: total > isi.length,
    berkas: isi.map((n: any) => ({ jalur: n.path, ukuran: n.size || 0 })),
  };
}

/**
 * One file's contents from the linked branch.
 *
 * The contents API answers with base64, and REFUSES above 1 MB — it replies
 * with an empty `content` rather than an error, which would arrive here as an
 * empty file and read as "this file is blank". That case is named instead.
 */
async function bacaBerkas(jalur: string) {
  const { t, owner, repo, branch } = _tautWajib();
  const p = String(jalur || "").replace(/^\/+/, "");
  if (!p) throw new Error("a file path is required");
  const j = await panggil(
    "/repos/" +
      _q(owner) +
      "/" +
      _q(repo) +
      "/contents/" +
      p.split("/").map(_q).join("/") +
      "?ref=" +
      _q(branch),
    t,
  );
  if (Array.isArray(j)) {
    throw new Error(p + " is a directory — use the tree operation");
  }
  if (!j.content || j.encoding !== "base64") {
    throw new Error(
      p +
        " could not be read as text (" +
        (j.size > 1000000
          ? "over GitHub's 1 MB limit for this endpoint"
          : "encoding " + (j.encoding || "unknown")) +
        ")",
    );
  }
  const buf = Buffer.from(j.content, "base64");
  // A NUL byte inside the first kilobyte is the same binary test the rest of
  // this app uses. Returning a decoded binary would fill the context with
  // mojibake and teach the agent nothing.
  if (buf.subarray(0, 1024).includes(0)) {
    throw new Error(p + " looks like a binary file");
  }
  return {
    repo: owner + "/" + repo,
    branch,
    jalur: p,
    ukuran: j.size || buf.length,
    isi: buf.toString("utf8"),
  };
}

/**
 * Code search, scoped to the linked repository.
 *
 * SEPARATE RATE LIMIT, and a much smaller one: GitHub allows roughly 10 code
 * searches a minute against 5000 ordinary requests an hour. Worth having, worth
 * not reaching for first.
 */
async function cariKode(kueri: string, batas = 30) {
  const { t, owner, repo } = _tautWajib();
  const k = String(kueri || "").trim();
  if (!k) throw new Error("a search query is required");
  const j = await panggil(
    "/search/code?per_page=" +
      Math.min(Math.max(batas, 1), 100) +
      "&q=" +
      _q(k + " repo:" + owner + "/" + repo),
    t,
  );
  return {
    repo: owner + "/" + repo,
    total: j.total_count || 0,
    hasil: (j.items || []).map((x: any) => ({
      jalur: x.path,
      url: x.html_url,
    })),
  };
}

/**
 * Renames a repository.
 *
 * PATCH /repos/{owner}/{repo} with `name`. This needs only the `repo` scope the
 * sign-in has always requested, so it works on tokens issued before delete_repo
 * was added to the list.
 *
 * GitHub REDIRECTS the old name to the new one, so existing clones keep
 * working — worth knowing, because it is the reason rename is a far smaller
 * decision than delete and is treated as one below.
 */
async function gantiNamaRepo(owner: string, repo: string, namaBaru: string) {
  // ── ARGUMENTS FIRST, CONNECTION SECOND ──
  //
  // The order used to be the other way round, and it made a wrong answer:
  // calling this with no new name while signed out said "not connected — sign
  // in to GitHub first", which is not the problem. Signing in would not supply
  // the missing name. A caller is told what is actually wrong with the call.
  //
  // It also made the tests depend on the machine: they passed while a token
  // happened to be stored and went red the moment one was signed out or
  // dropped after a 401. A check whose result depends on who is logged in is
  // not a check of this function.
  const nama = String(namaBaru || "").trim();
  if (!nama) throw new Error("a new name is required");
  if (!/^[A-Za-z0-9._-]+$/.test(nama)) {
    throw new Error(
      "a repository name may only contain letters, numbers, and . _ -",
    );
  }
  if (nama === repo) return { owner, repo, penuh: owner + "/" + repo };
  const t = baca().token;
  if (!t) throw new Error("not connected — sign in to GitHub first");
  const r = await panggil("/repos/" + _q(owner) + "/" + _q(repo), t, {
    metode: "PATCH",
    badan: { name: nama },
  });
  // The link points at a name that no longer exists, so it follows.
  const s = baca();
  if (s.taut && s.taut.owner === owner && s.taut.repo === repo) {
    s.taut = { ...s.taut, repo: r.name };
    tulis(s);
  }
  return {
    owner: r.owner && r.owner.login,
    repo: r.name,
    penuh: r.full_name,
    pribadi: Boolean(r.private),
    cabangUtama: r.default_branch || "main",
  };
}

/**
 * Whether what was typed confirms deleting this repository.
 *
 * A SEPARATE FUNCTION, for the same reason namaCabangSah() is one: the only
 * other way to test this rule is to CALL hapusRepo, and hapusRepo deletes. A
 * test written that way came within one existing owner of destroying a real
 * repository — the case "jarvis " was expected to be refused, was trimmed to a
 * match, and went through to DELETE. It answered 404 only because the owner in
 * the test did not exist.
 *
 * A rule that can only be tested by performing the action it guards WILL be
 * tested by performing it.
 *
 * Trimming is deliberate and is the ONLY transformation: a name pasted from
 * GitHub often carries a trailing space, and refusing that teaches nothing. The
 * comparison is otherwise exact — case included, because `Jarvis` and `jarvis`
 * can both exist and are different repositories.
 */
function konfirmasiCocok(repo: string, ketikan: string) {
  return String(ketikan || "").trim() === String(repo || "");
}

/**
 * Deletes a repository. There is no undo.
 *
 * ── THE CONFIRMATION IS NOT OPTIONAL, AND IT IS NOT A DIALOG ─────────────────
 *
 * `konfirmasi` must equal the repository's own name. That is the shape GitHub
 * itself uses, for the reason GitHub uses it: a yes/no box is answered by
 * reflex, and the reflex is yes. Typing the name cannot be done by accident,
 * and cannot be done to the WRONG repository by accident either — which is the
 * failure a context menu makes easy, because the row under the cursor is not
 * always the row that was read.
 *
 * ── AND WHY IT MAY SIMPLY BE IMPOSSIBLE ─────────────────────────────────────
 *
 * This needs the delete_repo scope. A token issued before that scope was
 * requested does not have it and never will — scopes are fixed when a token is
 * issued. So the failure is named here rather than passed through as a bare
 * 403, which would read as a bug in this app.
 */
async function hapusRepo(owner: string, repo: string, konfirmasi: string) {
  // Same order, same reason as gantiNamaRepo above: a missing argument is a
  // missing argument whether or not anyone is signed in.
  if (!owner || !repo) throw new Error("owner and repo are both required");
  if (!konfirmasiCocok(repo, konfirmasi)) {
    throw new Error(
      "type the repository name exactly (" + repo + ") to confirm deletion",
    );
  }
  const t = baca().token;
  if (!t) throw new Error("not connected — sign in to GitHub first");
  if (_scopeTerakhir.length && !_scopeTerakhir.includes("delete_repo")) {
    // TWO DIFFERENT PROBLEMS WEAR THE SAME MESSAGE, and telling someone to
    // sign in again when that cannot help is worse than saying nothing.
    //
    //   the running build does not request delete_repo  -> restart first, then
    //                                                      sign in
    //   it does, but this token predates that           -> sign in again
    //
    // Measured on a real one: a token issued fourteen hours before the scope
    // was added came back narrow from a sign-in made inside the still-running
    // old build.
    const bisaMinta = SCOPE.split(/\s+/).includes("delete_repo");
    throw new Error(
      "this sign-in cannot delete repositories — it was granted " +
        _scopeTerakhir.join(", ") +
        (bisaMinta
          ? ". Sign out and sign in again to grant delete access."
          : ". This running build does not ask for delete access yet — " +
            "restart WOLFSPACE first, then sign out and sign in again."),
    );
  }
  try {
    await panggil("/repos/" + _q(owner) + "/" + _q(repo), t, {
      metode: "DELETE",
    });
  } catch (e: any) {
    if (/403/.test(e.message) || /Must have admin/i.test(e.message)) {
      throw new Error(
        e.message +
          " — deleting needs the delete_repo scope; sign out and sign in again",
      );
    }
    throw e;
  }
  // A link to something that no longer exists would fail on every read, and the
  // reason would look like a network problem rather than a deleted repository.
  const s = baca();
  if (s.taut && s.taut.owner === owner && s.taut.repo === repo) {
    delete s.taut;
    tulis(s);
  }
  return { ok: true, dihapus: owner + "/" + repo };
}

/** Records which repository and branch this session is reading from. */
function taut(pilihan?: { owner: string; repo: string; branch: string }) {
  const s = baca();
  if (!pilihan) return s.taut || null;
  const { owner, repo, branch } = pilihan;
  if (!owner || !repo || !branch) {
    throw new Error("owner, repo and branch are all required");
  }
  s.taut = { owner, repo, branch };
  tulis(s);
  return s.taut;
}

/**
 * Whether a connection exists — WITHOUT returning the token.
 *
 * A status route that handed back the credential would put it in every log and
 * devtools panel that ever showed the response.
 */
function keadaan() {
  const s = baca();
  return {
    tersambung: Boolean(s.token),
    // Who is signed in, so the panel can name the account it is offering to
    // switch away from. Never the token.
    akun: s.akun || null,
    taut: s.taut || null,
    // Whether an account sign-in can be offered at all. Without it the panel
    // would show a Sign in button that could only ever fail.
    bisaMasuk: Boolean(clientId()),
    // The browser sign-in additionally needs the client secret, so the panel
    // can tell "not set up yet" apart from "set up for the code flow only".
    bisaWeb: Boolean(clientId() && clientSecret()),
    // True when the shipped OAuth App is what will be used, so the panel
    // knows there is nothing to set up before signing in.
    appBawaan: pakaiAppBawaan(),
    // Whether THIS token may delete. Reported separately because it is fixed
    // when the token is issued: a sign-in made before delete_repo was requested
    // can never gain it, and a control that can only fail is worse than an
    // absent one.
    bisaHapus: _scopeTerakhir.includes("delete_repo"),
    scope: _scopeTerakhir,
    // WHAT THIS BUILD WOULD ASK FOR, beside what the token actually has.
    //
    // MEASURED, and it is the difference that matters: a token issued at
    // 07:24 carried "read:user, repo" because delete_repo was added to the
    // request at 21:18 — fourteen hours later. Signing in again inside the
    // ALREADY-RUNNING app would have asked with the old string and produced the
    // same narrow token, which reads exactly like the fix not working.
    //
    // With both lists visible the panel can tell the two cases apart: a build
    // that does not yet ask for it needs a RESTART first; one that does needs
    // only a new sign-in.
    scopeDiminta: SCOPE.split(/\s+/).filter(Boolean),
    // Shown so it can be copied into the OAuth App's Authorization callback
    // URL, which has to match this exactly.
    alamatCallback: ALAMAT_CALLBACK,
  };
}

module.exports = {
  BERKAS,
  mulaiMasuk,
  lanjutMasuk,
  clientId,
  simpanClientId,
  mulaiWeb,
  masukWeb,
  keadaanWeb,
  ALAMAT_CALLBACK,
  sambung,
  putus,
  akun,
  daftarRepo,
  buatRepo,
  daftarCabang,
  namaCabangSah,
  gantiNamaRepo,
  hapusRepo,
  konfirmasiCocok,
  daftarBerkas,
  bacaBerkas,
  cariKode,
  taut,
  keadaan,
  _panggil: panggil,
};
