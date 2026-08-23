// Migrated TypeScript files must carry English comments only.
//
// WHY THIS IS A TEST AND NOT A NOTE. The rule was stated repeatedly and broken
// repeatedly, because it depends on remembering to check — and each manual
// check used a slightly different word list, so each one reported "clean" while
// leaving different lines behind. 147 Indonesian comment lines survived across
// files that had already been declared done. A single shared word list, run by
// CI, is the only version of this rule that cannot quietly drift.
//
// SCOPE: comments only. Indonesian IDENTIFIERS (berkas, jenis, daftar, semua)
// are deliberately out of scope — renaming them is a separate refactor that was
// never requested, and conflating the two would make this test unfixable
// without unrelated churn. String literals are also excluded: some are wire
// contracts or CSS class names that other files and stored data must match.
const fs = require("fs");
const path = require("path");

const AKAR = path.join(__dirname, "..");

// Every file that has completed migration. A file only belongs here once its
// comments are English; adding one is the last step of migrating it.
const BERKAS_MIGRASI = [
  "agent/broker/audit-log.ts",
  "agent/broker/commandchain.ts",
  "agent/broker/host.ts",
  "agent/broker/policy.ts",
  "agent/broker/zone-process.ts",
  "agent/mcp-client.ts",
  "agent/tools/disk-tools.ts",
  "agent/tools/file-tools.ts",
  "agent/tools/git-tool.ts",
  "agent/tools/net-diag.ts",
  "agent/tools/sandbox-validator.ts",
  "agent/tools/wsl-jail.ts",
  "agent/sandbox-policy.ts",
  "agent/sandbox.ts",
  "agent/snapshot.ts",
  "core/terminal.ts",
  "electron/preload.ts",
  "packages/contracts/agent-events.ts",
  "public/app/AgentSteps.tsx",
  "public/app/CodeBlocks.tsx",
  "public/app/Components.tsx",
  "public/app/Config.tsx",
  "public/app/Icons.tsx",
  "public/app/Model3DViewer.tsx",
  "public/app/PluginsView.tsx",
  "public/app/Screens.tsx",
  "public/app/Sidebar.tsx",
  "public/app/Viewport.tsx",
  "public/app/VisualTools.tsx",
  "public/app/Views.tsx",
  "public/app/globals.d.ts",
  "public/app/usePreviewPanel.tsx",
];

// Function words, not topic words: these appear in ordinary Indonesian prose
// and essentially never inside an English sentence. Keeping the list to
// grammar rather than vocabulary is what stops it from firing on identifiers
// that happen to be quoted in a comment.
const KATA_INDONESIA = [
  "yang",
  "untuk",
  "agar",
  "jika",
  "bila",
  "tidak",
  "tak",
  "dan",
  "atau",
  "dari",
  "dengan",
  "pada",
  "saat",
  "sudah",
  "belum",
  "hanya",
  "bukan",
  "jadi",
  "sebagai",
  "lalu",
  "kalau",
  "karena",
  "supaya",
  "dipakai",
  "dibuat",
  "dipindah",
  "diekstrak",
  "dimuat",
  "pemakai",
  "milik",
  "kita",
  "ini",
  "itu",
  "bisa",
  "akan",
  "harus",
  "setiap",
  "semua",
  "tetap",
  "cuma",
  "justru",
  "memang",
  "dulu",
  "sempat",
  "sengaja",
  "adalah",
  "ada",
  "juga",
  "masih",
  "sampai",
  "seperti",
  "antara",
  "hingga",
  "sebelum",
  "sesudah",
  "ketika",
  "sehingga",
  "namun",
  "tapi",
  "maka",
  "oleh",
  "ke",
];
const POLA = new RegExp("\\b(" + KATA_INDONESIA.join("|") + ")\\b", "i");

/**
 * Return the comment text of a source file, one entry per line, with code
 * stripped away. Line numbers are kept so a failure points somewhere.
 *
 * Block comments are tracked across lines so the body of a /* ... *​/ or a JSX
 * {/* ... *​/} is checked too — that is exactly where the missed lines hid.
 */
function komentarSaja(isi) {
  const hasil = [];
  let dalamBlok = false;
  isi.split(/\r?\n/).forEach((baris, i) => {
    const nomor = i + 1;
    let teks = "";
    if (dalamBlok) {
      const tutup = baris.indexOf("*/");
      if (tutup >= 0) {
        teks = baris.slice(0, tutup);
        dalamBlok = false;
      } else {
        teks = baris;
      }
    } else {
      const buka = baris.indexOf("/*");
      const garis = baris.indexOf("//");
      if (buka >= 0 && (garis < 0 || buka < garis)) {
        const tutup = baris.indexOf("*/", buka + 2);
        if (tutup >= 0) {
          teks = baris.slice(buka + 2, tutup);
        } else {
          teks = baris.slice(buka + 2);
          dalamBlok = true;
        }
      } else if (garis >= 0) {
        // Skip a // that sits inside a string or a regex — the common case here
        // is a URL ("https://…") and a path separator in a character class.
        const sebelum = baris.slice(0, garis);
        const kutip = (sebelum.match(/"/g) || []).length;
        const petik = (sebelum.match(/'/g) || []).length;
        if (kutip % 2 === 0 && petik % 2 === 0 && !/[:\w]\/$/.test(sebelum)) {
          teks = baris.slice(garis + 2);
        }
      }
    }
    if (teks.trim()) hasil.push({ nomor, teks });
  });
  return hasil;
}

describe("migrated code carries English comments", () => {
  test.each(BERKAS_MIGRASI)("%s has no Indonesian comments", (rel) => {
    const penuh = path.join(AKAR, rel);
    expect(fs.existsSync(penuh)).toBe(true);
    const temuan = komentarSaja(fs.readFileSync(penuh, "utf8"))
      // A line marked `verbatim` quotes an Indonesian test name or stored
      // string on purpose — translating it would break the thing it names.
      .filter((k) => !/verbatim/i.test(k.teks))
      .filter((k) => POLA.test(k.teks))
      .map((k) => rel + ":" + k.nomor + " ->" + k.teks.replace(/\s+/g, " "));
    expect(temuan).toEqual([]);
  });

  test("the file list stays in step with what has actually migrated", () => {
    // A migrated file left off the list is checked by nothing, which is how the
    // rule drifted in the first place. public/app is the directory where that
    // has happened, so it is the one enumerated here.
    const dir = path.join(AKAR, "public", "app");
    const nyata = fs
      .readdirSync(dir)
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .map((f) => "public/app/" + f)
      .sort();
    const terdaftar = BERKAS_MIGRASI.filter((f) =>
      f.startsWith("public/app/"),
    ).sort();
    expect(terdaftar).toEqual(nyata);
  });
});
