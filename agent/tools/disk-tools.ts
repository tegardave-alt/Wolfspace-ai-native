// Disk exploration (read-only, outside QROOT)
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
const { globToRe, getSemanticValidator } = require("./file-tools.ts");

// ── Local disk exploration (read-only, outside QROOT) ──
const DISK_HOME = os.homedir();
const DISK_BLOCKED =
  /^[A-Za-z]:[\\\/](Windows|Program Files|Program Files \(x86\)|ProgramData|System Volume Information|\$Recycle\.Bin)/i;

function resolveDiskPath(p) {
  const raw = (p || "").trim().replace(/^[`"']+|[`"']+$/g, "");
  if (/^[A-Za-z]:[\\\/]/.test(raw)) {
    const dest = path.resolve(raw);
    if (DISK_BLOCKED.test(dest)) throw new Error("path sistem ditolak: " + raw);
    return dest;
  }
  if (/^[\/]/.test(raw)) {
    const dest = path.resolve(raw);
    if (DISK_BLOCKED.test(dest)) throw new Error("path sistem ditolak: " + raw);
    return dest;
  }
  const dest = path.resolve(DISK_HOME, raw);
  if (DISK_BLOCKED.test(dest)) throw new Error("path sistem ditolak: " + raw);
  return dest;
}

function diskWalk(dir: any, filterRe: any, maxDepth?: any) {
  const skip =
    /^(\.git|node_modules|_agent_backups|dist-app|build|\.dart_tool|vendor|__pycache__|\.cache|\.vs|\.nuget|packages|Debug|Release|obj|bin|\.next|\.nuxt|target|bower_components|\.terraform|cache)$/i;
  const secret =
    /(\.env|\.pem$|\.key$|\.secret|credentials?|token|cloud-keys|\.lock$)/i;
  const out: any[] = [];
  (function walk(d, depth) {
    if (out.length > 800 || depth > (maxDepth || 7)) return;
    let ents;
    try {
      ents = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (skip.test(e.name)) continue;
      if (e.isFile() && secret.test(e.name)) continue;
      const fp = path.join(d, e.name);
      if (e.isDirectory()) walk(fp, depth + 1);
      else {
        const r = path.relative(dir, fp).replace(/\\/g, "/");
        if (
          !filterRe ||
          filterRe.test(fp.replace(/\\/g, "/")) ||
          filterRe.test(r)
        )
          out.push({ rel: r, fp });
      }
    }
  })(dir, 0);
  return out;
}

function diskList(p: any) {
  const dir = resolveDiskPath(p || DISK_HOME);
  let st;
  try {
    st = fs.statSync(dir);
  } catch {
    throw new Error("path tidak ada: " + p);
  }
  if (!st.isDirectory()) throw new Error("bukan direktori: " + p);
  const out: any[] = [];
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    throw new Error("tidak bisa akses: " + p);
  }
  const skipEntry =
    /^(\.git|node_modules|__pycache__|\.cache|\.vs|\.nuget|packages|Debug|Release|obj|bin|\.next|target|bower_components|\.terraform|cache)$/i;
  for (const e of ents) {
    if (skipEntry.test(e.name)) continue;
    const fp = path.join(dir, e.name);
    let sz = 0;
    try {
      if (e.isFile()) sz = fs.statSync(fp).size;
    } catch {}
    const icon = e.isDirectory() ? "📁 " : "📄 ";
    out.push(icon + e.name + (e.isDirectory() ? "/" : " (" + sz + "b)"));
  }
  return out.join("\n");
}

function diskGlob(p: any, pattern: any, options: any = {}) {
  const dir = resolveDiskPath(p || DISK_HOME);
  let st;
  try {
    st = fs.statSync(dir);
  } catch {
    throw new Error("path tidak ada: " + p);
  }
  if (!st.isDirectory()) throw new Error("bukan direktori: " + p);
  // ── Semantic mode ──
  if (options.intent) {
    const sv = getSemanticValidator();
    if (sv && sv.qSemanticSearch) {
      const semantic = sv.qSemanticSearch(options.intent, {
        intent: options.intent,
        filePatterns: true,
      });
      if (semantic.intent && semantic.patterns.length > 0) {
        for (const re of semantic.patterns) {
          const hits = diskWalk(dir, null)
            .filter((f) => re.test(f.fp.replace(/\\/g, "/")) || re.test(f.rel))
            .map((f) => f.fp.replace(/\\/g, "/"));
          if (hits.length) return hits.slice(0, 200).join("\n");
        }
        return "(no matching file)";
      }
    }
  }
  // ── Fallback: lexical glob ──
  let re;
  try {
    re = globToRe((pattern || "*").trim());
  } catch {
    return "pola tidak valid";
  }
  const hits = diskWalk(dir, re).map((f) => f.fp.replace(/\\/g, "/"));
  return hits.length ? hits.slice(0, 200).join("\n") : "(no matching file)";
}

function diskRead(p, near) {
  const fp = resolveDiskPath(p);
  let st;
  try {
    st = fs.statSync(fp);
  } catch {
    throw new Error("file tidak ada: " + p);
  }
  if (st.isDirectory())
    return (
      "(ini direktori) isi:\n" + fs.readdirSync(fp).slice(0, 100).join("\n")
    );
  const lines = fs.readFileSync(fp, "utf8").split("\n");
  const N = lines.length;
  near = parseInt(near);
  let a = 0,
    b = Math.min(N, 800);
  if (Number.isFinite(near) && near > 0) {
    a = Math.max(0, near - 40);
    b = Math.min(N, near + 40);
  }
  const shown = lines
    .slice(a, b)
    .map((l, i) => a + i + 1 + "\t" + l)
    .join("\n");
  const head = a > 0 || b < N ? `(baris ${a + 1}-${b} dari ${N})\n` : "";
  return head + shown;
}

function diskGrep(p: any, pattern: any, options: any = {}) {
  if (!pattern) return "pola kosong";
  let re;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    return "regex tidak valid: " + pattern;
  }
  const patternsToSearch = [re];

  const dir = resolveDiskPath(p || DISK_HOME);
  let st;
  try {
    st = fs.statSync(dir);
  } catch {
    throw new Error("path tidak ada: " + p);
  }
  if (!st.isDirectory()) throw new Error("bukan direktori: " + p);

  // --- SMART FILTERING (SEMANTIC REASONING) ---
  let extRegex;
  if (options.include_extensions) {
    const exts = options.include_extensions
      .split(",")
      .map((e) => e.trim().replace(/^\./, ""))
      .filter(Boolean);
    if (exts.length > 0) {
      extRegex = new RegExp(`\\.(${exts.join("|")})$`, "i");
    }
  }
  // Fall back to a blind search when the LLM does not use its reasoning.
  if (!extRegex) {
    extRegex =
      /\.(cjs|js|jsx|css|html|json|dart|yaml|yml|md|py|ts|tsx|txt|xml|sql|sh|bat|ps1|log|cfg|ini|toml|go|rs|java|c|cpp|h|hpp|rb|php|swift|kt|scala|r|m|tex|vue|svelte)$/i;
  }

  const hits: any[] = [];
  const files = diskWalk(dir, extRegex);
  for (const f of files) {
    if (hits.length >= 150) break;
    let txt;
    try {
      txt = fs.readFileSync(f.fp, "utf8");
    } catch {
      continue;
    }
    txt.split("\n").forEach((l, i) => {
      if (hits.length >= 150) return;
      for (const re of patternsToSearch) {
        if (re.test(l)) {
          hits.push(
            f.fp.replace(/\\/g, "/") +
              ":" +
              (i + 1) +
              ": " +
              l.trim().slice(0, 160),
          );
          break;
        }
      }
    });
  }
  return hits.length ? hits.join("\n") : "(tidak ada kecocokan)";
}

// ── The ASYNCHRONOUS version of the disk walker ──
//
// WHY IT EXISTS. The synchronous readdir blocks the event loop, and in Electron
// the main process shares that loop with BrowserWindow and the Windows message
// pump. CPU profiling of the main process during a real agent run showed the
// biggest contributor after idle was exactly this walk, and a lag sampler
// recorded the main process freezing for 8-13 seconds in one burst. During that
// time the window pumps no messages at all — that is the "the app hangs" being
// reported, while the renderer itself is healthy (longest task 319ms).
//
// The regex was fixed separately in globToRe (file-tools.ts). What is fixed
// here is the readdir: asynchronous, so the event loop — and the message pump —
// keeps being served between directories.
//
// The synchronous version is kept: server.cjs and the non-Electron path use it,
// and its limits and filters are deliberately IDENTICAL so both paths produce
// the same result.
const fspDisk = fs.promises;

async function _petaBatasDisk(items, batas, fn) {
  const hasil = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(batas, items.length) }, async () => {
      while (i < items.length) {
        const n = i++;
        hasil[n] = await fn(items[n]);
      }
    }),
  );
  return hasil;
}

async function diskWalkAsync(dir: any, filterRe: any, maxDepth?: any) {
  const skip =
    /^(\.git|node_modules|_agent_backups|dist-app|build|\.dart_tool|vendor|__pycache__|\.cache|\.vs|\.nuget|packages|Debug|Release|obj|bin|\.next|\.nuxt|target|bower_components|\.terraform|cache)$/i;
  const secret =
    /(\.env|\.pem$|\.key$|\.secret|credentials?|token|cloud-keys|\.lock$)/i;
  const out: any[] = [];
  async function walk(d, depth) {
    if (out.length > 800 || depth > (maxDepth || 7)) return;
    let ents;
    try {
      ents = await fspDisk.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (out.length > 800) return;
      if (skip.test(e.name)) continue;
      if (e.isFile() && secret.test(e.name)) continue;
      const fp = path.join(d, e.name);
      if (e.isDirectory()) await walk(fp, depth + 1);
      else {
        const r = path.relative(dir, fp).replace(/\\/g, "/");
        if (
          !filterRe ||
          filterRe.test(fp.replace(/\\/g, "/")) ||
          filterRe.test(r)
        )
          out.push({ rel: r, fp });
      }
    }
  }
  await walk(dir, 0);
  return out;
}

async function diskListAsync(p: any) {
  const dir = resolveDiskPath(p || DISK_HOME);
  let st;
  try {
    st = await fspDisk.stat(dir);
  } catch {
    throw new Error("path tidak ada: " + p);
  }
  if (!st.isDirectory()) throw new Error("bukan direktori: " + p);
  let ents;
  try {
    ents = await fspDisk.readdir(dir, { withFileTypes: true });
  } catch {
    throw new Error("tidak bisa akses: " + p);
  }
  const skipEntry =
    /^(\.git|node_modules|__pycache__|\.cache|\.vs|\.nuget|packages|Debug|Release|obj|bin|\.next|target|bower_components|\.terraform|cache)$/i;
  const dipakai = ents.filter((e) => !skipEntry.test(e.name));
  const baris = await _petaBatasDisk(dipakai, 16, async (e) => {
    const fp = path.join(dir, e.name);
    let sz = 0;
    try {
      if (e.isFile()) sz = (await fspDisk.stat(fp)).size;
    } catch {}
    return (
      (e.isDirectory() ? "📁 " : "📄 ") +
      e.name +
      (e.isDirectory() ? "/" : " (" + sz + "b)")
    );
  });
  return baris.join("\n");
}

async function diskGlobAsync(p: any, pattern: any, options: any = {}) {
  const dir = resolveDiskPath(p || DISK_HOME);
  let st;
  try {
    st = await fspDisk.stat(dir);
  } catch {
    throw new Error("path tidak ada: " + p);
  }
  if (!st.isDirectory()) throw new Error("bukan direktori: " + p);
  if (options.intent) {
    const sv = getSemanticValidator();
    if (sv && sv.qSemanticSearch) {
      const semantic = sv.qSemanticSearch(options.intent, {
        intent: options.intent,
        filePatterns: true,
      });
      if (semantic.intent && semantic.patterns.length > 0) {
        const semua = await diskWalkAsync(dir, null);
        for (const re of semantic.patterns) {
          const hits = semua
            .filter((f) => re.test(f.fp.replace(/\\/g, "/")) || re.test(f.rel))
            .map((f) => f.fp.replace(/\\/g, "/"));
          if (hits.length) return hits.slice(0, 200).join("\n");
        }
        return "(no matching file)";
      }
    }
  }
  let re;
  try {
    re = globToRe((pattern || "*").trim());
  } catch {
    return "pola tidak valid";
  }
  const hits = (await diskWalkAsync(dir, re)).map((f) =>
    f.fp.replace(/\\/g, "/"),
  );
  return hits.length ? hits.slice(0, 200).join("\n") : "(no matching file)";
}

async function diskGrepAsync(p: any, pattern: any, options: any = {}) {
  if (!pattern) return "pola kosong";
  let re;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    return "regex tidak valid: " + pattern;
  }

  const dir = resolveDiskPath(p || DISK_HOME);
  let st;
  try {
    st = await fspDisk.stat(dir);
  } catch {
    throw new Error("path tidak ada: " + p);
  }
  if (!st.isDirectory()) throw new Error("bukan direktori: " + p);

  let extRegex;
  if (options.include_extensions) {
    const exts = options.include_extensions
      .split(",")
      .map((e) => e.trim().replace(/^\./, ""))
      .filter(Boolean);
    if (exts.length > 0) extRegex = new RegExp(`\\.(${exts.join("|")})$`, "i");
  }
  if (!extRegex)
    extRegex =
      /\.(cjs|js|jsx|css|html|json|dart|yaml|yml|md|py|ts|tsx|txt|xml|sql|sh|bat|ps1|log|cfg|ini|toml|go|rs|java|c|cpp|h|hpp|rb|php|swift|kt|scala|r|m|tex|vue|svelte)$/i;

  const files = await diskWalkAsync(dir, extRegex);
  // Collected in FILE ORDER rather than I/O completion order, so the output for
  // the same input is always the same.
  const perFile = await _petaBatasDisk(files, 12, async (f) => {
    let txt;
    try {
      txt = await fspDisk.readFile(f.fp, "utf8");
    } catch {
      return [];
    }
    const lokal: any[] = [];
    const lines = txt.split("\n");
    for (let i = 0; i < lines.length; i++)
      if (re.test(lines[i]))
        lokal.push(
          f.fp.replace(/\\/g, "/") +
            ":" +
            (i + 1) +
            ": " +
            lines[i].trim().slice(0, 160),
        );
    return lokal;
  });
  const hits: any[] = [];
  for (const lokal of perFile) {
    for (const h of lokal) {
      if (hits.length >= 150) break;
      hits.push(h);
    }
    if (hits.length >= 150) break;
  }
  return hits.length ? hits.join("\n") : "(tidak ada kecocokan)";
}

module.exports = {
  DISK_HOME,
  DISK_BLOCKED,
  resolveDiskPath,
  diskWalk,
  diskList,
  diskGlob,
  diskRead,
  diskGrep,
  diskWalkAsync,
  diskListAsync,
  diskGlobAsync,
  diskGrepAsync,
};
