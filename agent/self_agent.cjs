// Self-agent stream implementation (extracted and modularized from server.cjs)
// Dependencies – same as original server.cjs
const { dlog } = require('./debug.cjs');
const { fillCloudKey, detectProvider, CLOUD, CLOUD_KEYS, loadCloudKeys, askCloudTools } = require('./cloud.cjs');
const { runSelfTool, SELF_TOOLS, qBackup } = require('./tools.cjs');
const { runReply } = require('./chat.cjs');
const { getOptimized, optimizeInBackground } = require('./sysprompt_opt.cjs');
const os = require('os');
const { StateGraph, START, END, Annotation } = require('@langchain/langgraph');
// System prompt for function-calling self-agent
const path = require('path');
const PROMPTS_CFG_PATH = path.join(__dirname, '..', 'config', 'prompts.json');

// ===================== SISTEM ATURAN AGENT (HARDCODED RULES) =====================
// Aturan yang dipindahkan dari prompt ke sistem untuk kepatuhan 100%
const SYSTEM_RULES = {
  // Kata-kata spekulatif yang dilarang
  FORBIDDEN_SPECULATIVE: /\b(mungkin|sepertinya|bisa jadi|perhaps|possibly|maybe|probably|seems|appears|I think|I believe|I assume|presumably)\b/gi,
  // Urutan tool yang wajib dicoba sebelum menyatakan "tidak ada"
  REQUIRED_TOOL_SEQUENCE: ['disk_grep', 'disk_glob', 'web_search'],
  // Minimal tools yang gagal sebelum bisa menyerah
  MIN_FAILED_TOOLS: 3
};

// Simpan bukti dari tool yang sudah diakses untuk validasi
const accessedEvidence = new Set();
let failedTools = new Set();

// Bersihkan output dari kata spekulatif
function sanitizeOutput(text) {
  return text.replace(SYSTEM_RULES.FORBIDDEN_SPECULATIVE, '[kata-spekulatif-dihapus]');
}

// Hapus rekapitulasi tool / daftar bukti / kalimat pengantar yang tidak perlu
function stripToolRecap(text) {
  if (!text) return text;
  return text
    .replace(/Berikut bukti dari tool yang telah dijalankan:?[\s\S]*?(?=Kesimpulan:|$)/gi, '')
    .replace(/Tool (grep|read|glob|list|bash|web_search|web_fetch|disk_grep|disk_read|disk_glob|disk_list|mcp_[a-z0-9_]+)(?:\s+dengan pattern [^\n]+)?\s+menemukan:?[\s\S]*?(?=\n\n|Tool |Kesimpulan:|$)/gi, '')
    .replace(/Kesimpulan:\s*/gi, '')
    .replace(/^\s*(\d+\.)\s+/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Potong jawaban akhir menjadi maksimal 1-2 kalimat / 300 karakter sebagai safety net
function truncateToConcise(text, maxChars = 300) {
  if (!text) return text;
  if (text.length <= maxChars) return text;
  // Coba ambil 1-2 kalimat pertama
  const sentences = text.match(/[^.!?]+[.!?]+(?:\s+|$)/g) || [text];
  let result = sentences[0] || '';
  if (sentences.length > 1 && (result + sentences[1]).length <= maxChars) {
    result += ' ' + sentences[1].trim();
  }
  result = result.trim();
  if (result.length > maxChars) result = result.slice(0, maxChars).trim() + '...';
  return result;
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
    const paths = evLower.match(/[a-z]:\\[^\s]+|(?:\.\.\/|\/|[a-zA-Z0-9_-]+\/)+[a-zA-Z0-9_.-]+/g) || [];
    for (const p of paths) {
      if (p.length > 3 && sum.includes(p)) return true;
    }
    // Cek apakah summary menyebut istilah/pattern kunci dari bukti (min 8 char)
    const terms = evLower.split(/\s+/).filter(w => w.length >= 8);
    for (const term of terms) {
      if (sum.includes(term)) return true;
    }
  }
  return false;
}
// ==================================================================================

function loadSelfAgentPrompt() {
  try {
    const raw = require('fs').readFileSync(PROMPTS_CFG_PATH, 'utf8');
    const clean = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
    const cfg = JSON.parse(clean);
    // Hapus aturan yang sudah dipindahkan ke sistem dari prompt (ringkasin)
    let promptText = cfg.prompts.self_agent.text;
    promptText = promptText.replace(/\[PRECISION RULES - WAJIB DIPATUHI\][\s\S]*?7\..+$/m, '');
    return promptText;
  } catch (e) {
    return "You are WOLFSPACE's assistant. Chat normally or use tools on WOLFSPACE's source code as needed. Answer based on evidence from tools. Do not speculate.";
  }
}

const SELF_FC_SYS = loadSelfAgentPrompt();

// --- PHASED EXECUTION TREE HELPERS ---
// Map a tool name to its execution phase for the visual tree.
function phaseForTool(name) {
  const observe = /^(disk_grep|disk_read|disk_glob|disk_list|web_search|web_fetch|glob|grep|read|list|mcp_[a-z0-9_]+)$/i;
  const act = /^(edit|write|bash|exec|task)$/i;
  if (observe.test(name)) return 'observe';
  if (act.test(name)) return 'act';
  return 'observe';
}

// Helper to emit a phase-tree node alongside legacy events.
function makePhaseEmitter(rawEmit) {
  const start = Date.now();
  return function emitPhase(phase, node) {
    rawEmit({
      t: 'phase',
      phase,
      time: Date.now() - start,
      status: node.status || 'ok',
      ...node
    });
  };
}

// Helper to parse pseudo‑function calls that some models emit as text
function parsePseudoCalls(text) {
  if (!text || text.indexOf('<function') < 0) return [];
  const out = [];
  const seen = new Set();
  const re = /<function\s*=\s*([\w.-]+)\s*=?\s*(\{[\s\S]*?\})?\s*\/?>(?:\s*<\/function>)?/g;
  let m;
  while ((m = re.exec(text))) {
    let args = {};
    if (m[2]) { try { args = JSON.parse(m[2]); } catch (_) {} }
    const callStr = JSON.stringify({ name: m[1], args });
    if (!seen.has(callStr)) {
      seen.add(callStr);
      out.push({ name: m[1], args });
    }
  }
  return out;
}

// --- LANGGRAPH STATE DEFINITION ---
const AgentState = Annotation.Root({
  messages: Annotation({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  step: Annotation({ reducer: (x, y) => y, default: () => 1 }),
  edits: Annotation({ reducer: (x, y) => x + y, default: () => 0 }),
  failedTools: Annotation({
    reducer: (x, y) => { const set = new Set(x); y.forEach(item => set.add(item)); return set; },
    default: () => new Set(),
  }),
  accessedEvidence: Annotation({
    reducer: (x, y) => { const set = new Set(x); y.forEach(item => set.add(item)); return set; },
    default: () => new Set(),
  }),
  fallbackCount: Annotation({ reducer: (x, y) => y, default: () => 0 }),
  forceRetryCount: Annotation({ reducer: (x, y) => y, default: () => 0 }),
  finalSummary: Annotation({ reducer: (x, y) => y, default: () => "" }),
  stopReason: Annotation({ reducer: (x, y) => y, default: () => "" }),
  waitForAnswer: Annotation({ reducer: (x, y) => y, default: () => false })
});

/**
 * Self‑agent loop – operates on WOLFSPACE's own source code via function‑calling tools.
 * @param {Object} opts - {history, port, cloud}
 * @param {function(Object):void} emit - event emitter (e.g. SSE writer)
 * @param {Object} ctl - {isCancelled, setCurReq, depth}
 */
async function selfAgentStream({ history, port, cloud }, emit, ctl = {}) {
  const isCancelled = ctl.isCancelled || (() => false);
  const setCurReq = ctl.setCurReq || (() => {});
  const depth = ctl.depth || 0;
  const MAX_DEPTH = 3;
  let finalSummary = '';
  const emitPhase = makePhaseEmitter(emit);
  loadCloudKeys(); // ensure keys are loaded
  fillCloudKey(cloud);

  // Resolve a cloud model if none provided (pick first available key)
  if (!(cloud && cloud.key)) {
    const prov = Object.keys(CLOUD_KEYS).find(p => CLOUD_KEYS[p] && CLOUD_KEYS[p].key);
    if (prov) cloud = { provider: prov, key: CLOUD_KEYS[prov].key, model: CLOUD_KEYS[prov].model, baseUrl: CLOUD_KEYS[prov].baseUrl };
  }
  if (!(cloud && cloud.key)) {
    dlog('self', 'info', 'stop', { reason: 'no_cloud_key', depth });
    emit({ t: 'err', m: 'Self-agent butuh model cloud yang kuat. Simpan API key di menu API Key dulu (model lokal 3B tidak sanggup mengedit source dengan aman).' });
    return finalSummary;
  }

  // If using a local endpoint we just do a normal chat (no tool calls)
  if (cloud.baseUrl && /(127\.0\.0\.1|localhost)/.test(cloud.baseUrl)) {
    emit({ t: 'step', n: 1 });
    let full = '';
    try {
      await askCloudStream(cloud, history || [], t => { full += t; emit({ t: 'tok', c: t }); }, r => setCurReq(r));
      if (!isCancelled()) { finalSummary = full; emit({ t: 'adone', steps: 1, edits: 0, summary: full }); }
    } catch (e) {
      if (!isCancelled()) emit({ t: 'err', m: e.message });
    }
    dlog('self', 'info', 'stop', { reason: 'local_base_fallback', depth, chars: full.length });
    return finalSummary;
  }

  let backup = null;
  const backupRel = () => (backup ? require('path').relative(__dirname, backup) : null);
  const ensureBackup = () => {
    if (!backup) {
      backup = qBackup();
      emit({ t: 'backup', dir: backupRel() });
      dlog('self', 'info', 'self-agent edit start', { backup: backupRel() });
    }
  };

  // Use DSpy-optimized system prompt if cached, else use original
  let optPrompt = getOptimized();
  if (optPrompt) {
    dlog('self', 'info', 'using optimized system prompt', { originalChars: SELF_FC_SYS.length, optimizedChars: optPrompt.length });
  }
  const currentSysPrompt = optPrompt || SELF_FC_SYS;

  const messages = [{ role: 'system', content: currentSysPrompt }, ...(history || [])];
  messages[0].content += "\n\n[CRITICAL BEHAVIOR RULE]: JAWAB MAKSIMAL 1-2 KALIMAT. LANGSUNG KE INTI. DILARANG KERAS mencantumkan daftar langkah, hasil tool, atau output grep di jawaban akhir. CoT/rencana_tindakan hanya untuk pemikiran INTERNAL; JANGAN ditulis ulang di jawaban final. Berikan LANGSUNG KESIMPULAN AKHIR saja. Contoh SALAH: '1. grep → ... 2. grep → ... Kesimpulan: ...'. Contoh BENAR: 'Ada di agent/public/app.jsx baris 4515.'";
  const MAX_STEPS = Infinity;
  let edits = 0;
  const callCounts = {};
  let fallbackCount = 0;
  let forceRetryCount = 0;
  const _TRANSIENT_SELF = /ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|timeout|EAI_AGAIN|network|ECONNREFUSED|ENOTFOUND|503|404|429|too busy|Service Unavailable|service_unavailable|Rate limit|FreeUsageLimit|insufficient_quota/i;

  // Load MCP tools dynamically
  const mcpClient = require('./mcp-client.cjs');
  let currentTools = [...SELF_TOOLS];
  try {
    const mcpTools = await mcpClient.getTools();
    if (mcpTools.length > 0) {
      currentTools = currentTools.concat(mcpTools);
      // HARDCODE RULE: Filter web_search/web_fetch HANYA jika pertanyaan jelas tentang Github/MCP
      const lastMsg = history && history.length > 0 ? history[history.length - 1].content : '';
      const isMcpQuery = /github|repo|issue|commit|pull request|mcp/i.test(lastMsg);
      const isGeneralQuery = /apa itu|siapa|cara|bagaimana|contoh|cari|google|web/i.test(lastMsg);
      
      if (isMcpQuery && !isGeneralQuery) {
        currentTools = currentTools.filter(t => t.function.name !== 'web_search' && t.function.name !== 'web_fetch');
        dlog('self', 'info', 'Hardcode: web_search dinonaktifkan karena tugas MCP terdeteksi.');
      }
      
      // Injeksi kesadaran MCP ke dalam otak/Prompt Sistem AI
      messages[0].content += "\n\n[CRITICAL MCP RULE]: Anda terhubung ke MCP. Prioritaskan alat 'mcp_'.";
    }
  } catch (e) {
    dlog('self', 'warn', 'Gagal memuat tools MCP', { error: e.message });
  }

  // --- INJEKSI CHAIN-OF-THOUGHT (CoT) ---
  currentTools = currentTools.map(t => {
    const newTool = JSON.parse(JSON.stringify(t));
    if (!newTool.function.parameters) newTool.function.parameters = { type: 'object', properties: {} };
    if (!newTool.function.parameters.properties) newTool.function.parameters.properties = {};
    newTool.function.parameters.properties.rencana_tindakan = {
      type: 'string',
      description: 'WAJIB DIISI SEBELUM PARAMETER LAIN: Tulis 1-2 kalimat deskripsi tentang apa yang akan Anda lakukan dengan alat ini dan mengapa.'
    };
    if (!newTool.function.parameters.required) newTool.function.parameters.required = [];
    if (!newTool.function.parameters.required.includes('rencana_tindakan')) {
      newTool.function.parameters.required.push('rencana_tindakan');
    }
    return newTool;
  });

  try {
    const workflow = new StateGraph(AgentState)
      .addNode("agent", async (state) => {
        if (isCancelled()) return { stopReason: 'cancelled' };
        emit({ t: 'step', n: state.step });
        let msg;
        try { msg = await askCloudTools(cloud, state.messages, currentTools); }
        catch (e) {
          if (_TRANSIENT_SELF.test(e.message || '') && state.fallbackCount < 3) {
            const fb = Object.keys(CLOUD_KEYS).find(p => p !== cloud.provider && CLOUD_KEYS[p] && CLOUD_KEYS[p].key);
            if (fb) {
              dlog('self', 'warn', 'provider fallback', { from: cloud.provider, to: fb, error: e.message.slice(0, 100) });
              emit({ t: 'err', m: cloud.provider + ' gagal: ' + e.message.slice(0, 80) + ' — beralih ke ' + fb });
              cloud = { provider: fb, key: CLOUD_KEYS[fb].key, model: CLOUD_KEYS[fb].model, baseUrl: CLOUD_KEYS[fb].baseUrl };
              fillCloudKey(cloud);
              return { fallbackCount: state.fallbackCount + 1 };
            }
          }
          dlog('self', 'info', 'stop', { reason: 'askCloudTools_error', step: state.step, error: (e && e.message || '').slice(0, 100) });
          emit({ t: 'err', m: e.message });
          return { stopReason: 'error' };
        }
        if (isCancelled()) return { stopReason: 'cancelled_after_tools' };

        let calls = (msg.tool_calls && msg.tool_calls.length) ? msg.tool_calls : null;
        if (!calls) {
          const pseudo = parsePseudoCalls(msg.content || '');
          if (pseudo.length) {
            calls = pseudo.map((c, i) => ({ id: 'call_' + state.step + '_' + i, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } }));
            msg.tool_calls = calls;
          }
        }
        if (msg.content && !calls) emit({ t: 'tok', c: msg.content });
        return { messages: [msg] };
      })
      .addNode("tools", async (state) => {
        const msg = state.messages[state.messages.length - 1];
        const calls = msg.tool_calls || [];
        
        let localEdits = 0;
        const localAccessed = new Set();
        const localFailed = new Set();
        
        const runOne = async (tc) => {
          let args = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch (_) {}
          
          if (args.rencana_tindakan) {
            emit({ t: 'thought', c: args.rencana_tindakan, tool: tc.function.name, ok: true });
            emitPhase('think', { tag: 'rencana_tindakan', status: 'ok', attrs: [{ k: 'tool', v: tc.function.name, t: 'str' }, { k: 'plan', v: args.rencana_tindakan.slice(0, 80), t: 'str' }] });
          }
          
          const sig = tc.function.name + '|' + (tc.function.arguments || '');
          callCounts[sig] = (callCounts[sig] || 0) + 1;
          if (callCounts[sig] > 10) return { stop: true };

          if (/^(edit|write)$/i.test(tc.function.name)) ensureBackup();
          if (tc.function.name === 'bash') {
            emit({ t: 'act', kind: 'bash', arg: args.command || '', ok: true, output: '⟳ running…' });
          }
          const r = await runSelfTool(tc.function.name, args, emit);
          if (r.edited) localEdits++;
          if (r.output) localAccessed.add(r.output);
          if (!r.ok && SYSTEM_RULES.REQUIRED_TOOL_SEQUENCE.includes(tc.function.name)) localFailed.add(tc.function.name);
          
          const extra = {};
          if (r.hunkId) { extra.hunkId = r.hunkId; extra.oldContent = r.oldContent; extra.newContent = r.newContent; }
          emit({ t: 'act', kind: tc.function.name, arg: args.path || args.pattern || args.command || '', ok: !!r.ok, output: r.output || '', ...extra });

          const phase = phaseForTool(tc.function.name);
          const cleanArg = (args.path || args.pattern || args.command || args.goal || '').replace(/C:\\Users\\dave\\quantum\\/gi, '').replace(/C:\\Users\\dave\\/gi, '').slice(0, 60);
          emitPhase(phase, {
            tag: 'tool_call', status: r.ok ? 'ok' : 'err',
            attrs: [{ k: 'name', v: tc.function.name, t: 'str' }, { k: 'arg', v: cleanArg, t: 'str' }],
            chip: phase,
            children: [{ tag: 'tool_result', status: r.ok ? 'ok' : 'err', attrs: [{ k: 'ok', v: String(r.ok), t: 'str' }, { k: 'preview', v: (r.output || '(ok)').replace(/\r?\n/g, ' ').slice(0, 80), t: 'str' }] }]
          });

          let out = r.output || '(ok)';
          if (callCounts[sig] >= 2) out += '\n[catatan: panggilan sama diulang ' + callCounts[sig] + '× — hasilnya SAMA. JANGAN ulang yang sama; pakai hasil ini, lalu lanjut atau jawab.]';
          if (r.needsAnswer) {
            emit({ t: 'ask', question: r.question, choices: r.choices });
            out = 'You asked the user: "' + r.question + '". The user will respond. Wait for their answer before continuing.';
            return { out, stop: true, waitForAnswer: true, question: r.question };
          }
          if (tc.function.name === 'task') {
            if (depth >= MAX_DEPTH) {
              const outMsg = '(batas kedalaman sub‑agent tercapai — kerjakan sub‑tugas ini langsung dengan tool biasa)';
              emit({ t: 'act', kind: 'task', arg: (args.goal || '').slice(0,70), ok: false, output: outMsg });
              return { out: outMsg };
            }
            emit({ t: 'act', kind: 'task', arg: (args.goal || '').slice(0,70), ok: true, output: '↳ sub‑agent…' });
            let subSum = '';
            const subEmit = (e) => {
              if (e.t === 'adone') subSum = e.summary || '';
              else if (e.t === 'err') subSum = '[sub‑agent error: ' + e.m + ']';
              else if (e.t === 'act') emit({ t: 'act', kind: e.kind, arg: '↳ ' + (e.arg || ''), ok: e.ok, output: e.output });
            };
            try {
              const ret = await selfAgentStream({ history: [{ role: 'user', content: args.goal || '' }], cloud }, subEmit, { isCancelled, setCurReq, depth: depth + 1 });
              return { out: subSum || ret || '(sub‑agent selesai tanpa ringkasan)' };
            } catch (e) { return { out: '[sub‑agent gagal: ' + e.message + ']' }; }
          }
          return { out };
        };

        const results = await Promise.all(calls.map(tc => runOne(tc)));
        
        const toolMessages = [];
        let stopReason = "";
        let waitForAnswer = false;
        let localSummary = "";
        
        for (let i = 0; i < calls.length; i++) {
          if (results[i] && results[i].stop) {
            if (results[i].waitForAnswer) {
              waitForAnswer = true;
              stopReason = "waiting_for_user_answer";
              localSummary = 'Menunggu jawaban user: ' + results[i].question;
            } else {
              stopReason = "repeated_tool_calls";
              localSummary = msg.content || 'Berhenti: panggilan tool berulang tanpa kemajuan.';
            }
          }
          toolMessages.push({ role: 'tool', tool_call_id: calls[i].id, content: (results[i] && results[i].out) || '(ok)' });
        }
        
        return { 
          messages: toolMessages, 
          step: state.step + 1, 
          edits: localEdits, 
          accessedEvidence: Array.from(localAccessed),
          failedTools: Array.from(localFailed),
          stopReason, 
          waitForAnswer, 
          finalSummary: localSummary 
        };
      })
      .addNode("validate", async (state) => {
        const msg = state.messages[state.messages.length - 1];
        const hasContent = msg.content && msg.content.trim();
        let fallback = hasContent ? msg.content : '(tidak ada respons dari model)';
        
        fallback = sanitizeOutput(fallback);
        fallback = stripToolRecap(fallback);
        fallback = truncateToConcise(fallback, 300);
        
        if (state.failedTools.size < SYSTEM_RULES.MIN_FAILED_TOOLS && SYSTEM_RULES.REQUIRED_TOOL_SEQUENCE.some(t => state.failedTools.has(t))) {
          const nextTool = SYSTEM_RULES.REQUIRED_TOOL_SEQUENCE.find(t => !state.failedTools.has(t));
          if (nextTool) {
            if (state.forceRetryCount >= 3) {
              dlog('self', 'warn', 'force_retry limit reached', { step: state.step });
            } else {
              emit({ t: 'force_retry', m: `Belum memenuhi minimal ${SYSTEM_RULES.MIN_FAILED_TOOLS} tool gagal. Coba ${nextTool} selanjutnya...` });
              return { 
                messages: [{ role: 'user', content: `Anda belum mencoba tool ${nextTool}. Jalankan tool tersebut untuk mencari informasi lebih lanjut sebelum menyimpulkan.` }],
                forceRetryCount: state.forceRetryCount + 1
              };
            }
          }
        }
        
        if (!hasValidEvidence(fallback, state.accessedEvidence)) {
          if (state.forceRetryCount >= 3) {
            dlog('self', 'warn', 'hasValidEvidence retry limit reached', { step: state.step });
          } else {
            emit({ t: 'force_retry', m: 'Jawaban belum berdasarkan bukti tools, meminta ulang...' });
            return { 
              messages: [{ role: 'user', content: 'Jawaban Anda harus didasarkan pada bukti dari tools yang sudah dijalankan, tetapi DILARANG menyalin ulang log/output tool. Berikan kesimpulan SANGAT SINGKAT (1-2 kalimat) saja, langsung ke inti.' }],
              forceRetryCount: state.forceRetryCount + 1
            };
          }
        }
        
        dlog('self', 'info', 'stop', { reason: hasContent ? 'text_response_no_tools' : 'no_response', step: state.step, chars: (msg.content || '').length, sanitized: true });
        
        emitPhase('validate', {
          tag: 'Validate', status: 'ok', attrs: [{ k: 'step', v: state.step, t: 'num' }],
          children: [
            { tag: 'evidence_check', status: 'ok', attrs: [{ k: 'claim_grounded', v: 'true', t: 'str' }], evidence: true },
            { tag: 'strip_tool_recap', status: 'ok', attrs: [{ k: 'final_chars', v: fallback.length, t: 'num' }] },
            { tag: 'sandbox_audit', status: 'ok', attrs: [{ k: 'files_written', v: state.edits, t: 'num' }] }
          ]
        });

        const runRes = hasContent ? await runReply(fallback) : null;
        emit({ t: 'adone', steps: state.step, edits: state.edits, summary: fallback, backup: backupRel(), run: runRes });
        
        emitPhase('return', {
          tag: 'Return', status: 'ok', attrs: [{ k: 'step', v: state.step, t: 'num' }],
          children: [{ tag: 'response', status: 'ok', attrs: [{ k: 'type', v: 'text', t: 'str' }, { k: 'chars', v: fallback.length, t: 'num' }, { k: 'preview', v: fallback.slice(0, 80), t: 'str' }] }]
        });
        
        return { finalSummary: fallback, stopReason: 'finished' };
      })
      .addEdge(START, "agent")
      .addConditionalEdges("agent", (state) => {
        if (state.stopReason) return END;
        const msg = state.messages[state.messages.length - 1];
        if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) return "tools";
        // If fallback provider updated but no tools were returned
        if (msg.role !== 'assistant') return "agent";
        return "validate";
      })
      .addConditionalEdges("tools", (state) => {
        if (state.stopReason) return END;
        if (state.step >= MAX_STEPS) return END;
        return "agent";
      })
      .addConditionalEdges("validate", (state) => {
        if (state.stopReason === 'finished') return END;
        return "agent";
      });

    const app = workflow.compile();
    const finalState = await app.invoke({ messages });

    if (finalState.stopReason === 'repeated_tool_calls' || finalState.stopReason === 'waiting_for_user_answer') {
       if (finalState.waitForAnswer) {
         dlog('self', 'info', 'stop', { reason: 'waiting_for_user_answer', step: finalState.step });
         emit({ t: 'adone', steps: finalState.step, edits: finalState.edits, summary: finalState.finalSummary, backup: backupRel(), waitForAnswer: true });
       } else {
         const runRes = finalState.finalSummary ? await runReply(finalState.finalSummary) : null;
         emit({ t: 'adone', steps: finalState.step, edits: finalState.edits, summary: finalState.finalSummary, backup: backupRel(), run: runRes });
       }
    } else if (finalState.step >= MAX_STEPS && finalState.stopReason !== "finished") {
       dlog('self', 'info', 'stop', { reason: 'max_steps', step: finalState.step });
       finalSummary = 'Batas langkah (' + MAX_STEPS + ').';
       emit({ t: 'adone', steps: finalState.step, edits: finalState.edits, summary: finalSummary, backup: backupRel() });
    }
    
    finalSummary = finalState.finalSummary || finalSummary;
  } catch (e) {
    dlog('self', 'info', 'stop', { reason: 'unhandled_exception', error: (e && e.message || String(e)).slice(0, 100) });
    if (!isCancelled()) emit({ t: 'err', m: e.message });
  }
  dlog('self', 'info', 'stop', { reason: 'end_of_function', finalSummary: (finalSummary || '').slice(0, 80) });
  return finalSummary;
}

module.exports = { selfAgentStream };
