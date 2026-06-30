// Self-agent stream implementation (extracted and modularized from server.cjs)
// Dependencies – same as original server.cjs
const { dlog } = require('./debug.cjs');
const { fillCloudKey, detectProvider, CLOUD, CLOUD_KEYS, loadCloudKeys, askCloudTools } = require('./cloud.cjs');
const { runSelfTool, SELF_TOOLS, qBackup } = require('./tools.cjs');
const { runReply } = require('./chat.cjs');
const { getOptimized, optimizeInBackground } = require('./sysprompt_opt.cjs');
const os = require('os');

// System prompt for function-calling self-agent
const SELF_FC_SYS = [
  "You are Quantum's assistant. You can chat normally AND, when needed, act on Quantum's own source code with tools — you decide which, like Claude.",
  "BE CONCISE — straight to the point. The final answer is AT MOST 1-3 short sentences. State the result ONCE (e.g. 'Ada di public/app.jsx:524.') and STOP. NEVER repeat the same sentence or finding, never restate the same info in different words, no filler, no recap, no tutorials. Repetition is a failure.",
  "DEFAULT = just answer in plain text. For greetings, general questions, explanations, opinions, or chit-chat, DO NOT use any tools — reply conversationally.",
  "USE TOOLS ONLY when the user clearly asks to find / read / inspect / locate / change / add / fix / search something in QUANTUM'S OWN SOURCE CODE OR asks for web information (e.g. 'where is the send button in the code', 'change the hint text', 'fix the agent', 'cari teks X di source', 'cari di web tentang React hooks'). General questions that merely mention a topic are NOT code tasks — answer them in text. For up-to-date info, API docs, or looking up errors, use web_search first then web_fetch to read a specific result.",
  "DISK EXPLORATION: Use disk_list, disk_read, disk_glob, disk_grep to explore ANY directory on the user's local disk (not just Quantum's source). The user home is 'C:\\Users\\dave'. Use absolute paths like 'C:\\Users\\dave\\project'. These are READ-ONLY — to edit/write files outside Quantum, use the bash tool with a cwd parameter. The bash tool also supports a cwd parameter to run commands in any directory.",
  "SKILLS PLUGIN SYSTEM: Use skill_list to see installed skill modules, skill_run to execute one, skill_install to add new skills from npm or local .cjs files. Skills are modular tools that extend Quantum's capabilities without modifying core code.",
  "SANDBOX EXECUTION: Use sandbox_run for safer command execution with capability-based filesystem (allow/deny read/write directories), resource limits (timeout, output size), and full audit logging. Prefer sandbox_run over bash for running untrusted or user-provided code.",
  "When you DO act: actually CALL the tools (function calls). NEVER describe a tool call in prose, NEVER write JSON like {\"name\":\"grep\",...} as your reply, and NEVER explain how the tools work. Either call tools, or give a short final answer. After editing, summarize what you changed.",
  "DECOMPOSE big work: if the task has SEVERAL independent parts (multiple files/areas, or separable sub-goals like 'find A and B and C', 'refactor X across files'), delegate each to a focused sub-agent via the `task` tool (one sub-goal per call), then combine their short results into your answer. For a SINGLE small task, just do it directly — no sub-agent for trivial work. A sub-agent (and you, finishing a sub-task) returns a SHORT result: what was found/done + exact file:line.",
  "WORKFLOW for a code task — follow IN ORDER, ONE tool call per step, each step ONCE:\n  STEP 1 LOCATE: grep a SHORT distinctive fragment (1-2 words, e.g. 'baris baru') -> read the file:line it returns.\n  STEP 2 READ: read the file with `near` = the line number grep returned (shows ±40 lines around it). A plain read shows only the file TOP, so for big files ALWAYS pass `near`.\n  STEP 3 EDIT: make ONE `edit` — copy old_string EXACTLY from what STEP 2 showed, with enough surrounding context to be unique; provide the full corrected new_string (keep the JSX/code valid).\n  STEP 4 DONE: reply with ONE sentence (file + what changed). The edit is auto syntax-checked & reverted if broken — if reverted, re-READ and fix old_string, do NOT repeat the same broken edit.\nIf STEP 1 already answers a 'where is it' question, stop at the answer — no edit needed.",
  "If the user asks for EXAMPLE/SAMPLE code, a snippet, or 'how to' code that is NOT about Quantum's own files (e.g. 'contoh kode python faktorial'), just put the code in your reply inside one fenced ```block``` — DO NOT use write/edit tools to create files. The reply's code block is run automatically and its terminal output is shown.",
  "Editable: server.cjs, *.cjs, config.json, public/** (.jsx/.js/.css/.html/.json), studio/lib/**/*.dart, studio/pubspec.yaml, studio/web/index.html. Forbidden: cloud-keys.json, node_modules, builds, backups.",
  "TRACKING PROGRESS: For tasks with 3+ steps, use `todowrite` to maintain a structured task list. Update status as you work: pending → in_progress → completed. This helps you stay organized and shows the user your progress.",
  "ASKING FOR CLARIFICATION: If the user's request is ambiguous or you cannot proceed without more information, use the `question` tool to ask the user. Provide clear choices when possible. The agent will pause and wait for the user's answer before continuing.",
  "NO SPECULATION: State only what you KNOW from evidence (code you read, output you saw, files you checked). If the result is correct, say it is correct. If it is wrong, say it is wrong. NEVER use words like 'maybe', 'possibly', 'perhaps', 'might be', 'could be', 'sepertinya', 'mungkin', 'bisa jadi'. Do NOT guess. If you don't know, say 'Saya tidak tahu' and offer to check."
].join('\n');

// Helper to parse pseudo‑function calls that some models emit as text
function parsePseudoCalls(text) {
  if (!text || text.indexOf('<function') < 0) return [];
  const out = [];
  const re = /<function\s*=\s*([\w.-]+)\s*=?\s*(\{[\s\S]*?\})?\s*\/?>(?:\s*<\/function>)?/g;
  let m;
  while ((m = re.exec(text))) {
    let args = {};
    if (m[2]) { try { args = JSON.parse(m[2]); } catch (_) {} }
    out.push({ name: m[1], args });
  }
  return out;
}

/**
 * Self‑agent loop – operates on Quantum's own source code via function‑calling tools.
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
  const ensureBackup = () => { if (!backup) { backup = qBackup(); emit({ t: 'backup', dir: backupRel() }); dlog('self', 'info', 'self-agent edit start', { backup: backupRel() }); } };

  // Use DSpy-optimized system prompt if cached, else fallback to original
  let optPrompt = getOptimized();
  if (optPrompt) {
    dlog('self', 'info', 'using optimized system prompt', { originalChars: SELF_FC_SYS.length, optimizedChars: optPrompt.length });
  } else {
    // Trigger background optimization for next time (non-blocking)
    setImmediate(() => optimizeInBackground(SELF_FC_SYS));
  }
  const currentSysPrompt = optPrompt || SELF_FC_SYS;

  const messages = [{ role: 'system', content: currentSysPrompt }, ...(history || [])];
  const MAX_STEPS = Infinity;
  let edits = 0;
  const callCounts = {};
  let fallbackCount = 0;
  const _TRANSIENT_SELF = /ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|timeout|EAI_AGAIN|network|ECONNREFUSED|ENOTFOUND|503|too busy|Service Unavailable|service_unavailable/i;

  try {
    for (let step = 1; step <= MAX_STEPS; step++) {
      if (isCancelled()) { dlog('self', 'info', 'stop', { reason: 'cancelled', step }); break; }
      emit({ t: 'step', n: step });
      let msg;
      try { msg = await askCloudTools(cloud, messages, SELF_TOOLS); }
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
          messages[messages.length - 1] = { role: 'assistant', content: null, tool_calls: calls };
        }
      }
      // Emit token output when there is plain content and no tool calls
      if (msg.content && !calls) emit({ t: 'tok', c: msg.content });
      // If there are no tool calls (or none returned), finalize the stream with fallback
      if (!calls || !calls.length) {
        const hasContent = msg.content && msg.content.trim();
        const fallback = hasContent ? msg.content : '(tidak ada respons dari model)';
        finalSummary = fallback;
        dlog('self', 'info', 'stop', { reason: hasContent ? 'text_response_no_tools' : 'no_response', step, chars: (msg.content || '').length });
        const runRes = hasContent ? await runReply(fallback) : null;
        emit({ t: 'adone', steps: step, edits, summary: finalSummary, backup: backupRel(), run: runRes });
        break;
      }

      // Execute each tool call sequentially
      const runOne = async (tc) => {
        let args = {};
        try { args = JSON.parse(tc.function.arguments || '{}'); } catch (_) {}
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
        // For edits, also include hunk info so frontend can show diff hunks
        const extra = {};
        if (r.hunkId) { extra.hunkId = r.hunkId; extra.oldContent = r.oldContent; extra.newContent = r.newContent; }
        emit({ t: 'act', kind: tc.function.name, arg: args.path || args.pattern || args.command || '', ok: !!r.ok, output: r.output || '', ...extra });
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
