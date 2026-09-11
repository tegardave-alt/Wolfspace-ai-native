// github.ts — connecting a GitHub account, and picking a repository and branch.
//
// ROLE IN THE SYSTEM. The token NEVER travels back out: /github/status answers
// WHETHER a connection exists, not what it is. A status response carrying the
// credential would have put it in every log and devtools panel that displayed
// it.
//
// CONNECTS TO
//   imports  agent/github
//   mounted  by server.ts
//   renderer GithubPanel in public/app/Components.tsx
export {};

const GH = require("../../agent/github.ts");

function badan(req: any): Promise<any> {
  return new Promise((selesai) => {
    let b = "";
    req.on("data", (c: any) => (b += c));
    req.on("end", () => {
      try {
        selesai(JSON.parse(b || "{}"));
      } catch (_) {
        selesai({});
      }
    });
  });
}

function kirim(res: any, kode: number, isi: any) {
  res.writeHead(kode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(isi));
}

/** Returns true when it handled the request. */
async function ruteGithub(req: any, res: any) {
  const url = String(req.url || "");

  // Who is signed in. Separate from /github/status because it goes to GitHub,
  // and status is asked for on every render.
  if (req.method === "GET" && url === "/github/account") {
    try {
      kirim(res, 200, { ok: true, akun: await GH.akun() });
    } catch (e: any) {
      kirim(res, 400, { ok: false, error: e.message });
    }
    return true;
  }

  if (req.method === "GET" && url === "/github/status") {
    kirim(res, 200, { ok: true, ...GH.keadaan() });
    return true;
  }

  // ── Signing in through the browser ──
  //
  // Start returns immediately; the browser is already open by then and the
  // panel polls. Nothing here waits for the user.
  if (req.method === "POST" && url === "/github/web/start") {
    try {
      kirim(res, 200, {
        ok: true,
        ...GH.masukWeb(Boolean((await badan(req)).ganti)),
      });
    } catch (e: any) {
      kirim(res, 400, { ok: false, error: e.message });
    }
    return true;
  }

  if (req.method === "GET" && url === "/github/web/poll") {
    kirim(res, 200, { ok: true, ...GH.keadaanWeb() });
    return true;
  }

  // ── Signing in with a GitHub account ──
  //
  // Two calls, not one. Waiting here until the user finished typing a code in
  // their browser would hold the backend for minutes; each request is short and
  // the panel repeats the second one on the interval GitHub asked for.
  if (req.method === "POST" && url === "/github/device/start") {
    try {
      kirim(res, 200, { ok: true, ...(await GH.mulaiMasuk()) });
    } catch (e: any) {
      kirim(res, 400, { ok: false, error: e.message });
    }
    return true;
  }

  if (req.method === "POST" && url === "/github/device/poll") {
    try {
      kirim(res, 200, { ok: true, ...(await GH.lanjutMasuk()) });
    } catch (e: any) {
      kirim(res, 400, { ok: false, error: e.message });
    }
    return true;
  }

  // The client ID of an OAuth App. Public by design, so it is stored and
  // returned like any other setting — it is not a credential.
  if (url === "/github/client-id") {
    if (req.method === "GET") {
      // The secret itself is never returned — only whether one is stored.
      kirim(res, 200, {
        ok: true,
        clientId: GH.clientId(),
        punyaRahasia: GH.keadaan().bisaWeb,
      });
      return true;
    }
    if (req.method === "POST") {
      const b = await badan(req);
      GH.simpanClientId(b.clientId || "", b.clientSecret);
      kirim(res, 200, { ok: true });
      return true;
    }
  }

  if (req.method === "POST" && url === "/github/connect") {
    const b = await badan(req);
    try {
      const akun = await GH.sambung(b.token);
      kirim(res, 200, { ok: true, akun });
    } catch (e: any) {
      // 400, not 500: a rejected token is the user's input being wrong, and
      // the message is GitHub's own so it names the actual fix.
      kirim(res, 400, { ok: false, error: e.message });
    }
    return true;
  }

  if (req.method === "POST" && url === "/github/disconnect") {
    GH.putus();
    kirim(res, 200, { ok: true });
    return true;
  }

  // Creating a repository. POST, not GET, on the same path the list uses --
  // the one write in this file, and the method is what separates them.
  if (req.method === "POST" && url === "/github/repos") {
    const b = await badan(req);
    try {
      kirim(res, 200, { ok: true, repo: await GH.buatRepo(b) });
    } catch (e: any) {
      kirim(res, 400, { ok: false, error: e.message });
    }
    return true;
  }
  if (req.method === "GET" && url === "/github/repos") {
    try {
      kirim(res, 200, { ok: true, repo: await GH.daftarRepo() });
    } catch (e: any) {
      kirim(res, 400, { ok: false, error: e.message });
    }
    return true;
  }

  // Renaming and deleting. Both are POST rather than PATCH/DELETE on a path
  // that also serves reads: the desktop path builds synthetic req/res objects,
  // and keeping every mutation on one verb keeps that layer simple.
  if (req.method === "POST" && url === "/github/repo/rename") {
    const b = await badan(req);
    try {
      kirim(res, 200, {
        ok: true,
        repo: await GH.gantiNamaRepo(b.owner, b.repo, b.nama),
      });
    } catch (e: any) {
      kirim(res, 400, { ok: false, error: e.message });
    }
    return true;
  }

  // The confirmation travels WITH the request. A route that deleted on the
  // strength of an earlier "are you sure" would delete whatever the client
  // named next, and the client is the part most likely to be wrong about which
  // row the user meant.
  if (req.method === "POST" && url === "/github/repo/delete") {
    const b = await badan(req);
    try {
      kirim(res, 200, {
        ok: true,
        ...(await GH.hapusRepo(b.owner, b.repo, b.konfirmasi)),
      });
    } catch (e: any) {
      kirim(res, 400, { ok: false, error: e.message });
    }
    return true;
  }

  if (req.method === "GET" && url.startsWith("/github/branches")) {
    const q = new URL(url, "http://x").searchParams;
    try {
      const cabang = await GH.daftarCabang(
        q.get("owner") || "",
        q.get("repo") || "",
      );
      kirim(res, 200, { ok: true, cabang });
    } catch (e: any) {
      kirim(res, 400, { ok: false, error: e.message });
    }
    return true;
  }

  if (url === "/github/link") {
    if (req.method === "GET") {
      kirim(res, 200, { ok: true, taut: GH.taut() });
      return true;
    }
    if (req.method === "POST") {
      const b = await badan(req);
      try {
        kirim(res, 200, { ok: true, taut: GH.taut(b) });
      } catch (e: any) {
        kirim(res, 400, { ok: false, error: e.message });
      }
      return true;
    }
  }

  return false;
}

module.exports = { ruteGithub };
