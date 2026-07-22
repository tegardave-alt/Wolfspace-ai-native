// Self-agent stream implementation (extracted and modularized from server.cjs)
// Dependencies – same as original server.cjs
const { dlog } = require("./debug.cjs");
const {
  fillCloudKey,
  detectProvider,
  CLOUD,
  CLOUD_KEYS,
  loadCloudKeys,
  askCloudTools,
} = require("./cloud.cjs");
const { runSelfTool, SELF_TOOLS, qBackup } = require("./tools.cjs");
const { runReply } = require("./chat.cjs");
const { getOptimized, optimizeInBackground } = require("./sysprompt_opt.cjs");
const {
  parsePseudoCalls,
  stripPseudoTags,
} = require("./pseudo-tag-filter.cjs");
const os = require("os");
const {
  StateGraph,
  START,
  END,
  Annotation,
  MemorySaver,
} = require("@langchain/langgraph");
// server.cjs me-`delete require.cache` untuk modul ini di SETIAP request /self-agent
// (hot-reload agar agent melihat perubahan source-nya sendiri). Itu me-recreate semua
// state module-level — termasuk checkpointer HITL. Kalau MemorySaver dibuat ulang tiap
// request, checkpoint dari run yang dijeda HITL hilang dan resume tak pernah menemukan
// pending tool call-nya. Simpan di globalThis supaya SATU instance bertahan lintas reload.
const agentMemory =
  globalThis.__wolfspaceAgentMemory ||
  (globalThis.__wolfspaceAgentMemory = new MemorySaver());
// System prompt for function-calling self-agent
const path = require("path");
const PROMPTS_CFG_PATH = path.join(__dirname, "..", "config", "prompts.json");

// ===================== SISTEM ATURAN AGENT (HARDCODED RULES) =====================
// Aturan yang dipindahkan dari prompt ke sistem untuk kepatuhan 100%
const SYSTEM_RULES = {
  // Kata-kata spekulatif yang dilarang
  FORBIDDEN_SPECULATIVE:
    /\b(mungkin|sepertinya|bisa jadi|perhaps|possibly|maybe|probably|seems|appears|I think|I believe|I assume|presumably)\b/gi,
  // Urutan tool yang wajib dicoba sebelum menyatakan "tidak ada"
  REQUIRED_TOOL_SEQUENCE: ["grep", "glob", "web_search"],
  // Minimal tools yang gagal sebelum bisa menyerah
  MIN_FAILED_TOOLS: 3,
};

// Simpan bukti dari tool yang sudah diakses untuk validasi
const accessedEvidence = new Set();
let failedTools = new Set();

// Bersihkan output dari kata spekulatif — TAPI jangan sentuh isi kutipan/backtick/code.
// Kata seperti "seems"/"maybe" sering muncul sah di dalam pesan error yang dikutip atau
// contoh kode; menyapunya di sana justru merusak jawaban yang benar (mis. pesan error
// '"seems to be offline"' menjadi korup). Kita mask dulu span terlindung, sapu, lalu pulihkan.
function sanitizeOutput(text) {
  if (!text) return text;
  // Sentinel di Private Use Area — takkan pernah muncul di output model, jadi
  // pemulihan tidak akan salah menargetkan angka asli dalam prosa.
  const protectedSpans = [];
  const wrap = (i) => "" + i + "";
  const maskedText = text.replace(
    /```[\s\S]*?```|`[^`]*`|"[^"]*"|'[^']*'/g,
    (m) => {
      protectedSpans.push(m);
      return wrap(protectedSpans.length - 1);
    },
  );
  const sweptText = maskedText.replace(
    SYSTEM_RULES.FORBIDDEN_SPECULATIVE,
    "[kata-spekulatif-dihapus]",
  );
  return sweptText.replace(/(\d+)/g, (_, i) => protectedSpans[Number(i)]);
}

// Buang blok reasoning (<think>...</think>) dan tag think yang nyasar/tak berpasangan.
// cloud.cjs membungkus reasoning-delta dengan tag ini untuk tampilan streaming, dan
// beberapa model (DeepSeek R1 dkk.) juga mengeluarkannya sendiri — apapun sumbernya,
// isi think TIDAK BOLEH tampil sebagai jawaban ke user.
function stripThinkBlocks(text) {
  // Fast-path HARUS case-insensitive: regex di bawah pakai flag /i, jadi cek awal
  // yang case-sensitive (indexOf) akan salah early-return untuk <THINK>/</Think>
  // dan membocorkannya mentah. Toleransi spasi opsional (< think >) juga, karena
  // sebagian model mengeluarkan dialek itu.
  if (!text || !/think\s*>/i.test(text)) return text;
  return text
    .replace(/<\s*think[^>]*>[\s\S]*?<\s*\/\s*think\s*>/gi, "")
    .replace(/^[\s\S]*?<\s*\/\s*think\s*>/i, "") // closer tanpa opener: semua sebelumnya = reasoning bocor
    .replace(/<\s*think[^>]*>[\s\S]*$/i, "") // opener tanpa closer: sisa stream = reasoning
    .trim();
}

// Hapus rekapitulasi tool / daftar bukti / kalimat pengantar yang tidak perlu
function stripToolRecap(text) {
  if (!text) return text;
  return text
    .replace(
      /Berikut bukti dari tool yang telah dijalankan:?[\s\S]*?(?=Kesimpulan:|$)/gi,
      "",
    )
    .replace(
      /Tool (grep|read|glob|list|bash|web_search|web_fetch|disk_grep|disk_read|disk_glob|disk_list|mcp_[a-z0-9_]+)(?:\s+dengan pattern [^\n]+)?\s+menemukan:?[\s\S]*?(?=\n\n|Tool |Kesimpulan:|$)/gi,
      "",
    )
    .replace(/Kesimpulan:\s*/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Potong jawaban akhir menjadi maksimal 2000 karakter sebagai safety net
function truncateToConcise(text, maxChars = 2000) {
  if (!text) return text;
  // Blok berpagar (```mermaid / ```code) TIDAK dihitung ke kuota keringkasan — diagram
  // dan kode memang panjang & disengaja. Kuota 2000 hanya untuk PROSA. Tanpa ini,
  // diagram besar "memakan" jatah prosa sehingga penjelasan setelahnya terpotong
  // menggantung ("...1. Server Layer (server.cjs)...").
  const prose = text.replace(/```[\s\S]*?```/g, "");
  if (prose.length <= maxChars) return text; // prosa muat -> kirim utuh (diagram gratis)

  // Prosa kepanjangan: potong, tapi jangan di tengah blok berpagar (rusak fence penutup).
  const fences = (text.match(/```/g) || []).length;
  if (fences >= 2 && fences % 2 === 0) {
    const lastFence = text.lastIndexOf("```");
    const nl = text.indexOf("\n", lastFence);
    const keepTo = nl === -1 ? text.length : nl + 1;
    const cap = maxChars + (text.length - prose.length); // beri ruang untuk blok
    return text.slice(0, Math.max(cap, keepTo)).trim();
  }
  return text.slice(0, maxChars).trim() + "...";
}

// Cek apakah jawaban mengandung minimal sebagian dari bukti yang diakses
// Validasi ini memastikan jawaban didasarkan pada bukti tool, TANPA memaksa agent
// menyalin ulang output tool. Cukup sebut file path atau istilah kunci dari bukti.
function hasValidEvidence(summary, evidenceSet) {
  if (evidenceSet.size === 0) return true; // tidak ada tool yang dijalankan, skip
  const sum = summary.toLowerCase();
  for (const ev of evidenceSet) {
    const evLower = ev.toLowerCase();
    // Cek apakah summary menyebut file path yang ada di bukti
    const paths =
      evLower.match(
        /[a-z]:\\[^\s]+|(?:\.\.\/|\/|[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_.-]+/g,
      ) || [];
    for (const p of paths) {
      if (p.length > 3 && sum.includes(p)) return true;
    }
    // Cek apakah summary menyebut istilah/pattern kunci dari bukti (min 8 char)
    const terms = evLower.split(/\s+/).filter((w) => w.length >= 8);
    for (const term of terms) {
      if (sum.includes(term)) return true;
    }
  }
  return false;
}

// ==================================================================================
// HALLUCINATION GUARD — Filter multi-tahap sebelum jawaban dikirim ke user
// ==================================================================================
// Cara model bisa halusinasi:
//   1. Pattern Completion: mengisi "celah" dengan pola yang plausibel, bukan nyata
//   2. Overconfidence: menjawab yakin tanpa pernah membaca/verifikasi evidence
//   3. Context Leakage: mencampur pengetahuan training dengan konteks sesi
//
// Guard ini mendeteksi 3 pola halusinasi paling umum dari agen:
//   A. Klaim lokasi file yang TIDAK pernah di-read/grep
//   B. Klaim keberadaan fungsi/variabel yang TIDAK ditemukan di tool output
//   C. Klaim "sudah diperbaiki/selesai" tanpa bukti edit yang sukses
// ==================================================================================

/**
 * Ekstrak klaim faktual dari teks jawaban model.
 * Klaim = kalimat/frasa yang bisa diverifikasi secara objektif.
 */
function extractClaims(text) {
  const claims = [];

  // POLA A — Klaim lokasi file (misal: "ada di public/app.jsx", "terdapat di server.cjs")
  const fileClaimRegex =
    /(?:ada\s+di|terdapat\s+di|berada\s+di|ditemukan\s+di|terletak\s+di|located\s+in|found\s+in|defined\s+in|inside)\s+([^\s,;.]+\.(jsx?|cjs|css|html|json|md|ts|py))/gi;
  let m;
  while ((m = fileClaimRegex.exec(text)) !== null) {
    claims.push({ type: "file_location", value: m[1], raw: m[0] });
  }

  // POLA B — Klaim keberadaan fungsi/variabel (misal: "fungsi handleClear", "variabel MAX_STEPS").
  // Flag /i: tanpa itu, kalimat berawalan kapital ("Fungsi Xyz") lolos pemeriksaan sepenuhnya.
  const symbolClaimRegex =
    /(?:fungsi|function|const|let|var|class|komponen|component)\s+([A-Za-z_$][A-Za-z0-9_$]{2,})/gi;
  while ((m = symbolClaimRegex.exec(text)) !== null) {
    claims.push({ type: "symbol_existence", value: m[1], raw: m[0] });
  }

  // POLA C — Klaim penyelesaian/keberhasilan. Termasuk active-voice ("telah menulis",
  // "berhasil membuat") supaya klaim seperti "Saya telah menulis roadmap" tertangkap —
  // itu persis kalimat yang dulu lolos sambil file-nya berisi "undefined".
  // Toleransi kata sisipan ("sudah SAYA perbaiki") + bentuk aktif-imperatif
  // ("perbaiki", "tambahkan") selain pasif ("diperbaiki") dan active-progressive
  // ("memperbaiki") — model memakai ketiganya bergantian.
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
 * Cross-reference klaim terhadap evidence nyata dari tool.
 * Return: { grounded: [...], hallucinated: [...] }
 */
function crossReferenceWithEvidence(claims, evidenceSet, editLog) {
  const evidenceText = [...evidenceSet].join("\n").toLowerCase();
  const edits = Array.isArray(editLog) ? editLog : [];
  const successfulEdits = edits.filter((e) => e.ok); // tool edit benar-benar sukses
  const substantiveEdits = successfulEdits.filter((e) => e.bytes > 0); // DAN menulis isi nyata
  const grounded = [];
  const hallucinated = [];

  for (const claim of claims) {
    let verified = false;

    if (claim.type === "file_location") {
      // File location grounded jika file tersebut pernah dibaca/di-grep oleh tool
      const fname = claim.value.toLowerCase().replace(/\\/g, "/");
      verified =
        evidenceText.includes(fname) ||
        evidenceText.includes(claim.value.toLowerCase());
    } else if (claim.type === "symbol_existence") {
      // Symbol grounded jika muncul di output tool (grep/read)
      verified = evidenceText.includes(claim.value.toLowerCase());
    } else if (claim.type === "completion_claim") {
      // INTI PENGUATAN: "sebuah edit terjadi" != "edit itu benar & bermakna".
      // Klaim penyelesaian TIDAK cukup dibuktikan oleh editCount>0 (menulis
      // "undefined" pun dulu lolos). Sekarang:
      //   - klaim penghapusan  -> butuh minimal 1 edit yang SUKSES (isi kosong sah)
      //   - klaim menulis/buat -> butuh minimal 1 edit sukses yang MENULIS isi nyata
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
 * HALLUCINATION GUARD — Entry point utama.
 *
 * Alur kerja:
 *   [TAHAP 1] Tidak ada tools dijalankan & tidak ada evidence → PASS (percakapan biasa)
 *   [TAHAP 2] Ekstrak semua klaim faktual dari jawaban model
 *   [TAHAP 3] Cross-reference setiap klaim dengan evidence tool yang nyata
 *   [TAHAP 4] Verdict:
 *             - 0 klaim halusinasi → PASS (jawaban bersih)
 *             - Ada klaim halusinasi, tapi mayoritas grounded → WARN + strip klaim palsu
 *             - Mayoritas halusinasi → BLOCK (jawaban ditolak, perlu retry)
 *
 * @returns {{ pass: boolean, verdict: 'clean'|'warn'|'block', hallucinated: Array, sanitized: string }}
 */
function hallucinationGuard(text, evidenceSet, editLog) {
  // TAHAP 1: Bypass hanya jika BENAR-BENAR tak ada aktivitas tool: tak ada evidence
  // baca/grep DAN tak ada edit. (Sebelumnya cuma cek evidenceSet — sebuah giliran
  // yang murni mengedit tanpa membaca bisa lolos tanpa verifikasi klaim "selesai".)
  const hasEdits = Array.isArray(editLog) && editLog.length > 0;
  if ((!evidenceSet || evidenceSet.size === 0) && !hasEdits) {
    return { pass: true, verdict: "clean", hallucinated: [], sanitized: text };
  }

  // TAHAP 2: Ekstrak klaim faktual
  const claims = extractClaims(text);

  // Jika tidak ada klaim faktual terdeteksi, jawaban aman (mungkin hanya narasi umum)
  if (claims.length === 0) {
    return { pass: true, verdict: "clean", hallucinated: [], sanitized: text };
  }

  // TAHAP 3: Cross-reference dengan evidence
  const { grounded, hallucinated } = crossReferenceWithEvidence(
    claims,
    evidenceSet || new Set(),
    editLog,
  );

  // TAHAP 4: Verdict
  const hallucinationRate = hallucinated.length / claims.length;

  if (hallucinated.length === 0) {
    // Semua klaim terverifikasi
    return { pass: true, verdict: "clean", hallucinated: [], sanitized: text };
  }

  if (hallucinationRate <= 0.4) {
    // Minoritas klaim halusinasi → strip klaim palsu dari teks, kirim versi bersih
    let sanitized = text;
    for (const h of hallucinated) {
      // Hapus kalimat yang mengandung klaim halusinasi
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

  // Mayoritas klaim tidak terverifikasi → BLOCK, perlu retry
  return {
    pass: false,
    verdict: "block",
    hallucinated,
    sanitized: null,
  };
}
// ==================================================================================

// Muat SEKALIGUS teks persona (text) dan blok prinsip/arsitektur/aturan (principles)
// dari config. Keduanya STATIS — kini keduanya hidup di config/prompts.json (single
// source of truth), bukan lagi 2/3-nya di-hardcode di file ini. Yang tetap di kode
// hanyalah injeksi DINAMIS (MODE EFFORT, pre-search, ROUTE) yang dihitung runtime.
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
// Also on globalThis: the per-request module reload (see agentMemory note above)
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
// chat.cjs so the plain-chat path gets the same protection).

// --- LANGGRAPH STATE DEFINITION ---
const AgentState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  step: Annotation({ reducer: (x, y) => y, default: () => 1 }),
  edits: Annotation({ reducer: (x, y) => x + y, default: () => 0 }),
  // Bukti edit yang kaya (bukan cuma hitungan): tiap entri {tool, target, ok, bytes}.
  // Dipakai hallucination guard untuk memverifikasi klaim "selesai" berdasarkan
  // edit yang BENAR-BENAR sukses & menulis isi nyata, bukan sekadar tool dipanggil.
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
  // Plafon langkah untuk giliran ini. 0 = pakai MAX_STEPS default. Saat user memilih
  // "lanjutkan" setelah jeda budget, plafon diperpanjang (bukan direset), sehingga
  // langkah menjadi checkpoint "masih lanjut?" alih-alih tebing yang menggagalkan.
  stepCeiling: Annotation({ reducer: (x, y) => y, default: () => 0 }),
});

/**
 * Self‑agent loop – operates on WOLFSPACE's own source code via function‑calling tools.
 * @param {Object} opts - {history, port, cloud}
 * @param {function(Object):void} emit - event emitter (e.g. SSE writer)
 * @param {Object} ctl - {isCancelled, setCurReq, depth}
 */
async function selfAgentStream(payload, emit, ctl = {}) {
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
  // Bila payload menyebut folder aktif, seluruh mutasi file (broker) + bash (Docker)
  // agent dikurung ke folder itu lewat context.workspaceRoot. Divalidasi: harus
  // direktori yang benar-benar ada; kalau tidak, agent berjalan normal (tak terkurung).
  let _wsRoot = null;
  if (workspace_root) {
    try {
      const _rp = path.resolve(workspace_root);
      const _st = require("fs").statSync(_rp);
      if (_st.isDirectory()) _wsRoot = _rp;
    } catch (_) {
      _wsRoot = null;
    }
  }
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
  loadCloudKeys(); // ensure keys are loaded
  fillCloudKey(cloud);

  // Resolve a cloud model if none provided (pick first available key)
  if (!(cloud && cloud.key)) {
    const prov = Object.keys(CLOUD_KEYS).find(
      (p) => CLOUD_KEYS[p] && CLOUD_KEYS[p].key,
    );
    if (prov)
      cloud = {
        provider: prov,
        key: CLOUD_KEYS[prov].key,
        model: CLOUD_KEYS[prov].model,
        baseUrl: CLOUD_KEYS[prov].baseUrl,
      };
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

  let sessionSnapshotId = null;
  const { rollback } = require("./snapshot.cjs");
  const ensureBackup = () => {
    if (!sessionSnapshotId) {
      sessionSnapshotId = qBackup();
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

  // Pemetaan batas kontext token, slicing riwayat pesan, dan instruksi sesuai mode effort yang dipilih (0=Low, 1=Medium, 2=High)
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
  // Blok STATIS (PRINSIP/PETA/ATURAN) kini dari config (SELF_FC_PRINCIPLES) — bukan
  // hardcode. Yang ditambahkan di kode hanyalah MODE EFFORT yang DINAMIS (nilai
  // dihitung dari effortLevel runtime). Rakitan akhir byte-identik dengan versi lama.
  messages[0].content +=
    "\n\n" +
    SELF_FC_PRINCIPLES +
    `

[MODE EFFORT AKTIF: ${effortModeName} (Context Token Budget: ~${effortTokenBudget} tokens | History Limit: ${effortMaxTurns} msgs)]
${effortLevel === 0 ? "Fokus pada penyelesaian cepat dan hemat token. Jawab langsung ke inti." : effortLevel === 2 ? "Fokus pada analisis mendalam, RCA secara kritis, dan verifikasi silang semua bukti." : "Lakukan investigasi standar secara terukur."}`;
  const MAX_STEPS = effortLevel === 0 ? 6 : effortLevel === 2 ? 20 : 14;
  let edits = 0;
  // Diagram Mermaid dari architecture_map: DIAGRAM adalah jawabannya. Prompt menyuruh
  // model ringkas & jangan copy output tool, jadi ia sering tak menempel blok mermaid.
  // Kita simpan blok terakhir lalu tempelkan otomatis di finalisasi bila summary tak
  // memuatnya — supaya diagram selalu terender, tak bergantung kepatuhan model.
  let lastArchMermaid = null;
  let fallbackCount = 0;
  let forceRetryCount = 0;
  // Session state persists across HITL resumes (keyed by thread_id)
  if (!_sessionState.has(thread_id)) {
    _sessionState.set(thread_id, {
      callCounts: {},
      callCountsByName: {},
      editFailCount: 0,
      grepReadSteps: 0,
      lastReadFile: null,
      readFileCount: 0,
    });
  }
  const sess = _sessionState.get(thread_id);
  const callCounts = sess.callCounts;
  const callCountsByName = sess.callCountsByName;
  let editFailCount = sess.editFailCount || 0;
  let grepReadSteps = sess.grepReadSteps;
  let lastReadFile = sess.lastReadFile;
  let readFileCount = sess.readFileCount;
  const _TRANSIENT_SELF =
    /ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|timeout|EAI_AGAIN|network|ECONNREFUSED|ENOTFOUND|503|404|429|too busy|Service Unavailable|service_unavailable|Rate limit|FreeUsageLimit|insufficient_quota/i;

  // Load MCP tools dynamically
  const mcpClient = require("./mcp-client.cjs");
  let currentTools = [...SELF_TOOLS];
  try {
    const mcpTools = await mcpClient.getTools();
    if (mcpTools.length > 0) {
      currentTools = currentTools.concat(mcpTools);
      // HARDCODE RULE: Filter web_search/web_fetch HANYA jika pertanyaan jelas tentang Github/MCP
      const lastMsg =
        history && history.length > 0
          ? history[history.length - 1].content
          : "";
      const isMcpQuery = /github|repo|issue|commit|pull request|mcp/i.test(
        lastMsg,
      );
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

      // Injeksi kesadaran MCP ke dalam otak/Prompt Sistem AI
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
        ? "(OPTIONAL) Maks 5 kata menjelaskan intent tool ini."
        : "(WAJIB) 1 kalimat SINGKAT — apa yang dilakukan tool ini.",
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
    const workflow = new StateGraph(AgentState)
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
        const reply = await askCloudTools(
          cloud,
          [{ role: "user", content: prompt }],
          [],
        );
        const lines = (reply.content || "")
          .split("\n")
          .filter((l) => l.trim().startsWith("-"))
          .map((l) => l.trim().replace(/^- /, ""));
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
          sysMsg.content +=
            "\n\n[TASK CHECKLIST AKTIF]:\n" +
            state.task_checklist.map((t) => "- " + t).join("\n") +
            "\nFokus selesaikan item di atas secara berurutan dengan menggunakan tools.";
          activeMessages[0] = sysMsg;
        }

        let msg;
        try {
          msg = await askCloudTools(cloud, activeMessages, currentTools);
        } catch (e) {
          if (
            _TRANSIENT_SELF.test(e.message || "") &&
            state.fallbackCount < 3
          ) {
            const fb = Object.keys(CLOUD_KEYS).find(
              (p) => p !== cloud.provider && CLOUD_KEYS[p] && CLOUD_KEYS[p].key,
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
          return { stopReason: "error" };
        }
        if (isCancelled()) return { stopReason: "cancelled_after_tools" };

        // Reasoning bisa bocor lewat dua jalur: terselip di content (tag <think> dari
        // cloud.cjs/model) atau model menghabiskan giliran HANYA berpikir (content
        // kosong, field reasoning terisi). Bersihkan yang pertama; untuk yang kedua,
        // dorong model menjawab ulang alih-alih menampilkan monolog internalnya.
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
          msg.content = "(model tidak memberikan jawaban final)";
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
        const localEditLog = [];

        const runOne = async (tc) => {
          let args = {};
          const rawArgs = tc.function.arguments || "";
          if (rawArgs.trim()) {
            try {
              args = JSON.parse(rawArgs);
            } catch (e) {
              // JSON argumen gagal parse (mis. content besar yang ter-truncate). JANGAN
              // jalankan tool dengan args kosong — itulah yang membuat write_artifact
              // menulis "undefined" lalu melapor sukses (halusinasi). Kembalikan error
              // agar model mengirim ulang JSON yang valid & ringkas.
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
          // Per-name counter: detects loop where agent retries same tool with slightly different args
          callCountsByName[tc.function.name] =
            (callCountsByName[tc.function.name] || 0) + 1;
          if (callCounts[sig] > 3) return { stop: true }; // exact same call > 3x: hard stop
          // Name-based loop detection only applies to ACTION tools. Read-only tools
          // (read/grep/glob/...) legitimately repeat across DIFFERENT files on any
          // non-trivial task — killing the run at the 6th `read` was a false positive
          // that also made the readFileCount>=8 notice below unreachable. Identical-args
          // loops are still caught for every tool by the callCounts[sig] check above.
          const isReadOnlyTool =
            /^(disk_grep|disk_read|disk_glob|disk_list|web_search|web_fetch|glob|grep|read|list|architecture_map|terminal_read|skill_list|mcp_[a-z0-9_]+)$/i.test(
              tc.function.name,
            );
          if (!isReadOnlyTool && callCountsByName[tc.function.name] > 5)
            return { stop: true, reason: "tool_name_loop" }; // same action-tool > 5x: hard stop

          if (
            /^(edit|write|replace_file_content|write_artifact)$/i.test(
              tc.function.name,
            )
          )
            ensureBackup();
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
          // Rekam bukti edit yang kaya untuk hallucination guard: apakah tool edit
          // benar-benar SUKSES (ok) dan berapa byte isi yang ditulis. "undefined"
          // atau konten kosong -> bytes 0 -> tak bisa menopang klaim "sudah ditulis".
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
          // Hanya output tool yang SUBSTANTIF dihitung sebagai evidence. Hasil kosong /
          // "(tidak ada file cocok)" / "(ok)" bukan bukti apa pun; kalau dimasukkan,
          // hasValidEvidence akan memaksa jawaban "mengutip" ketiadaan itu, dan untuk
          // pertanyaan pengetahuan umum model malah mengelak ("silakan minta saya membuat
          // file...") alih-alih menjawab dari pengetahuannya.
          const _outStr = (r.output || "").trim();
          const _nonSubstantive =
            !_outStr ||
            /^\(?\s*(ok|tidak ada|tidak ditemukan|no match|not found|nothing|kosong|empty|0\s+(hasil|match|file|baris))/i.test(
              _outStr,
            );
          if (r.ok && !_nonSubstantive) localAccessed.add(r.output);
          if (
            !r.ok &&
            SYSTEM_RULES.REQUIRED_TOOL_SEQUENCE.includes(tc.function.name)
          )
            localFailed.add(tc.function.name);

          // Track consecutive edit failures
          if (tc.function.name === "edit" && !r.ok) {
            editFailCount++;
            sess.editFailCount = editFailCount;
          } else if (tc.function.name === "edit" && r.ok) {
            editFailCount = 0;
            sess.editFailCount = 0;
          }

          const extra = {};
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
            // path final hasil resolve tool (kurungan workspace bisa me-remap ke
            // folder lain dari yang diminta) — dipakai UI utk preview yang akurat.
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
          if (callCounts[sig] >= 2)
            out +=
              "\n[SYSTEM: Panggilan identik diulang " +
              callCounts[sig] +
              "x — HASILNYA SAMA. Jangan ulangi. Gunakan read untuk melihat konten file, lalu edit SEKALI dengan old_string yang tepat.]";
          if (editFailCount >= 2)
            out +=
              "\n[SYSTEM: edit gagal " +
              editFailCount +
              "x berturut-turut. BERHENTI mencoba edit. Gunakan tool read untuk membaca baris yang tepat dari file, lalu buat 1 edit dengan old_string yang PERSIS sesuai konten file.]";
          if (callCountsByName[tc.function.name] > 3)
            out +=
              "\n[SYSTEM: Tool " +
              tc.function.name +
              " sudah dipanggil " +
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
                "(batas kedalaman sub‑agent tercapai — kerjakan sub‑tugas ini langsung dengan tool biasa)";
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
                out: subSum || ret || "(sub‑agent selesai tanpa ringkasan)",
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
        const EXECUTION_TOOLS = ["bash"];
        const executionCalls = calls.filter((tc) =>
          EXECUTION_TOOLS.includes(tc.function.name),
        );
        const nonExecutionCalls = calls.filter(
          (tc) => !EXECUTION_TOOLS.includes(tc.function.name),
        );

        if (executionCalls.length > 0 && !state.hitlApproved) {
          // Execute non-execution tools (grep, read, etc.) directly so results are available
          const nonExecMessages = [];
          for (const tc of nonExecutionCalls) {
            let tcArgs = {};
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
              content: "Menunggu persetujuan user...",
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
            finalSummary:
              "Menunggu persetujuan (HITL) untuk " +
              executionCalls.length +
              " eksekusi perintah.",
            waitForAnswer: false,
            hitlPending: true,
            pendingToolCalls: executionCalls,
          };
        }

        // Sequential execution (not Promise.all) to preserve emit order and avoid race conditions
        const results = [];
        for (const tc of calls) {
          const r = await runOne(tc);
          results.push(r);
        }

        const toolMessages = [];
        let stopReason = "";
        let waitForAnswer = false;
        let localSummary = "";

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
              localSummary = "Menunggu jawaban user: " + results[i].question;
            } else {
              stopReason = "repeated_tool_calls";
              localSummary =
                msg.content ||
                "Berhenti: panggilan tool berulang tanpa kemajuan.";
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
            let cmdObj = {};
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
                const fileToolsMod = require("./tools/file-tools.cjs");
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
          stopReason,
          waitForAnswer,
          hitlPending: stopReason === "hitl",
          hitlApproved: state.hitlApproved, // Keep approval through the session (reset only on new user message)
          finalSummary: localSummary,
        };
      })
      .addNode("validate", async (state) => {
        const msg = state.messages[state.messages.length - 1];
        const cleanContent = stripThinkBlocks(msg.content || "");
        const hasContent = cleanContent && cleanContent.trim();
        const rawContent = hasContent
          ? cleanContent
          : "(tidak ada respons dari model)";

        // Anti-tutorial: model punya tool eksekusi nyata (bash/sandbox_run), jadi jawaban
        // yang MENSIMULASIKAN hasil atau menyerah dengan "sebagai AI saya tidak bisa
        // menjalankan" adalah halusinasi peran — paksa ia benar-benar memanggil tool.
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
        fallback = sanitizeOutput(fallback);
        fallback = stripToolRecap(fallback);
        fallback = truncateToConcise(fallback, 2000);
        // Jaring pengaman: pastikan diagram architecture_map ikut terkirim (terender di UI)
        // walau model tak menempelnya, atau menempel PARSIAL (fence pembuka tanpa penutup —
        // sering terjadi saat model meringkas/memotong sendiri). Ditambahkan SETELAH
        // truncation agar blok utuh.
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
        // Evaluasi jawaban model sebelum dikirim ke user.
        // Jangan sentuh jawaban sampai proses evaluasi selesai.
        // Jika jawaban mengandung halusinasi mayoritas → retry.
        // Jika minoritas → strip klaim palsu, kirim versi bersih.
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
            // Batas retry tercapai. JANGAN buang jawaban model: tampilkan apa adanya
            // di UI, dan taruh peringatan "belum terverifikasi" HANYA di output agent
            // (timeline) sebagai satu langkah — bukan menempel di teks jawaban.
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
                " klaim tak cocok dengan bukti tool run ini" +
                (_unv ? " — " + _unv : "") +
                ". Jawaban tetap ditampilkan; mohon verifikasi mandiri.",
            });
            // fallback TETAP = jawaban asli model (rawContent yg sudah disanitasi di
            // atas). Sengaja tak diganti pesan generik.
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
                  content: `PERINGATAN SISTEM: Jawaban Anda mengandung klaim yang TIDAK TERBUKTI dari hasil tool:\n${hallucinatedList}\n\nKamu DILARANG menyebutkan sesuatu yang tidak ada di bukti tool. Baca ulang hasil tool yang ada, lalu berikan jawaban HANYA berdasarkan apa yang BENAR-BENAR ditemukan. Jika tidak ada buktinya, katakan "tidak ditemukan".`,
                },
              ],
              forceRetryCount: state.forceRetryCount + 1,
            };
          }
        } else if (hGuard.verdict === "warn") {
          // Minoritas halusinasi — pakai versi yang sudah di-strip
          dlog("self", "info", "hallucination_guard stripped claims", {
            stripped: hGuard.hallucinated.length,
          });
          fallback = hGuard.sanitized || fallback;
        }
        // verdict === 'clean': jawaban bersih, lanjut
        // ── END HALLUCINATION GUARD ─────────────────────────────────────────────────

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

        const runRes = hasContent ? await runReply(fallback) : null;
        emit({
          t: "adone",
          steps: state.step,
          edits: state.edits,
          summary: fallback,
          backup: sessionSnapshotId,
          run: runRes,
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
        // Jeda-checkpoint (bukan tebing): kalau plafon langkah tercapai, graph berhenti
        // di sini DENGAN state tersimpan di checkpointer — final handler menandainya
        // sebagai "dijeda, bisa dilanjutkan", tanpa rollback. Jalur utama tetap natural
        // completion (validate -> finished); ini hanya rem yang memberi user pilihan.
        if (state.step >= (state.stepCeiling || MAX_STEPS)) return END;
        return "executor";
      })
      .addConditionalEdges("validate", (state) => {
        if (state.stopReason === "finished") return END;
        return "executor";
      });

    const app = workflow.compile({ checkpointer: agentMemory });
    // recursionLimit LangGraph menghitung SUPER-STEP (tiap eksekusi node), sedang app
    // menghitung "step" hanya di node tools. Satu app-step = executor + tools = ~2
    // super-step, plus planner/validate/retry. Default LangGraph (25) lebih kecil dari
    // super-step yang dibutuhkan untuk mencapai MAX_STEPS (14-20) -> graph dilempar
    // "Recursion limit reached" SEBELUM logika stop/pause graceful app jalan. Skalakan
    // supaya app selalu berhenti duluan (loop app sendiri sudah bounded: callCounts,
    // forceRetryCount<3, fallbackCount<3, step>=ceiling).
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

        const toolResults = [];
        for (const pendingTc of pendingTools) {
          let args = {};
          try {
            args = JSON.parse(pendingTc.function.arguments || "{}");
          } catch (_) {}
          if (
            /^(edit|write|replace_file_content|write_artifact)$/i.test(
              pendingTc.function.name,
            )
          )
            ensureBackup();

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
      // Continue setelah jeda-budget: ambil checkpoint, perpanjang plafon satu window
      // lagi, lalu lanjutkan dari state yang tersimpan. Tidak ada rollback, tidak ada
      // re-plan — persis melanjutkan pekerjaan yang tadi dijeda.
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
        const fileToolsMod = require("./tools/file-tools.cjs");
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
              hint: "Agent logic ada di agent/self_agent.cjs",
            },
            {
              keywords: [
                "tool definition",
                "tool-def",
                "daftar tool",
                "definisi tool",
              ],
              hint: "Tool definitions ada di agent/tools/tool-definitions.cjs",
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
          let keywords = [];
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
            const grepResults = [];
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
        const runRes = finalState.finalSummary
          ? await runReply(finalState.finalSummary)
          : null;
        emit({
          t: "adone",
          steps: finalState.step,
          edits: finalState.edits,
          summary: finalState.finalSummary,
          backup: sessionSnapshotId,
          run: runRes,
        });
      }
    } else if (
      finalState.step >= (finalState.stepCeiling || MAX_STEPS) &&
      finalState.stopReason !== "finished"
    ) {
      // Plafon langkah tercapai TANPA natural completion. Ini BUKAN kegagalan —
      // agent masih bekerja produktif, cuma butuh window langkah berikutnya. Jangan
      // rollback: state tersimpan di checkpointer (thread_id), jadi tawarkan lanjut.
      // Natural completion tetap jalur selesai yang sebenarnya; ini jeda, bukan tebing.
      dlog("self", "info", "stop", {
        reason: "paused_budget",
        step: finalState.step,
      });
      const editedNote =
        (finalState.edits || 0) > 0
          ? ` (${finalState.edits} file diedit sejauh ini)`
          : "";
      finalSummary = `Dijeda di langkah ${finalState.step}${editedNote} — belum selesai. Pilih "Lanjutkan" untuk meneruskan.`;
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
        finalSummary = "Cloud API error — coba lagi dalam beberapa detik.";
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
    // Pertahanan berlapis: kalau recursionLimit LangGraph tetap terpicu (kasus tepi),
    // itu BUKAN crash — agent kehabisan "putaran", bukan gagal. Jangan rollback edit
    // yang sudah sukses, dan beri pesan yang bisa dilanjutkan (bukan error mentah).
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
      rollback(sessionSnapshotId);
      emit({
        t: "err",
        m: `[Auto-Rollback] Agen crash internal. Proyek dipulihkan (Snapshot: ${sessionSnapshotId}).`,
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

module.exports = { selfAgentStream };
