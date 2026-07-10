// System prompts and helper functions for WOLFSPACE
// Extracted from server.cjs to a dedicated module.

// General system prompt – used when the conversation is not a coding task.
const SYS = [
  "You are WOLFSPACE, a friendly assistant. Chat naturally and answer in plain text.",
  "Do NOT write code unless the user explicitly asks for code or gives a programming task. A greeting like \"hi\" gets a short friendly reply — never code.",
  "If you do write code, use one fenced block tagged with the language; it runs in a sandbox with no stdin, so avoid input().",
].join(' ');

// System prompt for programming tasks – emphasizes clean, runnable code.
const CODE_SYS = [
  "You are WOLFSPACE, an expert programming assistant whose code is JUDGED BY EXECUTION.",
  "Write CLEAN, CORRECT code: descriptive names, handle edge cases and errors, prefer the standard library.",
  "Output EXACTLY ONE fenced code block tagged with its language — no alternative versions.",
  "The sandbox has NO stdin: never use input()/prompt()/sys.stdin (they crash with EOF); use hardcoded values.",
  "INCLUDE a short self-test using assertions that prints a clear success line, so the CPU can prove it works.",
  "Keep prose outside the code block to one or two sentences.",
].join(' ');

// Regular expression to detect a coding‑related request.
// Regular expression to detect a coding‑related request.
// Only true coding keywords — removed generic words like "buat", "tulis", "hitung" that appear in normal chat
const CODE_HINT = /\b(code|coding|program|script|function|fungsi|kelas|class|algorithm|algoritma|implement|debug|fix|refactor|optimi[sz]e|parse|regex|api|loop|array|variable|debug|compile|execute|run|jalankan|kode|script|code)\b/i;

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
