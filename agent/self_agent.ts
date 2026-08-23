// Install the .ts hook FIRST: modules below require TypeScript files, and
// this file can itself be an entry point — tests require it directly, and
// `node -e` subprocesses load it without ever going through server.cjs.
require("../scripts/ts-register.cjs");
// Self-agent stream implementation (extracted and modularized from server.cjs)
// Dependencies – same as original server.cjs
const { dlog } = require("./debug.ts");
const {
  fillCloudKey,
  detectProvider,
  CLOUD,
  CLOUD_KEYS,
  loadCloudKeys,
  askCloudTools,
  askCloudStream,
} = require("./cloud.ts");
const {
  runSelfTool,
  SELF_TOOLS,
  qBackup,
  qBackupAsync,
} = require("./tools.cjs");
// Guards shared with the Python orchestrator — ONE implementation, two callers.
// They used to be defined inline further down; two copies of a security gate is
// the drift this repo has been bitten by before, and the copy is always the one
// that drifts.
const _penjagaAgent = require("./penjaga-agent.ts");
// runReply REMOVED from chat.ts — it never ran anything, it only returned
// {ok:true, info:"auto-run disabled"}, which used to be emitted as the `run`
// field on the done event. Real verification lives in the agent tools.
const { getOptimized, optimizeInBackground } = require("./sysprompt_opt.ts");
const {
  parsePseudoCalls,
  stripPseudoTags,
} = require("./pseudo-tag-filter.cjs");
const os = require("os");
// ── langgraph is loaded WHEN USED, not when this module is read ──
//
// It is the most expensive dependency in the whole application, and its cost
// was paid in the place where it hurts most. Measured:
//
//   require("./core.js")        1071 ms   570 modules
//     from node_modules          533 modules (93%)
//     our own code                37 modules  (7%)
//   require("@langchain/langgraph")  987 ms   <- almost all of it is this one
//   require("zod")                   235 ms
//
// And that is not a one-off cost. electron/main.ts drops the ENTIRE project
// require.cache on every hot-reload and then loads core again — in Electron's
// MAIN process, which means ~1 second of frozen window every time the agent
// touches its own files. server.cjs also drops THIS module's cache on every
// /self-agent request.
//
// What changed is WHEN, not how much: the cost moves to the first agent call,
// where it disappears among cloud calls that take a second anyway. An app opened
// to read code or look at a preview does not pay it at all.
let _lg: any = null;
function lg() {
  return (_lg = _lg || require("@langchain/langgraph"));
}

// server.cjs does `delete require.cache` for this module on EVERY /self-agent
// request (hot-reload, so the agent sees changes to its own source). That
// recreates all module-level state — including the HITL checkpointer. If
// MemorySaver were rebuilt per request, checkpoints from a run paused for HITL
// would be lost and resume would never find its pending tool call. Keeping it on
// globalThis is what makes ONE instance survive across reloads.
//
// It is also a FUNCTION now rather than a constant: creating a MemorySaver
// requires langgraph to be loaded, and that is exactly what is being deferred.
// Where it is stored has not changed, so the "one instance across reloads"
// guarantee still holds.
function memoriAgen() {
  return (
    globalThis.__wolfspaceAgentMemory ||
    (globalThis.__wolfspaceAgentMemory = new (lg().MemorySaver)())
  );
}
// System prompt for function-calling self-agent
const path = require("path");
const PROMPTS_CFG_PATH = path.join(__dirname, "..", "config", "prompts.json");

// ===================== AGENT RULE SYSTEM (HARDCODED RULES) =====================
// Rules moved out of the prompt and into the system, for 100% compliance
const SYSTEM_RULES = {
  // FORBIDDEN_SPECULATIVE REMOVED — do not bring it back. See the note where
  // sanitizeOutput() used to be, below, for why.
  //
  // The order of tools that must be tried before declaring "there is none"
  REQUIRED_TOOL_SEQUENCE: ["grep", "glob", "web_search"],
  // The minimum number of tools that must fail before giving up is allowed
  MIN_FAILED_TOOLS: 3,
  // How many times a single checklist ITEM may fail before the run STOPS and asks.
  //
  // WHY IT EXISTS. The checklist is the ground truth re-injected at every step —
  // but it used to have no "failed" status at all (_TODO_ICON only knew
  // completed/in_progress/cancelled/pending), and a failure never touched
  // task_checklist. So an item that had been tried and failed kept showing as
  // "[→] in progress" forever. To learn it had ever failed, the model HAD to dig
  // through conversation history — precisely the thing that degrades fastest as
  // context grows. So the anchor leaked exactly where it was needed most.
  //
  // MAX_STEPS does put a bound on things, but it is a BLIND ceiling: it kills the
  // run without saying what got stuck. This limit is different — it stops on the
  // SPECIFIC item, carries the reason with it, and asks the user instead of giving
  // up silently.
  MAX_ITEM_ATTEMPTS: 3,

  // How many times a run may be NUDGED onward when the model closes its turn with
  // TEXT while the checklist is still open.
  //
  // WHY IT EXISTS. The closing branch in the executor treated "has content, no
  // tool_calls" as a final answer and ENDED the run — without once checking
  // whether the work was actually finished. For a model fond of announcing its
  // plan in prose before acting, a single sentence of intent was enough to kill
  // the run halfway through.
  //
  // Recorded in a real run log (GLM-5.2, landing-page task):
  //   step 5  toolCalls=3            <- working
  //   step 6  content=176 toolCalls=0 -> stop "text_response_no_tools"
  // The checklist was still 0/4, but the run was closed and that sentence of
  // intent was shown as the final result. From the screen, the symptom looks
  // exactly like "the agent stopped on its own and did not follow the todo".
  //
  // Bounded so it does not become a loop: if the model is still narrating after a
  // few nudges, the run closes as before — now with an honest note that the
  // checklist is unfinished.
  MAX_CONTINUE_NUDGE: 3,
};

// Keep the evidence from tools already accessed, for validation
const accessedEvidence = new Set();
let failedTools = new Set();

// sanitizeOutput() REMOVED — it used to sweep speculative words out of the final
// answer and replace them with a "[speculative-word-removed]" marker. That marker
// was SHOWN to the user, so even a correct answer looked broken.
//
// Removing just the WORD (with no marker) is more dangerous still, and that is why
// this sweeper was dropped rather than replaced:
//
//   "The config file may not exist"  ->  "The config file does not exist"
//
// A guess turns into a definite statement. The sweeper never removed the
// speculation — it only removed the SIGN that it was speculation, and then served
// a guess as fact. For a tool whose purpose is to report the actual state of the
// code, that is a far more expensive failure than an ugly marker.
//
// The genuinely dangerous speculation — the model NARRATING execution results it
// never ran — is handled in the right place by SIMULATION_CLAIMS + force_retry:
// the model is TOLD TO REDO the call against a real tool, rather than having its
// sentence quietly edited after the fact.

// Strip reasoning blocks (<think>...</think>) and any stray/unpaired think tag.
// cloud.ts wraps reasoning deltas in these tags for the streaming view, and some
// models (DeepSeek R1 and friends) emit them on their own — whatever the source,
// think content MUST NOT appear as the answer to the user.
// ── Shared tooling: treating CODE as off-limits territory ──
//
// Every answer filter below works with regexes over free text. The trouble is
// that a model's answer is not free text: part of it is code and diagrams that
// HAPPEN to contain the word or mark the filter is looking for. With no boundary,
// the filter cuts into the user's code.
//
// The real cases that prompted this tooling (all three measured, not guessed):
//   - `const Kesimpulan: 1;` inside ```js lost the word "Kesimpulan:"
//   - mentioning the `</think>` tag inside backticks threw away the ENTIRE
//     preceding sentence, because the "closer without opener" rule anchors at the
//     start of the text
//   - a length cut landed in the middle of ``` so the rest of the answer rendered
//     as code
//
// The patterns catch a complete fenced block, a fence left UNCLOSED to the end
// (which happens often when a model truncates itself), and inline code.
const _POLA_KODE = /```[\s\S]*?```|```[\s\S]*$|`[^`\n]*`/g;

// Replace each code fragment with a marker, run the filter, then put them back.
// Used for filters whose regexes are ANCHORED (^ / $) and therefore cannot simply
// be run per fragment.
function _tanpaKode(text, saring) {
  const simpan: any[] = [];
  const bertanda = String(text).replace(_POLA_KODE, (m) => {
    simpan.push(m);
    return " K" + (simpan.length - 1) + " ";
  });
  const hasil = saring(bertanda);
  return hasil.replace(/ K(\d+) /g, (_, i) =>
    simpan[+i] === undefined ? "" : simpan[+i],
  );
}

// Split on blank lines, BUT treat a fenced block as a single unit.
//
// A plain `split(/\n\s*\n/)` treats a blank line inside ``` as a paragraph
// boundary, and the caller then trims each piece — the code loses its indentation
// and the block breaks into unpaired fences.
function _paragrafSadarPagar(t) {
  const out: any[] = [];
  let buf: any[] = [],
    dalamPagar = false;
  for (const b of String(t).split("\n")) {
    if (/^\s*```/.test(b)) dalamPagar = !dalamPagar;
    if (!dalamPagar && !b.trim()) {
      if (buf.length) out.push(buf.join("\n"));
      buf = [];
      continue;
    }
    buf.push(b);
  }
  if (buf.length) out.push(buf.join("\n"));
  return out;
}

function stripThinkBlocks(text) {
  // The fast path MUST be case-insensitive: the regexes below use the /i flag, so
  // a case-sensitive check (indexOf) would early-return wrongly for <THINK>/</Think>
  // and leak them raw. Optional spaces (< think >) are tolerated too, because some
  // models emit that dialect.
  if (!text || !/think\s*>/i.test(text)) return text;
  // Paired blocks are stripped first and WITHOUT code protection: a complete
  // <think>…</think> really is reasoning, wherever it appears.
  const berpasangan = text.replace(
    /<\s*think[^>]*>[\s\S]*?<\s*\/\s*think\s*>/gi,
    "",
  );
  // The two remaining rules sweep toward the start/end of the text, so both MUST be
  // blind to code — otherwise merely MENTIONING the tag inside a code example
  // throws away the answer around it.
  return _tanpaKode(berpasangan, (t) =>
    t
      .replace(/^[\s\S]*?<\s*\/\s*think\s*>/i, "") // a closer with no opener: everything before it is leaked reasoning
      .replace(/<\s*think[^>]*>[\s\S]*$/i, ""),
  ) // opener tanpa closer: sisa stream = reasoning
    .trim();
}

// Is this piece of text WORKING NOTES rather than a conclusion?
//
// The mark of working notes: dominated by list/mapping lines, almost no sentences.
// The real case that prompted this fix — a fragment that reached the user's screen
// labelled "here is the conclusion from its reasoning":
//
//   Language to Devicon mapping:
//   - js → devicon-javascript-plain
//   - ts → devicon-typescript-plain
//   ... (cut off mid-list)
//
// That is a reference table the model was assembling, not an answer. Calling it a
// conclusion makes the user read half-finished notes as the result of the work.
function _tampakCatatanKerja(teks) {
  const baris = String(teks || "")
    .split("\n")
    .map((b) => b.trim())
    .filter(Boolean);
  if (baris.length < 3) return false;
  const daftar = baris.filter((b) =>
    /^[-*•|]|\s(?:→|->|=>)\s|^\d+[.)]\s/.test(b),
  ).length;
  // A sentence = a line ending in . ? or ! that is long enough.
  const kalimat = baris.filter((b) => b.length > 40 && /[.!?]$/.test(b)).length;
  return daftar / baris.length >= 0.6 && kalimat <= 1;
}

// Pull the conclusion out of a reasoning monologue when the model never closed its
// answer in `content`.
//
// RETURNS THE KIND, not just the text. The old version always returned a string
// and its caller always labelled it "here is the conclusion from its reasoning" —
// when only the FIRST branch actually finds a conclusion. The second branch merely
// takes the last paragraph, and the last paragraph of a monologue is often the
// part that was never finished.
//
// The label has to follow the content. Otherwise the user reads working notes as
// an answer — and that is worse than showing nothing, because it looks like a
// legitimate result.
//
// @returns {{teks: string, jenis: "kesimpulan"|"catatan"|"kosong"}}
function salvageReasoning(reasoning) {
  let t = String(reasoning || "");
  if (!t.trim()) return { teks: "", jenis: "kosong" };
  t = stripThinkBlocks(t) || t; // drop the think tag when the reasoning carries one along
  t = t.trim();
  if (!t) return { teks: "", jenis: "kosong" };

  // 1) An explicit conclusion marker — take it from the LAST occurrence.
  //    Only this branch may be called a "conclusion".
  const marker =
    /(?:^|\n)\s*(?:kesimpulan|jawaban akhir|final answer|jadi,|singkatnya|ringkasnya)\s*[:\-]?\s*/gi;
  let lastIdx = -1;
  for (const m of t.matchAll(marker)) lastIdx = m.index + m[0].length;
  if (lastIdx > -1) {
    const tail = t.slice(lastIdx).trim();
    // The threshold used to be 40 characters, and that threw away the SHORT
    // conclusions that are the best ones: "Kesimpulan: penyebabnya port kosong."
    // (36 chars) fell through to the paragraph branch and showed as "notes", even
    // though the model had stated it as a conclusion explicitly. All that needs
    // rejecting is a marker left dangling with no content.
    if (tail.length > 12) {
      return { teks: tail.slice(0, 4000), jenis: "kesimpulan" };
    }
  }

  // 2) With no marker: the last paragraph. This is NOT a conclusion, and must not
  //    be called one.
  //
  //    The splitter is fence-aware. A plain `split(/\n\s*\n/)` treats a blank line
  //    INSIDE ``` as a paragraph boundary; pieces are then taken from the end until
  //    the quota runs out, so a code block can be carried in half — an opening
  //    fence with no closer, and its line indentation lost to .trim(). That is
  //    exactly the broken output seen on screen: a "New:" block whose contents were
  //    no longer code.
  const paras = _paragrafSadarPagar(t).filter((p) => p.trim());
  const out: any[] = [];
  let n = 0;
  for (let i = paras.length - 1; i >= 0 && n < 1200; i--) {
    out.unshift(paras[i].trim());
    n += paras[i].length;
  }
  // `.slice(0, 4000)` can still land mid-block, and a reasoning monologue often
  // stops abruptly with a fence left open. Both are closed here: an odd number of
  // fences means the UI would render the rest of the message — including text
  // outside the block — as code.
  let ekor = out.join("\n\n").slice(0, 4000);
  if ((ekor.match(/```/g) || []).length % 2 === 1) ekor += "\n```";

  // Pure working notes are NOT salvaged at all. A half-finished mapping list
  // answers nothing, and showing it only makes the user think there is a result.
  if (!ekor || _tampakCatatanKerja(ekor)) return { teks: "", jenis: "kosong" };
  return { teks: ekor, jenis: "catatan" };
}

// Translate a provider failure into the RIGHT cause.
//
// WHY IT EXISTS. When every provider was exhausted, the run closed with one fixed
// sentence: "Cloud API error — try again in a few seconds." The original message
// was discarded, even though it already said exactly what was wrong. What happened
// on a real run:
//
//   opencode 429 FreeUsageLimitError            -> switched to github
//   custom   402 "Insufficient credit. Add funds at zyloo.io/…/billing."
//   puter    402 "No usage left for request."   -> stopped
//   what the user saw: "try again in a few seconds."
//
// That advice is WRONG for a 402: exhausted credit does not recover by waiting.
// The user waits, retries, fails again, and has no hint at all that what needs
// doing is on their provider's billing dashboard. The symptom reads as
// "the application is broken".
//
// So the only distinction drawn is whether WAITING helps, because that is the only
// thing that changes what the user does next.
function _ringkasGagalCloud(provider, err, gagal) {
  const pesan = String((err && err.message) || err || "");
  const dicoba = Array.isArray(gagal) && gagal.length ? gagal : [];
  const semua = dicoba.concat(
    provider && !dicoba.includes(provider) ? [provider] : [],
  );
  const daftar = semua.length ? " (dicoba: " + semua.join(", ") + ")" : "";
  const inti = pesan.replace(/\s+/g, " ").slice(0, 160);

  // Credit/quota exhausted, or the key was rejected: WAITING DOES NOT HELP.
  if (
    /\b40[123]\b/.test(pesan) ||
    /insufficient|no usage left|quota|credit|billing|payment|unauthorized|invalid[_ ]?api[_ ]?key/i.test(
      pesan,
    )
  )
    return (
      "Semua provider cloud menolak permintaan ini" +
      daftar +
      ". Bukan gangguan sesaat — menunggu tidak akan menolong: kuota/kredit habis " +
      "atau kunci ditolak. Isi ulang kredit di dasbor providernya, atau tambahkan " +
      "kunci provider lain.\n\nBalasan terakhir: " +
      inti
    );

  // Rate limit: waiting DOES help.
  if (/\b429\b/.test(pesan) || /rate[ _-]?limit|too many requests/i.test(pesan))
    return (
      "Semua provider cloud sedang kena batas laju" +
      daftar +
      ". Ini sementara — coba lagi sebentar lagi.\n\nBalasan terakhir: " +
      inti
    );

  return (
    "Permintaan ke provider cloud gagal" +
    daftar +
    ".\n\nBalasan terakhir: " +
    inti
  );
}

// Remove tool recaps, evidence lists, and needless preamble sentences.
//
// THIS FUNCTION USED TO BE ABLE TO DELETE THE ENTIRE ANSWER. Both its patterns were
// `[\s\S]*?(?=…|$)` — a lazy sweep stopping at the next marker, with `$` as the
// last alternative. If that marker never appeared (and usually it does not: models
// rarely write "Kesimpulan:"), `$` means THE END OF THE WHOLE TEXT. An answer
// An answer opening with the recap sentence below therefore came out as an
// EMPTY string — measured, not guessed: 3 paragraphs in, "" out.
//
//   "Berikut bukti dari tool yang telah dijalankan: …"   (verbatim: matched)
// out as an EMPTY string — measured, not guessed: 3 paragraphs in, "" out.
//
// The deletion is now BOUNDED TO A PARAGRAPH. A tool recap is one paragraph, and
// that bound makes the worst possible damage one paragraph rather than the rest of
// the answer. Fenced blocks are never touched.
const _AWAL_REKAP =
  /^\s*(?:Berikut bukti dari tool yang telah dijalankan|Tool\s+(?:grep|read|glob|list|bash|web_search|web_fetch|disk_grep|disk_read|disk_glob|disk_list|mcp_[a-z0-9_]+)\b(?:\s+dengan pattern [^\n]*)?\s+menemukan)\b/i;
function stripToolRecap(text) {
  if (!text) return text;
  const keluar: any[] = [];
  for (const p of _paragrafSadarPagar(text)) {
    if (/^\s*```/.test(p)) {
      keluar.push(p); // a code/diagram block: the user's, leave it alone
      continue;
    }
    const baris = p.split("\n");
    const i = baris.findIndex((b) => _AWAL_REKAP.test(b));
    let sisa = baris;
    if (i >= 0) {
      // A recap = the marker line ITSELF plus the evidence list trailing it
      // (bullets, numbering, or indented lines). Stop at the first line of prose —
      // in a paragraph with no blank line, the actual answer sentence often sits
      // directly under the marker, and dropping a whole paragraph would drop the
      // answer with it.
      let j = i + 1;
      while (j < baris.length && /^\s*(?:[-*•]|\d+[.)]\s|\s)/.test(baris[j]))
        j++;
      sisa = baris.slice(0, i).concat(baris.slice(j));
    }
    // "Kesimpulan:" is only a line-opening label — removed there and nowhere else,
    // not wherever it happens to appear (inside code, for instance).
    const bersih = sisa
      .map((b) => b.replace(/^(\s*)Kesimpulan:\s*/i, "$1"))
      .join("\n");
    if (bersih.trim()) keluar.push(bersih);
  }
  return keluar
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Truncate the final answer to at most 2000 characters of PROSE, as a safety net.
//
// Two defects are fixed here, both measured:
//
//  1. SPLIT CODE BLOCKS. The safe branch only ran when the fence count was even
//     and >= 2. An answer with an ODD number of fences — the most common case, as
//     models often cut themselves off mid-block — fell through to a raw
//     `slice(0, 2000)`. The result was a block that was never closed, and a UI
//     rendering the rest of the answer as code.
//
//  2. SILENT TRUNCATION. The even-fence branch cut without adding any marker, so
//     an answer missing half of itself looked like a complete answer that happened
//     to stop. Every truncation now leaves a trace.
//
// Fenced blocks still do not count against the quota (diagrams and code are long on
// purpose) — but they are also never cut in the middle now: a block is included
// WHOLE or not at all.
// Cut at a sensible boundary rather than mid-word.
//
// The order is paragraph -> sentence -> word, and a boundary is only accepted while
// it is still within the last 40% of the budget. Without that condition, text with
// no punctuation could be cut far shorter than asked for.
function _potongRapi(s, n) {
  if (s.length <= n) return s;
  const kepala = s.slice(0, n);
  const batasParagraf = kepala.lastIndexOf("\n\n");
  if (batasParagraf > n * 0.6) return kepala.slice(0, batasParagraf).trim();
  const kalimat = kepala.match(/[\s\S]*[.!?]/);
  if (kalimat && kalimat[0].length > n * 0.6) return kalimat[0].trim();
  const spasi = kepala.lastIndexOf(" ");
  if (spasi > n * 0.6) return kepala.slice(0, spasi).trim();
  return kepala.trim();
}
function truncateToConcise(text, maxChars = 2000) {
  if (!text) return text;

  // Split into PROSE pieces and CODE pieces. A fence left unclosed to the end of
  // the text still counts as code, so nothing is cut inside it.
  const bagian: any[] = [];
  let last = 0,
    m;
  const P = /```[\s\S]*?```|```[\s\S]*$/g;
  while ((m = P.exec(text)) !== null) {
    if (m.index > last)
      bagian.push({ kode: false, s: text.slice(last, m.index) });
    bagian.push({ kode: true, s: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) bagian.push({ kode: false, s: text.slice(last) });

  // An odd fence is closed EVEN when nothing was truncated. A model that stops
  // mid-block sends an opening ``` with no closer, and the UI then renders the rest
  // of the message as code. Closing it here changes no content — it just makes a
  // block that was already left open end where it stands.
  const tutupPagar = (s) =>
    (s.match(/```/g) || []).length % 2 === 1 ? s + "\n```" : s;

  const prosa = bagian.reduce((n, b) => n + (b.kode ? 0 : b.s.length), 0);
  if (prosa <= maxChars) return tutupPagar(text); // prosa muat -> utuh (diagram gratis)

  let sisa = maxChars,
    out = "",
    terpotong = false;
  for (const b of bagian) {
    if (b.kode) {
      out += b.s; // the block comes along whole, and costs no quota
      continue;
    }
    if (b.s.length <= sisa) {
      out += b.s;
      sisa -= b.s.length;
      continue;
    }
    out += _potongRapi(b.s, sisa);
    terpotong = true;
    break; // sisanya dibuang
  }

  return tutupPagar(out.trim()) + (terpotong ? "\n\n…" : "");
}

// Check that the answer contains at least part of the evidence accessed.
// This validation makes sure the answer is grounded in tool evidence WITHOUT
// forcing the agent to copy tool output back out. Naming a file path or a key term
// from the evidence is enough.
function hasValidEvidence(summary, evidenceSet) {
  if (evidenceSet.size === 0) return true; // no tool ran at all, so skip
  const sum = summary.toLowerCase();
  for (const ev of evidenceSet) {
    const evLower = ev.toLowerCase();
    // Does the summary name a file path present in the evidence?
    const paths =
      evLower.match(
        /[a-z]:\\[^\s]+|(?:\.\.\/|\/|[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_.-]+/g,
      ) || [];
    for (const p of paths) {
      if (p.length > 3 && sum.includes(p)) return true;
    }
    // Does the summary name a key term/pattern from the evidence (min 8 chars)?
    const terms = evLower.split(/\s+/).filter((w) => w.length >= 8);
    for (const term of terms) {
      if (sum.includes(term)) return true;
    }
  }
  return false;
}

// ==================================================================================
// HALLUCINATION GUARD — a multi-stage filter before the answer reaches the user
// ==================================================================================
// How a model can hallucinate:
//   1. Pattern completion: filling a "gap" with a plausible pattern rather than a
//      real one
//   2. Overconfidence: answering with certainty without ever reading or verifying
//      the evidence
//   3. Context leakage: mixing training knowledge into the session context
//
// This guard detects the 3 most common hallucination patterns from the agent:
//   A. Claiming a file location that was NEVER read or grepped
//   B. Claiming a function/variable exists that is NOT in any tool output
//   C. Claiming "fixed/done" with no evidence of a successful edit
// ==================================================================================

/**
 * Extract factual claims from the model's answer text.
 * A claim = a sentence or phrase that can be verified objectively.
 */
function extractClaims(text) {
  const claims: any[] = [];

  // PATTERN A — file location claims. The phrases matched, verbatim:
  //   "ada di public/app.tsx", "terdapat di server.cjs"   (verbatim)
  // "terdapat di server.cjs")
  const fileClaimRegex =
    /(?:ada\s+di|terdapat\s+di|berada\s+di|ditemukan\s+di|terletak\s+di|located\s+in|found\s+in|defined\s+in|inside)\s+([^\s,;.]+\.(jsx?|cjs|css|html|json|md|ts|py))/gi;
  let m;
  while ((m = fileClaimRegex.exec(text)) !== null) {
    claims.push({ type: "file_location", value: m[1], raw: m[0] });
  }

  // PATTERN B — claims that a function/variable exists (e.g. "fungsi handleClear",
  // "variabel MAX_STEPS"). The /i flag matters: without it a capitalised opener
  // ("Fungsi Xyz") skips the check entirely.
  const symbolClaimRegex =
    /(?:fungsi|function|const|let|var|class|komponen|component)\s+([A-Za-z_$][A-Za-z0-9_$]{2,})/gi;
  while ((m = symbolClaimRegex.exec(text)) !== null) {
    claims.push({ type: "symbol_existence", value: m[1], raw: m[0] });
  }

  // PATTERN C — completion/success claims. Includes the active voice ("telah
  // menulis", "berhasil membuat") so a claim like "Saya telah menulis roadmap" is
  // caught — that is precisely the sentence that used to pass while the file
  // contained "undefined". It also tolerates an inserted word, and the
  // active-imperative form alongside the passive and active-progressive — models
  // use all of them interchangeably. The forms matched, verbatim:
  //   "sudah SAYA perbaiki", "perbaiki", "tambahkan", "diperbaiki", "memperbaiki"   (verbatim)
  // the active-imperative form ("perbaiki", "tambahkan") alongside the passive
  // ("diperbaiki") and active-progressive ("memperbaiki") — models use all three
  // interchangeably.
  const EDIT_VERB =
    "(?:menulis|tulis|membuat|buat|menyimpan|simpan|menambahkan|tambahkan|memperbaiki|perbaiki|mengubah|ubah|mengganti|ganti|menghapus|hapus|hilangkan|diperbaiki|diedit|diubah|dihapus|ditambahkan|ditulis|dibuat|disimpan)";
  const completionClaimRegex = new RegExp(
    "(?:sudah|telah)\\s+(?:(?:saya|kami|berhasil)\\s+){0,2}" +
      EDIT_VERB +
      "|(?:fix|edit|updat|creat|writ|sav|delet|remov|add)(?:e)?(?:ed|d)\\s+successfully" +
      "|berhasil\\s+(?:(?:saya|kami)\\s+)?" +
      EDIT_VERB,
    "gi",
  );
  while ((m = completionClaimRegex.exec(text)) !== null) {
    claims.push({ type: "completion_claim", value: m[0], raw: m[0] });
  }

  return claims;
}

/**
 * Cross-reference claims against real tool evidence.
 * Returns: { grounded: [...], hallucinated: [...] }
 */
function crossReferenceWithEvidence(claims, evidenceSet, editLog) {
  const evidenceText = [...evidenceSet].join("\n").toLowerCase();
  const edits = Array.isArray(editLog) ? editLog : [];
  const successfulEdits = edits.filter((e) => e.ok); // tool edit benar-benar sukses
  const substantiveEdits = successfulEdits.filter((e) => e.bytes > 0); // AND wrote real content
  const grounded: any[] = [];
  const hallucinated: any[] = [];

  for (const claim of claims) {
    let verified = false;

    if (claim.type === "file_location") {
      // A file location is grounded if that file was ever read or grepped by a tool
      const fname = claim.value.toLowerCase().replace(/\\/g, "/");
      verified =
        evidenceText.includes(fname) ||
        evidenceText.includes(claim.value.toLowerCase());
    } else if (claim.type === "symbol_existence") {
      // A symbol is grounded if it appears in tool output (grep/read)
      verified = evidenceText.includes(claim.value.toLowerCase());
    } else if (claim.type === "completion_claim") {
      // THE CORE OF THE HARDENING: "an edit happened" != "that edit was correct and
      // meaningful". A completion claim is NOT proven by editCount>0 (writing
      // "undefined" used to pass). Now:
      //   - a deletion claim -> needs at least 1 SUCCESSFUL edit (empty is valid)
      //   - a write/create claim -> needs at least 1 successful edit that WROTE
      //     real content
      const isDeletion = /hapus|hilang|remov|delet/i.test(claim.raw);
      if (isDeletion) {
        verified = successfulEdits.length > 0;
      } else {
        verified = substantiveEdits.length > 0;
      }
    }

    if (verified) {
      grounded.push(claim);
    } else {
      hallucinated.push(claim);
    }
  }

  return { grounded, hallucinated };
}

/**
 * HALLUCINATION GUARD — the main entry point.
 *
 * How it works:
 *   [STAGE 1] No tools ran and no evidence -> PASS (an ordinary conversation)
 *   [STAGE 2] Extract every factual claim from the model's answer
 *   [STAGE 3] Cross-reference each claim against real tool evidence
 *   [STAGE 4] Verdict:
 *             - 0 hallucinated claims -> PASS (a clean answer)
 *             - Some hallucinated, but most grounded -> WARN + strip the false ones
 *             - Mostly hallucinated -> BLOCK (answer rejected, retry needed)
 *
 * @returns {{ pass: boolean, verdict: 'clean'|'warn'|'block', hallucinated: Array, sanitized?: string }}
 */
function hallucinationGuard(text, evidenceSet, editLog) {
  // STAGE 1: bypass only when there is TRULY no tool activity: no read/grep
  // evidence AND no edits. (It used to check evidenceSet alone — a turn that
  // purely edited without reading could slip past with its "done" claim
  // unverified.)
  const hasEdits = Array.isArray(editLog) && editLog.length > 0;
  if ((!evidenceSet || evidenceSet.size === 0) && !hasEdits) {
    return { pass: true, verdict: "clean", hallucinated: [], sanitized: text };
  }

  // TAHAP 2: Ekstrak klaim faktual
  const claims = extractClaims(text);

  // With no factual claims detected the answer is safe (probably general narration)
  if (claims.length === 0) {
    return { pass: true, verdict: "clean", hallucinated: [], sanitized: text };
  }

  // STAGE 3: cross-reference against the evidence
  const { grounded, hallucinated } = crossReferenceWithEvidence(
    claims,
    evidenceSet || new Set(),
    editLog,
  );

  // TAHAP 4: Verdict
  const hallucinationRate = hallucinated.length / claims.length;

  if (hallucinated.length === 0) {
    // Every claim verified
    return { pass: true, verdict: "clean", hallucinated: [], sanitized: text };
  }

  if (hallucinationRate <= 0.4) {
    // A minority hallucinated -> strip the false claims from the text and send the
    // clean version
    let sanitized = text;
    for (const h of hallucinated) {
      // Drop the sentences carrying a hallucinated claim
      const sentenceRegex = new RegExp(
        "[^.!?]*" +
          h.raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
          "[^.!?]*[.!?]?",
        "gi",
      );
      sanitized = sanitized.replace(sentenceRegex, "").trim();
    }
    sanitized = sanitized.replace(/\n{3,}/g, "\n\n").trim();
    return { pass: true, verdict: "warn", hallucinated, sanitized };
  }

  // Most claims unverified -> BLOCK, a retry is needed
  return {
    pass: false,
    verdict: "block",
    hallucinated,
    sanitized: null,
  };
}
// ==================================================================================

// Load the persona text and the principles/architecture/rules block together from
// config. Both are STATIC — and both now live in config/prompts.json (a single
// source of truth) rather than two-thirds hardcoded in this file. What stays in
// code is only the DYNAMIC injection (MODE EFFORT, pre-search, ROUTE) computed at
// run time.
function loadSelfAgentConfig() {
  try {
    const raw = require("fs").readFileSync(PROMPTS_CFG_PATH, "utf8");
    const clean = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
    const sa = JSON.parse(clean).prompts.self_agent;
    let text = (sa.text || "").replace(
      /\[PRECISION RULES - WAJIB DIPATUHI\][\s\S]*?7\..+$/m,
      "",
    );
    return { text, principles: sa.principles || "" };
  } catch (e) {
    return {
      text: "You are WOLFSPACE's assistant. Chat normally or use tools on WOLFSPACE's source code as needed. Answer based on evidence from tools. Do not speculate.",
      principles: "",
    };
  }
}
const _selfCfg = loadSelfAgentConfig();
const SELF_FC_SYS = _selfCfg.text;
const SELF_FC_PRINCIPLES = _selfCfg.principles;

// Session state persists across HITL resumes (keyed by thread_id).
// Also on globalThis: the per-request module reload (see memoriAgen() note above)
// would otherwise wipe this Map between the paused run and its HITL resume.
const _sessionState =
  globalThis.__wolfspaceSessionState ||
  (globalThis.__wolfspaceSessionState = new Map());

// --- PHASED EXECUTION TREE HELPERS ---
// Map a tool name to its execution phase for the visual tree.
function phaseForTool(name) {
  const observe =
    /^(disk_grep|disk_read|disk_glob|disk_list|web_search|web_fetch|glob|grep|read|list|architecture_map|mcp_[a-z0-9_]+)$/i;
  const act =
    /^(edit|write|bash|exec|task|replace_file_content|write_artifact)$/i;
  if (observe.test(name)) return "observe";
  if (act.test(name)) return "act";
  return "observe";
}

// Helper to emit a phase-tree node alongside legacy events.
function makePhaseEmitter(rawEmit) {
  const start = Date.now();
  return function emitPhase(phase, node) {
    rawEmit({
      t: "phase",
      phase,
      time: Date.now() - start,
      status: node.status || "ok",
      ...node,
    });
  };
}

// parsePseudoCalls / stripPseudoTags now live in ./pseudo-tag-filter.cjs (shared with
// chat.ts so the plain-chat path gets the same protection).

// --- LANGGRAPH STATE DEFINITION ---
// An activity summary for the PAUSE message (the step ceiling was reached).
//
// THE PROBLEM FIXED: the pause message used to name only the step number, and the
// file note only appeared when edits > 0. So two very different situations produced
// IDENTICAL sentences:
//   - 14 productive investigation steps, ready to conclude
//   - 14 steps reading the same file in different ways
// The user pays for both, cannot tell them apart, then presses "Continue" which
// blindly adds another 14 steps.
//
// This DELIBERATELY stops nothing. Stopping earlier would mean guessing at
// "progress", and that is semantic — an older version tried it by penalising
// VOLUME and was withdrawn because it killed legitimate tasks (see the note in the
// guard). All that is added here is honest REPORTING: zero false-positive risk,
// because no decision depends on it.
//
// Label precision matters here:
//   callCountsByName  -> total calls per tool (accurate)
//   noProgressBySig   -> how often an identical call returned the same result
//   failedTools       -> the NAMES of tools that have failed, NOT a count
//   failsByName       -> the current CONSECUTIVE failures (reset on success),
//                        so NOT reported as a total

// Turn todowrite todos into checklist lines WITH STATUS.
//
// The status travels with them, not just the text: a checklist re-injected without
// status reads identically at step 1 and step 14, so the model can redo an item it
// already finished. Capped at 12 items so the per-step injection stays cheap —
// todowrite itself is not capped, only this rendering.
const CHECKLIST_MAX_ITEMS = 12;
const _TODO_ICON = {
  completed: "[x]",
  in_progress: "[→]",
  cancelled: "[-]",
  pending: "[ ]",
};

function formatChecklist(todos) {
  if (!Array.isArray(todos)) return [];
  return todos
    .slice(0, CHECKLIST_MAX_ITEMS)
    .map((t) => {
      const text = String((t && t.content) || "").trim();
      if (!text) return null;
      return `${_TODO_ICON[t && t.status] || _TODO_ICON.pending} ${text}`;
    })
    .filter(Boolean);
}

// The unfinished items — used in the pause message so "Continue" names the work
// that is left rather than merely how many steps were spent.
// The item being worked on — the "[→]" marker from todowrite. Tool failures are
// counted against THIS item, because that is the work in progress. With no active
// item a failure cannot be tied to anything and is ignored (the agent may be
// exploring rather than working through the plan).
function itemAktif(checklist) {
  const l = (checklist || []).find((t) => String(t).startsWith("[→]"));
  return l ? String(l).slice(3).trim() : null;
}

// Record a failure against the active item and return a NEW map (the old one is
// not mutated — this state's reducer is "replace wholesale", so an in-place
// mutation would never be seen).
function catatGagalItem(fails, item, sebab) {
  if (!item) return fails || {};
  const lama = (fails || {})[item] || { n: 0, sebab: [] };
  return {
    ...(fails || {}),
    [item]: {
      n: lama.n + 1,
      // Only the last 3 reasons are kept: what the model needs is the PATTERN of
      // failure, not a complete archive — and this checklist is re-injected every
      // step, so its length is directly proportional to token cost.
      sebab: [...lama.sebab, String(sebab || "").slice(0, 120)].slice(-3),
    },
  };
}

// Checklist lines plus failure markers, ready to inject into the system message.
// An item that has failed is shown as "[!] text (gagal N×: reason)" in place of
// "[→]", so the model SEES the blockage instead of having to remember it.
function checklistDenganKegagalan(checklist, fails) {
  const f = fails || {};
  return (checklist || []).map((baris) => {
    const teks = String(baris)
      .replace(/^\[[x→\- ]\]\s*/, "")
      .trim();
    const g = f[teks];
    if (!g || !g.n) return baris;
    return (
      "[!] " +
      teks +
      " (gagal " +
      g.n +
      "×" +
      (g.sebab.length ? ": " + g.sebab[g.sebab.length - 1] : "") +
      ")"
    );
  });
}

function pendingChecklist(checklist) {
  return (checklist || []).filter(
    (l) => !l.startsWith("[x]") && !l.startsWith("[-]"),
  );
}

function describePauseActivity(finalState, sess) {
  const parts: any[] = [];

  const byName = (sess && sess.callCountsByName) || {};
  const names = Object.keys(byName);
  const totalCalls = names.reduce((s, k) => s + (byName[k] || 0), 0);
  if (totalCalls) {
    const top = names
      .sort((a, b) => byName[b] - byName[a])
      .slice(0, 3)
      .map((k) => `${k}×${byName[k]}`)
      .join(", ");
    parts.push(`${totalCalls} panggilan tool (${top})`);
  }

  parts.push(`${finalState.edits || 0} file diedit`);

  const noProg = (sess && sess.noProgressBySig) || {};
  const repeats = Object.values(noProg).reduce(
    (s: number, n: any) => s + (n || 0),
    0,
  );
  if (repeats) parts.push(`${repeats} pengulangan berhasil-sama`);

  const failed = finalState.failedTools;
  const failedNames = failed ? Array.from(failed).slice(0, 3).join(", ") : "";
  if (failedNames) parts.push(`tool bermasalah: ${failedNames}`);

  return parts.join(", ");
}

// The graph state shape is also built WHEN USED: Annotation.Root requires langgraph
// to be loaded, and running it at module scope would undo all the deferral above.
// The result is memoised — the shape never changes within a process, and rebuilding
// it per run only wastes time.
let _bentukState: any = null;
function bentukState() {
  if (_bentukState) return _bentukState;
  const { Annotation } = lg();
  return (_bentukState = Annotation.Root({
    messages: Annotation({
      reducer: (x, y) => x.concat(y),
      default: () => [],
    }),
    step: Annotation({ reducer: (x, y) => y, default: () => 1 }),
    edits: Annotation({ reducer: (x, y) => x + y, default: () => 0 }),
    // Rich edit evidence (not just a count): each entry is {tool, target, ok, bytes}.
    // Used by the hallucination guard to verify a "done" claim against edits that
    // ACTUALLY succeeded and wrote real content, rather than merely a tool having
    // been called.
    editLog: Annotation({ reducer: (x, y) => x.concat(y), default: () => [] }),
    failedTools: Annotation({
      reducer: (x, y) => {
        const set = new Set(x);
        y.forEach((item) => set.add(item));
        return set;
      },
      default: () => new Set(),
    }),
    accessedEvidence: Annotation({
      reducer: (x, y) => {
        const set = new Set(x);
        y.forEach((item) => set.add(item));
        return set;
      },
      default: () => new Set(),
    }),
    fallbackCount: Annotation({ reducer: (x, y) => y, default: () => 0 }),
    forceRetryCount: Annotation({ reducer: (x, y) => y, default: () => 0 }),
    finalSummary: Annotation({ reducer: (x, y) => y, default: () => "" }),
    stopReason: Annotation({ reducer: (x, y) => y, default: () => "" }),
    waitForAnswer: Annotation({ reducer: (x, y) => y, default: () => false }),
    hitlPending: Annotation({ reducer: (x, y) => y, default: () => false }),
    hitlApproved: Annotation({ reducer: (x, y) => y, default: () => false }),
    pendingToolCall: Annotation({ reducer: (x, y) => y, default: () => null }),
    pendingToolCalls: Annotation({ reducer: (x, y) => y, default: () => [] }),
    task_checklist: Annotation({ reducer: (x, y) => y, default: () => [] }),
    // PER-ITEM checklist failures: { "<item text>": { n, sebab: [...] } }.
    // Separate from failedTools (which records TOOL NAMES, not which piece of work
    // is stuck). This is what carries failures into the ground-truth anchor.
    checklistFails: Annotation({ reducer: (x, y) => y, default: () => ({}) }),
    // How many times the run has been nudged onward because the model closed its
    // turn with text while the checklist was still open. Counted SEPARATELY from
    // forceRetryCount: that counter is already shared by three other gates (tool
    // evidence, reasoning-without-answer, the hallucination guard), so riding along
    // there would let this nudge run out of budget for entirely unrelated reasons.
    continueNudge: Annotation({ reducer: (x, y) => y, default: () => 0 }),
    // The step ceiling for this turn. 0 = use the default MAX_STEPS. When the user
    // chooses "continue" after a budget pause the ceiling is EXTENDED (not reset),
    // which turns the step limit into a "still going?" checkpoint rather than a
    // cliff that fails the run.
    stepCeiling: Annotation({ reducer: (x, y) => y, default: () => 0 }),
  }));
}

/**
 * Self‑agent loop – operates on WOLFSPACE's own source code via function‑calling tools.
 * @param {Object} opts - {history, port, cloud}
 * @param {function(Object):void} emit - event emitter (e.g. SSE writer)
 * @param {Object} ctl - {isCancelled, setCurReq, depth}
 */
async function selfAgentStream(payload, emit, ctl: any = {}) {
  let {
    history,
    port,
    cloud,
    thread_id,
    hitl_response,
    continue_response,
    workspace_root,
  } = payload;
  thread_id =
    thread_id ||
    "thread_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
  // ── Per-workspace confinement (ww) ──
  // When the payload names an active folder, every file mutation (broker) and bash
  // (Docker) call the agent makes is confined to that folder via
  // context.workspaceRoot. Validated: it must be a directory that really exists;
  // otherwise the agent runs normally (unconfined).
  let _wsRoot: any = null;
  if (workspace_root) {
    try {
      const _rp = path.resolve(workspace_root);
      const _st = require("fs").statSync(_rp);
      if (_st.isDirectory()) _wsRoot = _rp;
    } catch (_) {
      _wsRoot = null;
    }
  }
  // Load the findings journal once per run. This is what carries knowledge across a
  // process RESTART — the part the checklist does not give, because its checkpoint
  // uses MemorySaver, which dies with the process.
  try {
    const _t = require("./temuan.ts");
    const _n = _t.muat(_t.kunciWs(_wsRoot));
    if (_n) dlog("self", "info", "temuan dimuat", { berkas: _n });
  } catch (_) {}

  const agentCtx = { sessionId: thread_id, workspaceRoot: _wsRoot };
  if (_wsRoot)
    emit({
      t: "act",
      kind: "workspace",
      arg: _wsRoot,
      ok: true,
      output: "🔒 agent terkurung ke workspace: " + _wsRoot,
    });
  const isCancelled = ctl.isCancelled || (() => false);
  const setCurReq = ctl.setCurReq || (() => {});
  const depth = ctl.depth || 0;
  const MAX_DEPTH = 3;
  let finalSummary = "";
  const emitPhase = makePhaseEmitter(emit);
  const failedProviders: any[] = []; // Track providers that already failed so the fallback does not ping-pong
  loadCloudKeys(); // ensure keys are loaded
  fillCloudKey(cloud);

  // Resolve a cloud model if none provided (pick first available key from clientKeys or CLOUD_KEYS)
  if (!(cloud && cloud.key)) {
    const availableKeys =
      cloud && cloud.clientKeys
        ? { ...CLOUD_KEYS, ...cloud.clientKeys }
        : CLOUD_KEYS;
    const prov = Object.keys(availableKeys).find(
      (p) =>
        availableKeys[p] &&
        (typeof availableKeys[p] === "string"
          ? availableKeys[p]
          : availableKeys[p].key),
    );
    if (prov) {
      const kObj = availableKeys[prov];
      cloud = {
        provider: prov,
        key: typeof kObj === "string" ? kObj : kObj.key,
        model: typeof kObj === "object" ? kObj.model : undefined,
        baseUrl: typeof kObj === "object" ? kObj.baseUrl : undefined,
        clientKeys: cloud ? cloud.clientKeys : undefined,
      };
    }
  }
  if (!(cloud && cloud.key)) {
    dlog("self", "info", "stop", { reason: "no_cloud_key", depth });
    emit({
      t: "err",
      m: "Self-agent butuh model cloud yang kuat. Simpan API key di menu API Key dulu (model lokal 3B tidak sanggup mengedit source dengan aman).",
    });
    return finalSummary;
  }

  // If using a local endpoint we just do a normal chat (no tool calls)
  if (cloud.baseUrl && /(127\.0\.0\.1|localhost)/.test(cloud.baseUrl)) {
    emit({ t: "step", n: 1 });
    let full = "";
    try {
      await askCloudStream(
        cloud,
        history || [],
        (t) => {
          full += t;
          emit({ t: "tok", c: t });
        },
        (r) => setCurReq(r),
      );
      if (!isCancelled()) {
        finalSummary = full;
        emit({ t: "adone", steps: 1, edits: 0, summary: full });
      }
    } catch (e) {
      if (!isCancelled()) emit({ t: "err", m: e.message });
    }
    dlog("self", "info", "stop", {
      reason: "local_base_fallback",
      depth,
      chars: full.length,
    });
    return finalSummary;
  }

  let sessionSnapshotId: any = null;
  const { rollback } = require("./snapshot.ts");
  // ASYNCHRONOUS, and deliberately so. In Electron mode the whole agent run happens
  // inside the MAIN process — the owner of BrowserWindow and the pump for the
  // Windows message queue. A synchronous qBackup() copies ~112 files with
  // copyFileSync (measured at 285-365 ms of full blocking, ~1.8 s on a cold cache);
  // for that whole time the window pumps no messages. The async version copies with
  // bounded parallelism and yields the event loop in between.
  //
  // Both callers are in async functions, immediately before `await runSelfTool`, so
  // awaiting here changes no ordering: the backup still completes BEFORE the first
  // editing tool runs — which is the actual guarantee.
  const ensureBackup = async () => {
    if (!sessionSnapshotId) {
      sessionSnapshotId = qBackupAsync ? await qBackupAsync() : qBackup();
      if (sessionSnapshotId) {
        emit({ t: "backup", dir: sessionSnapshotId });
        dlog("self", "info", "self-agent edit start", {
          backup: sessionSnapshotId,
        });
      }
    }
  };

  // Use DSpy-optimized system prompt if cached, else use original
  let optPrompt = getOptimized();
  if (optPrompt) {
    dlog("self", "info", "using optimized system prompt", {
      originalChars: SELF_FC_SYS.length,
      optimizedChars: optPrompt.length,
    });
  }
  const currentSysPrompt = optPrompt || SELF_FC_SYS;

  // Token context limit mapping, message-history slicing, and the instructions that
  // go with the chosen effort mode
  const effortLevel =
    cloud && typeof cloud.effort !== "undefined"
      ? Number(cloud.effort)
      : typeof payload.effort !== "undefined"
        ? Number(payload.effort)
        : 1;
  const effortMaxTurns = effortLevel === 0 ? 6 : effortLevel === 2 ? 40 : 16;
  const effortTokenBudget =
    effortLevel === 0 ? 1024 : effortLevel === 2 ? 16384 : 4096;
  const effortModeName =
    effortLevel === 0 ? "LOW" : effortLevel === 2 ? "HIGH" : "MEDIUM";

  const slicedHistory =
    history && Array.isArray(history) ? history.slice(-effortMaxTurns) : [];
  const messages = [
    { role: "system", content: currentSysPrompt },
    ...slicedHistory,
  ];
  // The STATIC block (PRINCIPLES/MAP/RULES) now comes from config
  // (SELF_FC_PRINCIPLES) rather than being hardcoded. All the code adds is the
  // DYNAMIC EFFORT MODE (its value computed from effortLevel at run time). The final
  // assembly is byte-identical to the old version.
  messages[0].content +=
    "\n\n" +
    SELF_FC_PRINCIPLES +
    `

[MODE EFFORT AKTIF: ${effortModeName} (Context Token Budget: ~${effortTokenBudget} tokens | History Limit: ${effortMaxTurns} msgs)]
${effortLevel === 0 ? "Fokus pada penyelesaian cepat dan hemat token. Jawab langsung ke inti." : effortLevel === 2 ? "Fokus pada analisis mendalam, RCA secara kritis, dan verifikasi silang semua bukti." : "Lakukan investigasi standar secara terukur."}`;
  const MAX_STEPS = effortLevel === 0 ? 6 : effortLevel === 2 ? 20 : 14;
  let edits = 0;
  // The Mermaid diagram from architecture_map: THE DIAGRAM IS the answer. The prompt
  // tells the model to be brief and not to copy tool output, so it often does not
  // attach the mermaid block. The last block is kept and appended automatically at
  // finalisation when the summary does not carry it — so the diagram always renders,
  // without depending on the model complying.
  let lastArchMermaid: any = null;
  let fallbackCount = 0;
  let forceRetryCount = 0;
  // Session state persists across HITL resumes (keyed by thread_id)
  if (!_sessionState.has(thread_id)) {
    // Clear stale sessions (finished or abandoned threads) — without this the map
    // grows without bound and an old counter can poison a thread resumed much later.
    try {
      const _now = Date.now();
      for (const [k, v] of _sessionState) {
        if (_now - (v.ts || 0) > 2 * 3600e3) {
          _sessionState.delete(k);
          // Clear the in-memory LangGraph checkpoints too.
          //
          // Read from globalThis DIRECTLY rather than through memoriAgen(): if the
          // agent has never run in this process there is no checkpointer yet, and
          // nothing to clear. Calling the factory here would load langgraph purely
          // to clean up something empty — exactly the cost being avoided.
          try {
            const mem = globalThis.__wolfspaceAgentMemory;
            if (
              mem &&
              mem.checkpoints &&
              typeof mem.checkpoints.delete === "function"
            ) {
              for (const [key] of mem.checkpoints)
                if (key.includes(k)) mem.checkpoints.delete(key);
            }
            if (
              mem &&
              mem.storage &&
              typeof mem.storage.delete === "function"
            ) {
              for (const [key] of mem.storage)
                if (key.includes(k)) mem.storage.delete(key);
            }
          } catch (e) {}
        }
      }
    } catch (_) {}
    _sessionState.set(thread_id, {
      ts: Date.now(),
      callCounts: {},
      callCountsByName: {},
      editFailCount: 0,
      grepReadSteps: 0,
      lastReadFile: null,
      readFileCount: 0,
      // Detect STAGNATION (not volume): the last output per signature plus a count
      // of identical results, and consecutive failures per tool name (reset on
      // success).
      lastOutBySig: {},
      noProgressBySig: {},
      failsByName: {},
    });
  }
  const sess = _sessionState.get(thread_id);
  sess.ts = Date.now();
  if (!sess.lastOutBySig) {
    sess.lastOutBySig = {};
    sess.noProgressBySig = {};
    sess.failsByName = {};
  }
  const callCounts = sess.callCounts;
  const callCountsByName = sess.callCountsByName;
  let editFailCount = sess.editFailCount || 0;
  let grepReadSteps = sess.grepReadSteps;
  let lastReadFile = sess.lastReadFile;
  let readFileCount = sess.readFileCount;
  const _TRANSIENT_SELF =
    /ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|timeout|EAI_AGAIN|network|ECONNREFUSED|ENOTFOUND|503|404|429|403|401|RegionError|too busy|Service Unavailable|service_unavailable|Rate limit|FreeUsageLimit|insufficient_quota/i;

  // Load MCP tools dynamically
  //
  // getTools() holds up the FIRST STEP of the run, before any other event is sent.
  // Each MCP server's handshake may take up to HANDSHAKE_TIMEOUT_MS (60 s in
  // mcp-client.ts) before giving up, and this was measured directly: one run sat
  // silent for a full 60.3 seconds here while two servers (figma, github) timed out
  // together — with no sign at all to the user that the agent was still alive. The
  // heartbeat below matches the existing model_wait pattern, so the frontend needs
  // no new event type to show it.
  const mcpClient = require("./mcp-client.ts");
  let currentTools = [...SELF_TOOLS];
  try {
    const _mcpT0 = Date.now();
    emit({ t: "model_wait", m: "Preparing MCP connection…" });
    const _mcpHb = setInterval(() => {
      emit({
        t: "model_wait",
        m:
          "Masih menyiapkan MCP (" +
          Math.round((Date.now() - _mcpT0) / 1000) +
          "s)…",
      });
    }, 10000);
    let mcpTools;
    try {
      mcpTools = await mcpClient.getTools();
    } finally {
      clearInterval(_mcpHb);
    }
    if (mcpTools.length > 0) {
      currentTools = currentTools.concat(mcpTools);
      // HARDCODED RULE: filter web_search/web_fetch dynamically when the query is
      // about MCP
      const lastMsg =
        history && history.length > 0
          ? history[history.length - 1].content
          : "";
      const mcpToolKeywords = mcpTools
        .map((t) =>
          t.function.name.replace(/^mcp_[^_]+_/, "").replace(/_/g, "|"),
        )
        .join("|");
      const baseKeywords =
        "mcp|database|sql|query|api|data|server|github|repo|issue|commit|pull request";
      const isMcpQuery = new RegExp(
        `${baseKeywords}${mcpToolKeywords ? "|" + mcpToolKeywords : ""}`,
        "i",
      ).test(lastMsg);
      const isGeneralQuery =
        /apa itu|siapa|cara|bagaimana|contoh|cari|google|web/i.test(lastMsg);

      if (isMcpQuery && !isGeneralQuery) {
        currentTools = currentTools.filter(
          (t) =>
            t.function.name !== "web_search" && t.function.name !== "web_fetch",
        );
        dlog(
          "self",
          "info",
          "Hardcode: web_search dinonaktifkan karena tugas MCP terdeteksi.",
        );
      }

      // Inject MCP awareness into the model's system prompt
      messages[0].content +=
        "\n\n[CRITICAL MCP RULE]: Anda terhubung ke MCP. Prioritaskan alat 'mcp_'.";
    }
  } catch (e) {
    dlog("self", "warn", "Gagal memuat tools MCP", { error: e.message });
  }

  // --- INJEKSI CHAIN-OF-THOUGHT (CoT) ---
  // Inject rencana_tindakan for all tools: required for modifying tools, optional for read-only.
  const READ_ONLY_TOOLS = [
    "grep",
    "read",
    "glob",
    "list",
    "architecture_map",
    "web_search",
    "web_fetch",
    "question",
    "todowrite",
    "skill_list",
    "terminal_read",
  ];
  currentTools = currentTools.map((t) => {
    const newTool = JSON.parse(JSON.stringify(t));
    const isReadOnly = READ_ONLY_TOOLS.includes(t.function.name);
    if (!newTool.function.parameters)
      newTool.function.parameters = { type: "object", properties: {} };
    if (!newTool.function.parameters.properties)
      newTool.function.parameters.properties = {};
    newTool.function.parameters.properties.rencana_tindakan = {
      type: "string",
      description: isReadOnly
        ? "(OPTIONAL) Max 5 words describing this tool's intent."
        : "(REQUIRED) One SHORT sentence — what this tool does.",
    };
    if (!isReadOnly) {
      if (!newTool.function.parameters.required)
        newTool.function.parameters.required = [];
      if (!newTool.function.parameters.required.includes("rencana_tindakan")) {
        newTool.function.parameters.required.push("rencana_tindakan");
      }
    }
    return newTool;
  });

  try {
    // THIS is where langgraph finally loads — on the first agent call, not when the
    // application opens. Every symbol is taken once, in one place, so the loading
    // path stays plain to see.
    const { StateGraph, START, END } = lg();
    const workflow = new StateGraph(bentukState())
      .addNode("planner", async (state) => {
        emit({ t: "step", n: state.step });
        emit({
          t: "act",
          kind: "planner",
          arg: "Menyusun rencana...",
          ok: true,
          output: "Sedang membuat checklist singkat",
        });
        const lastMsg = state.messages[state.messages.length - 1];
        const prompt = `Anda adalah AI Planner. Berdasarkan permintaan user, buat checklist SANGAT SINGKAT (maksimal 3 langkah). Tiap langkah di baris baru diawali "- ". JANGAN detail — langsung ke inti tugas. Jangan tambahkan teks lain.\n\nPermintaan: ${lastMsg.content}`;
        // The planner is not a step that may kill the run: its checklist is only a
        // convenience (the executor runs the same without it — see the "Jalankan
        // tugas user." fallback below). Before there was a provider fallback here, a
        // single dead key in first position (github 401, say) killed the ENTIRE run
        // 1-2 seconds in — before the executor even got to try its own provider.
        // Verified on a real run: 8 of the 10 keys in CLOUD_KEYS were dead when
        // measured.
        const _planTried: any[] = [];
        let _planCloud = cloud;
        let reply: any = null;
        for (let _t = 0; _t < 4; _t++) {
          try {
            reply = await askCloudTools(
              _planCloud,
              [{ role: "user", content: prompt }],
              [],
            );
            if (_planCloud !== cloud) {
              cloud = _planCloud; // the live provider is used by the executor too
              dlog("self", "info", "planner fallback established", {
                provider: cloud.provider,
              });
            }
            break;
          } catch (e) {
            dlog("self", "warn", "planner_request_failed", {
              provider: _planCloud.provider,
              error: ((e && e.message) || "").slice(0, 120),
            });
            if (!_TRANSIENT_SELF.test((e && e.message) || "")) break;
            _planTried.push(_planCloud.provider);
            const fb = Object.keys(CLOUD_KEYS).find(
              (p) =>
                !_planTried.includes(p) && CLOUD_KEYS[p] && CLOUD_KEYS[p].key,
            );
            if (!fb) break;
            _planCloud = {
              provider: fb,
              key: CLOUD_KEYS[fb].key,
              model: CLOUD_KEYS[fb].model,
              baseUrl: CLOUD_KEYS[fb].baseUrl,
            };
            fillCloudKey(_planCloud);
          }
        }
        const lines = reply
          ? (reply.content || "")
              .split("\n")
              .filter((l) => l.trim().startsWith("-"))
              .map((l) => l.trim().replace(/^- /, ""))
          : [];
        if (lines.length === 0) lines.push("Jalankan tugas user.");
        emit({
          t: "act",
          kind: "planner",
          arg: "Rencana selesai",
          ok: true,
          output: lines.slice(0, 3).join("\n"),
        });
        return { task_checklist: lines.slice(0, 3) };
      })
      .addNode("executor", async (state) => {
        if (isCancelled()) return { stopReason: "cancelled" };

        // HITL Resume (in-graph path): if there are pending tool calls, inject them as an assistant message
        // so the tools node re-runs them with hitlApproved=true.
        const pendingInGraph =
          state.pendingToolCalls && state.pendingToolCalls.length > 0
            ? state.pendingToolCalls
            : state.pendingToolCall
              ? [state.pendingToolCall]
              : [];
        if (state.hitlApproved && pendingInGraph.length > 0) {
          emit({ t: "step", n: state.step });
          emit({
            t: "act",
            kind: "hitl_approved",
            arg: pendingInGraph.map((tc) => tc.function.name).join(", "),
            ok: true,
            output: "Diizinkan oleh user ✔",
          });
          const approvedMsg = {
            role: "assistant",
            content: null,
            tool_calls: pendingInGraph,
          };
          // Clear pending tools so it doesn't loop
          return {
            messages: [approvedMsg],
            pendingToolCall: null,
            pendingToolCalls: [],
            stopReason: "",
          };
        }

        emit({ t: "step", n: state.step });

        const activeMessages = [...state.messages];
        if (state.task_checklist && state.task_checklist.length > 0) {
          const sysMsg = { ...activeMessages[0] };
          // Lines from todowrite already carry status ("[x] ...", "[→] ..."); lines
          // from the planner are still bare. Prefix "- " ONLY on the bare ones so
          // both read consistently without damaging the status markers.
          const hasStatus = state.task_checklist.some((t) =>
            /^\[[x→\- ]\] /.test(t),
          );
          // Failures are injected here too, not left only in conversation history:
          // this is what makes "already tried and failed" part of the ground truth
          // rather than something the model has to remember.
          const barisChecklist = checklistDenganKegagalan(
            state.task_checklist,
            state.checklistFails,
          );
          const adaGagal = barisChecklist.some((t) => t.startsWith("[!]"));
          sysMsg.content +=
            "\n\n[TASK CHECKLIST AKTIF]:\n" +
            barisChecklist
              .map((t) => (/^\[[x→\-! ]\] /.test(t) ? t : "- " + t))
              .join("\n") +
            (adaGagal
              ? "\nItem [!] SUDAH DICOBA dan gagal. JANGAN ulangi pendekatan yang sama — ganti cara, atau jelaskan ke user kenapa item itu tak bisa diselesaikan."
              : "") +
            (hasStatus
              ? "\nIni status TERKINI, bukan rencana awal. JANGAN kerjakan ulang item [x]. Kerjakan item [→], lalu lanjut ke [ ] berikutnya, dan perbarui lewat todowrite setiap kali status berubah."
              : "\nFokus selesaikan item di atas secara berurutan dengan menggunakan tools.");
          activeMessages[0] = sysMsg;
        }

        // FINDINGS: what is already KNOWN, not what is left to do.
        //
        // The checklist above keeps the agent remembering its TASK. This block keeps
        // it remembering its KNOWLEDGE — two different things, of which only one was
        // ever guarded.
        //
        // Measured in a real run ledger (pid 12932): 246 actions for 22 unique
        // commands, with index.html read 13 times and app.js 12 times. The longest
        // consecutive repeat was only 4, so this was not a loop — it was
        // history.slice(-16) discarding `read` results (their content is the longest,
        // so they are trimmed first), leaving the agent unaware it had read them.
        try {
          const _temuan = require("./temuan.ts");
          const _blok = _temuan.blokPrompt(_temuan.kunciWs(_wsRoot));
          if (_blok) {
            const m = { ...activeMessages[0] };
            m.content += _blok;
            activeMessages[0] = m;
          }
        } catch (_) {
          // A failure to remember must not stop the run: without this block the agent
          // falls back to the old behaviour rather than failing.
        }

        let msg;
        // OBSERVABILITY for the model call. There used to be NO trace at all when a
        // request began — even though cloud.ts allows a 600000 ms (10 MINUTE)
        // timeout. So the agent could sit silent for a quarter of an hour with the
        // log carrying nothing but renderer noise, making "stuck" impossible to tell
        // apart from "waiting on the model". This really happened: after pulling 4
        // Notion pages the context ballooned and the run stopped without a single
        // event. Log the START (with the context size) and the END (with the
        // duration), and tell the UI, so the user knows they are waiting rather than
        // hung.
        const _askT0 = Date.now();
        const _ctxChars = activeMessages.reduce(
          (n, m) => n + String((m && m.content) || "").length,
          0,
        );
        dlog("self", "info", "model_request_start", {
          step: state.step,
          provider: cloud && cloud.provider,
          messages: activeMessages.length,
          ctxChars: _ctxChars,
          tools: currentTools.length,
        });
        emit({
          t: "model_wait",
          m: "Waiting for the model…",
          ctxChars: _ctxChars,
        });
        const _hbInterval = setInterval(() => {
          emit({
            t: "model_wait",
            m:
              "Masih menunggu jawaban model (" +
              Math.round((Date.now() - _askT0) / 1000) +
              "s)…",
            ctxChars: _ctxChars,
          });
        }, 10000);
        try {
          msg = await askCloudTools(cloud, activeMessages, currentTools);
          clearInterval(_hbInterval);
          dlog("self", "info", "model_request_done", {
            step: state.step,
            ms: Date.now() - _askT0,
            contentChars: String((msg && msg.content) || "").length,
            reasoningChars: String((msg && msg.reasoning) || "").length,
            toolCalls: (msg && msg.tool_calls && msg.tool_calls.length) || 0,
          });
        } catch (e) {
          clearInterval(_hbInterval);
          dlog("self", "error", "model_request_failed", {
            step: state.step,
            ms: Date.now() - _askT0,
            error: ((e && e.message) || "").slice(0, 120),
          });
          if (
            _TRANSIENT_SELF.test(e.message || "") &&
            state.fallbackCount < 3
          ) {
            failedProviders.push(cloud.provider);
            const fb = Object.keys(CLOUD_KEYS).find(
              (p) =>
                !failedProviders.includes(p) &&
                CLOUD_KEYS[p] &&
                CLOUD_KEYS[p].key,
            );
            if (fb) {
              dlog("self", "warn", "provider fallback", {
                from: cloud.provider,
                to: fb,
                error: e.message.slice(0, 100),
              });
              emit({
                t: "err",
                m:
                  cloud.provider +
                  " gagal: " +
                  e.message.slice(0, 80) +
                  " — beralih ke " +
                  fb,
              });
              cloud = {
                provider: fb,
                key: CLOUD_KEYS[fb].key,
                model: CLOUD_KEYS[fb].model,
                baseUrl: CLOUD_KEYS[fb].baseUrl,
              };
              fillCloudKey(cloud);
              return { fallbackCount: state.fallbackCount + 1 };
            }
          }
          dlog("self", "info", "stop", {
            reason: "askCloudTools_error",
            step: state.step,
            error: ((e && e.message) || "").slice(0, 100),
          });
          emit({ t: "err", m: e.message });
          return {
            stopReason: "error",
            finalSummary: _ringkasGagalCloud(
              cloud && cloud.provider,
              e,
              failedProviders,
            ),
          };
        }
        if (isCancelled()) return { stopReason: "cancelled_after_tools" };

        // ── An EMPTY response means a broken provider, not a model that "finished" ──
        //
        // Some providers answer HTTP 200 with a well-formed but EMPTY body: no
        // content, no reasoning, no tool_calls. Because it is not an error it never
        // matched _TRANSIENT_SELF, so the provider fallback already present in the
        // catch block above never fired — even though the consequence is the same as
        // a 502: that turn simply vanishes.
        //
        // Measured on a real GLM-5.2 run through the opencode provider: 5 of 6 calls
        // returned 0/0/0, and the run died at step 2 with the message below — which
        // blames the model when it was the channel that failed.
        //
        //   "(tidak ada respons dari model)"   (verbatim: the string emitted)
        // model)" — a message that blames the model when it was the channel that
        // failed.
        //
        // Treated exactly like a transient failure: switch provider, bounded by the
        // same fallbackCount, and reported to the user.
        if (
          !msg.content &&
          !msg.reasoning &&
          !(msg.tool_calls && msg.tool_calls.length) &&
          state.fallbackCount < 3
        ) {
          failedProviders.push(cloud.provider);
          const fbHampa = Object.keys(CLOUD_KEYS).find(
            (p) =>
              !failedProviders.includes(p) &&
              CLOUD_KEYS[p] &&
              CLOUD_KEYS[p].key,
          );
          if (fbHampa) {
            dlog("self", "warn", "provider fallback (respons hampa)", {
              from: cloud.provider,
              to: fbHampa,
              step: state.step,
            });
            emit({
              t: "err",
              m:
                cloud.provider +
                " membalas kosong (tanpa teks/tool) — beralih ke " +
                fbHampa,
            });
            cloud = {
              provider: fbHampa,
              key: CLOUD_KEYS[fbHampa].key,
              model: CLOUD_KEYS[fbHampa].model,
              baseUrl: CLOUD_KEYS[fbHampa].baseUrl,
            };
            fillCloudKey(cloud);
            return { fallbackCount: state.fallbackCount + 1 };
          }
        }

        // Reasoning can leak by two routes: tucked inside content (a <think> tag
        // from cloud.ts or the model), or the model spending its whole turn ONLY
        // thinking (content empty, the reasoning field filled). Clean up the first;
        // for the second, push the model to answer again rather than showing the
        // user its internal monologue.
        if (msg.content) msg.content = stripThinkBlocks(msg.content);
        if (
          !msg.content &&
          !(msg.tool_calls && msg.tool_calls.length) &&
          msg.reasoning
        ) {
          if (state.forceRetryCount < 3) {
            emit({
              t: "force_retry",
              m: "Model hanya berpikir tanpa jawaban final — meminta ulang...",
            });
            return {
              messages: [
                {
                  role: "user",
                  content:
                    "Kamu berhenti di tengah proses berpikir tanpa memberikan jawaban final. JANGAN menarasikan rencana atau simulasi. Langsung PANGGIL tool yang dibutuhkan (bash/read/grep/edit) atau berikan jawaban final yang singkat.",
                },
              ],
              forceRetryCount: state.forceRetryCount + 1,
            };
          }
          // SALVAGE the reasoning content — BUT with a label that matches what it
          // actually is.
          //
          // The reason for salvaging still stands: sometimes the answer really is in
          // the reasoning monologue, it just never got moved into content, and
          // discarding it means discarding work already paid for.
          //
          // WHAT WAS FIXED: anything salvaged used to be labelled "berikut
          // WHAT WAS FIXED: anything salvaged used to be given the conclusion label below
          // — including when all that was recovered was the last paragraph. Half-finished
          // recovered was the last paragraph. Half-finished working notes were
          // therefore presented as the result. Seen directly on the user's screen: a
          // language->icon mapping list, cut off mid-way, served as if it were the
          // answer.
          //
          // The label now follows the kind, and pure working notes are not shown at
          // all — better to admit there is no answer than to hand over something
          // that looks like one.
          const salvaged = salvageReasoning(msg.reasoning);
          if (salvaged.jenis === "kesimpulan") {
            msg.content =
              "_(Model tidak menutup jawabannya; berikut kesimpulan dari proses berpikirnya.)_\n\n" +
              salvaged.teks;
          } else if (salvaged.jenis === "catatan") {
            msg.content =
              "_(Model tidak memberikan jawaban final. Berikut CATATAN TERAKHIR dari proses berpikirnya — ini bukan kesimpulan, dan mungkin belum selesai.)_\n\n" +
              salvaged.teks;
          } else {
            msg.content =
              "(Model tidak memberikan jawaban final, dan proses berpikirnya tidak memuat kesimpulan yang bisa dipakai. Coba jalankan ulang, atau persempit permintaannya.)";
          }
          dlog("self", "info", "reasoning_salvage", {
            step: state.step,
            jenis: salvaged.jenis,
            reasoningChars: String(msg.reasoning || "").length,
            salvagedChars: salvaged.teks ? salvaged.teks.length : 0,
          });
        }

        let calls =
          msg.tool_calls && msg.tool_calls.length ? msg.tool_calls : null;
        if (!calls) {
          const pseudo = parsePseudoCalls(msg.content || "");
          if (pseudo.length) {
            calls = pseudo.map((c, i) => ({
              id: "call_" + state.step + "_" + i,
              type: "function",
              function: { name: c.name, arguments: JSON.stringify(c.args) },
            }));
            msg.tool_calls = calls;
          }
        }
        // Safety net: whether or not a call parsed, never let a raw <function...> tag
        // (unclosed, unknown dialect, malformed JSON) reach the user as visible text.
        if (msg.content && !calls) {
          const safe = stripPseudoTags(msg.content);
          if (safe) emit({ t: "tok", c: safe });
        }
        return { messages: [msg] };
      })
      .addNode("tools", async (state) => {
        const msg = state.messages[state.messages.length - 1];
        const calls = msg.tool_calls || [];

        let localEdits = 0;
        const localAccessed = new Set();
        const localFailed = new Set();
        const localEditLog: any[] = [];
        // Failures are tied to the checklist ITEM being worked on, not to the tool
        // name. Collected here, then counted once at the end of the step.
        const itemSedangDikerjakan = itemAktif(state.task_checklist);
        const sebabGagalLangkahIni: any[] = [];

        const runOne = async (tc) => {
          let args: any = {};
          const rawArgs = tc.function.arguments || "";
          if (rawArgs.trim()) {
            try {
              args = JSON.parse(rawArgs);
            } catch (e) {
              // The argument JSON failed to parse (large truncated content, for
              // instance). Do NOT run the tool with empty args — that is what made
              // write_artifact write "undefined" and then report success (a
              // hallucination). Return an error so the model resends valid, compact
              // JSON.
              const out = `[ERROR: argumen untuk tool "${tc.function.name}" bukan JSON valid (kemungkinan terpotong). JANGAN anggap berhasil. Kirim ulang pemanggilan dengan JSON yang benar; untuk konten panjang, persingkat. Detail: ${(e.message || "").slice(0, 80)}]`;
              emit({
                t: "act",
                kind: tc.function.name,
                arg: "",
                ok: false,
                output: out,
              });
              return { out };
            }
          }

          // Emit thought only when this tool actually executes
          if (args.rencana_tindakan) {
            emit({
              t: "thought",
              c: args.rencana_tindakan,
              tool: tc.function.name,
              ok: true,
              ts: Date.now(),
            });
          }

          const sig = tc.function.name + "|" + (tc.function.arguments || "");
          callCounts[sig] = (callCounts[sig] || 0) + 1;
          // Per-name counter: used for the soft NOTICE and the backstop, NOT for a
          // hard stop.
          callCountsByName[tc.function.name] =
            (callCountsByName[tc.function.name] || 0) + 1;
          // GUARD PRINCIPLE: punish STAGNATION, not VOLUME. It used to be: >3
          // identical calls or >5 calls per name = a hard stop EVEN WHEN ALL
          // SUCCEEDED — which killed legitimate multi-step tasks (6 different bash
          // commands; `npm test` 4 times through an edit->test cycle). A hard stop
          // now comes only from the POST-execution detection below (a repeated
          // identical result, or consecutive failures; success resets it). All that
          // is left here is an absolute backstop for an infinite loop whose output
          // always changes (a timestamp, say) and so escapes stagnation detection.
          if (callCounts[sig] > 8) {
            dlog("hard-stop repeated_call_backstop", {
              sig: sig.slice(0, 140),
            });
            return {
              stop: true,
              stopNote:
                "tool «" +
                tc.function.name +
                "» dipanggil dengan argumen identik " +
                callCounts[sig] +
                "x (arg: " +
                (tc.function.arguments || "").slice(0, 80) +
                "…)",
            };
          }
          const isReadOnlyTool =
            /^(disk_grep|disk_read|disk_glob|disk_list|web_search|web_fetch|glob|grep|read|list|architecture_map|terminal_read|skill_list|mcp_[a-z0-9_]+)$/i.test(
              tc.function.name,
            );

          if (
            /^(edit|write|replace_file_content|write_artifact)$/i.test(
              tc.function.name,
            )
          )
            await ensureBackup();
          if (tc.function.name === "bash") {
            emit({
              t: "act",
              kind: "bash",
              arg: args.command || "",
              ok: true,
              output: "⟳ running…",
            });
          }
          const r = await runSelfTool(tc.function.name, args, emit, agentCtx);
          // Increment BOTH: localEdits feeds graph state; the outer `edits` is what
          // the catch-block's rollback guard reads — without this it stays 0 forever
          // and a crash after successful edits would always roll them back.
          if (r.edited) {
            localEdits++;
            edits++;
          }
          if (tc.function.name === "architecture_map" && r.ok) {
            const mm = (r.output || "").match(/```mermaid[\s\S]*?```/);
            if (mm) lastArchMermaid = mm[0];
          }
          // Record rich edit evidence for the hallucination guard: whether the edit
          // tool actually SUCCEEDED (ok) and how many bytes of content it wrote.
          // "undefined" or empty content -> 0 bytes -> cannot support a "written"
          // claim.
          if (
            /^(edit|write|replace_file_content|write_artifact)$/i.test(
              tc.function.name,
            )
          ) {
            const written =
              args.content != null
                ? String(args.content)
                : args.new_string != null
                  ? String(args.new_string)
                  : "";
            localEditLog.push({
              tool: tc.function.name,
              target: String(args.path || args.filename || args.title || ""),
              ok: !!r.ok,
              bytes: written.trim().length,
            });
          }
          if (
            r.output &&
            typeof r.output === "string" &&
            r.output.length > 1500
          ) {
            r.output =
              r.output.slice(0, 1500) +
              "\n... [TRUNCATED] (Output too long, please use specific filters if needed)";
          }
          // Only SUBSTANTIVE tool output counts as evidence. An empty result,
          // "(no matching file)", or "(ok)" proves nothing; counting them would make
          // hasValidEvidence force the answer to "quote" that absence, and for a
          // general-knowledge question the model would then dodge ("silakan minta
          // saya membuat file...") instead of answering from what it knows.
          const _outStr = (r.output || "").trim();
          const _nonSubstantive = _penjagaAgent.takSubstantif(_outStr);
          if (r.ok && !_nonSubstantive) localAccessed.add(r.output);
          if (
            !r.ok &&
            SYSTEM_RULES.REQUIRED_TOOL_SEQUENCE.includes(tc.function.name)
          )
            localFailed.add(tc.function.name);

          // ANY failure is recorded against the active checklist item — not only the
          // search tools in REQUIRED_TOOL_SEQUENCE above. What actually jams the work
          // is usually a repeatedly failing edit/bash/write, and that is what needs
          // to be visible in the anchor.
          if (!r.ok && itemSedangDikerjakan) {
            sebabGagalLangkahIni.push(
              tc.function.name +
                ": " +
                String(r.output || "gagal")
                  .trim()
                  .split("\n")[0],
            );
          }

          // Track consecutive edit failures
          if (tc.function.name === "edit" && !r.ok) {
            editFailCount++;
            sess.editFailCount = editFailCount;
          } else if (tc.function.name === "edit" && r.ok) {
            editFailCount = 0;
            sess.editFailCount = 0;
          }

          const extra: any = {};
          if (r.hunkId) {
            extra.hunkId = r.hunkId;
            extra.oldContent = r.oldContent;
            extra.newContent = r.newContent;
          }
          emit({
            t: "act",
            kind: tc.function.name,
            arg: args.path || args.pattern || args.command || "",
            ok: !!r.ok,
            output: r.output || "",
            // The final path the tool resolved to (workspace confinement can remap to
            // a different folder than the one asked for) — used by the UI for an
            // accurate preview.
            path: r.path || undefined,
            ...extra,
          });

          const phase = phaseForTool(tc.function.name);
          const cleanArg = (
            args.path ||
            args.pattern ||
            args.command ||
            args.goal ||
            ""
          )
            .replace(/C:\\Users\\dave\\quantum\\/gi, "")
            .replace(/C:\\Users\\dave\\/gi, "")
            .slice(0, 60);
          emitPhase(phase, {
            tag: "tool_call",
            status: r.ok ? "ok" : "err",
            attrs: [
              { k: "name", v: tc.function.name, t: "str" },
              { k: "arg", v: cleanArg, t: "str" },
            ],
            chip: phase,
            children: [
              {
                tag: "tool_result",
                status: r.ok ? "ok" : "err",
                attrs: [
                  { k: "ok", v: String(r.ok), t: "str" },
                  {
                    k: "preview",
                    v: (r.output || "(ok)").replace(/\r?\n/g, " ").slice(0, 80),
                    t: "str",
                  },
                ],
              },
            ],
          });

          let out = r.output || "(ok)";
          // ── Post-execution stagnation detection (the real source of a hard stop) ──
          // (a) Per signature: an identical call returning IDENTICAL OUTPUT
          //     repeatedly = zero new information -> warn at 2, stop at 3.
          //     Different output = progress -> reset.
          const _outKey = String(out).slice(0, 2000);
          const _sameResult = sess.lastOutBySig[sig] === _outKey;
          sess.noProgressBySig[sig] = _sameResult
            ? (sess.noProgressBySig[sig] || 0) + 1
            : 0;
          sess.lastOutBySig[sig] = _outKey;
          // (b) Per name: CONSECUTIVE failures (success resets). 6 in a row on an
          //     action tool means the approach is a dead end.
          if (r.ok) sess.failsByName[tc.function.name] = 0;
          else
            sess.failsByName[tc.function.name] =
              (sess.failsByName[tc.function.name] || 0) + 1;
          if (sess.noProgressBySig[sig] >= 3) {
            dlog("hard-stop no_progress", { sig: sig.slice(0, 140) });
            return {
              out,
              stop: true,
              stopNote:
                "tool «" +
                tc.function.name +
                "» dipanggil identik " +
                (sess.noProgressBySig[sig] + 1) +
                "x dengan HASIL SAMA persis (arg: " +
                (tc.function.arguments || "").slice(0, 80) +
                "…)",
            };
          }
          if (!isReadOnlyTool && sess.failsByName[tc.function.name] >= 6) {
            dlog("hard-stop consecutive_fails", {
              tool: tc.function.name,
              fails: sess.failsByName[tc.function.name],
            });
            return {
              out,
              stop: true,
              reason: "tool_name_loop",
              stopNote:
                "tool «" +
                tc.function.name +
                "» GAGAL " +
                sess.failsByName[tc.function.name] +
                "x beruntun (kegagalan terakhir: " +
                String(out).replace(/\s+/g, " ").slice(0, 100) +
                "…)",
            };
          }
          if (_sameResult && sess.noProgressBySig[sig] >= 1)
            out +=
              "\n[SYSTEM: Panggilan identik diulang dengan HASIL SAMA (" +
              (sess.noProgressBySig[sig] + 1) +
              "x). Jangan ulangi persis — ganti pendekatan, atau read dulu lalu edit SEKALI dengan old_string yang tepat.]";
          if (editFailCount >= 2)
            out +=
              "\n[SYSTEM: edit gagal " +
              editFailCount +
              "x berturut-turut. BERHENTI mencoba edit. Gunakan tool read untuk membaca baris yang tepat dari file, lalu buat 1 edit dengan old_string yang PERSIS sesuai konten file.]";
          if (callCountsByName[tc.function.name] > 3)
            out +=
              "\n[SYSTEM: Tool " +
              tc.function.name +
              " was already called " +
              callCountsByName[tc.function.name] +
              "x. Ganti pendekatan atau berikan jawaban kepada user sekarang.]";
          if (r.needsAnswer) {
            emit({ t: "ask", question: r.question, choices: r.choices });
            out =
              'You asked the user: "' +
              r.question +
              '". The user will respond. Wait for their answer before continuing.';
            return {
              out,
              stop: true,
              waitForAnswer: true,
              question: r.question,
            };
          }
          if (tc.function.name === "task") {
            if (depth >= MAX_DEPTH) {
              const outMsg =
                "(sub-agent depth limit reached — handle this sub-task directly with normal tools)";
              emit({
                t: "act",
                kind: "task",
                arg: (args.goal || "").slice(0, 70),
                ok: false,
                output: outMsg,
              });
              return { out: outMsg };
            }
            emit({
              t: "act",
              kind: "task",
              arg: (args.goal || "").slice(0, 70),
              ok: true,
              output: "↳ sub‑agent…",
            });
            let subSum = "";
            const subEmit = (e) => {
              if (e.t === "adone") subSum = e.summary || "";
              else if (e.t === "err") subSum = "[sub‑agent error: " + e.m + "]";
              else if (e.t === "act")
                emit({
                  t: "act",
                  kind: e.kind,
                  arg: "↳ " + (e.arg || ""),
                  ok: e.ok,
                  output: e.output,
                });
            };
            try {
              const ret = await selfAgentStream(
                {
                  history: [{ role: "user", content: args.goal || "" }],
                  cloud,
                  workspace_root: _wsRoot,
                },
                subEmit,
                { isCancelled, setCurReq, depth: depth + 1 },
              );
              return {
                out: subSum || ret || "(sub-agent finished without a summary)",
              };
            } catch (e) {
              return { out: "[sub‑agent gagal: " + e.message + "]" };
            }
          }
          return { out };
        };

        // Thoughts are emitted inside runOne or HITL branch — only for tools that actually execute.

        // HITL gates only the unprotected path: `bash` runs PowerShell directly on
        // the host — no broker (that's capability_exec only), no sandbox (that's
        // sandbox_run only), so it needs user approval. edit/write stay HITL-free:
        // they're covered by auto-snapshot + rollback.
        // The approval gate lives in agent/penjaga-agent.ts, shared with the
        // Python orchestrator. It used to be defined here, which was fine while
        // there was one agent loop; with two, a gate on only one of them means
        // the SAME request behaves differently depending on which one handled
        // it. The reasoning for gating git per OPERATION rather than by name
        // moved with the code.
        const _perluPersetujuan = (tc) => _penjagaAgent.perluPersetujuan(tc);
        const executionCalls = calls.filter(_perluPersetujuan);
        const nonExecutionCalls = calls.filter((tc) => !_perluPersetujuan(tc));

        if (executionCalls.length > 0 && !state.hitlApproved) {
          // Execute non-execution tools (grep, read, etc.) directly so results are available
          const nonExecMessages: any[] = [];
          for (const tc of nonExecutionCalls) {
            let tcArgs: any = {};
            try {
              tcArgs = JSON.parse(tc.function.arguments || "{}");
            } catch (_) {}
            if (tcArgs.rencana_tindakan) {
              emit({
                t: "thought",
                c: tcArgs.rencana_tindakan,
                tool: tc.function.name,
                ok: true,
              });
            }
            const r = await runOne(tc);
            nonExecMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: r.out || "(ok)",
            });
          }
          // Emit HITL only for execution tools
          const code = executionCalls
            .map((tc) => {
              let a = {};
              try {
                a = JSON.parse(tc.function.arguments || "{}");
              } catch (_) {}
              return (
                "=== " +
                tc.function.name +
                " ===\n" +
                JSON.stringify(a, null, 2)
              );
            })
            .join("\n\n");
          emit({
            t: "hitl",
            thread_id,
            request: {
              title:
                "Eksekusi perintah (" +
                executionCalls.length +
                "): " +
                executionCalls.map((tc) => tc.function.name).join(", "),
              code,
            },
          });
          // Add placeholder tool messages for execution tools
          for (const tc of executionCalls) {
            nonExecMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: "Waiting for your approval...",
            });
          }
          return {
            messages: nonExecMessages,
            step: state.step + 1,
            edits: localEdits,
            editLog: localEditLog,
            accessedEvidence: Array.from(localAccessed),
            failedTools: Array.from(localFailed),
            stopReason: "hitl",
            // "HITL" is internal jargon and means nothing to the user; the waiting
            // state is already visible from the approve/reject buttons. All that is
            // left is the useful fact: how many commands.
            finalSummary:
              executionCalls.length +
              " perintah perlu persetujuan Anda sebelum dijalankan.",
            waitForAnswer: false,
            hitlPending: true,
            pendingToolCalls: executionCalls,
          };
        }

        // Sequential execution (not Promise.all) to preserve emit order and avoid race conditions
        const results: any[] = [];
        for (const tc of calls) {
          const r = await runOne(tc);
          results.push(r);
        }

        const toolMessages: any[] = [];
        let stopReason = "";
        let waitForAnswer = false;
        let localSummary = "";
        // The per-item failure map after this step. Computed once every tool has
        // finished (see the MAX_ITEM_ATTEMPTS gate below).
        let failsBaru = state.checklistFails || {};
        // The live plan from todowrite. null = no todowrite call in this step, so the
        // existing checklist is NOT overwritten.
        let todoUpdate: any = null;

        for (let i = 0; i < calls.length; i++) {
          const name = calls[i].function.name;
          const SEARCH_TOOLS = [
            "grep",
            "disk_grep",
            "read",
            "disk_read",
            "glob",
            "disk_glob",
            "list",
            "disk_list",
            "web_search",
            "web_fetch",
          ];
          const isSearch = SEARCH_TOOLS.includes(name);
          const isGrep = name === "grep" || name === "disk_grep";
          const isRead = name === "read" || name === "disk_read";
          // todowrite -> task_checklist. todowrite used to ONLY emit to the UI and
          // return a string; the agent state never knew the plan existed, so by step
          // 14 it was buried under dozens of tool-output messages. Copying it into
          // the checklist puts it on the per-step re-injection channel that ALREADY
          // exists in the executor node.
          if (name === "todowrite") {
            try {
              const a = JSON.parse(calls[i].function.arguments || "{}");
              if (Array.isArray(a.todos)) todoUpdate = formatChecklist(a.todos);
            } catch (_) {}
          }
          if (isSearch) {
            grepReadSteps++;
            if (isRead) {
              let fp = "";
              try {
                fp = JSON.parse(calls[i].function.arguments || "{}").path || "";
              } catch (_) {}
              if (fp === lastReadFile) readFileCount++;
              else {
                lastReadFile = fp;
                readFileCount = 1;
              }
            }
          }
          if (results[i] && results[i].stop) {
            if (results[i].waitForAnswer) {
              waitForAnswer = true;
              stopReason = "waiting_for_user_answer";
              // The question alone, WITHOUT the "Waiting for your reply: " prefix.
              // The UI already says it is waiting, twice — through the
              // "Question from the Agent" panel (j.question) and the "Menunggu
              // jawaban Anda..." status. This prefix attaches to the question text
              // and then reads to the user as part of the agent's own sentence,
              // exactly like the old [kata-spekulatif-dihapus] marker: an internal
              // label leaking to the surface.
              localSummary = results[i].question;
            } else {
              stopReason = "repeated_tool_calls";
              localSummary =
                msg.content ||
                "Berhenti: panggilan tool berulang tanpa kemajuan" +
                  (results[i].stopNote
                    ? " — " +
                      results[i].stopNote +
                      ". Coba: instruksi lebih spesifik, atau pecah tugasnya."
                    : ".");
            }
          }
          let out = (results[i] && results[i].out) || "(ok)";
          // Force-stop notice: inform model to answer now instead of aborting the graph
          if (grepReadSteps >= 5 && isSearch) {
            out +=
              "\n\n[SYSTEM NOTICE: PENCARIAN SELESAI] Anda sudah melakukan 5 langkah pencarian. DILARANG memanggil tool pencarian lagi. Berikan jawaban/kesimpulan lengkap Anda kepada user SEKARANG berdasarkan hasil yang sudah dikumpulkan.";
          }
          if (readFileCount >= 8 && isRead) {
            out +=
              "\n\n[SYSTEM NOTICE: BACA SELESAI] File sudah dibaca cukup. DILARANG memanggil tool read lagi. Berikan jawaban/kesimpulan lengkap Anda kepada user SEKARANG berdasarkan hasil yang sudah dikumpulkan.";
          }
          // Auto-convert: bash edit rejection → auto-read file + inject edit instruction
          if (name === "bash" && out.includes("DILARANG edit file via bash")) {
            // Parse file path from bash command (common patterns)
            const cmd = calls[i].function.arguments || "";
            let cmdObj: any = {};
            try {
              cmdObj = JSON.parse(cmd);
            } catch (_) {}
            const cmdStr = cmdObj.command || "";
            // Extract file path from common sed/findstr/Set-Content patterns
            const pathMatch =
              cmdStr.match(
                /(?:sed|findstr|Set-Content|Out-File|Add-Content)[\s\S]*?["']?([^\s"']+?\.(?:jsx|js|cjs|css|html|json|md))["']?/i,
              ) ||
              cmdStr.match(
                /["']([^\s"']+?\.(?:jsx|js|cjs|css|html|json|md))["']/i,
              );
            if (pathMatch && pathMatch[1]) {
              const targetFile = pathMatch[1].replace(/\\\\/g, "\\");
              // Auto-read the file so agent has context for edit tool
              try {
                const fileToolsMod = require("./tools/file-tools.ts");
                const absPath = fileToolsMod.qResolve
                  ? fileToolsMod.qResolve(targetFile)
                  : null;
                if (absPath) {
                  const fileContent = fileToolsMod.qRead(absPath);
                  // Truncate to 300 lines for context
                  const lines = fileContent
                    .split("\n")
                    .slice(0, 300)
                    .join("\n");
                  out = `DITOLAK edit via bash. File sudah dibaca untuk Anda:\n\n${lines}\n\n[SYSTEM] Gunakan tool "edit" sekarang dengan:\n- path: ${targetFile}\n- old_string: (copy dari file di atas)\n- new_string: "" (kosong untuk hapus)`;
                  emit({
                    t: "act",
                    kind: "read",
                    arg: targetFile,
                    ok: true,
                    output: "Auto-read untuk edit conversion",
                  });
                } else {
                  out =
                    "DITOLAK edit via bash. Baca file dulu dengan read tool, lalu gunakan edit tool.";
                }
              } catch (e2) {
                out =
                  "DITOLAK edit via bash. Baca file dulu dengan read tool, lalu gunakan edit tool.";
              }
            } else {
              out =
                'DITOLAK edit via bash. Gunakan tool "edit" — baca file dulu dengan read tool jika perlu.';
            }
          }
          toolMessages.push({
            role: "tool",
            tool_call_id: calls[i].id,
            content: out,
          });
        }

        // ── The per-item jam gate: stop and ASK, rather than give up ──
        //
        // This step's failures are counted against the active checklist item. When
        // one item has failed MAX_ITEM_ATTEMPTS times, the run is STOPPED and the
        // user is asked.
        //
        // Why ask rather than skip the item automatically: skipping keeps the agent
        // productive but lets it give up silently on exactly the thing that mattered
        // most — and a hidden failure is precisely what this system exists to
        // prevent. Stop-and-ask puts the jam in front of someone who can decide.
        //
        // The pause path uses the mechanism that ALREADY exists (t:"ask" +
        // waitForAnswer) rather than a new one — so resume, the HITL checkpoint, and
        // the UI all work automatically.
        if (sebabGagalLangkahIni.length && itemSedangDikerjakan) {
          failsBaru = catatGagalItem(
            state.checklistFails,
            itemSedangDikerjakan,
            sebabGagalLangkahIni[0],
          );
          const n = failsBaru[itemSedangDikerjakan].n;
          if (n >= SYSTEM_RULES.MAX_ITEM_ATTEMPTS && !waitForAnswer) {
            const sebab = failsBaru[itemSedangDikerjakan].sebab;
            const pertanyaan =
              'Item "' +
              itemSedangDikerjakan +
              '" sudah gagal ' +
              n +
              "× berturut-turut.\nSebab terakhir: " +
              (sebab[sebab.length - 1] || "tidak tercatat") +
              "\n\nSaya berhenti di sini alih-alih mencoba lagi dengan cara yang sama. Bagaimana lanjutnya?";
            emit({
              t: "ask",
              question: pertanyaan,
              choices: [
                "Coba pendekatan lain",
                "Lewati item ini, lanjut ke berikutnya",
                "Hentikan run",
              ],
            });
            waitForAnswer = true;
            stopReason = "item_macet";
            // "menunggu keputusan user" is dropped for the same reason: the choices
            // are already on screen as buttons, so the sentence merely narrates a UI
            // mechanism back at the user.
            localSummary = "Item checklist gagal " + n + "× berturut-turut.";
          }
        }

        // Persist session state for HITL resume
        sess.grepReadSteps = grepReadSteps;
        sess.lastReadFile = lastReadFile;
        sess.readFileCount = readFileCount;
        sess.callCountsByName = callCountsByName;
        sess.editFailCount = editFailCount;

        return {
          messages: toolMessages,
          step: state.step + 1,
          edits: localEdits,
          editLog: localEditLog,
          accessedEvidence: Array.from(localAccessed),
          failedTools: Array.from(localFailed),
          ...(sebabGagalLangkahIni.length ? { checklistFails: failsBaru } : {}),
          stopReason,
          waitForAnswer,
          hitlPending: stopReason === "hitl",
          hitlApproved: state.hitlApproved, // Keep approval through the session (reset only on new user message)
          finalSummary: localSummary,
          // Only send when todowrite was actually called: this checklist reducer is
          // "replace wholesale", (x, y) => y, so sending [] on every step would
          // ERASE the planner's plan.
          ...(todoUpdate ? { task_checklist: todoUpdate } : {}),
        };
      })
      .addNode("validate", async (state) => {
        const msg = state.messages[state.messages.length - 1];
        const cleanContent = stripThinkBlocks(msg.content || "");
        const hasContent = cleanContent && cleanContent.trim();
        const rawContent = hasContent
          ? cleanContent
          : "(tidak ada respons dari model)";

        // Anti-tutorial: the model has real execution tools (bash/sandbox_run), so an
        // answer that SIMULATES the result, or gives up with the refusal below, is a
        // role hallucination — force it to actually call a tool.
        //
        //   "sebagai AI saya tidak bisa menjalankan"   (verbatim: matched)
        const SIMULATION_CLAIMS = new RegExp(
          [
            "sebagai AI[^.]{0,60}(tidak (bisa|dapat|punya)|akses)",
            "as an? AI[^.]{0,60}(cannot|can'?t|unable|no (access|way))",
            "tidak (punya|memiliki) akses real-?time",
            "(saya|aku)?\\s*(tidak (bisa|dapat)|(cannot|can'?t|unable to)) (menjalankan|mengeksekusi|execute|run)",
            "(saya|kita|mari kita|let'?s)\\s*(akan\\s*)?(asumsikan|anggap|bayangkan|misalkan|assume|imagine|pretend|simulate|simulasikan)",
            "seolah-?olah[^.]{0,40}(sudah|berjalan|jadi)",
            "dalam simulasi|in (a )?simulation",
            "output(nya)?\\s*(yang diharapkan\\s*)?(mungkin|kira-?kira|biasanya|misal|expected|would be|typically)",
            "(hasil|hasilnya)\\s*(kira-?kira|mungkin|misal|diperkirakan|kurang lebih)",
          ].join("|"),
          "i",
        );
        if (
          hasContent &&
          SIMULATION_CLAIMS.test(cleanContent) &&
          state.forceRetryCount < 3
        ) {
          emit({
            t: "force_retry",
            m: "[ANTI-TUTORIAL] Jawaban mensimulasikan eksekusi — memaksa pemanggilan tool nyata...",
          });
          return {
            messages: [
              {
                role: "user",
                content:
                  "PERINGATAN SISTEM: Kamu BISA mengeksekusi perintah secara nyata — kamu punya tool bash (PowerShell di host) dan sandbox_run. DILARANG mensimulasikan, mengasumsikan, atau menarasikan output. PANGGIL tool yang sesuai SEKARANG dan laporkan output aslinya.",
              },
            ],
            forceRetryCount: state.forceRetryCount + 1,
          };
        }

        const evidenceValid = hasValidEvidence(
          rawContent,
          state.accessedEvidence,
        );

        let fallback = rawContent;
        // There is no speculative-word sweeper here any more — the model's sentence
        // reaches the screen as written. The two steps below only REMOVE things (the
        // tool recap, excess length); neither inserts a marker mid-sentence.
        fallback = stripToolRecap(fallback);
        fallback = truncateToConcise(fallback, 2000);
        // Safety net: make sure the architecture_map diagram is sent (and renders in
        // the UI) even when the model does not attach it, or attaches it PARTIALLY
        // (an opening fence with no closer — common when the model summarises or
        // truncates itself). Added AFTER truncation so the block stays whole.
        if (lastArchMermaid && !/```mermaid[\s\S]*?```/.test(fallback)) {
          fallback = fallback.replace(/```mermaid[\s\S]*$/i, "").trim(); // buang fence parsial
          fallback =
            (fallback && fallback !== "(tidak ada respons dari model)"
              ? fallback + "\n\n"
              : "") + lastArchMermaid;
        }

        if (
          state.failedTools.size < SYSTEM_RULES.MIN_FAILED_TOOLS &&
          SYSTEM_RULES.REQUIRED_TOOL_SEQUENCE.some((t) =>
            state.failedTools.has(t),
          )
        ) {
          const nextTool = SYSTEM_RULES.REQUIRED_TOOL_SEQUENCE.find(
            (t) => !state.failedTools.has(t),
          );
          if (nextTool) {
            if (state.forceRetryCount >= 3) {
              dlog("self", "warn", "force_retry limit reached", {
                step: state.step,
              });
            } else {
              emit({
                t: "force_retry",
                m: `Belum memenuhi minimal ${SYSTEM_RULES.MIN_FAILED_TOOLS} tool gagal. Coba ${nextTool} selanjutnya...`,
              });
              return {
                messages: [
                  {
                    role: "user",
                    content: `Anda belum mencoba tool ${nextTool}. Jalankan tool tersebut untuk mencari informasi lebih lanjut sebelum menyimpulkan.`,
                  },
                ],
                forceRetryCount: state.forceRetryCount + 1,
              };
            }
          }
        }

        if (!evidenceValid) {
          if (state.forceRetryCount >= 3) {
            dlog("self", "warn", "hasValidEvidence retry limit reached", {
              step: state.step,
            });
          } else {
            emit({
              t: "force_retry",
              m: "Jawaban belum berdasarkan bukti tools, meminta ulang...",
            });
            return {
              messages: [
                {
                  role: "user",
                  content:
                    "Jawaban Anda harus didasarkan pada bukti dari tools yang sudah dijalankan, tetapi DILARANG menyalin ulang log/output tool. Berikan kesimpulan SANGAT SINGKAT (1-2 kalimat) saja, langsung ke inti.",
                },
              ],
              forceRetryCount: state.forceRetryCount + 1,
            };
          }
        }

        // ── HALLUCINATION GUARD ─────────────────────────────────────────────────────
        // Evaluate the model's answer before it goes to the user.
        // Do not touch the answer until the evaluation has finished.
        // Mostly hallucinated -> retry.
        // A minority -> strip the false claims and send the clean version.
        const hGuard = hallucinationGuard(
          fallback,
          state.accessedEvidence,
          state.editLog || [],
        );
        dlog("self", "info", "hallucination_guard", {
          verdict: hGuard.verdict,
          hallucinated: hGuard.hallucinated.length,
        });

        if (hGuard.verdict === "block") {
          if (state.forceRetryCount >= 3) {
            // The retry limit is reached. Do NOT discard the model's answer: show it
            // as-is in the UI, and put the "not yet verified" warning ONLY in the
            // agent output (the timeline), as a single step — rather than attaching
            // it to the answer text.
            dlog(
              "self",
              "warn",
              "hallucination_guard block, retry limit reached — answer kept, note to timeline",
              { step: state.step },
            );
            const _unv = hGuard.hallucinated
              .map((h) => h.raw)
              .filter(Boolean)
              .slice(0, 6)
              .join("; ");
            emit({
              t: "act",
              kind: "verify",
              arg: "sebagian klaim belum terverifikasi",
              ok: false,
              output:
                hGuard.hallucinated.length +
                " claim does not match the evidence from this tool run" +
                (_unv ? " — " + _unv : "") +
                ". Jawaban tetap ditampilkan; mohon verifikasi mandiri.",
            });
            // The fallback REMAINS the model's own answer (the rawContent sanitised
            // above). Deliberately not replaced with a generic message.
          } else {
            const hallucinatedList = hGuard.hallucinated
              .map((h) => `"${h.raw}"`)
              .join(", ");
            emit({
              t: "force_retry",
              m: `[HALLUCINATION GUARD] ${hGuard.hallucinated.length} klaim tidak terverifikasi: ${hallucinatedList.slice(0, 120)}`,
            });
            return {
              messages: [
                {
                  role: "user",
                  content: `PERINGATAN SISTEM: Jawaban Anda mengandung klaim yang TIDAK TERBUKTI dari hasil tool:\n${hallucinatedList}\n\nKamu DILARANG menyebutkan sesuatu yang tidak ada di bukti tool. Baca ulang hasil tool yang ada, lalu berikan jawaban HANYA berdasarkan apa yang BENAR-BENAR ditemukan. Jika tidak ada buktinya, katakan "not found".`,
                },
              ],
              forceRetryCount: state.forceRetryCount + 1,
            };
          }
        } else if (hGuard.verdict === "warn") {
          // A minority hallucinated — use the stripped version
          dlog("self", "info", "hallucination_guard stripped claims", {
            stripped: hGuard.hallucinated.length,
          });
          fallback = hGuard.sanitized || fallback;
        }
        // verdict === 'clean': jawaban bersih, lanjut
        // ── END HALLUCINATION GUARD ─────────────────────────────────────────────────

        // ── Text is not a done signal while the checklist is STILL open ──
        //
        // Below this the run is CLOSED and the model's text is used as the final
        // answer. That is right when the work really is finished — but nothing here
        // checked that it was. A model that announces its plan first ("Saya buat
        // folder baru freelance-landing/ ...") closed its own run with one sentence
        // of intent, with the checklist still at 0/4.
        //
        // Deliberately a NUDGE, not a force: the nudging is bounded by
        // MAX_CONTINUE_NUDGE, and after that the run closes anyway — with an honest
        // note that the checklist is unfinished, rather than quietly as if it were
        // done.
        const _sisa = (state.task_checklist || []).filter((b) =>
          /^\[(?: |→|!)\]/.test(String(b)),
        );
        if (
          hasContent &&
          _sisa.length &&
          (state.continueNudge || 0) < SYSTEM_RULES.MAX_CONTINUE_NUDGE
        ) {
          dlog("self", "info", "continue_nudge", {
            step: state.step,
            sisa: _sisa.length,
            ke: (state.continueNudge || 0) + 1,
          });
          emit({
            t: "force_retry",
            m:
              "Checklist belum tuntas (" +
              _sisa.length +
              " item) — melanjutkan, bukan menutup.",
          });
          return {
            messages: [
              {
                role: "user",
                content:
                  "JANGAN menutup pekerjaan. Checklist Anda masih punya " +
                  _sisa.length +
                  " item yang belum tuntas:\n" +
                  _sisa.join("\n") +
                  "\n\nDILARANG menarasikan rencana. PANGGIL tool untuk MENGERJAKAN " +
                  "item yang bertanda [→] sekarang juga. Kalau item itu sebenarnya " +
                  "sudah selesai, panggil todowrite untuk menandainya [x] lalu " +
                  "langsung kerjakan item berikutnya.",
              },
            ],
            continueNudge: (state.continueNudge || 0) + 1,
          };
        }
        // Nudged to the limit and the model is still narrating: close, but do NOT
        // claim completion. The remaining work is named so the user knows exactly
        // what was not done.
        if (hasContent && _sisa.length) {
          dlog("self", "warn", "continue_nudge limit reached", {
            step: state.step,
            sisa: _sisa.length,
          });
          fallback =
            fallback +
            "\n\n⚠ Run berhenti dengan " +
            _sisa.length +
            " item checklist BELUM tuntas:\n" +
            _sisa.join("\n");
        }

        dlog("self", "info", "stop", {
          reason: hasContent ? "text_response_no_tools" : "no_response",
          step: state.step,
          chars: (msg.content || "").length,
          sanitized: true,
        });

        emitPhase("validate", {
          tag: "Validate",
          status: "ok",
          attrs: [{ k: "step", v: state.step, t: "num" }],
          children: [
            {
              tag: "evidence_check",
              status: "ok",
              attrs: [{ k: "claim_grounded", v: "true", t: "str" }],
              evidence: true,
            },
            {
              tag: "hallucination_guard",
              status: hGuard.verdict === "clean" ? "ok" : "warn",
              attrs: [
                { k: "verdict", v: hGuard.verdict, t: "str" },
                { k: "hallucinated", v: hGuard.hallucinated.length, t: "num" },
              ],
            },
            {
              tag: "strip_tool_recap",
              status: "ok",
              attrs: [{ k: "final_chars", v: fallback.length, t: "num" }],
            },
            {
              tag: "sandbox_audit",
              status: "ok",
              attrs: [{ k: "files_written", v: state.edits, t: "num" }],
            },
          ],
        });

        emit({
          t: "adone",
          steps: state.step,
          edits: state.edits,
          summary: fallback,
          backup: sessionSnapshotId,
        });

        emitPhase("return", {
          tag: "Return",
          status: "ok",
          attrs: [{ k: "step", v: state.step, t: "num" }],
          children: [
            {
              tag: "response",
              status: "ok",
              attrs: [
                { k: "type", v: "text", t: "str" },
                { k: "chars", v: fallback.length, t: "num" },
                { k: "preview", v: fallback.slice(0, 80), t: "str" },
              ],
            },
          ],
        });

        return { finalSummary: fallback, stopReason: "finished" };
      })
      .addConditionalEdges(START, (state) => {
        if (state.hitlApproved) return "executor";
        const lastMsg = state.messages[state.messages.length - 1];
        const TASK_KEYWORDS =
          /\b(code|coding|program|script|function|fungsi|kelas|class|algorithm|algoritma|buat(?:kan)?|tulis(?:kan)?|implement|debug|fix|perbaiki|refactor|optimi[sz]e|sort|parse|regex|api|loop|array|string|hitung|kalkulator|baca|file|folder|cari|search|hapus|edit|ubah|ganti|tambah(?:kan)?|jalankan|eksekusi|test|bantu)\b/i;
        const CODE_KEYWORDS =
          /\b(buat(?:kan)?|tulis(?:kan)?|implement|debug|fix|perbaiki|refactor|optimi[sz]e|edit|ubah|ganti|tambah(?:kan)?|jalankan|eksekusi|code|program|script)\b/i;
        if (
          state.task_checklist &&
          state.task_checklist.length === 0 &&
          lastMsg.role === "user" &&
          CODE_KEYWORDS.test(lastMsg.content)
        ) {
          return "planner";
        }
        // Skip planner for simple search/lookup — langsung executor
        return "executor";
      })
      .addEdge("planner", "executor")
      .addConditionalEdges("executor", (state) => {
        if (state.stopReason) return END;
        const msg = state.messages[state.messages.length - 1];
        if (
          msg.role === "assistant" &&
          msg.tool_calls &&
          msg.tool_calls.length > 0
        )
          return "tools";
        // If fallback provider updated but no tools were returned
        if (msg.role !== "assistant") return "executor";
        return "validate";
      })
      .addConditionalEdges("tools", (state) => {
        if (state.stopReason) return END;
        // A pause checkpoint, not a cliff: when the step ceiling is reached the graph
        if (state.step >= (state.stepCeiling || MAX_STEPS)) return END;
        return "executor";
      })
      .addConditionalEdges("validate", (state) => {
        if (state.stopReason === "finished") return END;
        return "executor";
      });

    const app = workflow.compile({ checkpointer: memoriAgen() });
    // LangGraph's recursionLimit counts SUPER-STEPS (every node execution), while
    // the app counts a "step" only in the tools node. One app step = executor +
    // tools = ~2 super-steps, plus planner/validate/retry. LangGraph's default (25)
    // is smaller than the number of super-steps needed to reach MAX_STEPS (14-20),
    // so the graph threw "Recursion limit reached" BEFORE the app's graceful
    // stop/pause logic could run. Scale it so the app always stops first (the app's
    // own loop is already bounded: callCounts, forceRetryCount<3, fallbackCount<3,
    // step>=ceiling).
    const recLimit = (ceil) => Math.max(ceil || MAX_STEPS, 1) * 2 + 40;
    const config = {
      configurable: { thread_id },
      recursionLimit: recLimit(MAX_STEPS),
    };

    let finalState;
    if (hitl_response) {
      // HITL Resume: get checkpoint state, run all pending tools directly, then continue graph
      const checkpoint = await app.getState(config);
      const savedState = checkpoint.values;
      const pendingTools =
        savedState.pendingToolCalls && savedState.pendingToolCalls.length > 0
          ? savedState.pendingToolCalls
          : savedState.pendingToolCall
            ? [savedState.pendingToolCall]
            : [];

      if (pendingTools.length > 0) {
        // Execute all approved tool calls directly
        emit({ t: "step", n: (savedState.step || 0) + 1 });
        emit({
          t: "act",
          kind: "hitl_approved",
          arg: pendingTools.map((tc) => tc.function.name).join(", "),
          ok: true,
          output: "Diizinkan oleh user ✔",
        });

        const toolResults: any[] = [];
        for (const pendingTc of pendingTools) {
          let args: any = {};
          try {
            args = JSON.parse(pendingTc.function.arguments || "{}");
          } catch (_) {}
          if (
            /^(edit|write|replace_file_content|write_artifact)$/i.test(
              pendingTc.function.name,
            )
          )
            await ensureBackup();

          const r = await runSelfTool(
            pendingTc.function.name,
            args,
            emit,
            agentCtx,
          );
          if (r.edited) edits++; // keep the crash-rollback guard's counter honest
          const toolResult = r.output || "(ok)";

          emit({
            t: "act",
            kind: pendingTc.function.name,
            arg: args.path || args.command || "",
            ok: !!r.ok,
            output: toolResult,
          });
          toolResults.push({
            tc: pendingTc,
            output: toolResult,
            edited: !!r.edited,
          });
        }

        // Build new messages: current history + all tool results, then continue graph fresh.
        // The checkpoint's messages end with PLACEHOLDER tool responses ("Menunggu
        // persetujuan user...") that were pushed for the pending calls when HITL fired.
        // Appending the real results would leave TWO tool messages for the same
        // tool_call_id — strict providers (deepseek et al.) reject that as an invalid
        // sequence. Drop the placeholders first so each tool_call has exactly one response.
        const pendingIds = new Set(pendingTools.map((tc) => tc.id));
        const historyWithoutPlaceholders = (savedState.messages || []).filter(
          (m) => !(m.role === "tool" && pendingIds.has(m.tool_call_id)),
        );
        const continuationMessages = [
          ...historyWithoutPlaceholders,
          ...toolResults.map(({ tc, output }) => ({
            role: "tool",
            tool_call_id: tc.id,
            content: output,
          })),
        ];

        // Restart graph. hitlApproved: true means all subsequent execution tools in this turn
        // are auto-allowed. The flag resets to false when a new user message arrives (fresh invoke).
        finalState = await app.invoke(
          {
            messages: continuationMessages,
            step: (savedState.step || 0) + 1,
            edits:
              (savedState.edits || 0) +
              toolResults.filter((r) => r.edited).length,
            hitlApproved: true,
            pendingToolCall: null,
            pendingToolCalls: [],
            task_checklist: savedState.task_checklist || [],
          },
          {
            configurable: { thread_id: thread_id + "_resume_" + Date.now() },
            recursionLimit: recLimit(savedState.stepCeiling),
          },
        );
      } else {
        // No pending tool call found — just restart normally
        finalState = await app.invoke({ messages, hitlApproved: true }, config);
      }
    } else if (continue_response) {
      // Continue after a budget pause: take the checkpoint, extend the ceiling by
      // one more window, and carry on from the saved state. No rollback and no
      // re-planning — exactly resuming the work that was paused.
      const checkpoint = await app.getState(config);
      const savedState = (checkpoint && checkpoint.values) || {};
      const prevCeiling = savedState.stepCeiling || MAX_STEPS;
      emit({ t: "step", n: savedState.step || 0 });
      emit({
        t: "act",
        kind: "continue",
        arg: "",
        ok: true,
        output: `Melanjutkan (plafon → ${prevCeiling + MAX_STEPS} langkah)`,
      });
      finalState = await app.invoke(
        {
          messages: savedState.messages || [],
          step: savedState.step || 0,
          edits: savedState.edits || 0,
          task_checklist: savedState.task_checklist || [],
          stepCeiling: prevCeiling + MAX_STEPS,
          stopReason: "",
        },
        {
          configurable: { thread_id: thread_id + "_cont_" + Date.now() },
          recursionLimit: recLimit(prevCeiling + MAX_STEPS),
        },
      );
    } else {
      // Initial run — pre-search injection + intent-based routing
      try {
        const fileToolsMod = require("./tools/file-tools.ts");
        const userMsg = messages[messages.length - 1];
        if (userMsg && userMsg.role === "user" && fileToolsMod.qGrep) {
          const content = (userMsg.content || "").toLowerCase();

          // Intent-based pre-routing: tell agent WHERE to look
          const INTENT_MAP = [
            {
              keywords: [
                "tombol",
                "button",
                "fitur",
                "menu",
                "ui",
                "sidebar",
                "composer",
                "chat",
                "modal",
                "komponen",
                "component",
                "halaman",
                "page",
                "app.jsx",
              ],
              hint: "UI/React ada di public/app.jsx",
            },
            {
              keywords: [
                "css",
                "warna",
                "color",
                "style",
                "theme",
                "tema",
                "layout",
                "border",
                "background",
                "font",
              ],
              hint: "Styling ada di public/styles.css",
            },
            {
              keywords: [
                "agent",
                "hitl",
                "tool",
                "langgraph",
                "graph",
                "executor",
                "planner",
                "validate",
                "rencana",
                "self_agent",
              ],
              hint: "Agent logic ada di agent/self_agent.ts",
            },
            {
              keywords: [
                "tool definition",
                "tool-def",
                "daftar tool",
                "definisi tool",
              ],
              hint: "Tool definitions ada di agent/tools/tool-definitions.ts",
            },
            {
              keywords: [
                "server",
                "route",
                "api",
                "endpoint",
                "http",
                "port",
                "sse",
              ],
              hint: "Server ada di server.cjs",
            },
            {
              keywords: ["config", "konfigurasi", "mcp", "prompt"],
              hint: "Config ada di config/",
            },
          ];
          let routingHint = "";
          for (const intent of INTENT_MAP) {
            if (intent.keywords.some((k) => content.includes(k))) {
              routingHint = intent.hint;
              break;
            }
          }

          // Extract likely search keywords from user message
          const afterVerb = content.match(
            /(?:cari|hapus|temukan|edit|ganti|ubah|cari letak|di mana|where is)\s+(.{3,60})/i,
          );
          let keywords: any[] = [];
          if (afterVerb && afterVerb[1]) {
            let kw = afterVerb[1]
              .replace(
                /^(di\s+(dalam\s+)?)|(yang\s+)|(kode\s+|tombol\s+|button\s+|fitur\s+)/gi,
                "",
              )
              .trim();
            kw = kw.split(/\s+/).slice(0, 4).join(" ");
            if (kw.length >= 3) keywords.push(kw);
          }
          if (keywords.length === 0) {
            const words = (userMsg.content || "")
              .split(/\s+/)
              .filter(
                (w) =>
                  w.length >= 4 &&
                  !/^(yang|dengan|untuk|dari|pada|akan|bisa|harus|saya|tolong|silakan|mana|dimana|cara|buat|tampilkan|jelaskan|berikan|periksa|cek|lihat|karena|tetapi|namun|jika|kalau|supaya|agar|sehingga|sangat|juga|sudah|belum|masih|lebih|kurang|paling|saja|ini|itu|ada|tidak|dengan|dalam|luar|atas|bawah|kiri|kanan|depan|belakang|semua|setiap|beberapa|banyak|sedikit|cari|hapus|temukan|edit|ganti|ubah|fitur|tombol|button|kode|file|folder|project|direktori)/i.test(
                    w,
                  ),
              );
            if (words.length > 0) keywords.push(words.slice(0, 3).join(" "));
          }

          if (keywords.length > 0) {
            const grepResults: any[] = [];
            for (const kw of keywords.slice(0, 2)) {
              const result = fileToolsMod.qGrep(kw, {});
              if (result && !result.startsWith("(") && result.length > 5) {
                grepResults.push('grep "' + kw + '":\n' + result.slice(0, 500));
              }
            }
            if (grepResults.length > 0) {
              let preSearch =
                "\n\n[PRE-SEARCH — hasil sudah ada. JANGAN grep ulang. Langsung read + edit/jawab]:\n" +
                grepResults.join("\n\n");
              if (routingHint) preSearch += "\n\n[ROUTE] " + routingHint;
              messages[0].content += preSearch;
              dlog("self", "info", "pre_search_injected", {
                keywords,
                routing: routingHint,
                chars: preSearch.length,
              });
            } else if (routingHint) {
              messages[0].content +=
                "\n\n[ROUTE] " +
                routingHint +
                ". Gunakan grep/read langsung ke file ini.";
            }
          } else if (routingHint) {
            messages[0].content +=
              "\n\n[ROUTE] " +
              routingHint +
              ". Gunakan grep/read langsung ke file ini.";
          }
        }
      } catch (e) {
        dlog("self", "warn", "pre_search_failed", { error: e.message });
      }
      finalState = await app.invoke({ messages }, config);
    }

    if (
      finalState.stopReason === "repeated_tool_calls" ||
      finalState.stopReason === "waiting_for_user_answer" ||
      finalState.stopReason === "hitl"
    ) {
      if (finalState.stopReason === "hitl") {
        dlog("self", "info", "stop", { reason: "hitl", step: finalState.step });
        emit({
          t: "adone",
          steps: finalState.step,
          edits: finalState.edits,
          summary: finalState.finalSummary,
          backup: sessionSnapshotId,
          hitlPending: true,
          thread_id,
        });
      } else if (finalState.waitForAnswer) {
        dlog("self", "info", "stop", {
          reason: "waiting_for_user_answer",
          step: finalState.step,
        });
        emit({
          t: "adone",
          steps: finalState.step,
          edits: finalState.edits,
          summary: finalState.finalSummary,
          backup: sessionSnapshotId,
          waitForAnswer: true,
          thread_id,
        });
      } else {
        emit({
          t: "adone",
          steps: finalState.step,
          edits: finalState.edits,
          summary: finalState.finalSummary,
          backup: sessionSnapshotId,
        });
      }
    } else if (
      finalState.step >= (finalState.stepCeiling || MAX_STEPS) &&
      finalState.stopReason !== "finished"
    ) {
      // The step ceiling was reached WITHOUT natural completion. This is NOT a
      // failure — the agent is still working productively, it just needs the next
      // window of steps. Do not roll back: the state is saved in the checkpointer
      // (thread_id), so offer to continue. Natural completion is still the real
      // finish path; this is a pause, not a cliff.
      dlog("self", "info", "stop", {
        reason: "paused_budget",
        step: finalState.step,
      });
      // Report WHAT happened during those steps, not just their number — without
      // this, 14 productive steps and 14 spent going in circles produce exactly the
      // same sentence.
      const activity = describePauseActivity(finalState, sess);
      const nextBudget = (finalState.stepCeiling || MAX_STEPS) + MAX_STEPS;
      // The remaining checklist is named too: what decides whether "Continue" is
      // worth pressing is WHAT is unfinished, not how many steps were spent.
      const sisa = pendingChecklist(finalState.task_checklist);
      finalSummary =
        `Dijeda di langkah ${finalState.step} — ${activity}. ` +
        (sisa.length
          ? `Belum selesai:\n${sisa.join("\n")}\n`
          : "Belum selesai; ") +
        `"Lanjutkan" menambah plafon ke ${nextBudget} langkah.`;
      emit({
        t: "adone",
        steps: finalState.step,
        edits: finalState.edits,
        summary: finalSummary,
        backup: sessionSnapshotId,
        paused: true,
        continuable: true,
        thread_id,
      });
    } else if (finalState.stopReason === "finished") {
      dlog("self", "info", "stop", {
        reason: "finished",
        step: finalState.step,
      });
      finalSummary = finalState.finalSummary || "Selesai.";
      if (!finalState.finalSummary) {
        emit({
          t: "adone",
          steps: finalState.step,
          edits: finalState.edits,
          summary: finalSummary,
          backup: sessionSnapshotId,
        });
      }
    } else {
      // Catch-all: any other stopReason (error, cancelled, or unknown) — ALWAYS emit adone
      dlog("self", "info", "stop", {
        reason: finalState.stopReason || "unknown",
        step: finalState.step,
      });
      if (finalState.stopReason === "error") {
        // The message already composed at the point of failure wins, because it is
        // the only one that knows which provider failed and why.
        finalSummary =
          finalState.finalSummary ||
          "Cloud API error — coba lagi dalam beberapa detik.";
      } else if (finalState.stopReason === "cancelled") {
        finalSummary = "Dibatalkan oleh user.";
      } else {
        finalSummary = finalState.finalSummary || "Selesai.";
      }
      emit({
        t: "adone",
        steps: finalState.step,
        edits: finalState.edits,
        summary: finalSummary,
        backup: sessionSnapshotId,
      });
    }

    finalSummary = finalState.finalSummary || finalSummary;
  } catch (e) {
    const msg = (e && e.message) || String(e);
    // Defence in depth: if LangGraph's recursionLimit fires anyway (an edge case),
    // that is NOT a crash — the agent ran out of "turns", it did not fail. Do not
    // roll back edits that already succeeded, and give a message that can be
    // continued from (rather than a raw error).
    if (/recursion limit/i.test(msg)) {
      dlog("self", "info", "stop", {
        reason: "recursion_limit",
        edits: edits || 0,
      });
      finalSummary =
        (edits || 0) > 0
          ? `Dijeda: mencapai batas putaran internal (${edits} file sudah diedit). Minta "lanjutkan" untuk meneruskan.`
          : 'Dijeda: mencapai batas putaran internal sebelum selesai. Minta "lanjutkan" atau perjelas tugasnya.';
      emit({
        t: "adone",
        steps: 0,
        edits: edits || 0,
        summary: finalSummary,
        backup: sessionSnapshotId,
        paused: true,
        continuable: true,
        thread_id,
      });
      return finalSummary;
    }
    dlog("self", "info", "stop", {
      reason: "unhandled_exception",
      error: msg.slice(0, 100),
    });
    if (sessionSnapshotId && (edits || 0) === 0) {
      // The rollback return value IS CHECKED, and the call is wrapped.
      //
      // Before: `rollback(id)` with nothing checked, followed by always telling the
      // user "Proyek dipulihkan". Two failures were proven by executing this block
      // as it stood:
      //   - the snapshot is missing -> rollback returns {ok:false}, IGNORED, and the
      //     user is still told the project was restored (when it was not)
      //   - the metadata is corrupt -> rollback THROWS, and a throw here killed the
      //     three emits below it, including done. The result was ZERO messages to
      //     the UI, and a UI hanging forever because it never learned the run had
      //     ended. A failed recovery became a permanently frozen UI.
      //
      // The report is now honest: success is called success, failure is called
      // failure ALONG WITH its cause — which is exactly when the user most needs to
      // know, because their work may genuinely not be back.
      let pulih = { ok: false, error: "rollback tidak dijalankan" };
      try {
        pulih = rollback(sessionSnapshotId) || pulih;
      } catch (errRb) {
        pulih = { ok: false, error: errRb.message };
      }
      emit({
        t: "err",
        m: pulih.ok
          ? `[Auto-Rollback] Agen crash internal. Proyek dipulihkan (Snapshot: ${sessionSnapshotId}).`
          : `[Auto-Rollback GAGAL] Agen crash internal dan proyek TIDAK dipulihkan: ${pulih.error} (Snapshot: ${sessionSnapshotId}). Periksa berkas Anda sebelum melanjutkan.`,
      });
    }
    if (!isCancelled()) emit({ t: "err", m: e.message });
    // ALWAYS emit adone so frontend knows the agent is done
    emit({
      t: "adone",
      steps: 0,
      edits: edits || 0,
      summary: "Error: " + (e.message || "unknown").slice(0, 100),
      backup: sessionSnapshotId,
    });
    finalSummary = "Error: " + (e.message || "").slice(0, 80);
  }
  dlog("self", "info", "stop", {
    reason: "end_of_function",
    finalSummary: (finalSummary || "").slice(0, 80),
  });
  return finalSummary;
}

// describePauseActivity is exported FOR TESTING. It is pure (state in, string out)
// so it can be verified without running the graph or calling a model — otherwise
// the only way to test it would be to wait for the agent to genuinely hit the step
// ceiling.
module.exports = {
  selfAgentStream,
  describePauseActivity,
  // Exported for testing: pure helpers, touching neither the graph nor IO.
  itemAktif,
  catatGagalItem,
  checklistDenganKegagalan,
  SYSTEM_RULES,
};

// Marks this file as a MODULE rather than a global script. Without it every
// top-level const lands in one shared global scope with the other .ts files in
// this project, where a name used twice becomes a redeclaration error far from
// either definition. Left as `export {}` rather than converting the requires to
// imports, because imports HOIST: the lazy LangGraph require below is what cut
// startup from 1071 ms to 314 ms, and hoisting it would undo that silently.
export {};
