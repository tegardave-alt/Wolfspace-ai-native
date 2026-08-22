// Cloud key (BYOK) API: save, detect provider, list, delete.
// Ported from the former server/routes/cloud.cjs; behavior is unchanged.
//
// Keys are written to the gitignored store resolved by agent/keys-path.cjs and
// are never sent to the browser — the list endpoint returns provider names and
// model ids only, never the key itself.

import type { IncomingMessage, ServerResponse } from "node:http";
import * as fs from "node:fs";

// keys-path.cjs is untyped CommonJS and migrates in a later phase; require()
// with a local shape keeps this file from needing a .d.ts for it today.
const { resolveKeysPath } = require("../../agent/keys-path.cjs") as {
  resolveKeysPath: () => string;
};

export interface CloudKeyEntry {
  key: string;
  model?: string;
  baseUrl?: string;
}

export interface CloudProviderConfig {
  host: string;
  path: string;
  model: string;
}

export interface DetectKeyResult {
  provider: string;
  name: string;
  verified: boolean;
}

export interface CloudRouteDeps {
  /** Loaded server-side keys, keyed by provider. Never leaves the server. */
  CLOUD_KEYS: Record<string, CloudKeyEntry | undefined>;
  /** Static per-provider endpoint config, used only for its default model id. */
  CLOUD: Record<string, CloudProviderConfig | undefined>;
  PROVIDER_NAMES: Record<string, string | undefined>;
  /** Re-reads the key store into CLOUD_KEYS after a write or delete. */
  loadCloudKeys(): void;
  detectKey(key: string): Promise<DetectKeyResult>;
  dlog(cat: string, level: string, msg: string, data?: unknown): void;
}

export function handle(
  req: IncomingMessage,
  res: ServerResponse,
  deps: CloudRouteDeps,
): boolean {
  const { CLOUD_KEYS, CLOUD, PROVIDER_NAMES, loadCloudKeys, detectKey, dlog } =
    deps;

  // POST /cloud-save - Persist BYOK key server-side
  if (req.method === "POST" && req.url === "/cloud-save") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        const { key, provider, model, baseUrl } = JSON.parse(body);
        if (!key || !provider) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "key & provider are required" }));
          return;
        }
        let store: Record<string, CloudKeyEntry> = {};
        try {
          store = JSON.parse(fs.readFileSync(resolveKeysPath(), "utf8"));
        } catch {}
        store[provider] = {
          key,
          model: model || "",
          ...(baseUrl ? { baseUrl } : {}),
        };
        fs.writeFileSync(resolveKeysPath(), JSON.stringify(store, null, 2));
        loadCloudKeys();
        dlog("http", "info", "cloud key saved server-side", { provider });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, provider }));
      } catch (e) {
        // Deliberately 200: the browser copy is already saved by this point, so
        // the UI treats a failure here as "saved locally only", not a hard error.
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: (e as Error).message }));
      }
    });
    return true;
  }

  // POST /detect-key - Detect key provider
  if (req.method === "POST" && req.url === "/detect-key") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", async () => {
      let out: DetectKeyResult = {
        provider: "openai",
        name: "OpenAI",
        verified: false,
      };
      try {
        const { key } = JSON.parse(body);
        if (key) out = await detectKey(key);
      } catch {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(out));
    });
    return true;
  }

  // GET /cloud-providers - List providers with keys (names and models only)
  if (req.method === "GET" && req.url === "/cloud-providers") {
    const out: Array<{ provider: string; name: string; model: string }> = [];
    for (const [provider, entry] of Object.entries(CLOUD_KEYS)) {
      if (!entry || !entry.key) continue;
      out.push({
        provider,
        name: PROVIDER_NAMES[provider] || provider,
        model: entry.model || CLOUD[provider]?.model || "",
      });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(out));
    return true;
  }

  // DELETE /cloud-providers/:provider - Delete a key
  if (
    req.method === "DELETE" &&
    (req.url || "").startsWith("/cloud-providers/")
  ) {
    const prov = decodeURIComponent(
      (req.url || "").slice("/cloud-providers/".length),
    );
    try {
      let store: Record<string, CloudKeyEntry> = {};
      try {
        store = JSON.parse(fs.readFileSync(resolveKeysPath(), "utf8"));
      } catch {}
      delete store[prov];
      fs.writeFileSync(resolveKeysPath(), JSON.stringify(store, null, 2));
      loadCloudKeys();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, provider: prov }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
    return true;
  }

  return false;
}
