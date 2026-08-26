// ── Pseudo tool-call tag filter ──
// Weak / local models sometimes emit tool calls as text (`<function=name>{...}</function>`)
// instead of using native tool_calls. This module (a) parses those tags into real calls
// when possible, and (b) guarantees the raw tag NEVER reaches the user — whether it parsed
// successfully, used a different separator dialect, or never closed at all.
"use strict";

// Documented dialect (server.cjs): `<function=name={"path":"x"}>` or `<function=list>`
// (groq/llama quirk) — args live INSIDE the opening tag, before its closing `>`, with
// no `</function>` closer. Also tolerates a `:` separator (some local fine-tunes) and an
// explicit `</function>` closer, should either appear. The separator+JSON pair is one
// optional unit so a bare stray `=`/`:` without JSON doesn't get treated as malformed args.
const CALL_RE =
  /<function\s*[:=]\s*([\w.-]+)\s*(?:[:=]\s*(\{[\s\S]*?\}))?\s*\/?>(?:\s*<\/function>)?/g;

// Parse well-formed pseudo tool-calls out of a FULL (already-complete) string.
// No JSON captured -> the tool takes no args (e.g. `<function=list>`), args = {}.
// JSON captured but malformed -> intentionally NOT turned into a call with empty args
// (that would silently run a tool with the wrong/missing arguments) — left for
// stripPseudoTags to remove instead, so it disappears rather than misfires.
function parsePseudoCalls(text) {
  if (!text || text.indexOf("<function") < 0) return [];
  const out: any[] = [];
  const seen = new Set();
  let m;
  CALL_RE.lastIndex = 0;
  while ((m = CALL_RE.exec(text))) {
    let args = {};
    if (m[2]) {
      try {
        args = JSON.parse(m[2]);
      } catch (_) {
        continue;
      } // malformed -> drop, don't fabricate
    }
    const callStr = JSON.stringify({ name: m[1], args });
    if (!seen.has(callStr)) {
      seen.add(callStr);
      out.push({ name: m[1], args });
    }
  }
  return out;
}

// Remove every <function...> fragment from a FULL string, closed or not — safety net so
// no dialect variant or truncated tag can ever reach the user as visible text.
function stripPseudoTags(text) {
  if (!text || text.indexOf("<function") < 0) return text;
  return text
    .replace(/<function\b[\s\S]*?<\/function>/g, "")
    .replace(/<function\b[^>]*\/?>/g, "")
    .replace(/<function\b[\s\S]*$/, ""); // dangling/never-closed tag at end of string
}

// Streaming-safe filter for token-by-token output (agent/chat.ts's onToken). Buffers only
// while a chunk *might* be the start of a "<function" tag; everything else passes straight
// through unbuffered. A closed tag is dropped entirely; an unresolved one is held (capped)
// until flush() so a malformed/never-closing tag can't stall the stream forever.
function createPseudoTagStreamFilter(onOutput) {
  const NEEDLE = "<function";
  const MAX_HOLD = 4000;
  let hold = "";

  function feed(chunk) {
    let s = hold + chunk;
    hold = "";
    for (;;) {
      const idx = s.indexOf("<");
      if (idx === -1) {
        if (s) onOutput(s);
        return;
      }
      if (idx > 0) {
        onOutput(s.slice(0, idx));
        s = s.slice(idx);
      }
      if (s.length < NEEDLE.length) {
        if (NEEDLE.startsWith(s)) {
          hold = s;
          return;
        } // could still become "<function"
        onOutput(s[0]);
        s = s.slice(1);
        continue;
      }
      if (!s.startsWith(NEEDLE)) {
        onOutput(s[0]);
        s = s.slice(1);
        continue;
      }
      // s starts with "<function" — find the earliest way it could end
      const closeTagIdx = s.indexOf("</function>");
      const selfCloseIdx = s.indexOf("/>");
      const plainCloseIdx = s.indexOf(">");
      if (closeTagIdx !== -1) {
        s = s.slice(closeTagIdx + "</function>".length);
        continue;
      }
      if (
        selfCloseIdx !== -1 &&
        (plainCloseIdx === -1 || selfCloseIdx <= plainCloseIdx)
      ) {
        s = s.slice(selfCloseIdx + 2);
        continue;
      }
      // opened but not yet closed in this chunk — hold and wait for more (a </function> or
      // the model finishing without one); the plain '>' alone is NOT treated as a close,
      // since <function=name>{...ARGS...}</function> legitimately contains '>' inside JSON-free text rarely but args are JSON so unlikely — still, wait for explicit closer.
      hold = s;
      // Safety valve: a pathological tag that just keeps growing without ever closing.
      // It already committed to "<function" -> drop it (never leak), don't stall forever.
      if (hold.length > MAX_HOLD) hold = "";
      return;
    }
  }

  // End of stream with something still buffered: if it committed to being a "<function"
  // tag (even if the model never emitted a closer — e.g. it hit a token/length limit),
  // drop it silently rather than leak the fragment. Anything else (just an ambiguous
  // "<" prefix that never resolved) is almost certainly ordinary text — emit it as-is.
  function flush() {
    if (hold && !hold.startsWith(NEEDLE)) onOutput(hold);
    hold = "";
  }

  return { feed, flush };
}

module.exports = {
  parsePseudoCalls,
  stripPseudoTags,
  createPseudoTagStreamFilter,
};
