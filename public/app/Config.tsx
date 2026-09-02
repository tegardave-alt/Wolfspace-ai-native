// Config — the workspace root constant, taken DYNAMICALLY from the preload
// (window.WOLFSPACE.root). Loaded FIRST via APP_MODULES so it is available to
// every module and to app.tsx. It produces the same value the old hardcoded one
// did back when the folder was still "quantum", but follows a rename (to
// wolfspace, say) automatically — with no code change.
const _wsRaw =
  (typeof window !== "undefined" &&
    window.WOLFSPACE &&
    window.WOLFSPACE.root) ||
  "C:\\Users\\dave\\quantum";
// Native Windows form (drive letter lowercased) — for comparing stored paths.
const WOLFSPACE_ROOT_WIN = _wsRaw.replace(/^[A-Za-z]:/, (m: string) =>
  m.toLowerCase(),
);
// Lowercase forward-slash form — used when composing workspace paths.
const WOLFSPACE_ROOT = WOLFSPACE_ROOT_WIN.replace(/\\/g, "/").toLowerCase();

// Agent effort level (0=Low, 1=Medium, 2=High) — ONE source of truth.
//
// This value used to be read in three places with different logic, and two of
// them were wrong: `parseInt(...) || 1` turned 0 into 1, because `||` treats 0
// as falsy. So when the user picked Low AND had no cloud config yet, the UI
// showed "Low" while the request sent Medium — silently, with no sign at all.
// Low effort truncates history to 6 messages and caps the agent at 6 steps, so
// the difference is real, not cosmetic.
//
// Cloud config wins over localStorage: that is where the UI stores it once a
// cloud exists, and the value then travels between devices with the config.
function readEffort(cloudCfg?: { effort?: unknown } | null): number {
  if (cloudCfg && typeof cloudCfg.effort !== "undefined") {
    const n = Number(cloudCfg.effort);
    if (Number.isFinite(n)) return n;
  }
  try {
    // ?? "" is not ceremony: getItem returns null when the key has never been
    // written, and parseInt(null) quietly becomes NaN through a path that is
    // invisible in the code.
    const n = parseInt(localStorage.getItem("wolfspace_effort") ?? "", 10);
    // Number.isFinite, NOT `|| 1` — the latter is what used to swallow 0.
    if (Number.isFinite(n)) return n;
  } catch (_) {}
  return 1; // Medium when it has never been set
}

// ── BYOK (Bring Your Own Key) helpers for web client deployment ──
function getBYOKKeys(): Record<string, KunciBYOK | string> {
  try {
    const raw = localStorage.getItem("wolfspace_byok_keys");
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function saveBYOKKey(provider: string, keyObj: string | KunciBYOK): void {
  try {
    const keys = getBYOKKeys();
    keys[provider] = typeof keyObj === "string" ? { key: keyObj } : keyObj;
    localStorage.setItem("wolfspace_byok_keys", JSON.stringify(keys));
  } catch (_) {}
}

function hasAnyBYOKKey() {
  const keys = getBYOKKeys();
  return Object.values(keys).some(
    (k: KunciBYOK | string) => k && (typeof k === "string" || Boolean(k.key)),
  );
}

// ONE entry per known service: how to RUN it, and how its credential is PASSED.
//
// THOSE TWO FACTS USED TO LIVE APART. The command was here; the credential was
// an if/else chain repeated in BOTH Screens.tsx and Components.tsx. Three lists,
// none matching: Components knew how to send a bearer to a remote server and
// Screens did not; Screens knew `notion` and Components did not; figma was in
// both and they disagreed. Anything in none of them fell through to
// `env = { TOKEN: ... }` — a variable name no MCP server reads.
//
// That is why "connect" did not connect. Typing `huggingface` produced
// `npx -y huggingface` (404) with the token written to TOKEN, and the failure
// surfaced as "Failed to initialise MCP server" with no reason attached.
//
// Every package below was checked to EXIST on npm before being written here.
// Inventing a name is the original sin this file was rewritten to stop, and a
// registry is only worth having if its entries are real.
//
// A credential mapping is recorded ONLY where it was already known to be right.
// Where it is not known, the entry carries none and the user is asked for
// `NAME=value` — better than a confident guess that silently does nothing.
interface KredensialMcp {
  /** Passed as an environment variable of this name. */
  env?: string;
  /** Appended to argv as `<arg><value>` — some servers take it that way. */
  arg?: string;
  /** Remote only: sent as an HTTP header through the bridge. */
  header?: string;
  awalan?: string;
}
interface EntriMcp {
  command?: string;
  args?: string[];
  /** Remote servers: reached through scripts/mcp-http-bridge.cjs. */
  url?: string;
  kredensial?: KredensialMcp;
}

const MCP_DIKENAL: Record<string, EntriMcp> = {
  notion: {
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    kredensial: { env: "NOTION_TOKEN" },
  },
  n8n: { command: "npx", args: ["-y", "n8n-mcp"] },
  figma: {
    command: "npx",
    args: ["-y", "figma-developer-mcp", "--stdio"],
    kredensial: { arg: "--figma-api-key=" },
  },
  github: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    kredensial: { env: "GITHUB_PERSONAL_ACCESS_TOKEN" },
  },
  brave: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    kredensial: { env: "BRAVE_API_KEY" },
  },
  slack: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    kredensial: { env: "SLACK_BOT_TOKEN" },
  },
  postgres: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres"],
    kredensial: { env: "POSTGRES_URL" },
  },
  filesystem: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem"],
  },
  memory: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
  },
  // REMOTE, not an npm package. There is no HuggingFace MCP server to install;
  // the official one is an endpoint, reached through the bridge already in this
  // repo. Typing the name used to mean `npx -y huggingface`, which cannot work
  // and never said so.
  huggingface: {
    url: "https://huggingface.co/mcp",
    kredensial: { header: "Authorization", awalan: "Bearer " },
  },
};

/** A remote URL, run through the bridge that speaks Streamable HTTP then SSE. */
function mcpLewatJembatan(url: string): { command: string; args: string[] } {
  return { command: "node", args: ["scripts/mcp-http-bridge.cjs", url] };
}

// ── Resolving an MCP server command from what the user typed ──
//
// ONE source. This logic used to be duplicated in Components.tsx and
// Screens.tsx, and had already drifted: one of them used the old sse-bridge.cjs
// (which speaks SSE only, so a server offering just /mcp failed silently) while
// the other had moved to mcp-http-bridge.cjs; figma existed in only one file.
// The same "two surfaces" pattern has bitten this repo repeatedly.
//
// WHY THE FALLBACK CHANGED. The old version ended with:
//     args = ["-y", `@modelcontextprotocol/server-${cleanType}`]
// that is, INVENTING a package name from the server name. That scope holds only
// a handful of official servers, so anything outside the list 404s — with an npm
// message that never mentions the name was made up.
//
// Proven: typing "n8n" produced @modelcontextprotocol/server-n8n (404), and
// "n8n1" produced server-n8n1 (404). Two dead entries in the config, and each
// time they were re-added through the UI they came back.
//
// The fallback now uses what was typed AS the package name. That is correct for
// the common case (the user naming an npm package), and official servers are
// still reachable by typing their full name — which contains "/" and is
// therefore handled by the branch above.
function mcpResolvePerintah(type: unknown): {
  command: string;
  args: string[];
} {
  const teks = String(type || "").trim();
  const kecil = teks.toLowerCase();

  // A full command typed verbatim -> used verbatim.
  if (kecil.startsWith("npx ") || kecil.startsWith("node ")) {
    const p = teks.split(/\s+/);
    // p[0] is always present: this branch is only reached after startsWith("npx "
    // / "node "), so the text is non-empty. ?? "" states that without a dead branch.
    return { command: p[0] ?? "", args: p.slice(1) };
  }
  // A remote URL -> through the bridge, which tries Streamable HTTP then SSE.
  if (kecil.startsWith("http")) return mcpLewatJembatan(teks);
  // A scoped or path-bearing name -> an npm package.
  if (teks.includes("/")) return { command: "npx", args: ["-y", teks] };

  const entri = MCP_DIKENAL[kecil];
  if (entri) {
    // A known REMOTE service resolves to the bridge, not to a package that does
    // not exist. This is the branch `huggingface` needed.
    if (entri.url) return mcpLewatJembatan(entri.url);
    return { command: entri.command!, args: entri.args! };
  }

  // Fallback: treat what was typed AS the package name. Never invent a scope.
  return { command: "npx", args: ["-y", teks] };
}

/**
 * Where the credential the user typed actually goes.
 *
 * Returns the env to spawn with, the args (a few servers take the key on the
 * command line), and — when nothing here knows the answer — `perluNama`, so the
 * caller can ASK instead of writing a variable no server reads.
 *
 * Accepted forms, in order:
 *   {"A":"b"}     JSON, used as the environment verbatim
 *   NAME=value    an explicit variable name; works for any server, known or not
 *   value         a bare secret, placed using the registry above
 */
function mcpResolveKredensial(
  type: unknown,
  kredensial: unknown,
  argsAwal: readonly string[],
): { env: Record<string, string>; args: string[]; perluNama?: boolean } {
  const teks = String(kredensial == null ? "" : kredensial).trim();
  const args = [...argsAwal];
  if (!teks) return { env: {}, args };

  // The user knows best: JSON is taken as the environment exactly as written.
  try {
    const j = JSON.parse(teks);
    if (j && typeof j === "object" && !Array.isArray(j))
      return { env: j, args };
  } catch (_) {}

  // NAME=value — the escape hatch that makes an unknown server workable without
  // waiting for the registry to learn about it.
  const m = teks.match(/^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]+)$/);
  if (m) return { env: { [m[1]!]: m[2]! }, args };

  const nama = String(type || "")
    .trim()
    .toLowerCase();
  const entri = MCP_DIKENAL[nama];
  const k = entri && entri.kredensial;

  // Remote: the secret travels as a HEADER through env, never in argv. argv
  // shows up in any process listing and is recorded with it.
  const remote = nama.startsWith("http") || Boolean(entri && entri.url);
  if (remote) {
    const header = (k && k.header) || "Authorization";
    const awalan = k && k.awalan !== undefined ? k.awalan : "Bearer ";
    return {
      env: { MCP_HEADERS: JSON.stringify({ [header]: awalan + teks }) },
      args,
    };
  }
  if (k && k.env) return { env: { [k.env]: teks }, args };
  if (k && k.arg) return { env: {}, args: [...args, k.arg + teks] };

  // NOTHING is invented here. The old code wrote { TOKEN: value }, which looks
  // like it worked and never did.
  return { env: {}, args, perluNama: true };
}
