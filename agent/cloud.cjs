// Cloud model integration for WOLFSPACE (extracted from server.cjs)
// Dependencies – same as original server.cjs
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { dlog } = require('./debug.cjs');
const { resolveKeysPath } = require('./keys-path.cjs');

// Load configuration (shared with other modules)
const CONFIG_PATH = path.join(__dirname, '..', 'config.json');
const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

// -------------------------------------------------------------------
// Provider definitions and alias tables (originally in server.cjs)
// -------------------------------------------------------------------
const CLOUD = {
  anthropic:  { host: 'api.anthropic.com',                 path: '/v1/messages',                model: 'claude-opus-4-8' },
  openai:     { host: 'api.openai.com',                    path: '/v1/chat/completions',        model: 'gpt-4o' },
  openrouter: { host: 'openrouter.ai',                     path: '/api/v1/chat/completions',    model: 'anthropic/claude-opus-4-8' },
  groq:       { host: 'api.groq.com',                      path: '/openai/v1/chat/completions', model: 'llama-3.3-70b-versatile' },
  qwen:       { host: 'dashscope-intl.aliyuncs.com',       path: '/compatible-mode/v1/chat/completions', model: 'qwen-plus' },
  deepseek:   { host: 'api.deepseek.com',                  path: '/chat/completions',           model: 'deepseek-chat' },
  github:     { host: 'models.inference.ai.azure.com',     path: '/chat/completions',           model: 'gpt-4o' },
  gemini:     { host: 'generativelanguage.googleapis.com', path: '/v1beta/openai/chat/completions', model: 'gemini-2.5-flash' },
  nvidia:     { host: 'integrate.api.nvidia.com',          path: '/v1/chat/completions',        model: 'nvidia/nemotron-3-super-120b-a12b' },
  opencode:   { host: 'opencode.ai',                        path: '/zen/go/v1/chat/completions',   model: 'deepseek-v4-flash' },
  puter:      { host: 'api.puter.com',                     path: '/puterai/openai/v1/chat/completions', model: 'claude-sonnet-4' },
};

const MODEL_ALIASES = {
  anthropic:  { claude:'claude-opus-4-8', opus:'claude-opus-4-8', sonnet:'claude-sonnet-4-6', haiku:'claude-haiku-4-5' },
  openai:     { gpt:'gpt-4o', '4o':'gpt-4o', mini:'gpt-4o-mini' },
  groq:       { llama:'llama-3.3-70b-versatile', 'llama-fast':'llama-3.1-8b-instant', 'llama-8b':'llama-3.1-8b-instant', gemma:'gemma2-9b-it' },
  qwen:       { qwen:'qwen-plus', plus:'qwen-plus', max:'qwen-max', turbo:'qwen-turbo', coder:'qwen2.5-coder-32b-instruct' },
  deepseek:   { chat:'deepseek-chat', deepseek:'deepseek-chat', coder:'deepseek-chat', reasoner:'deepseek-reasoner', r1:'deepseek-reasoner' },
  github:     { '4o':'gpt-4o', 'gpt-4o':'gpt-4o', deepseek:'DeepSeek-V3-0324', 'deepseek-r1':'DeepSeek-R1', r1:'DeepSeek-R1', llama:'Llama-3.3-70B-Instruct' },
  gemini:     { gemini:'gemini-2.0-flash', flash:'gemini-2.0-flash', pro:'gemini-1.5-pro' },
  openrouter: {},
  nvidia:     { llama:'meta/llama-3.3-70b-instruct', '70b':'meta/llama-3.3-70b-instruct', nemotron:'nvidia/llama-3.1-nemotron-70b-instruct', deepseek:'deepseek-ai/deepseek-r1', qwen:'qwen/qwen2.5-coder-32b-instruct' },
  opencode:   { flash:'deepseek-v4-flash', 'v4-flash':'deepseek-v4-flash', 'deepseek-v4-flash':'deepseek-v4-flash', 'deepseek-v4-flash-free':'deepseek-v4-flash-free' },
};

const PROVIDER_NAMES = {
  anthropic:'Claude', openai:'OpenAI', openrouter:'OpenRouter', groq:'Groq', qwen:'Qwen', deepseek:'DeepSeek',
  github:'GitHub Models', gemini:'Gemini', nvidia:'NVIDIA', puter:'Puter', opencode:'OpenCode'
};

// -------------------------------------------------------------------
// Load API keys – from cloud-keys.json (git‑ignored) or environment vars
// -------------------------------------------------------------------
let CLOUD_KEYS = {};
function loadCloudKeys() {
  CLOUD_KEYS = {};
  try {
    const raw = JSON.parse(fs.readFileSync(resolveKeysPath(), 'utf8'));
    for (const [p, v] of Object.entries(raw)) CLOUD_KEYS[p] = typeof v === 'string' ? { key: v } : v;
  } catch (_) {}
  for (const p of Object.keys(PROVIDER_NAMES)) {
    const ev = process.env[p.toUpperCase() + '_API_KEY'];
    if (ev) CLOUD_KEYS[p] = { ...(CLOUD_KEYS[p] || {}), key: ev };
  }
}
loadCloudKeys();

function detectProvider(key) {
  key = (key || '').trim();
  if (key.startsWith('nvapi-')) return 'nvidia';
  if (key.startsWith('github_pat_') || key.startsWith('ghp_')) return 'github';
  if (key.startsWith('sk-ant-')) return 'anthropic';
  if (key.startsWith('sk-or-'))  return 'openrouter';
  if (key.startsWith('gsk_'))    return 'groq';
  if (key.startsWith('AIza'))    return 'gemini';
  if (key.startsWith('sk-UUa'))    return 'opencode';
  if (key.startsWith('sk-'))     return 'openai'; // covers sk-proj-… too
  return 'openai'; // default fallback
}

// -------------------------------------------------------------------
// Provider probing – lightweight HEAD request to confirm key works
// -------------------------------------------------------------------
const PROBE = {
  openai:     { host:'api.openai.com',                    path:'/v1/models',                    auth:'bearer' },
  deepseek:   { host:'api.deepseek.com',                  path:'/models',                       auth:'bearer' },
  qwen:       { host:'dashscope-intl.aliyuncs.com',       path:'/compatible-mode/v1/models',    auth:'bearer' },
  groq:       { host:'api.groq.com',                      path:'/openai/v1/models',             auth:'bearer' },
  openrouter: { host:'openrouter.ai',                     path:'/api/v1/key',                   auth:'bearer' },
  anthropic:  { host:'api.anthropic.com',                 path:'/v1/models',                    auth:'anthropic' },
  github:     { host:'models.inference.ai.azure.com',     path:'/models',                       auth:'bearer' },
  gemini:     { host:'generativelanguage.googleapis.com', path:'/v1beta/models?key=KEY',        auth:'query' },
  opencode:   { host:'opencode.ai',                        path:'/zen/go/v1/models',              auth:'bearer' },
  nvidia:     { host:'integrate.api.nvidia.com',          path:'/v1/models',                    auth:'bearer' },
};

function httpsStatus(opts) {
  return new Promise(resolve => {
    const r = https.request({ ...opts, method:'GET', timeout:8000 }, s => { s.resume(); resolve(s.statusCode || 0); });
    r.on('error', () => resolve(0));
    r.on('timeout', () => { r.destroy(); resolve(0); });
    r.end();
  });
}

async function probeProvider(provider, key) {
  const t = PROBE[provider]; if (!t) return 0;
  let path = t.path; const headers = {};
  if (t.auth === 'bearer') headers['authorization'] = 'Bearer ' + key;
  else if (t.auth === 'anthropic') { headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01'; }
  else if (t.auth === 'query') path = path.replace('KEY', encodeURIComponent(key));
  return httpsStatus({ hostname:t.host, path, headers });
}

function candidatesFor(key) {
  key = (key || '').trim();
  if (key.startsWith('github_pat_') || key.startsWith('ghp_')) return ['github'];
  if (key.startsWith('sk-ant-')) return ['anthropic'];
  if (key.startsWith('sk-or-'))  return ['openrouter'];
  if (key.startsWith('gsk_'))    return ['groq'];
  if (key.startsWith('AIza'))    return ['gemini'];
  if (key.startsWith('sk-UUa'))    return ['opencode'];
  if (key.startsWith('sk-'))     return ['openai','deepseek','qwen','opencode']; // ambiguous → probe
  return ['openai','deepseek','qwen','groq','openrouter','anthropic','github','gemini'];
}

async function detectKey(key) {
  const cands = candidatesFor(key);
  for (const p of cands) {
    const st = await probeProvider(p, key);
    if (st >= 200 && st < 300) return { provider:p, name:PROVIDER_NAMES[p]||p, verified:true };
  }
  return { provider:cands[0], name:PROVIDER_NAMES[cands[0]]||cands[0], verified:false };
}

// -------------------------------------------------------------------
// Cloud model request helpers (streaming & function‑calling)
// -------------------------------------------------------------------
function _askCloudStreamOnce(cloud, work, onToken, reg) {
  return new Promise((resolve, reject) => {
    const provider = cloud.provider || detectProvider(cloud.key);
    const cfg = CLOUD[provider] || CLOUD.openai;
    // Guard: never leak a raw key in the model field
    let model = (cloud.model || '').trim();
    if (!model || /^(sk-|gsk_|AIza)/.test(model)) model = cfg.model;
    const aliases = MODEL_ALIASES[provider];
    if (aliases && aliases[model.toLowerCase()]) model = aliases[model.toLowerCase()];
    // Extract system message from work array (chat.cjs prepends it as first element).
    // cloud.system overrides only if explicitly set; otherwise use the work[0] system message.
    let workMsgs = work;
    let sysFromWork = '';
    if (work && work.length > 0 && work[0].role === 'system') {
      sysFromWork = work[0].content || '';
      workMsgs = work.slice(1); // strip system message from the message list
    }
    const sys = cloud.system || sysFromWork || undefined;
    console.log('[cloud] system prompt:', sys ? `${sys.length} chars, starts: ${sys.slice(0,80)}...` : 'EMPTY!');
    console.log('[cloud] work messages:', workMsgs.length, 'msgs, roles:', workMsgs.map(m=>m.role).join(','));
    let host = cfg.host, path = cfg.path, port = null, headers = { 'content-type':'application/json' }, body, extract;
    let isReasoning = false; // Track reasoning block state
    const effortTokens = cloud.effort === 0 || cloud.effort === 'low' ? 1024 : (cloud.effort === 2 || cloud.effort === 'high' ? 16384 : 4096);
    const effortStr = cloud.effort === 0 || cloud.effort === 'low' ? 'low' : (cloud.effort === 2 || cloud.effort === 'high' ? 'high' : 'medium');
    if (provider === 'opencode' && model.includes('-free')) path = '/zen/v1/chat/completions';
    const openaiCompatible = () => {
      headers['authorization'] = 'Bearer ' + cloud.key;
      const payload = { model, stream:true, messages:[{role:'system',content:sys||''},...workMsgs] };
      if (model.includes('o1') || model.includes('o3') || model.includes('reasoner') || model.includes('thinking')) {
        payload.reasoning_effort = effortStr;
      } else {
        payload.max_tokens = effortTokens + 4096;
      }
      body = JSON.stringify(payload);
      extract = j => {
        try {
          const d = j.choices && j.choices[0] && j.choices[0].delta;
          if (!d) return '';
          let chunk = '';
          if (d.reasoning_content) {
            if (!isReasoning) { isReasoning = true; chunk += '<think>\n'; }
            chunk += d.reasoning_content;
          } else if (d.content) {
            if (isReasoning) { isReasoning = false; chunk += '\n</think>\n\n'; }
            chunk += d.content;
          }
          return chunk;
        } catch { return ''; }
      };
    };
    if (cloud.baseUrl) {
      try { const u = new URL(cloud.baseUrl.replace(/\/+$/,'') + '/chat/completions'); host = u.hostname; path = u.pathname + (u.search||''); if (u.port) port = parseInt(u.port); }
      catch (_) {}
      openaiCompatible();
    } else if (provider === 'anthropic') {
      headers['x-api-key'] = cloud.key;
      headers['anthropic-version'] = '2023-06-01';
      body = JSON.stringify({ model, max_tokens: effortTokens + 4096, system:sys||'', stream:true, thinking:{type:'enabled', budget_tokens: effortTokens}, messages: workMsgs.map(m=>({role:m.role,content:m.content})) });
      extract = j => {
        if (j.type === 'content_block_delta' && j.delta) {
          let chunk = '';
          if (j.delta.type === 'thinking_delta') {
            if (!isReasoning) { isReasoning = true; chunk += '<think>\n'; }
            chunk += j.delta.thinking;
          } else if (j.delta.type === 'text_delta') {
            if (isReasoning) { isReasoning = false; chunk += '\n</think>\n\n'; }
            chunk += j.delta.text;
          }
          return chunk;
        }
        return '';
      };
    } else if (provider === 'gemini') {
      path = `/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(cloud.key)}`;
      body = JSON.stringify({ systemInstruction:{parts:[{text:sys||''}]}, contents: workMsgs.map(m=>({role:m.role==='assistant'?'model':'user', parts:[{text:m.content}]})), generationConfig:{ maxOutputTokens: effortTokens + 4096 } });
      extract = j => { try { return j.candidates[0].content.parts.map(p=>p.text||'').join(''); } catch { return ''; } };
    } else {
      openaiCompatible();
    }
    headers['content-length'] = Buffer.byteLength(body);
    const t0 = Date.now();
    const maskedKey = cloud.key ? cloud.key.slice(0, 5) + '***' + cloud.key.slice(-4) : 'none';
    dlog('cloud','info',`cloud model start ${provider}/${model}`,{provider,model,host,key:maskedKey});
    const { VERBOSE } = require('./debug.cjs');
    if (VERBOSE) dlog('cloud','info','cloud model request',{provider,model,messages:work});
    const isLocal = host === '127.0.0.1' || host === 'localhost';
    const reqFn = isLocal ? http.request : https.request;
    const reqOpts = { hostname:host, path, method:'POST', headers, timeout:600000 };
    if (port) reqOpts.port = port;
    const r = reqFn(reqOpts, s => {
      let acc = '', buf = '', errBody = '';
      if (s.statusCode >= 400) {
        s.on('data', c => errBody += c);
        s.on('end', () => { dlog('cloud','error','cloud model http error',{provider,model,status:s.statusCode,body:errBody.slice(0,200)}); reject(new Error(`${provider} ${s.statusCode}: ${errBody.slice(0,300)}`)); });
        return;
      }
      s.on('data', chunk => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          const m = line.match(/^data:\s*(.*)$/);
          if (!m) continue;
          if (m[1] === '[DONE]') continue;
          try { const j = JSON.parse(m[1]); const t = extract(j); if (t) { acc += t; onToken(t); } } catch (_) {}
        }
      });
      s.on('end', () => {
        dlog('cloud','info','cloud model end',{provider,ms:Date.now()-t0,chars:acc.length});
        if (require('./debug.cjs').VERBOSE) dlog('cloud','info','cloud model full response',{response:acc.slice(0,5000)});
        resolve(acc);
      });
    });
    r.on('error', e => { dlog('cloud','error','cloud model error',{provider,error:e.message}); reject(e); });
    r.on('timeout', () => { dlog('cloud','error','cloud model timeout',{provider}); r.destroy(); reject(new Error('model timeout')); });
    if (reg) reg(r);
    r.write(body); r.end();
  });
}

/**
 * Public API – streaming chat with a cloud model.
 * @param {Object} cloud - {key, provider?, model?, system?, baseUrl?}
 * @param {Array} work - chat history [{role,content},...]
 * @param {function(string):void} onToken - receives each token.
 * @param {function} reg - optional callback to get the request object (for cancellation).
 */
function askCloudStream(cloud, work, onToken, reg) {
  return _askCloudStreamOnce(cloud, work, onToken, reg);
}

function fillCloudKey(cloud) {
  if (!cloud) return;
  cloud.provider = cloud.provider || (cloud.key ? detectProvider(cloud.key) : null);
  if (!cloud.key && cloud.provider && CLOUD_KEYS[cloud.provider]) {
    cloud.key = CLOUD_KEYS[cloud.provider].key;
    cloud.model = cloud.model || CLOUD_KEYS[cloud.provider].model;
  }
  if (!cloud.baseUrl && cloud.provider && CLOUD_KEYS[cloud.provider] && CLOUD_KEYS[cloud.provider].baseUrl) {
    cloud.baseUrl = CLOUD_KEYS[cloud.provider].baseUrl;
  }
  if (cloud.baseUrl && /:8085(\/|$)/.test(cloud.baseUrl)) cloud.baseUrl = undefined;
  // Auto-fix: derive opencode baseUrl from model (Zen free vs Go paid)
  if (cloud.provider === 'opencode' || (cloud.baseUrl && /opencode\.ai/i.test(cloud.baseUrl))) {
    const isFree = cloud.model && cloud.model.includes('-free');
    const correct = 'https://opencode.ai' + (isFree ? '/zen/v1' : '/zen/go/v1');
    if (cloud.baseUrl !== correct) { cloud.baseUrl = correct; cloud.provider = 'opencode'; }
  }
}

function _sanitizeMessages(messages) {
  // Ensure all tool_calls have valid JSON arguments (Qwen API requirement)
  for (const msg of messages) {
    if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        if (tc.function) {
          if (!tc.function.arguments || tc.function.arguments.trim() === '') {
            tc.function.arguments = '{}';
          } else {
            // Validate JSON, fix if invalid
            try {
              JSON.parse(tc.function.arguments);
            } catch (_) {
              tc.function.arguments = '{}';
            }
          }
        }
      }
    }
  }
  return messages;
}

function _askCloudToolsOnce(cloud, messages, tools) {
  return new Promise((resolve, reject) => {
    const provider = cloud.provider || detectProvider(cloud.key);
    const cfg = CLOUD[provider] || CLOUD.openai;
    let model = (cloud.model || '').trim();
    if (!model || /^(sk-|gsk_|AIza|nvapi-)/.test(model)) model = cfg.model;
    const aliases = MODEL_ALIASES[provider];
    if (aliases && aliases[model.toLowerCase()]) model = aliases[model.toLowerCase()];
    let host = cfg.host, p = cfg.path, port, transport = https;
    if (provider === 'opencode' && model.includes('-free')) p = '/zen/v1/chat/completions';
    if (cloud.baseUrl) { try { const u = new URL(cloud.baseUrl.replace(/\/+$/, '') + '/chat/completions'); host = u.hostname; p = u.pathname + (u.search || ''); port = u.port || undefined; transport = (u.protocol === 'http:') ? http : https; } catch (_) {} }
    const isReasoning = /deepseek|reason/i.test(model);
    const sanitizedMessages = _sanitizeMessages(messages);
    const body = JSON.stringify({ model, messages: sanitizedMessages, tools: tools, tool_choice: 'auto', temperature: 0.1, stream: true, max_tokens: isReasoning ? 2048 : 512 });
    const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + cloud.key, 'content-length': Buffer.byteLength(body) };
    const r = transport.request({ hostname: host, port, path: p, method: 'POST', headers, timeout: 300000 }, s => {
      const bad = s.statusCode >= 400;
      let buf = '', errBody = '', content = '', reasoning = ''; const tcs = [];
      s.on('data', c => {
        if (bad) { errBody += c; return; }
        buf += c; let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
          const m = line.match(/^data:\s*(.*)$/); if (!m || m[1] === '[DONE]') continue;
          let j; try { j = JSON.parse(m[1]); } catch { continue; }
          const delta = j.choices && j.choices[0] && j.choices[0].delta; if (!delta) continue;
          if (delta.content) content += delta.content;
          else if (delta.reasoning_content) reasoning += delta.reasoning_content;
          if (delta.tool_calls) for (const t of delta.tool_calls) {
            const i = t.index || 0;
            if (!tcs[i]) tcs[i] = { id: t.id || ('call_' + i), type: 'function', function: { name: '', arguments: '' } };
            if (t.id) tcs[i].id = t.id;
            if (t.function) { if (t.function.name) tcs[i].function.name = t.function.name; if (t.function.arguments) tcs[i].function.arguments += t.function.arguments; }
          }
        }
      });
      s.on('end', () => {
        if (bad) {
          try { const err = JSON.parse(errBody).error || {};
            if ((err.code === 'tool_use_failed' || /tool/i.test(err.message || '')) && err.failed_generation)
              return resolve({ role: 'assistant', content: String(err.failed_generation) }); // Jangan kirim tool_calls:[] untuk DeepSeek
          } catch (_) {}
          return reject(new Error(provider + ' ' + s.statusCode + ': ' + errBody.slice(0, 300)));
        }
        const validToolCalls = tcs.filter(Boolean);
        const response = { role: 'assistant', content: content || (reasoning || null) };
        // Hanya kirim tool_calls jika ada minimal 1 (hindari error DeepSeek)
        if (validToolCalls.length > 0) response.tool_calls = validToolCalls;
        resolve(response);
      });
    });
    r.on('error', reject); r.on('timeout', () => r.destroy(new Error('timeout')));
    r.write(body); r.end();
  });
}

const _TRANSIENT = /ECONNRESET|ETIMEDOUT|EPIPE|socket hang up|timeout|EAI_AGAIN|network|ECONNREFUSED|ENOTFOUND|503|404|too busy|Service Unavailable|service_unavailable|<!DOCTYPE/i;
async function askCloudTools(cloud, messages, tools) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try { return await _askCloudToolsOnce(cloud, messages, tools); }
    catch (e) {
      last = e;
      if (!_TRANSIENT.test(e.message || '') || attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 400 * attempt));
    }
  }
  throw last;
}

module.exports = {
  CLOUD,
  MODEL_ALIASES,
  PROVIDER_NAMES,
  CLOUD_KEYS,
  loadCloudKeys,
  detectProvider,
  candidatesFor,
  probeProvider,
  detectKey,
  askCloudStream,
  fillCloudKey,
  askCloudTools,
};
