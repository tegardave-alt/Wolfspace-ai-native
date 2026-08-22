// Config — the workspace root constant, taken DYNAMICALLY from the preload
// (window.WOLFSPACE.root). Loaded FIRST via APP_MODULES so it is available to
// every module and to app.jsx. It produces the same value the old hardcoded one
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
  return 1; // Medium bila belum pernah disetel
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

// ── Resolving an MCP server command from what the user typed ──
//
// ONE source. This logic used to be duplicated in Components.jsx and
// Screens.jsx, and had already drifted: one of them used the old sse-bridge.cjs
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
const MCP_ALIAS = {
  notion: { command: "npx", args: ["-y", "@notionhq/notion-mcp-server"] },
  n8n: { command: "npx", args: ["-y", "n8n-mcp"] },
  figma: { command: "npx", args: ["-y", "figma-developer-mcp", "--stdio"] },
  github: {
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
  },
  penpot: {
    command: "node",
    args: [
      "C:\langs\node\node_modules\@penpot\mcp\packages\server\dist\index.js",
    ],
  },
};

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
  if (kecil.startsWith("http")) {
    return { command: "node", args: ["scripts/mcp-http-bridge.cjs", teks] };
  }
  // A scoped or path-bearing name -> an npm package.
  if (teks.includes("/")) return { command: "npx", args: ["-y", teks] };

  // Read through an index-typed variable: `kecil` comes from user input, so it
  // really is an arbitrary string and not one of MCP_ALIAS's literal keys.
  const alias = (
    MCP_ALIAS as Record<string, { command: string; args: string[] }>
  )[kecil];
  if (alias) return alias;

  // Fallback: treat what was typed AS the package name. Never invent a scope.
  return { command: "npx", args: ["-y", teks] };
}
