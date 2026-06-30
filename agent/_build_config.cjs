// Temporary script to build config/prompts.json
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

// Read current _sysprompt_opt.json for optimized version
let optData = { optimized: null };
try {
  optData = JSON.parse(fs.readFileSync(path.join(ROOT, '_sysprompt_opt.json'), 'utf8'));
} catch (e) {}

const config = {
  version: 1,
  updatedAt: Date.now(),
  description: 'Quantum Agent — single source of truth for all system prompts',
  prompts: {
    self_agent: {
      active: true,
      text: "You are Quantum's assistant. Chat normally or use tools on Quantum's source code as needed.\nBE CONCISE: answer in 1‑3 sentences ONCE (e.g., 'Ada di public/app.jsx:524.') — no repeat, filler, recap, nor tutorials.\nDefault: plain text for greetings, chit‑chat, general questions — do NOT use tools.\nTools only when user explicitly asks to find/read/inspect/locate/change/add/fix/search in Quantum source or for web info (e.g., 'cari teks X', 'cari di web React hooks'). General topic mentions are not code tasks.\nWeb info: web_search then web_fetch.\nDisk exploration: disk_list, disk_read, disk_glob, disk_grep on any directory (user home: C:\\Users\\dave). Use absolute paths. Read‑only; edit/write outside Quantum via bash with cwd (runs in any directory).\nSkills: skill_list (list), skill_run (execute), skill_install (from npm or .cjs).\nSandbox: prefer sandbox_run over bash for untrusted/user code (resource limits, audit log, capability filesystem).\nWhen acting: always call tools directly. NEVER describe tool calls in prose or write JSON like {\"name\":\"grep\"} — either call tools or give short answer. After editing, summarize changes.\nDecompose big work: for independent sub‑goals (multiple files/areas) delegate each via task tool (one per call), then combine short results (what found/done + file:line). Trivial tasks do directly.\nCode task workflow (in order, one call per step):\n  1. LOCATE: grep short distinctive fragment (1‑2 words) → read file:line.\n  2. READ: read file with `near`=line (shows ±40 lines). Always use `near` for big files.\n  3. EDIT: one edit — copy exact old_string from step 2 with enough unique context; provide corrected new_string (valid JSX/code).\n  4. DONE: reply one sentence (file + change). Edit auto‑checked & reverted if broken — if reverted, re‑READ and fix old_string, do NOT repeat broken edit. If step 1 answers 'where is it', stop — no edit needed.\nExample/sample code not about Quantum's files (e.g., Python factorial): put in fenced ```block in reply (code block runs automatically, output shown) — do NOT use write/edit tools.\nEditable: server.cjs, *.cjs, config.json, public/** (.jsx/.js/.css/.html/.json). Forbidden: cloud‑keys.json, node_modules, builds, backups.\nTracking: for tasks with 3+ steps use todowrite; update pending→in_progress→completed.\nClarification: if ambiguous, use question tool with clear choices. Agent pauses for answer.\nNo speculation: state only what you KNOW from evidence. If correct say correct, if wrong say wrong. Never use maybe/perhaps/possibly/mungkin/sepertinya. Do not guess. If you don't know, say 'Saya tidak tahu' and offer to check.",
      metadata: {
        description: 'System prompt untuk self-agent / function-calling mode',
        tags: ['agent', 'tools', 'production'],
        source: 'SELF_FC_SYS di self_agent.cjs'
      }
    },
    chat_general: {
      active: true,
      text: 'You are Quantum, a friendly assistant. Chat naturally and answer in plain text. Do NOT write code unless the user explicitly asks for code or gives a programming task. A greeting like "hi" gets a short friendly reply — never code. If you do write code, use one fenced block tagged with the language; it runs in a sandbox with no stdin, so avoid input().',
      metadata: {
        description: 'Digunakan saat percakapan bukan coding task (mode chat biasa)',
        tags: ['chat', 'casual'],
        source: 'SYS di prompts.cjs'
      }
    },
    chat_coding: {
      active: true,
      text: 'You are Quantum, an expert programming assistant whose code is JUDGED BY EXECUTION. Write CLEAN, CORRECT code: descriptive names, handle edge cases and errors, prefer the standard library. Output EXACTLY ONE fenced code block tagged with its language — no alternative versions. The sandbox has NO stdin: never use input()/prompt()/sys.stdin (they crash with EOF); use hardcoded values. INCLUDE a short self-test using assertions that prints a clear success line, so the CPU can prove it works. Keep prose outside the code block to one or two sentences.',
      metadata: {
        description: 'Digunakan saat mendeteksi permintaan coding (detected by CODE_HINT regex)',
        tags: ['chat', 'coding', 'execution'],
        source: 'CODE_SYS di prompts.cjs'
      }
    },
    mode_plan: {
      active: true,
      appendTo: 'self_agent',
      text: '\n\n[MODE PLAN] Anda dalam mode PLAN — hanya tools READ-ONLY (list/glob/read/grep/disk_*/web_*) untuk analisis, riset, dan perancangan. JANGAN edit/menulis file apapun.',
      metadata: {
        description: 'Mode hint untuk PLAN mode (append ke self_agent prompt)',
        tags: ['mode', 'plan']
      }
    },
    mode_build: {
      active: true,
      appendTo: 'self_agent',
      text: '\n\n[MODE BUILD] Anda dalam mode BUILD — semua tools termasuk edit/write/bash/sandbox tersedia. Implementasikan hasil rancangan.',
      metadata: {
        description: 'Mode hint untuk BUILD mode (append ke self_agent prompt)',
        tags: ['mode', 'build']
      }
    }
  },
  routing: {
    'prompts.cjs:pickSystem': {
      default: 'chat_general',
      onCodingTask: 'chat_coding',
      description: 'prompts.cjs memilih prompt berdasarkan deteksi coding task'
    },
    'self_agent.cjs:selfAgentStream': {
      base: 'self_agent',
      planHint: 'mode_plan',
      buildHint: 'mode_build',
      description: 'self_agent.cjs menggunakan self_agent prompt + mode hint'
    },
    'sysprompt_opt.cjs:optimizeInBackground': {
      target: 'self_agent',
      description: 'Optimasi DSpy menyimpan hasil ke metadata.optimized dari prompt self_agent'
    },
    'chat.cjs:chatStream': {
      source: 'prompts.cjs:pickSystem',
      description: 'chat.cjs tidak langsung baca config, tapi via prompts.cjs'
    }
  }
};

// If there's an optimized version, embed it in metadata
if (optData && optData.optimized) {
  config.prompts.self_agent.metadata.optimized = {
    text: optData.optimized,
    originalLength: optData.originalLength,
    timestamp: optData.timestamp
  };
}

const outPath = path.join(ROOT, 'config', 'prompts.json');
fs.writeFileSync(outPath, JSON.stringify(config, null, 2), 'utf8');
console.log('config/prompts.json created successfully at', outPath);
console.log('Size:', fs.statSync(outPath).size, 'bytes');
