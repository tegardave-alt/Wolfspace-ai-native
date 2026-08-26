// System prompts and helper functions for WOLFSPACE
// Extracted from server.cjs to a dedicated module.

// Load prompts from config/prompts.json (single source of truth)
const fs = require("fs");
const path = require("path");
const PROMPTS_CFG_PATH = path.join(__dirname, "..", "config", "prompts.json");

function loadPrompts() {
  try {
    const cfg = JSON.parse(fs.readFileSync(PROMPTS_CFG_PATH, "utf8"));
    return {
      SYS: cfg.prompts.chat_general.text,
      CODE_SYS: cfg.prompts.chat_coding.text,
    };
  } catch (e) {
    // Fallback defaults if config unavailable
    return {
      SYS: "You are WOLFSPACE, a friendly assistant. Chat naturally and answer in plain text.",
      CODE_SYS:
        "You are WOLFSPACE, an expert programming assistant. Write clean, correct code.",
    };
  }
}

// Regular expression to detect a coding‑related request.
// Only true coding keywords — removed generic words like "buat", "tulis", "hitung" that appear in normal chat
const CODE_HINT =
  /\b(code|coding|program|script|function|fungsi|kelas|class|algorithm|algoritma|implement|debug|fix|refactor|optimi[sz]e|parse|regex|api|loop|array|variable|debug|compile|execute|run|jalankan|kode|script|code)\b/i;

/**
 * Determine whether the most recent user message is a coding task.
 * @param {Array<{role:string, content:string}>} work - full chat history.
 * @returns {boolean} true if a coding hint is found in the latest user message.
 */
function isCodingTask(work) {
  for (let i = work.length - 1; i >= 0; i--) {
    if (work[i].role === "user") {
      return CODE_HINT.test(work[i].content || "");
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
  const prompts = loadPrompts();
  return isCodingTask(work) ? prompts.CODE_SYS : prompts.SYS;
}

module.exports = {
  isCodingTask,
  pickSystem,
  loadPrompts, // Exported in case other modules need it directly
};
