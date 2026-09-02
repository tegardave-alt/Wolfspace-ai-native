// Check the MCP registry table in public/app/Config.tsx against reality.
//
// REPORTS, IT DOES NOT GENERATE. Generating the table from the official MCP
// registry was the plan and the measurement killed it:
//
//   - Of the ten services in MCP_DIKENAL, only three have an entry under their
//     own DNS-verified namespace (notion, figma, huggingface).
//   - Two of those three CONTRADICT the working configuration: com.notion/mcp
//     and com.figma.mcp/mcp are remote streamable-http endpoints, while
//     WOLFSPACE points at their npm packages — which still work.
//   - Only one (huggingface) states its credential at all.
//
// And deriving short names from namespaces does not survive contact with the
// data. Across the first 100 servers the heuristic produced aliases like
// `hood`, `goji`, `inside` and `1325`: DNS verification proves OWNERSHIP, not
// relevance, so whoever owns hood.ag can claim the alias `hood`. Five
// collisions appeared in those 100 alone.
//
// So the table stays hand-written, and this script watches it for drift:
//
//   1. Does every npm package it names still exist?   (a dead package is a
//      connection that cannot work, and it fails as npm 404 — the exact
//      symptom that started all of this)
//   2. Does the registry disagree about transport?    (Notion and Figma both
//      shipping official remote servers is a real change worth knowing about,
//      even though acting on it would be a regression today)
//
// Exit code is 1 only for (1). A disagreement is information, not a failure.
//
// Usage: node scripts/periksa-mcp.cjs

const fs = require("fs");
const path = require("path");
const https = require("https");
const AKAR = path.resolve(__dirname, "..");
const REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers";

/** Read MCP_DIKENAL out of the source, through the same transform the app uses. */
function bacaTabel() {
  globalThis.self = globalThis;
  const Babel = require(path.join(AKAR, "public/vendor/babel.min.js"));
  const kode = Babel.transform(
    fs.readFileSync(path.join(AKAR, "public/app/Config.tsx"), "utf8"),
    { presets: ["react", "typescript"], filename: "/app/Config.tsx" },
  ).code;
  const fn = new Function(
    "window",
    "localStorage",
    kode + "\nreturn MCP_DIKENAL;",
  );
  return fn(undefined, undefined);
}

function ambilJson(url) {
  return new Promise((selesai, gagal) => {
    https
      .get(url, { headers: { "user-agent": "wolfspace-periksa-mcp" } }, (r) => {
        let b = "";
        r.on("data", (c) => (b += c));
        r.on("end", () => {
          try {
            selesai(JSON.parse(b));
          } catch (e) {
            gagal(e);
          }
        });
      })
      .on("error", gagal);
  });
}

/**
 * The published version of an npm package, or null when it is not there.
 *
 * Asked over HTTPS rather than by running `npm view`. On Windows `npm` is
 * npm.cmd, and Node refuses to execFile a .cmd without a shell -- it fails with
 * spawn EINVAL, which is the same .cmd-needs-a-shell trap that produced the
 * argument-splitting bug in mcp-client. The registry answers the question
 * directly, with no subprocess to get wrong.
 */
function versiNpm(paket) {
  // A scoped name carries a slash that must not become a path separator.
  const jalur = "https://registry.npmjs.org/" + paket.replace("/", "%2f");
  return ambilJson(jalur).then(
    (d) => (d && d["dist-tags"] && d["dist-tags"].latest) || null,
    () => null,
  );
}

/** The second-level label of the namespace, reversed: com.figma.mcp -> figma. */
function sld(ns) {
  const l = String(ns || "")
    .split(".")
    .reverse();
  return l.length >= 2 ? l[l.length - 2] : "";
}

/** The registry entry published under the service's OWN domain, if any. */
async function entriVendor(nama) {
  try {
    const d = await ambilJson(
      REGISTRY + "?search=" + encodeURIComponent(nama) + "&limit=100",
    );
    return (
      (d.servers || [])
        .map((x) => x.server || {})
        // io.github.* is a person's namespace, not a vendor's. Verified, but it
        // says nothing about whether this is THE server for the service.
        .filter((s) => {
          const ns = String(s.name || "").split("/")[0];
          return ns && !ns.startsWith("io.github.") && sld(ns) === nama;
        })[0] || null
    );
  } catch (_) {
    return null;
  }
}

/** The npm package a table entry runs, if it runs one. */
function paketDari(e) {
  if (!e || !Array.isArray(e.args)) return null;
  return e.args.find((a) => a && a !== "-y" && !a.startsWith("-")) || null;
}

(async () => {
  const tabel = bacaTabel();
  const nama = Object.keys(tabel);
  console.log("Memeriksa " + nama.length + " entri MCP_DIKENAL\n");

  let mati = 0;
  let beda = 0;

  for (const n of nama) {
    const e = tabel[n];
    const baris = [];

    if (e.url) {
      baris.push("remote " + e.url);
    } else {
      const paket = paketDari(e);
      const v = paket ? await versiNpm(paket) : null;
      if (paket && !v) {
        mati++;
        baris.push("npm " + paket + "  ✗ TIDAK ADA DI NPM");
      } else {
        baris.push("npm " + paket + "@" + v);
      }
    }

    const reg = await entriVendor(n);
    if (reg) {
      const daftarRemote = (reg.remotes || []).map((r) => String(r.url || ""));
      const regRemote = daftarRemote.length > 0;
      const kitaRemote = Boolean(e.url);
      // Compare the endpoint WITHOUT its query string. co.huggingface publishes
      // both `/mcp` and `/mcp?login`; reading only remotes[0] reported a
      // disagreement with our own URL that did not exist.
      const polos = (u) => String(u || "").split("?")[0];
      const cocok =
        kitaRemote && daftarRemote.some((u) => polos(u) === polos(e.url));
      if (regRemote !== kitaRemote) {
        beda++;
        baris.push(
          "≠ registry: " +
            reg.name +
            " memakai " +
            (regRemote ? "remote " + daftarRemote[0] : "paket"),
        );
      } else if (regRemote && !cocok) {
        beda++;
        baris.push("≠ registry: " + reg.name + " -> " + daftarRemote[0]);
      } else {
        baris.push("= registry: " + reg.name);
      }
    }

    console.log("  " + n.padEnd(14) + baris.join("\n" + " ".repeat(16)));
  }

  console.log(
    "\n" +
      mati +
      " paket hilang, " +
      beda +
      " berbeda dari registry (beda = informasi, bukan kegagalan)",
  );
  // Only a missing package is a broken connection. A registry that disagrees is
  // something to read and decide about, not something to fail a build over.
  process.exit(mati > 0 ? 1 : 0);
})();
