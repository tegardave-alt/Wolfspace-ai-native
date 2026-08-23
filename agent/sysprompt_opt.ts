// System prompt auto-optimizer using DSpy
// Caches optimized version to config/prompts.json to reduce token usage.
import * as fs from "fs";
import * as path from "path";

const CACHE_FILE = path.join(__dirname, "..", "config", "prompts.json");
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let cachedOptimized: any = null;

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      const opt =
        cfg.prompts &&
        cfg.prompts.self_agent &&
        cfg.prompts.self_agent.metadata &&
        cfg.prompts.self_agent.metadata.optimized;
      if (
        opt &&
        opt.text &&
        opt.timestamp &&
        Date.now() - opt.timestamp < CACHE_TTL_MS
      ) {
        console.log(
          "[sysprompt] loaded cached optimized prompt (" +
            opt.text.length +
            " chars, saved " +
            (opt.originalLength - opt.text.length) +
            " chars)",
        );
        return opt.text;
      }
    }
  } catch (_) {}
  return null;
}

function saveCache(optimized, originalLength) {
  try {
    const cfg = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (!cfg.prompts.self_agent.metadata) cfg.prompts.self_agent.metadata = {};
    cfg.prompts.self_agent.metadata.optimized = {
      text: optimized,
      originalLength: originalLength,
      timestamp: Date.now(),
    };
    cfg.updatedAt = Date.now();
    const tempFile = CACHE_FILE + "." + Date.now() + ".tmp";
    fs.writeFileSync(tempFile, JSON.stringify(cfg, null, 2), "utf8");
    fs.renameSync(tempFile, CACHE_FILE);
    console.log(
      "[sysprompt] cached optimized prompt to config/prompts.json (atomic)",
    );
  } catch (_) {}
}

// Returns the best available system prompt (cached optimized, or null)
function getOptimized() {
  if (cachedOptimized !== null) return cachedOptimized;
  cachedOptimized = loadCache();
  return cachedOptimized;
}

// Run DSpy optimization in background (non-blocking)
async function optimizeInBackground(originalPrompt) {
  // Only optimize if we have an API key
  try {
    const dspy = require("./dspy_tool.ts");
    console.log("[sysprompt] starting background DSpy optimization...");
    const result = await dspy.run({
      prompt: originalPrompt,
      context:
        "This is WOLFSPACE agent's system prompt. Optimize it to be SHORTER (reduce token count by 30-50%) while preserving ALL functional instructions, tool call rules, safety constraints, and behavioral guidelines. Remove wordiness, merge similar rules, use concise language. The result must produce the SAME agent behavior.",
    });
    if (
      result.ok &&
      result.output &&
      result.output.length > 50 &&
      result.output.length < originalPrompt.length * 0.95
    ) {
      console.log(
        "[sysprompt] DSpy optimized: " +
          originalPrompt.length +
          " -> " +
          result.output.length +
          " chars (" +
          Math.round((1 - result.output.length / originalPrompt.length) * 100) +
          "% reduction)",
      );
      cachedOptimized = result.output;
      saveCache(result.output, originalPrompt.length);
      return result.output;
    } else {
      console.log(
        "[sysprompt] DSpy optimization skipped — output not shorter or failed",
      );
    }
  } catch (e) {
    console.log("[sysprompt] background optimization error:", e.message);
  }
  return null;
}

module.exports = { getOptimized, optimizeInBackground, loadCache, saveCache };
