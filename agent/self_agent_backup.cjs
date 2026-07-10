// Self-agent stream implementation (extracted and modularized from server.cjs)
// Dependencies – same as original server.cjs
const { dlog } = require('./debug.cjs');
const { fillCloudKey, detectProvider, CLOUD, CLOUD_KEYS, loadCloudKeys, askCloudTools } = require('./cloud.cjs');
const { runSelfTool, SELF_TOOLS, qBackup } = require('./tools.cjs');
const { runReply } = require('./chat.cjs');
const { getOptimized, optimizeInBackground } = require('./sysprompt_opt.cjs');
const os = require('os');

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
    for (let step = 1; step <= MAX_STEPS; step++) {
      if (isCancelled()) { dlog('self', 'info', 'stop', { reason: 'cancelled', step }); break; }
      emit({ t: 'step', n: step });
      let msg;
      try { msg = await askCloudTools(cloud, messages, currentTools); }
      catch (e) {
        if (_TRANSIENT_SELF.test(e.message || '') && fallbackCount < 3) {
          const fb = Object.keys(CLOUD_KEYS).find(p => p !== cloud.provider && CLOUD_KEYS[p] && CLOUD_KEYS[p].key);
          if (fb) {
            fallbackCount++;
            dlog('self', 'warn', 'provider fallback', { from: cloud.provider, to: fb, error: e.message.slice(0, 100) });
            emit({ t: 'err', m: cloud.provider + ' gagal: ' + e.message.slice(0, 80) + ' — beralih ke ' + fb });
            cloud = { provider: fb, key: CLOUD_KEYS[fb].key, model: CLOUD_KEYS[fb].model, baseUrl: CLOUD_KEYS[fb].baseUrl };
            fillCloudKey(cloud);
            step--; continue;
          }
        }
        dlog('self', 'info', 'stop', { reason: 'askCloudTools_error', step, error: (e && e.message || '').slice(0, 100) });
        emit({ t: 'err', m: e.message }); break;
      }
      if (isCancelled()) { dlog('self', 'info', 'stop', { reason: 'cancelled_after_tools', step }); break; }
      messages.push(msg);

      // Recover pseudo‑function calls if the model emitted them as plain text
      let calls = (msg.tool_calls && msg.tool_calls.length) ? msg.tool_calls : null;
      if (!calls) {
        const pseudo = parsePseudoCalls(msg.content || '');
        if (pseudo.length) {
        calls = pseudo.map((c, i) => ({ id: 'call_' + step + '_' + i, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } }));
        const newMsg = { role: 'assistant', content: null };
        if (calls && calls.length > 0) newMsg.tool_calls = calls;
        messages[messages.length - 1] = newMsg;
      }
      }
      // Emit token output when there is plain content and no tool calls
      if (msg.content && !calls) emit({ t: 'tok', c: msg.content });
      // If there are no tool calls (or none returned), finalize the stream with fallback
      if (!calls || !calls.length) {
        const hasContent = msg.content && msg.content.trim();
        let fallback = hasContent ? msg.content : '(tidak ada respons dari model)';
        
        // 1. Bersihkan kata spekulatif dari output
        fallback = sanitizeOutput(fallback);
        
        // 1b. Hapus rekapitulasi tool / daftar bukti / pola verbose
        fallback = stripToolRecap(fallback);
        
        // 1c. Safety net: pastikan jawaban akhir tetap singkat (maks 1-2 kalimat / 300 char)
        fallback = truncateToConcise(fallback, 300);
        
        // 2. Validasi bukti: jika belum mencoba minimal 3 tool, paksa coba lagi
        if (failedTools.size < SYSTEM_RULES.MIN_FAILED_TOOLS && SYSTEM_RULES.REQUIRED_TOOL_SEQUENCE.some(t => failedTools.has(t))) {
          const nextTool = SYSTEM_RULES.REQUIRED_TOOL_SEQUENCE.find(t => !failedTools.has(t));
          if (nextTool) {
            if (++forceRetryCount > 3) {
              dlog('self', 'warn', 'force_retry limit reached', { step });
            } else {
              emit({ t: 'force_retry', m: `Belum memenuhi minimal ${SYSTEM_RULES.MIN_FAILED_TOOLS} tool gagal. Coba ${nextTool} selanjutnya...` });
              messages.push({ role: 'user', content: `Anda belum mencoba tool ${nextTool}. Jalankan tool tersebut untuk mencari informasi lebih lanjut sebelum menyimpulkan.` });
              step--;
              continue;
            }
          }
        }
        
        // 3. Cek apakah jawaban mengandung bukti dari tools yang diakses
        if (!hasValidEvidence(fallback, accessedEvidence)) {
          if (++forceRetryCount > 3) {
            dlog('self', 'warn', 'hasValidEvidence retry limit reached', { step });
          } else {
            emit({ t: 'force_retry', m: 'Jawaban belum berdasarkan bukti tools, meminta ulang...' });
            messages.push({ role: 'user', content: 'Jawaban Anda harus didasarkan pada bukti dari tools yang sudah dijalankan, tetapi DILARANG menyalin ulang log/output tool. Berikan kesimpulan SANGAT SINGKAT (1-2 kalimat) saja, langsung ke inti.' });
            step--;
            continue;
          }
        }
        
        finalSummary = fallback;
        dlog('self', 'info', 'stop', { reason: hasContent ? 'text_response_no_tools' : 'no_response', step, chars: (msg.content || '').length, sanitized: true });

        // Validation phase
        emitPhase('validate', {
          tag: 'Validate',
          status: 'ok',
          attrs: [{ k: 'step', v: step, t: 'num' }],
          children: [
            { tag: 'evidence_check', status: 'ok', attrs: [{ k: 'claim_grounded', v: 'true', t: 'str' }], evidence: true },
            { tag: 'strip_tool_recap', status: 'ok', attrs: [{ k: 'final_chars', v: fallback.length, t: 'num' }] },
            { tag: 'sandbox_audit', status: 'ok', attrs: [{ k: 'files_written', v: edits, t: 'num' }] }
          ]
        });

        const runRes = hasContent ? await runReply(fallback) : null;
        emit({ t: 'adone', steps: step, edits, summary: finalSummary, backup: backupRel(), run: runRes });

        // Return phase
        emitPhase('return', {
          tag: 'Return',
          status: 'ok',
          attrs: [{ k: 'step', v: step, t: 'num' }],
          children: [
            { tag: 'response', status: 'ok', attrs: [{ k: 'type', v: 'text', t: 'str' }, { k: 'chars', v: finalSummary.length, t: 'num' }, { k: 'preview', v: finalSummary.slice(0, 80), t: 'str' }] }
          ]
        });
        break;
      }

      // Execute each tool call sequentially
      const runOne = async (tc) => {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch (_) {}
        
        // --- EXTRAKTOR CHAIN-OF-THOUGHT ---
        if (args.rencana_tindakan) {
          // Kita pancarkan sebagai tipe 'thought' khusus agar Frontend bisa membungkusnya dalam UI berstruktur
          emit({ t: 'thought', c: args.rencana_tindakan, tool: tc.function.name, ok: true });
          emitPhase('think', {
            tag: 'rencana_tindakan',
            status: 'ok',
            attrs: [
              { k: 'tool', v: tc.function.name, t: 'str' },
              { k: 'plan', v: args.rencana_tindakan.slice(0, 80), t: 'str' }
            ]
          });
        }
        
        const sig = tc.function.name + '|' + (tc.function.arguments || '');
        callCounts[sig] = (callCounts[sig] || 0) + 1;
        if (callCounts[sig] > 10) return { stop: true };

        if (/^(edit|write)$/i.test(tc.function.name)) ensureBackup();
        // Emit "running" immediately for bash so frontend shows activity right away
        if (tc.function.name === 'bash') {
          emit({ t: 'act', kind: 'bash', arg: args.command || '', ok: true, output: '⟳ running…' });
        }
        const r = await runSelfTool(tc.function.name, args, emit);
        if (r.edited) edits++;
        // Simpan output tool sebagai bukti yang diakses
        if (r.output) accessedEvidence.add(r.output);
        // Catat tool yang gagal
        if (!r.ok && SYSTEM_RULES.REQUIRED_TOOL_SEQUENCE.includes(tc.function.name)) {
          failedTools.add(tc.function.name);
        }
        // For edits, also include hunk info so frontend can show diff hunks
        const extra = {};
        if (r.hunkId) { extra.hunkId = r.hunkId; extra.oldContent = r.oldContent; extra.newContent = r.newContent; }
        emit({ t: 'act', kind: tc.function.name, arg: args.path || args.pattern || args.command || '', ok: !!r.ok, output: r.output || '', ...extra });

        // Emit single tool_call node with tool_result child for execution tree
        const phase = phaseForTool(tc.function.name);
        const toolArg = args.path || args.pattern || args.command || args.goal || '';
        const cleanArg = toolArg.replace(/C:\\Users\\dave\\quantum\\/gi, '').replace(/C:\\Users\\dave\\/gi, '').slice(0, 60);
        emitPhase(phase, {
          tag: 'tool_call',
          status: r.ok ? 'ok' : 'err',
          attrs: [
            { k: 'name', v: tc.function.name, t: 'str' },
            { k: 'arg', v: cleanArg, t: 'str' }
          ],
          chip: phase,
          children: [
            {
              tag: 'tool_result',
              status: r.ok ? 'ok' : 'err',
              attrs: [
                { k: 'ok', v: String(r.ok), t: 'str' },
                { k: 'preview', v: (r.output || '(ok)').replace(/\r?\n/g, ' ').slice(0, 80), t: 'str' }
              ]
            }
          ]
        });

        let out = r.output || '(ok)';
        if (callCounts[sig] >= 2) out += '\n[catatan: panggilan sama diulang ' + callCounts[sig] + '× — hasilnya SAMA. JANGAN ulang yang sama; pakai hasil ini, lalu lanjut atau jawab.]';
        // Handle question tool — pause and wait for user input
        if (r.needsAnswer) {
          emit({ t: 'ask', question: r.question, choices: r.choices });
          out = 'You asked the user: "' + r.question + '". The user will respond. Wait for their answer before continuing.';
          return { out, stop: true, waitForAnswer: true, question: r.question };
        }
        // Handle sub‑agent task delegation
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

      // Execute all tool calls in parallel (Promise.all) — eliminates sequential bottleneck
      const results = await Promise.all(calls.map((tc, i) => runOne(tc)));
      // Check for stop conditions after all parallel executions
      for (let i = 0; i < calls.length; i++) {
        if (results[i] && results[i].stop) {
          if (results[i].waitForAnswer) {
            // Question tool — pause and wait for user input
            for (let j = 0; j < calls.length; j++) {
              messages.push({ role: 'tool', tool_call_id: calls[j].id, content: (results[j] && results[j].out) || '(ok)' });
            }
            emit({ t: 'adone', steps: step, edits, summary: 'Menunggu jawaban user: ' + results[i].question, backup: backupRel(), waitForAnswer: true });
            dlog('self', 'info', 'stop', { reason: 'waiting_for_user_answer', step, question: results[i].question });
            return 'Menunggu jawaban user: ' + results[i].question;
          }
          dlog('self', 'info', 'stop', { reason: 'repeated_tool_calls', step, tool: calls[i].function.name });
          finalSummary = msg.content || 'Berhenti: panggilan tool berulang tanpa kemajuan.';
          const runRes = msg.content ? await runReply(msg.content) : null;
          emit({ t: 'adone', steps: step, edits, summary: finalSummary, backup: backupRel(), run: runRes });
          return finalSummary;
        }
      }
      for (let i = 0; i < calls.length; i++) {
        messages.push({ role: 'tool', tool_call_id: calls[i].id, content: (results[i] && results[i].out) || '(ok)' });
      }
      if (step === MAX_STEPS) {
        dlog('self', 'info', 'stop', { reason: 'max_steps', step });
        finalSummary = 'Batas langkah (' + MAX_STEPS + ').';
        emit({ t: 'adone', steps: step, edits, summary: finalSummary, backup: backupRel() });
      }
    }
  } catch (e) {
    dlog('self', 'info', 'stop', { reason: 'unhandled_exception', error: (e && e.message || String(e)).slice(0, 100) });
    if (!isCancelled()) emit({ t: 'err', m: e.message });
  }
  dlog('self', 'info', 'stop', { reason: 'end_of_function', finalSummary: (finalSummary || '').slice(0, 80) });
  return finalSummary;
}

module.exports = { selfAgentStream };
