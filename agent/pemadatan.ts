/**
 * Folds the middle of a long conversation into one digest, so a run can keep
 * going instead of walking into a provider's context limit.
 *
 * THE GAP THIS CLOSES. Inside a single run the executor sends the whole array:
 *
 *     const activeMessages = [...state.messages];     self_agent.ts:1471
 *
 * There is no trim there, and `messages` is an append-only channel on both
 * sides of the graph (`operator.add` in services/agent-python/models.py). So it
 * grows for the entire run. agent/cloud.ts has no handler for a context-length
 * refusal, so the run does not degrade — it dies on a 400, and the longest runs
 * are exactly the ones that reach it.
 *
 * WHY THE DIGEST IS STRUCTURAL AND NOT A MODEL SUMMARY. Asking a model to
 * summarise costs a round trip, can fail, can hallucinate, and cannot be tested
 * deterministically. It is also unnecessary here: agent/temuan.ts already
 * carries WHAT THE AGENT KNOWS across the same boundary, and the checklist
 * carries WHAT IT MUST DO. What the middle of the array still holds that those
 * two do not is the SHAPE of what happened — which tools ran, against what, and
 * what failed. That is countable, so it is counted.
 *
 * WHY IT MERGES INTO THE SYSTEM MESSAGE rather than inserting a new one. Two
 * consecutive messages of the same role, and a `tool` message with no matching
 * assistant, are both rejected by strict providers — self_agent.ts:2919 already
 * records deepseek doing exactly that. Appending to the system message adds no
 * message at all, so no sequence can break. It is also the pattern the checklist
 * and the findings journal already use in the same function.
 *
 * WHAT IT REFUSES TO DO. It never splits a tool-call group. An assistant message
 * carrying `tool_calls` whose `role:"tool"` answers were dropped, or a `tool`
 * message whose assistant was dropped, is an invalid sequence — so the tail
 * boundary is moved earlier until it is clean. Compaction that produced a 400
 * would be worse than the overflow it prevents.
 */

"use strict";

const anggaran = require("./anggaran.ts");

/** One message in the OpenAI-shaped array the executor builds. */
type Pesan = {
  role: string;
  content?: any;
  tool_calls?: { id?: string; function?: { name?: string; arguments?: any } }[];
  tool_call_id?: string;
  [k: string]: any;
};

type Hasil = {
  /** The compacted array, digest already merged into the system message. */
  pesan: Pesan[];
  /** How many messages were folded away. */
  dibuang: number;
  /** Character count before and after — the only exact numbers here. */
  charSebelum: number;
  charSesudah: number;
};

/** Exact character weight of what will be sent. Content may be a string or the
 *  structured-content array some providers use, so anything non-string is
 *  measured through JSON — the same shape the request body will carry. */
function _charPesan(m: Pesan): number {
  let n = 0;
  if (typeof m?.content === "string") n += m.content.length;
  else if (m?.content != null) n += JSON.stringify(m.content).length;
  if (m?.tool_calls) n += JSON.stringify(m.tool_calls).length;
  return n;
}

export function ukuranChar(pesan: Pesan[]): number {
  let n = 0;
  for (const m of pesan || []) n += _charPesan(m);
  return n;
}

/** An ESTIMATE, for reporting only. Never used to decide anything — see
 *  PADAT_CHAR_PER_TOKEN. */
export function taksirToken(pesan: Pesan[]): number {
  return Math.ceil(ukuranChar(pesan) / anggaran.PADAT_CHAR_PER_TOKEN);
}

export function perluPadat(pesan: Pesan[], ambang?: number): boolean {
  return ukuranChar(pesan) > (ambang || anggaran.PADAT_AMBANG_CHAR);
}

/**
 * Moves a tail boundary earlier until it no longer starts on a tool result.
 *
 * A `role:"tool"` message answers an assistant that came before it. Starting
 * the kept tail on one would orphan it. Walking backwards lands on that
 * assistant — or earlier — which keeps the whole group together.
 *
 * It never walks past `batasBawah`, so the head is never eaten.
 */
function _awalAman(pesan: Pesan[], mulai: number, batasBawah: number): number {
  let i = Math.min(mulai, pesan.length);
  while (i > batasBawah && pesan[i] && pesan[i].role === "tool") i--;
  return i;
}

/**
 * How many messages at the front are kept verbatim.
 *
 * The leading system messages, plus the first user message when one follows
 * them — that is the original request, and losing it is how an agent ends a
 * long run having solved a different problem than the one it was asked.
 *
 * Neither role can belong to a tool-call group, so this boundary is always
 * safe without adjustment.
 */
function _panjangKepala(pesan: Pesan[]): number {
  let i = 0;
  while (i < pesan.length && pesan[i]?.role === "system") i++;
  if (i < pesan.length && pesan[i]?.role === "user") i++;
  return i;
}

/** Readable tool name from either shape the array carries. */
function _namaTool(tc: any): string {
  return String(tc?.function?.name || tc?.name || "?");
}

/** First argument that looks like a target (a path, a url, a command). Purely
 *  for the digest — a wrong guess costs a less useful line, nothing more. */
function _targetTool(tc: any): string {
  let arg = tc?.function?.arguments ?? tc?.arguments;
  if (typeof arg === "string") {
    try {
      arg = JSON.parse(arg);
    } catch {
      return "";
    }
  }
  if (!arg || typeof arg !== "object") return "";
  for (const k of [
    "path",
    "file",
    "berkas",
    "target",
    "url",
    "command",
    "cmd",
  ]) {
    if (typeof arg[k] === "string" && arg[k]) return arg[k];
  }
  return "";
}

/**
 * Builds the digest for the dropped span: what ran, against what, what failed.
 *
 * Deliberately counted rather than described. "read x13 index.html" is both
 * shorter and more actionable than a sentence about having examined the file,
 * and it is the same signal that exposed the repetition bug in the first place.
 */
function _blokRingkas(buang: Pesan[], mulaiIdx: number): string {
  const hitung = new Map<string, number>();
  const target = new Map<string, number>();
  let gagal = 0;
  let teksAsisten = 0;

  for (const m of buang) {
    if (m.role === "assistant") {
      if (Array.isArray(m.tool_calls)) {
        for (const tc of m.tool_calls) {
          const n = _namaTool(tc);
          hitung.set(n, (hitung.get(n) || 0) + 1);
          const t = _targetTool(tc);
          if (t) target.set(t, (target.get(t) || 0) + 1);
        }
      } else if (typeof m.content === "string" && m.content.trim()) {
        teksAsisten++;
      }
    } else if (m.role === "tool") {
      const c = typeof m.content === "string" ? m.content : "";
      // Cheap and deliberately shallow: the tool result format is not uniform
      // across tools, so this counts what looks like a failure rather than
      // claiming to know. An over-count costs one line in the digest.
      if (/^\s*(error|gagal|failed|traceback)/i.test(c)) gagal++;
    }
  }

  const urut = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]);

  const baris: string[] = [];
  baris.push(
    "\n\n[RIWAYAT DIPADATKAN] " +
      buang.length +
      " pesan (indeks " +
      mulaiIdx +
      "-" +
      (mulaiIdx + buang.length - 1) +
      ") diringkas. Isi lengkapnya tidak lagi dikirim, tetapi yang berikut BENAR terjadi:",
  );

  const alat = urut(hitung);
  if (alat.length) {
    baris.push(
      "  tool: " +
        alat
          .map(([n, c]) => n + (c > 1 ? " x" + c : ""))
          .slice(0, 12)
          .join(", "),
    );
  }
  const tg = urut(target);
  if (tg.length) {
    baris.push(
      "  target: " +
        tg
          .map(([t, c]) => t + (c > 1 ? " x" + c : ""))
          .slice(0, 10)
          .join(", "),
    );
  }
  if (gagal) baris.push("  hasil tool yang tampak gagal: " + gagal);
  if (teksAsisten) baris.push("  balasan teks tanpa tool: " + teksAsisten);
  baris.push(
    "  Jangan ulangi pekerjaan di atas hanya karena rinciannya tidak terlihat lagi.",
  );

  const s = baris.join("\n");
  return s.length > anggaran.PADAT_BLOK_MAKS
    ? s.slice(0, anggaran.PADAT_BLOK_MAKS) + "\n  [ringkasan dipotong]"
    : s;
}

/**
 * Compacts if the array is over budget, otherwise leaves it completely alone.
 *
 * @returns null when nothing was done — the caller then sends what it had. That
 *   is the common case and it costs one character count, so this is safe to
 *   call on every step.
 */
export function padatkan(
  pesan: Pesan[],
  opts?: { ambang?: number; sisaEkor?: number },
): Hasil | null {
  if (!Array.isArray(pesan) || pesan.length === 0) return null;

  const charSebelum = ukuranChar(pesan);
  const ambang = opts?.ambang || anggaran.PADAT_AMBANG_CHAR;
  if (charSebelum <= ambang) return null;

  const kepala = _panjangKepala(pesan);
  const sisaEkor = opts?.sisaEkor || anggaran.PADAT_SISA_EKOR;

  // Where the tail would start on message count alone, then moved earlier until
  // it cannot orphan a tool result.
  const ekorKasar = Math.max(kepala, pesan.length - sisaEkor);
  const ekor = _awalAman(pesan, ekorKasar, kepala);

  const buang = pesan.slice(kepala, ekor);
  // Nothing worth folding: either the array is short, or the whole middle is one
  // unbreakable tool group. Returning null is honest — the caller learns the
  // array is still over budget and can act on that, rather than being handed an
  // array that only looks compacted.
  if (buang.length === 0) return null;

  const blok = _blokRingkas(buang, kepala);
  const keluar: Pesan[] = [...pesan.slice(0, kepala), ...pesan.slice(ekor)];

  // Merge the digest into the system message. If the array somehow starts
  // without one, prepend it rather than dropping the digest on the floor.
  if (keluar[0] && keluar[0].role === "system") {
    const m: Pesan = { ...keluar[0] };
    m.content = (typeof m.content === "string" ? m.content : "") + blok;
    keluar[0] = m;
  } else {
    keluar.unshift({ role: "system", content: blok.trimStart() });
  }

  return {
    pesan: keluar,
    dibuang: buang.length,
    charSebelum,
    charSesudah: ukuranChar(keluar),
  };
}

module.exports = {
  ukuranChar,
  taksirToken,
  perluPadat,
  padatkan,
};
