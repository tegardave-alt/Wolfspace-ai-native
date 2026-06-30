// System prompts and helper functions for Quantum
// Extracted from server.cjs to a dedicated module.

// Load prompts from config/prompts.json (single source of truth)
const fs = require('fs');
const path = require('path');
const PROMPTS_CFG_PATH = path.join(__dirname, 'config', 'prompts.json');

let _promptsCache = null;
function loadPrompts() {
  if (_promptsCache) return _promptsCache;
  try {
    const cfg = JSON.parse(fs.readFileSync(PROMPTS_CFG_PATH, 'utf8'));
    _promptsCache = {
      SYS: cfg.prompts.chat_general.text,
      CODE_SYS: cfg.prompts.chat_coding.text,
    };
    return _promptsCache;
  } catch (e) {
    // Fallback defaults if config unavailable
    return {
      SYS: 'You are Quantum, a friendly assistant. Chat naturally and answer in plain text.',
      CODE_SYS: 'You are Quantum, an expert programming assistant. Write clean, correct code.',
    };
  }
}

const SYS = loadPrompts().SYS;
const CODE_SYS = loadPrompts().CODE_SYS;

// Regular expression to detect a coding‑related request.
const CODE_HINT = /\b(code|coding|program|script|function|fungsi|kelas|class|algorithm|algoritma|buat(?:kan)?|tulis(?:kan)?|implement|debug|fix|refactor|optimi[sz]e|sort|parse|regex|api|loop|array|string|hitung|kalkulator)\b/i;

/**
 * Determine whether the most recent user message is a coding task.
 * @param {Array<{role:string, content:string}>} work - full chat history.
 * @returns {boolean} true if a coding hint is found in the latest user message.
 */
function isCodingTask(work) {
  for (let i = work.length - 1; i >= 0; i--) {
    if (work[i].role === 'user') {
      return CODE_HINT.test(work[i].content || '');
    }
  }
  return false;
}

/**
 * Choose the appropriate system prompt based on the chat history.
 * @param {Array} work - chat history

 * @returns {string} system prompt
 */
function pickSystem(work) {

  return isCodingTask(work) ? CODE_SYS : SYS;
}

module.exports = {
  SYS,
  CODE_SYS,
  isCodingTask,
  pickSystem,
};
