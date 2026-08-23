// ── The planner, as ONE implementation with two callers ──
//
// The JS loop (agent/self_agent.ts) and the Python graph (services/agent-python)
// both need a short checklist before work starts, and both were getting it from
// different places: self_agent built one inline, while the Python path answered
// its `__plan__` pseudo-tool with a three-line stub that always returned an EMPTY
// checklist.
//
// An empty checklist is not a small difference. The checklist is the ground truth
// re-injected at every step — it is what stops the agent redoing finished work,
// and since failures are recorded against items, it is also what carries "already
// tried, already failed" without the model having to remember it. Running the
// Python orchestrator without one meant losing the anchor exactly where it
// matters most.
//
// Same reasoning as agent/penjaga-agent.ts: two copies of a decision is the drift
// this repo has been bitten by before, and the copy is always the one that
// drifts.

const penjaga = require("./penjaga-agent.ts");

/** At most this many checklist items. Short on purpose — see promptRencana. */
export const MAKS_LANGKAH = 3;

/** Used when the model returns nothing usable. The run continues regardless. */
export const RENCANA_FALLBACK = "Jalankan tugas user.";

/** How many providers to try before giving up on planning entirely. */
export const MAKS_PERCOBAAN_PROVIDER = 4;

/**
 * Should a failure make us try a DIFFERENT provider?
 *
 * Deliberately NOT penjaga.galatSementara, and the difference is the whole point:
 *
 *   galatSementara  "should I retry the SAME provider?"   -> transport shapes only
 *   this one        "should I try ANOTHER provider?"      -> also auth and quota
 *
 * A 401 or an exhausted quota is not worth retrying against the same key, so
 * galatSementara rightly says no. But it is exactly the reason to reach for the
 * next key. Collapsing the two would silently disable fallback for dead keys —
 * and on a real run here, 8 of the 10 keys in CLOUD_KEYS were dead when measured.
 */
const _POLA_GANTI_PROVIDER =
  /ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|timeout|EAI_AGAIN|network|ECONNREFUSED|ENOTFOUND|503|404|429|403|401|RegionError|too busy|Service Unavailable|service_unavailable|Rate limit|FreeUsageLimit|insufficient_quota/i;

export function layakGantiProvider(e: unknown): boolean {
  const m = (e as any)?.message ?? e ?? "";
  return _POLA_GANTI_PROVIDER.test(String(m));
}

/**
 * The planning prompt.
 *
 * Short by design: the checklist is re-injected into the system message at every
 * step, so its length is paid again on every model call. Three coarse items are
 * enough to anchor the work; a detailed plan would cost tokens per step to say
 * what the executor is about to discover anyway.
 *
 * Kept in Indonesian because the model answers in the user's language and the
 * checklist is shown to the user verbatim.
 */
export function promptRencana(permintaan: string): string {
  return (
    "Anda adalah AI Planner. Berdasarkan permintaan user, buat checklist SANGAT " +
    'SINGKAT (maksimal 3 langkah). Tiap langkah di baris baru diawali "- ". ' +
    "JANGAN detail — langsung ke inti tugas. Jangan tambahkan teks lain.\n\n" +
    "Permintaan: " +
    permintaan
  );
}

/**
 * Pull checklist items out of a model reply.
 *
 * Only lines opening with "- " count. A model that ignores the format and writes
 * prose produces nothing here, which is correct: half-parsed prose would put
 * sentences into the checklist and they would be re-injected at every step.
 */
export function parseChecklist(content: unknown): string[] {
  return String(content ?? "")
    .split("\n")
    .filter((l) => l.trim().startsWith("-"))
    .map((l) => l.trim().replace(/^- /, ""))
    .slice(0, MAKS_LANGKAH);
}

/** What rencanakan() hands back. */
export interface HasilRencana {
  /** Never empty — falls back to RENCANA_FALLBACK. */
  checklist: string[];
  /**
   * The provider that actually answered. The caller MUST adopt this: when the
   * planner falls back, the executor should keep using the key that works rather
   * than rediscovering the dead one.
   */
  cloud: any;
  /** Providers that failed, in order. For logging, not for decisions. */
  dicoba: string[];
}

/**
 * Ask the model for a checklist, falling back across providers.
 *
 * NEVER THROWS. The planner is not a step that may kill the run: its checklist is
 * a convenience, and the executor runs the same without one. Before there was a
 * fallback here, a single dead key in first position (github 401, say) killed the
 * ENTIRE run 1-2 seconds in, before the executor even tried its own provider.
 */
export async function rencanakan(
  cloud: any,
  permintaan: string,
  catat?: (level: string, pesan: string, data?: any) => void,
): Promise<HasilRencana> {
  // Resolved at CALL time, not at module load. electron/main.ts drops the whole
  // project require.cache on hot reload, and a binding captured at load would
  // keep calling into the discarded module instance.
  const { askCloudTools, CLOUD_KEYS, fillCloudKey } = require("./cloud.ts");

  const prompt = promptRencana(permintaan);
  const dicoba: string[] = [];
  let aktif = cloud;
  let reply: any = null;

  for (let t = 0; t < MAKS_PERCOBAAN_PROVIDER; t++) {
    try {
      reply = await askCloudTools(
        aktif,
        [{ role: "user", content: prompt }],
        [],
      );
      break;
    } catch (e: any) {
      if (catat)
        catat("warn", "planner_request_failed", {
          provider: aktif?.provider,
          error: String((e && e.message) || "").slice(0, 120),
        });
      if (!layakGantiProvider(e)) break;
      dicoba.push(aktif?.provider);
      const fb = Object.keys(CLOUD_KEYS).find(
        (p) => !dicoba.includes(p) && CLOUD_KEYS[p] && CLOUD_KEYS[p].key,
      );
      if (!fb) break;
      aktif = {
        provider: fb,
        key: CLOUD_KEYS[fb].key,
        model: CLOUD_KEYS[fb].model,
        baseUrl: CLOUD_KEYS[fb].baseUrl,
      };
      fillCloudKey(aktif);
    }
  }

  const checklist = reply ? parseChecklist(reply.content) : [];
  if (checklist.length === 0) checklist.push(RENCANA_FALLBACK);

  return { checklist, cloud: aktif, dicoba };
}

module.exports = {
  MAKS_LANGKAH,
  RENCANA_FALLBACK,
  MAKS_PERCOBAAN_PROVIDER,
  layakGantiProvider,
  promptRencana,
  parseChecklist,
  rencanakan,
};

export {};
