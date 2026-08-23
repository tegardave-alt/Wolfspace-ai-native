// DSpy tool for WOLFSPACE agent
// Real native integration: uses WOLFSPACE's own cloud LLM to optimize prompts
// (ChainOfThought-style prompt optimization, no Python dependency).

const { dlog } = require("./debug.cjs");

function run(args) {
  const prompt = (args.prompt || "").trim();
  const context = (args.context || "").trim();
  if (!prompt) return { ok: false, output: "No prompt provided" };

  console.log(
    "[dspy] called with prompt length:",
    prompt.length,
    "context:",
    context ? "yes" : "no",
  );

  // Resolve cloud config: prefer caller-provided cloud, fallback to own resolution
  let cloud = args.cloud || null;
  if (cloud && cloud.key) {
    console.log(
      "[dspy] using caller-provided cloud config, provider:",
      cloud.provider || "unknown",
    );
  } else {
    // Fallback: resolve from WOLFSPACE's cloud module
    try {
      const cloudMod = require("./cloud.ts");
      cloudMod.loadCloudKeys();
      const keys = cloudMod.CLOUD_KEYS || {};
      const providers = Object.keys(keys);
      if (providers.length > 0) {
        const p = providers[0];
        cloud = {
          key: keys[p].key || "",
          provider: p,
          model: keys[p].model || cloudMod.CLOUD[p]?.model || "gpt-4o-mini",
          baseUrl: keys[p].baseUrl || "",
        };
        cloudMod.fillCloudKey(cloud);
      }
      if (!cloud || !cloud.key) {
        for (const ev of [
          "OPENAI_API_KEY",
          "ANTHROPIC_API_KEY",
          "GROQ_API_KEY",
          "DEEPSEEK_API_KEY",
        ]) {
          if (process.env[ev]) {
            const prov = ev.replace(/_API_KEY$/, "").toLowerCase();
            cloud = {
              key: process.env[ev],
              provider: prov,
              model: "gpt-4o-mini",
            };
            cloudMod.fillCloudKey(cloud);
            break;
          }
        }
      }
    } catch (e) {
      console.log("[dspy] cloud resolution error:", e.message);
      try {
        if (process.env.OPENAI_API_KEY)
          cloud = {
            key: process.env.OPENAI_API_KEY,
            provider: "openai",
            model: "gpt-4o-mini",
          };
      } catch (_) {}
    }
  }

  if (!cloud || !cloud.key) {
    console.log("[dspy] no API key found — optimization skipped");
    return {
      ok: false,
      output:
        "DSpy needs an API key to optimize prompts. Set one in WOLFSPACE's settings (☁ menu) first.",
    };
  }

  console.log(
    "[dspy] cloud resolved, provider:",
    cloud.provider,
    "model:",
    cloud.model,
  );

  // Build the DSpy-style ChainOfThought prompt
  const ctxHint = context ? `\nOptimization context: ${context}` : "";
  const systemMsg = `You are a prompt optimization expert. Your task is to improve the given prompt following ChainOfThought methodology.${ctxHint}

Analyze the original prompt for:
1. Clarity — is the instruction unambiguous?
2. Specificity — does it include concrete examples, format constraints, and edge case handling?
3. Structure — is it organized logically (role, task, steps, output format)?
4. Completeness — does it define inputs/outputs, constraints, and error handling?
5. Tone — is it appropriately directive without being vague?

Return your response in this exact format:

OPTIMIZED_PROMPT:
<the improved prompt here>

EXPLANATION:
<brief explanation of key improvements>`;

  // Make a non-streaming cloud call for the optimization
  return new Promise((resolve) => {
    try {
      const messages = [
        { role: "system", content: systemMsg },
        { role: "user", content: `Original prompt to optimize:\n\n${prompt}` },
      ];

      // Use askCloudTools-like approach: collect full response from stream
      const { askCloudStream } = require("./cloud.ts");
      let full = "";
      askCloudStream(
        cloud,
        messages,
        (token) => {
          full += token;
        },
        null,
      )
        .then(() => {
          // Parse optimized prompt from response
          let optimized = full;
          let explanation = "";

          const optMatch = optimized.match(
            /OPTIMIZED_PROMPT:\s*([\s\S]*?)(?:\nEXPLANATION:|$)/i,
          );
          const explMatch = optimized.match(/EXPLANATION:\s*([\s\S]*)/i);

          if (optMatch) {
            optimized = optMatch[1].trim();
          } else {
            // Fallback: try to extract anything that looks like the improved prompt
            const lines = optimized.split("\n").filter((l) => l.trim());
            optimized = lines
              .slice(0, Math.ceil(lines.length * 0.7))
              .join("\n")
              .trim();
          }
          if (explMatch) {
            explanation = explMatch[1].trim();
          }

          let output = optimized || full.trim();
          if (explanation) {
            output += "\n\n[DSpy: " + explanation + "]";
          }

          resolve({ ok: true, output });
        })
        .catch((err) => {
          resolve({
            ok: false,
            output: "DSpy optimization failed: " + err.message,
          });
        });
    } catch (e) {
      resolve({ ok: false, output: "DSpy internal error: " + e.message });
    }
  });
}

module.exports = { run };
