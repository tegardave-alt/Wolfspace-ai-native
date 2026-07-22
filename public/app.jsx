const { useState, useRef, useEffect, useCallback, useMemo } = React;

// Command Palette (forked from VS Code) - daftar command yang tersedia
const COMMANDS = [
  { id: 'open.agents', label: 'Agent Runner: Buka Agent Runner', icon: 'runner', action: () => document.querySelector('[data-view="agents"]')?.click() },
  { id: 'open.settings', label: 'Settings: Buka Pengaturan', icon: 'settings', action: () => document.querySelector('[data-view="settings"]')?.click() },
  { id: 'terminal.new', label: 'Terminal: Buat Terminal Baru', icon: 'terminal', action: () => window.createNewTerminal?.() },
  { id: 'openclaw.chat', label: 'OpenClaw: Jalankan dari Chat', icon: 'runner', action: () => window.dispatchEvent(new CustomEvent('WOLFSPACE:set-composer', { detail: '/openclaw ' })) },
  { id: 'agent.run', label: 'Agent: Mulai agent baru', icon: 'play', action: () => window.startNewAgent?.() },
  { id: 'theme.toggle', label: 'Appearance: Toggle Tema Gelap/Terang', icon: 'theme', action: () => document.body.classList.toggle('light-theme') },
];

/* ----------------------------- Icons ----------------------------- */
const Icon = {
  // Traced (potrace) from the WOLFSPACE reference mark — a wolf head in profile.
  wolf: (p) => (
    <svg viewBox="0 0 416 416" fill="none" {...p}>
      <g transform="translate(0,416) scale(0.1,-0.1)" fill="currentColor" stroke="none">
        <path d="M1704 3358 c6 -26 36 -252 36 -265 0 -2 -24 15 -52 38 -62 49 -152
92 -226 108 -88 18 -88 18 -50 -51 19 -35 52 -111 72 -170 l38 -107 33 24 c47
37 54 30 13 -12 -49 -51 -196 -278 -210 -325 -8 -28 -8 -55 0 -107 19 -115 16
-161 -18 -227 -30 -60 -122 -185 -217 -294 -60 -70 -65 -94 -27 -140 26 -30
130 -90 157 -90 7 0 30 -9 52 -20 72 -37 134 -27 289 45 98 45 160 54 221 31
75 -29 107 -111 82 -211 l-7 -30 25 28 25 28 0 -28 c0 -27 -22 -142 -36 -187
-5 -17 1 -14 31 14 36 33 37 34 31 10 -12 -43 -19 -186 -11 -226 l8 -39 10 30
c10 31 84 135 96 135 3 0 37 27 74 61 37 33 67 58 67 55 0 -11 -25 -62 -43
-89 -11 -16 -16 -31 -12 -35 11 -11 172 77 223 123 27 24 66 69 87 100 21 30
40 54 41 52 8 -8 -28 -141 -51 -186 l-26 -52 53 27 c72 36 172 135 205 202 14
29 34 86 43 125 l17 72 23 -75 c15 -48 23 -101 24 -148 0 -64 2 -71 14 -55 26
34 60 109 77 168 20 67 23 219 6 274 -6 19 -8 37 -5 40 7 7 91 -38 128 -69 16
-13 42 -42 59 -65 l29 -40 -7 48 c-19 133 -60 231 -136 325 -56 70 -179 171
-251 208 -27 13 -48 27 -48 30 0 17 174 -38 263 -83 l68 -34 -22 43 c-85 168
-268 353 -433 438 -39 20 -108 50 -153 66 -46 16 -83 32 -83 37 0 4 39 7 87 7
l87 0 -54 56 c-115 118 -323 267 -483 346 -72 36 -218 98 -230 98 -5 0 -6 -15
-3 -32z m146 -125 c64 -59 90 -100 110 -172 14 -52 7 -61 -23 -33 l-23 22 -22
-30 c-26 -34 -46 -40 -37 -10 10 32 -4 41 -28 17 l-22 -22 -6 100 c-4 55 -11
119 -17 143 -5 23 -6 42 -2 42 5 0 36 -26 70 -57z m-198 -618 c-2 -14 -26 -47
-52 -73 -33 -34 -52 -62 -60 -93 -19 -75 -22 -77 -37 -29 -28 92 9 172 92 200
28 10 53 18 56 19 3 0 4 -10 1 -24z m113 -161 c-22 -52 -53 -92 -85 -109 -42
-22 -110 -44 -110 -35 0 14 42 60 55 60 23 0 72 48 80 77 8 32 21 43 53 43 22
0 22 -1 7 -36z m-82 -3 c-12 -48 -74 -67 -82 -26 -3 17 -1 17 12 6 20 -16 37
-7 37 20 0 12 7 19 19 19 14 0 18 -5 14 -19z m511 -49 c57 -27 183 -128 173
-139 -2 -2 -24 5 -48 16 -24 10 -55 22 -69 26 -24 7 -24 6 7 -26 35 -38 84
-118 100 -166 l12 -32 -44 34 c-42 32 -131 72 -140 64 -2 -3 9 -24 26 -48 41
-62 84 -211 44 -154 -19 26 -69 58 -123 77 l-41 15 40 -61 c21 -34 39 -65 39
-69 0 -4 -19 3 -43 16 -25 14 -68 27 -102 30 -59 6 -59 6 -32 -10 32 -18 36
-29 7 -20 -29 9 -183 -22 -247 -51 -31 -13 -58 -23 -60 -21 -5 6 85 87 97 87
6 0 8 5 5 10 -14 23 -63 7 -152 -51 -121 -78 -200 -110 -287 -117 -67 -5 -68
-4 -57 16 15 29 14 69 -5 118 l-16 43 46 59 c80 105 159 154 276 173 33 5 88
13 121 19 72 11 91 25 109 81 15 45 67 96 108 105 15 3 32 8 37 10 6 2 42 2
81 0 54 -2 87 -10 138 -34z"/>
      </g>
    </svg>
  ),
  spark: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M12 2.5l1.9 5.1 5.1 1.9-5.1 1.9L12 16.5l-1.9-5.1L5 9.5l5.1-1.9L12 2.5z"
        fill="currentColor"
      />
      <path
        d="M18.5 14.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  ),
  caret: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  chev: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M6 9l6 6 6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  reset: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M3 12a9 9 0 109-9 9 9 0 00-7 3.3M3 4v3.3h3.3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  copy: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="9"
        y="9"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M5 15V5a2 2 0 012-2h10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  check: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  send: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M4 12l16-8-5 16-3.5-6L4 12z" fill="currentColor" />
    </svg>
  ),
  target: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
    </svg>
  ),
  arrow: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  play: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path d="M7 5l12 7-12 7V5z" fill="currentColor" />
    </svg>
  ),
  pencil: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M14.5 5.5l4 4M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  loader: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M12 3a9 9 0 109 9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  square: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="5"
        y="5"
        width="14"
        height="14"
        rx="2"
        fill="currentColor"
      />
    </svg>
  ),
  terminal: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M9 10l3 3-3 3M15 16h2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  sun: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  moon: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  ),
};
const HubIcon = {
  back: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  search: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle
        cx="10.5"
        cy="10.5"
        r="6.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M15.5 15.5L20 20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  download: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M12 3v12m0 0l-4-4m4 4l4-4M5 17v2a2 2 0 002 2h10a2 2 0 002-2v-2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  check: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  loader: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M12 3a9 9 0 109 9"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  ),
  star: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M12 2l2.9 6.3L22 9.2l-5 4.6 1.3 6.9L12 17.5l-6.3 3.2L7 13.8 2 9.2l7.1-.9L12 2z"
        fill="currentColor"
      />
    </svg>
  ),
  dl: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M12 5v10m0 0l-3-3m3 3l3-3M6 17h12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
  hf: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="8" cy="7" r="3" fill="currentColor" />
      <circle cx="16" cy="7" r="3" fill="currentColor" />
      <path
        d="M6 11c-1 0-1.5 2-1.5 4 0 3 2 6 7.5 6s7.5-3 7.5-6c0-2-.5-4-1.5-4M8 14v3M12 14v3M16 14v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  ),
  ollama: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3-8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm-6 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-2.7 0-5.8 1.29-6 2v2h12v-2c-.2-.71-3.3-2-6-2z" />
    </svg>
  ),
  empty: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="3"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8 12h8M10 15h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  ),
};
function BrandMark({ className }) {
  return (
    <span className={"brand-mark " + (className || "")}>
      <Icon.wolf />
    </span>
  );
}

/* ----------------------------- Backend glue ----------------------------- */
const PREFIXES = [
  ["github_pat_", "github", "GitHub Models"],
  ["ghp_", "github", "GitHub Models"],
  ["sk-ant-", "anthropic", "Claude"],
  ["sk-or-", "openrouter", "OpenRouter"],
  ["gsk_", "groq", "Groq"],
  ["AIza", "gemini", "Gemini"],
  ["nvapi-", "nvidia", "NVIDIA"],
  ["sk-UUa", "opencode", "OpenCode"],
  ["sk-", "openai", "OpenAI"],
];
const CLOUD_DEFAULT = {
  anthropic: "claude",
  openai: "gpt-4o",
  openrouter: "anthropic/claude-opus-4-8",
  groq: "llama",
  qwen: "qwen",
  deepseek: "chat",
  github: "gpt-4o",
  gemini: "gemini-2.0-flash",
  nvidia: "nvidia/nemotron-3-super-120b-a12b",
  opencode: "deepseek-v4-flash",
  puter: "claude-sonnet-4",
  cloudflare: "@cf/meta/llama-3.1-8b-instruct",
  custom: "gpt-4o",
};
const PROVIDER_LABELS = {
  openai: "OpenAI",
  qwen: "Qwen",
  groq: "Groq",
  openrouter: "OpenRouter",
  anthropic: "Claude",
  deepseek: "DeepSeek",
  github: "GitHub Models",
  gemini: "Gemini",
  nvidia: "NVIDIA",
  opencode: "OpenCode",
  puter: "Puter",
  cloudflare: "Cloudflare Worker",
  custom: "Custom",
};
const PROVIDER_OPTS = [
  "auto",
  "openai",
  "qwen",
  "deepseek",
  "github",
  "groq",
  "openrouter",
  "anthropic",
  "gemini",
  "nvidia",
  "opencode",
  "puter",
  "cloudflare",
  "custom",
];
function detectPrefix(key) {
  key = (key || "").trim();
  for (const [p, prov, name] of PREFIXES)
    if (key.startsWith(p)) return { provider: prov, name };
  return key ? { provider: "openai", name: "OpenAI" } : null;
}
function keyish(s) {
  return /^(sk-|gsk_|AIza|github_pat_|ghp_)/.test((s || "").trim());
}
function getCloud() {
  try {
    return JSON.parse(localStorage.getItem("quantum_cloud") || "null");
  } catch (e) {
    return null;
  }
}
function setCloudLS(c) {
  if (c) localStorage.setItem("quantum_cloud", JSON.stringify(c));
  else localStorage.removeItem("quantum_cloud");
}
function escHtml(s) {
  return s.replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
  );
}
function mdInline(s) {
  let h = escHtml(s);
  h = h.replace(/`([^`\n]+)`/g, '<span class="inline-code">$1</span>');
  h = h.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  return h;
}
function mdToHtml(s) {
  const lines = s.split(/\r?\n/);
  const outBlocks = [];
  let normalLines = [];

  const flushNormal = () => {
    if (normalLines.length > 0) {
      outBlocks.push(mdInline(normalLines.join("\n")).replace(/\n/g, "<br/>"));
      normalLines = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const nextLine = lines[i + 1];
    if (
      i + 1 < lines.length &&
      line.includes("|") &&
      /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(nextLine)
    ) {
      flushNormal();
      const parseRow = (r) => {
        let trimmed = r.trim();
        if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
        if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
        return trimmed.split("|").map((c) => c.trim());
      };
      const headers = parseRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().includes("|") && lines[i].trim() !== "") {
        rows.push(parseRow(lines[i]));
        i++;
      }
      let html = '<div class="md-table-wrap"><table class="md-table"><thead><tr>';
      headers.forEach((h) => {
        html += `<th>${mdInline(h)}</th>`;
      });
      html += '</tr></thead><tbody>';
      rows.forEach((row) => {
        html += '<tr>';
        for (let c = 0; c < headers.length; c++) {
          const cell = row[c] || "";
          html += `<td>${mdInline(cell)}</td>`;
        }
        html += '</tr>';
      });
      html += '</tbody></table></div>';
      outBlocks.push(html);
    } else {
      normalLines.push(line);
      i++;
    }
  }
  flushNormal();
  return outBlocks.join("");
}
function parseBlocks(text) {
  // Pre-processing: Jika model hanya memberikan tag penutup tapi lupa tag pembuka
  if ((text.includes("</think>") || text.includes("</thought>")) && 
      !text.includes("<think>") && !text.includes("<thought>")) {
    text = "<think>\n" + text;
  }

  const out = [];
  const re = /(?:```(\w*)\n?([\s\S]*?)```)|(?:<(?:think|thought)>([\s\S]*?)(?:<\/(?:think|thought)>|$))/gi;
  let last = 0,
    m;
  while ((m = re.exec(text))) {
    const pre = text.slice(last, m.index);
    if (pre.trim()) out.push({ type: "text", html: mdToHtml(pre.trim()) });
    if (m[3] !== undefined) {
      out.push({
        type: "think",
        html: mdToHtml(m[3].trim())
      });
    } else {
      out.push({
        type: "code",
        lang: m[1] || "text",
        code: (m[2] || "").replace(/\n$/, ""),
      });
    }
    last = re.lastIndex;
  }
  const tail = text.slice(last);
  const openCode = tail.indexOf("```");
  const openThink = tail.search(/<(?:think|thought)>/i);
  if (openThink >= 0 && (openCode < 0 || openThink < openCode)) {
    const pre = tail.slice(0, openThink);
    if (pre.trim()) out.push({ type: "text", html: mdToHtml(pre.trim()) });
    out.push({
      type: "think",
      html: mdToHtml(tail.slice(openThink).replace(/^<(?:think|thought)>\n?/i, "").trim())
    });
  } else if (openCode >= 0) {
    const pre = tail.slice(0, openCode);
    if (pre.trim()) out.push({ type: "text", html: mdToHtml(pre.trim()) });
    out.push({
      type: "code",
      lang: "",
      code: tail.slice(openCode).replace(/^```\w*\n?/, ""),
    });
  } else if (tail.trim()) out.push({ type: "text", html: mdToHtml(tail.trim()) });
  return out;
}
function reqFor(modelVal, cloud, history) {
  const effortVal = cloud && typeof cloud.effort !== 'undefined' ? Number(cloud.effort) : (parseInt(localStorage.getItem("quantum_effort") || "1", 10) || 1);
  return modelVal === "cloud" && cloud
    ? { history, cloud, effort: effortVal }
    : { history, port: modelVal, effort: effortVal };
}
// Verify HTTP server is running (only for browser users, not Electron)
async function checkServerHealth() {
  if (IPC) return true; // Electron: uses IPC, no HTTP needed
  try {
    const r = await fetch("/", { method: "HEAD", timeout: 2000 });
    return r.ok;
  } catch {
    return false;
  }
}
// Parse an SSE stream from a fetch Response, calling onEvent(parsedJSON) per line.
async function pumpSSE(r, signal, onEvent) {
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      const mm = line.match(/^data:\s*(.*)$/);
      if (!mm) continue;
      let j;
      try {
        j = JSON.parse(mm[1]);
      } catch (e) {
        continue;
      }
      onEvent(j);
    }
  }
}
const IPC =
  typeof window !== "undefined" && window.WOLFSPACE && window.WOLFSPACE.ipc
    ? window.WOLFSPACE
    : null;

// Ambil /ww/list lewat IPC (Electron: tanpa server HTTP) ATAU fetch (browser).
// Tanpa ini, di app Electron origin app:// fetch("/ww/list") jadi 404 → hantu tak terbuang.
async function wwApi(path, { method = "GET", body = null } = {}) {
  try {
    if (IPC && IPC.invoke) {
      const r = await IPC.invoke("api", { method, path, body });
      return JSON.parse((r && r.body) || "null");
    }
    const opts =
      body != null
        ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : { method };
    return await (await fetch(path, opts)).json();
  } catch (_) {
    return null;
  }
}
const wwListFetch = () => wwApi("/ww/list");

// ── Electron fetch-shim ──
// Electron TAK punya server HTTP (zero open ports). Rutekan setiap fetch path-relatif
// ("/…") ke backend in-process lewat IPC.invoke("api"), supaya SEMUA endpoint non-stream
// (models, cloud-providers, detect-key, cloud-save, hf, ollama, agents, terminal, run, dst)
// hidup di Electron TANPA mengubah call-site. Di browser (IPC null) shim TIDAK dipasang —
// fetch asli tetap dipakai. Chat/self-agent pakai IPC.stream (bukan fetch), tak terpengaruh.
if (
  typeof window !== "undefined" &&
  IPC &&
  IPC.invoke &&
  window.fetch &&
  !window.__wwFetchShimmed
) {
  window.__wwFetchShimmed = true;
  const _realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    init = init || {};
    const url = typeof input === "string" ? input : (input && input.url) || "";
    // Hanya API path-relatif same-origin. URL absolut/eksternal/blob → fetch asli.
    if (typeof url !== "string" || !url.startsWith("/")) return _realFetch(input, init);
    const method = String(
      init.method || (typeof input === "object" && input.method) || "GET",
    ).toUpperCase();
    let body = init.body != null ? init.body : typeof input === "object" ? input.body : null;
    // FormData/stream tak didukung shim → serahkan ke fetch asli (jarang di path relatif).
    if (body != null && typeof body !== "string") return _realFetch(input, init);
    let payload = null;
    if (body != null) {
      try {
        payload = JSON.parse(body);
      } catch (_) {
        payload = body;
      }
    }
    let r;
    try {
      r = await IPC.invoke("api", { method, path: url, body: payload });
    } catch (_) {
      return _realFetch(input, init); // IPC gagal → coba fetch asli (mis. aset statis app://)
    }
    const status = (r && r.status) || 200;
    const text = r && typeof r.body === "string" ? r.body : "";
    const hdr = (r && r.headers) || {};
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: "",
      headers: { get: (k) => hdr[String(k).toLowerCase()] ?? null },
      json: async () => JSON.parse(text || "null"),
      text: async () => text,
      clone() {
        return this;
      },
    };
  };
}

// ── Electron EventSource-shim ──
// EventSource (SSE) BUKAN fetch, jadi fetch-shim tak menangkapnya → di Electron
// `new EventSource("/api/agents/stream")` nyasar ke app:// (404), mematikan output
// live Agent Runner / opencode CLI. Di Electron, rutekan EventSource path-relatif
// ke IPC.stream("api", …) (apiStream) dan parse SSE jadi event onmessage.
if (
  typeof window !== "undefined" &&
  IPC &&
  IPC.stream &&
  !window.__wwEventSourceShimmed
) {
  window.__wwEventSourceShimmed = true;
  const _RealES = window.EventSource;
  window.EventSource = function (url) {
    if (typeof url !== "string" || !url.startsWith("/")) {
      return _RealES ? new _RealES(url) : { close() {}, onmessage: null, onerror: null };
    }
    const es = { onmessage: null, onerror: null, onopen: null, readyState: 1, close() {} };
    let buf = "";
    let cancel = null;
    try {
      cancel = IPC.stream(
        "api",
        { method: "GET", path: url },
        (chunk) => {
          if (typeof chunk !== "string") return;
          buf += chunk;
          let i;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const raw = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const dataLines = raw
              .split("\n")
              .filter((l) => l.slice(0, 5) === "data:")
              .map((l) => l.slice(5).replace(/^ /, ""));
            if (dataLines.length && typeof es.onmessage === "function")
              es.onmessage({ data: dataLines.join("\n") });
          }
        },
        () => {
          es.readyState = 2;
          if (typeof es.onerror === "function") es.onerror({ type: "done" });
        },
      );
    } catch (e) {
      if (typeof es.onerror === "function") setTimeout(() => es.onerror(e), 0);
    }
    es.close = () => {
      es.readyState = 2;
      try {
        cancel && cancel();
      } catch (_) {}
    };
    return es;
  };
}

// ── Auto-migrasi localStorage (Electron, sekali jalan) ──
// Kalau ada file jembatan dari browser (~/.wolfspace/ls-migrate.json via /ww/ls-load)
// dan Electron ini belum pernah migrasi, TERAPKAN OTOMATIS saat load — tanpa perlu
// menempel apa pun di DevTools console (yang diblokir proteksi self-XSS).
if (
  typeof window !== "undefined" &&
  IPC &&
  IPC.invoke &&
  !localStorage.getItem("quantum_migrated")
) {
  IPC.invoke("api", { method: "GET", path: "/ww/ls-load" })
    .then((r) => {
      if (!r || r.status !== 200) return;
      let data = {};
      try {
        data = JSON.parse(r.body).data || {};
      } catch (_) {
        return;
      }
      const keys = Object.keys(data).filter((k) => k !== "quantum_migrated");
      if (!keys.length) return; // belum ada dump dari browser → cek lagi lain kali
      for (const k of keys) localStorage.setItem(k, data[k]);
      localStorage.setItem("quantum_migrated", "1");
      console.log("[ww] auto-migrasi localStorage: " + keys.length + " kunci diimpor — reload…");
      location.reload();
    })
    .catch(() => {});
}

async function streamChat(reqBody, onText, signal) {
  let acc = "",
    run = null;
  const handle = (j) => {
    if (j.t === "tok") {
      acc += j.c;
      onText(acc, run);
    } else if (j.t === "retry") {
      acc = "";
      run = null;
      onText(acc, run);
    } // new fix attempt ? drop the previous failed one
    else if (j.t === "run") {
      run = j.run;
      onText(acc, run);
    } else if (j.t === "done") {
      run = j.run || run;
      onText(acc, run);
    } else if (j.t === "err") {
      acc += "\n[" + j.m + "]";
      onText(acc, run);
    }
  };
  if (IPC) {
    // Electron IPC � no HTTP
    await new Promise((resolve) => {
      const cancel = IPC.stream("chat", reqBody, handle, resolve);
      if (signal)
        signal.addEventListener("abort", () => {
          cancel();
          resolve();
        });
    });
    return { text: acc, run };
  }
  const r = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
    signal,
  });
  await pumpSSE(r, signal, handle);
  return { text: acc, run };
}
// Self-edit agent: stream the READ/GREP/EDIT/� loop (IPC, or /self-agent over HTTP).
async function streamSelfAgent(reqBody, onEvent, signal) {
  if (IPC) {
    await new Promise((resolve) => {
      const cancel = IPC.stream("self-agent", reqBody, onEvent, resolve);
      if (signal)
        signal.addEventListener("abort", () => {
          cancel();
          resolve();
        });
    });
    return;
  }
  try {
    const r = await fetch("/self-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reqBody),
      signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
    await pumpSSE(r, signal, onEvent);
  } catch (e) {
    if (e instanceof TypeError && e.message.includes("Failed to fetch")) {
      throw new Error(
        'Tidak bisa terhubung ke server self-agent.\n\nJika running di browser:\n1. Buka terminal di folder WOLFSPACE\n2. Jalankan: npm start\n3. Tunggu sampai "http://127.0.0.1:8090" muncul\n4. Refresh browser dan coba lagi\n\nAtau gunakan Electron: npm run app',
      );
    }
    throw e;
  }
}

async function runOpenClawChat(message, signal) {
  const r = await fetch("/api/openclaw/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
    signal,
  });
  let data = {};
  try {
    data = await r.json();
  } catch (_) {}
  if (!r.ok || !data.ok) {
    throw new Error(data.error || `OpenClaw gagal: HTTP ${r.status}`);
  }
  return data;
}

/* ----------------------------- Model Interface (collapsible dropdown) ----------------------------- */
function ModelInterface({ models, modelVal, setModelVal }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);
  const current = models.find((m) => m.value === modelVal);
  const label = current ? current.label : modelVal;
  return (
    <div className="model-interface" ref={ref}>
      <button
        className="mi-trigger"
        onClick={() => setOpen(!open)}
        title={label}
      >
        <span className="mi-label">{label}</span>
        <Icon.chev
          className={"mi-chev" + (open ? " open" : "")}
          style={{ width: 14, height: 14 }}
        />
      </button>
      {open && (
        <div className="mi-panel">
          {models.map((m) => (
            <div
              key={m.value}
              className={
                "mi-opt" +
                (m.value === modelVal ? " active" : "") +
                (m.disabled ? " disabled" : "")
              }
              onClick={() => {
                if (!m.disabled) {
                  setModelVal(m.value);
                  setOpen(false);
                }
              }}
            >
              {m.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Top bar ----------------------------- */
function TopBar({
  models,
  modelVal,
  setModelVal,
  panelOpen,
  setPanelOpen,
  onReset,
  status,
  theme,
  setTheme,
  terminalOpen,
  setTerminalOpen,
}) {
  return (
    <header className="topbar">
      <div className="tb-spacer" />
      <button 
        className={`panel-toggle-btn ${panelOpen ? 'active' : ''}`}
        onClick={() => setPanelOpen(!panelOpen)}
        title="Toggle Right Panel"
        style={{ 
          opacity: panelOpen ? 1 : 0.7, 
          background: 'transparent', 
          border: 'none', 
          cursor: 'pointer', 
          color: 'inherit',
          padding: '6px',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
          <line x1="15" x2="15" y1="3" y2="21"/>
        </svg>
      </button>
    </header>
  );
}

/* ----------------------------- HuggingFace models ----------------------------- */
function fmtSize(b) {
  if (!b) return "";
  const gb = b / 1073741824;
  return gb >= 1 ? gb.toFixed(2) + " GB" : (b / 1048576).toFixed(0) + " MB";
}
function HFModels({ onSaved }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [sel, setSel] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(null);
  const [msg, setMsg] = useState("");
  const search = async () => {
    const t = q.trim();
    if (!t) return;
    setMsg("Mencari model...");
    setResults([]);
    setSel("");
    setFiles([]);
    try {
      const r = await (
        await fetch("/hf/search?q=" + encodeURIComponent(t))
      ).json();
      if (r.error) throw new Error(r.error);
      setResults(r);
      setMsg(r.length ? "" : "Belum ada hasil yang cocok.");
    } catch (e) {
      setMsg("Pencarian gagal: " + e.message);
    }
  };
  const pick = async (id) => {
    setSel(id);
    setFiles([]);
    setMsg("Memuat daftar file...");
    try {
      const r = await (
        await fetch("/hf/files?id=" + encodeURIComponent(id))
      ).json();
      if (r.error) throw new Error(r.error);
      setFiles(r);
      setMsg(r.length ? "" : "Tidak ada file .gguf di repositori ini.");
    } catch (e) {
      setMsg("Gagal memuat file: " + e.message);
    }
  };
  const download = async (file) => {
    if (busy) return;
    setBusy(true);
    setProg(0);
    setMsg("Mengunduh " + file.split("/").pop() + "...");
    try {
      const res = await fetch("/hf/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sel, file }),
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          const m = line.match(/^data:\s*(.*)$/);
          if (!m) continue;
          let j;
          try {
            j = JSON.parse(m[1]);
          } catch (e) {
            continue;
          }
          if (j.t === "progress") setProg(j.pct);
          else if (j.t === "done") {
            setMsg(
              "Selesai: " +
                j.model.name +
                " sudah diunduh dan dijalankan di port " +
                j.model.port +
                ". Tunggu sekitar 30 detik, lalu pilih dari menu Model.",
            );
            onSaved && onSaved();
          } else if (j.t === "err") setMsg("Unduhan gagal: " + j.m);
        }
      }
    } catch (e) {
      setMsg("Unduhan gagal: " + e.message);
    }
    setBusy(false);
    setProg(null);
  };
  return (
    <div className="hf">
      <label className="field-label">Model HuggingFace</label>
      <div className="hf-search">
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari GGUF, misalnya qwen coder"
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
          }}
        />
        <button className="btn btn-primary" onClick={search}>
          Cari
        </button>
      </div>
      {results.length > 0 && (
        <div className="hf-res">
          {results.map((m) => (
            <button
              key={m.id}
              className={"hf-item" + (sel === m.id ? " sel" : "")}
              onClick={() => pick(m.id)}
            >
              {m.id}
              <br />
              <span className="meta">
                Unduhan {m.downloads.toLocaleString()} � Suka {m.likes}
              </span>
            </button>
          ))}
        </div>
      )}
      {sel &&
        files.map((f) => {
          const heavy = f.size > 4 * 1073741824;
          return (
            <div className="hf-file" key={f.path}>
              <span className="nm">{f.path.split("/").pop()}</span>
              <span className={"sz" + (heavy ? " heavy" : "")}>
                {fmtSize(f.size)}
                {heavy ? " ?" : ""}
              </span>
              <button
                className="hf-dl"
                disabled={busy}
                onClick={() => download(f.path)}
              >
                Unduh
              </button>
            </div>
          );
        })}
      {prog !== null && (
        <div className="hf-bar">
          <div style={{ width: prog + "%" }} />
        </div>
      )}
      {msg && <div className="hf-msg">{msg}</div>}
    </div>
  );
}

/* ----------------------------- History (full page) ----------------------------- */
function HistoryView({ savedChats = [], onSelect, onDelete }) {
  const [searchQuery, setSearchQuery] = useState("");

  const formatTimeAgo = (ts) => {
    if (!ts) return "now";
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return "now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
    return `${Math.floor(diff / 2592000)}mo`;
  };

  const filteredChats = savedChats
    .slice()
    .reverse()
    .filter((c) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const title = (c.title || "").toLowerCase();
      const proj = (c.project || "").toLowerCase();
      return title.includes(q) || proj.includes(q);
    });

  return (
    <div style={{ padding: "40px 60px", maxWidth: "920px", margin: "0 auto", width: "100%", color: "#e2e8f0" }}>
      <h1 style={{ fontSize: "20px", fontWeight: 600, color: "#f3f4f6", marginBottom: "24px" }}>
        Conversation History
      </h1>

      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "32px" }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            background: "#181b20",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "10px",
            padding: "10px 16px",
            gap: "10px",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "#e2e8f0",
              fontSize: "14px",
              width: "100%",
              fontFamily: "inherit",
            }}
          />
        </div>
      </div>

      <div
        style={{
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "0.8px",
          color: "#6b7280",
          textTransform: "uppercase",
          marginBottom: "12px",
        }}
      >
        ALL CONVERSATIONS
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {filteredChats.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "#6b7280", fontSize: "14px" }}>
            Belum ada riwayat percakapan yang tersimpan.
          </div>
        ) : (
          filteredChats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => onSelect(chat)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 12px",
                borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                cursor: "pointer",
                borderRadius: "8px",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.02)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <div style={{ fontSize: "15px", fontWeight: 500, color: "#e2e8f0" }}>
                  {chat.title || "Chat"}
                </div>
                <div style={{ fontSize: "13px", color: "#6b7280" }}>
                  {chat.project || "WOLFSPACE"}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <span style={{ fontSize: "13px", color: "#6b7280" }}>
                  {formatTimeAgo(chat.savedAt)}
                </span>
                <button
                  title="Hapus"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(chat.id);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#6b7280",
                    cursor: "pointer",
                    fontSize: "16px",
                    padding: "4px 8px",
                    borderRadius: "4px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "#ef4444";
                    e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "#6b7280";
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ----------------------------- Settings (full page) ----------------------------- */
function SettingsView({ onBack, onSaved, onCloudChanged }) {
  const stored = getCloud();
  const [key, setKey] = useState("");
  const [provider, setProvider] = useState(
    stored ? (stored.baseUrl ? "custom" : stored.provider) : "auto",
  );
  const [model, setModelName] = useState(
    stored ? (keyish(stored.model) ? "" : stored.model) : "",
  );
  const [baseUrl, setBaseUrl] = useState(stored ? stored.baseUrl || "" : "");
  const [hint, setHint] = useState(
    stored
      ? "Provider " +
          stored.provider +
          " � " +
          (stored.key ? stored.key.slice(-4) : "server") +
          " � aktif"
      : "Tempel API key, lalu deteksi otomatis atau pilih provider.",
  );

  const detect = async () => {
    const k = key.trim() || (stored && stored.key);
    if (!k) {
      setHint("Tempel API key terlebih dahulu.");
      return;
    }
    setHint("Sedang mendeteksi provider...");
    try {
      const d = await (
        await fetch("/detect-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: k }),
        })
      ).json();
      if (PROVIDER_LABELS[d.provider]) setProvider(d.provider);
      setHint(
        d.verified
          ? "Terverifikasi: " + d.name
          : "Tebakan: " + d.name + " (belum terverifikasi)",
      );
    } catch (e) {
      setHint("Deteksi belum berhasil: " + e.message);
    }
  };
  const save = () => {
    const k = key.trim() || (stored && stored.key);
    if (!k) {
      setHint("Tempel API key terlebih dahulu.");
      return;
    }
    let prov, name, bu;
    if (provider === "auto") {
      const d = detectPrefix(k);
      prov = d.provider;
      name = d.name;
    } else if (provider === "custom" || provider === "cloudflare") {
      prov = provider;
      name = PROVIDER_LABELS[provider];
      bu = baseUrl.trim();
      if (!bu) {
        setHint("Isi Base URL untuk " + (provider === "cloudflare" ? "Cloudflare Worker" : "provider custom") + ".");
        return;
      }
    } else {
      prov = provider;
      name = PROVIDER_LABELS[provider];
    }
    let mdl = model.trim();
    if (stored && stored.provider !== prov) mdl = "";
    if (!mdl || keyish(mdl)) mdl = CLOUD_DEFAULT[prov] || "gpt-4o";
    setCloudLS({ key: k, provider: prov, name, model: mdl, baseUrl: bu });
    // mirror to the server so the backend agent loop can use it autonomously
    fetch("/cloud-save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: k, provider: prov, model: mdl, baseUrl: bu }),
    })
      .then((r) => r.json())
      .then(() =>
        setHint(
          "Tersimpan di browser dan server: " +
            prov +
            " � " +
            k.slice(-4) +
            " ? " +
            mdl,
        ),
      )
      .catch(() =>
        setHint(
          "Tersimpan di browser: " + prov + " � " + k.slice(-4) + " ? " + mdl,
        ),
      );
    onSaved();
    onCloudChanged(); // Trigger model list reload
  };
  const clear = () => {
    setCloudLS(null);
    setKey("");
    setModelName("");
    setBaseUrl("");
    setProvider("auto");
    setHint("Konfigurasi API key sudah dihapus.");
    onSaved();
    onCloudChanged();
  };

  return (
    <div className="hub">
      <header className="hub-header">
        <span className="tb-divider" />
        <div className="hub-title-group">
          <span
            className="hub-hf-mark"
            style={{ background: "rgba(94,234,212,.14)", color: "#5eead4" }}
          >
            {SB.key({ width: 16, height: 16 })}
          </span>
          <span className="hub-title">Pengaturan API</span>
        </div>
        <div className="tb-spacer" />
      </header>
      <div className="hub-body">
        <div className="hub-inner settings-inner">
          <div className="settings-card">
            <div className="field">
              <label className="field-label">API Key Cloud</label>
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder={
                  stored
                    ? "Key tersimpan (... " +
                      (stored.key ? stored.key.slice(-4) : "server") +
                      ") - kosongkan untuk tetap memakai key lama"
                    : "Tempel API key di sini"
                }
              />
            </div>
            <button className="btn btn-ghost" onClick={detect}>
              Deteksi provider dari key
            </button>
            <div className="field">
              <label className="field-label">Provider</label>
              <div className="select-wrap">
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                >
                  <option value="auto">Deteksi otomatis</option>
                  {PROVIDER_OPTS.filter((p) => p !== "auto").map((p) => (
                    <option key={p} value={p}>
                      {p === "custom"
                        ? "OpenAI-compatible (URL custom)"
                        : PROVIDER_LABELS[p]}
                    </option>
                  ))}
                </select>
                <Icon.chev className="chev" style={{ width: 15, height: 15 }} />
              </div>
            </div>
          {(provider === "custom" || provider === "cloudflare") && (
            <div className="field">
              <label className="field-label">Base URL</label>
              <input
                className="input"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={provider === "cloudflare" ? "https://api.cloudflare.com/client/v4/accounts/ACCOUNT_ID/ai/v1" : "https://host/v1"}
              />
            </div>
          )}
            <div className="field">
              <label className="field-label">Model</label>
              <input
                className="input"
                value={model}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="Opsional, misalnya qwen, coder, gpt-4o"
              />
            </div>
            <div className="provider-status">
              <span className="status-dot" />
              {hint}
            </div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={save}>
                <Icon.check style={{ width: 14, height: 14 }} /> Simpan
              </button>
              <button className="btn btn-danger" onClick={clear}>
                Hapus konfigurasi
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Syntax highlight ----------------------------- */
const KW = {
  python:
    "def class return if elif else for while in and or not import from as with try except finally lambda None True False print pass break continue is global nonlocal yield assert raise del self".split(
      " ",
    ),
  javascript:
    "function return if else for while const let var class new typeof instanceof import from export default await async try catch finally throw switch case break continue this null undefined true false of in delete void yield".split(
      " ",
    ),
};
KW.typescript = KW.javascript;
KW.go =
  "func return if else for range var const type struct interface package import map chan go defer nil true false switch case break continue".split(
    " ",
  );
function highlight(code, lang) {
  const kws = KW[lang] || KW.javascript;
  const re =
    /(\/\/[^\n]*|#[^\n]*)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+\.?\d*\b)|([A-Za-z_$][\w$]*)(\s*\()?/g;
  let out = "",
    last = 0,
    m;
  while ((m = re.exec(code))) {
    out += escHtml(code.slice(last, m.index));
    if (m[1]) out += '<span class="t-com">' + escHtml(m[1]) + "</span>";
    else if (m[2]) out += '<span class="t-str">' + escHtml(m[2]) + "</span>";
    else if (m[3]) out += '<span class="t-num">' + escHtml(m[3]) + "</span>";
    else if (m[4] !== undefined) {
      const w = m[4],
        paren = m[5] || "";
      if (kws.indexOf(w) >= 0)
        out += '<span class="t-kw">' + escHtml(w) + "</span>";
      else if (paren) out += '<span class="t-fn">' + escHtml(w) + "</span>";
      else out += escHtml(w);
      out += escHtml(paren);
    }
    last = re.lastIndex;
  }
  out += escHtml(code.slice(last));
  return out;
}

/* ----------------------------- Code block ----------------------------- */
const LANGS = [
  "python",
  "javascript",
  "typescript",
  "bash",
  "go",
  "c",
  "cpp",
  "java",
  "php",
  "rust",
  "kotlin",
  "html",
  "css",
  "json",
];
const MLANG = {
  js: "javascript",
  javascript: "javascript",
  node: "javascript",
  ts: "typescript",
  typescript: "typescript",
  py: "python",
  python: "python",
  go: "go",
  golang: "go",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  java: "java",
  php: "php",
  rust: "rust",
  kotlin: "kotlin",
  html: "html",
  css: "css",
  json: "json",
  bash: "shell",
  sh: "shell",
  shell: "shell",
  sql: "sql",
  yaml: "yaml",
  markdown: "markdown",
};
function mLang(l) {
  return MLANG[(l || "").toLowerCase()] || "plaintext";
}

// Per-language monogram badge (color + short symbol) � clean, no heavy logo assets.
const LANG_META = {
  python: { l: "Python", s: "Py", c: "#3776AB" },
  javascript: { l: "JavaScript", s: "JS", c: "#F7DF1E", d: 1 },
  typescript: { l: "TypeScript", s: "TS", c: "#3178C6" },
  bash: { l: "Bash", s: ">_", c: "#4EAA25" },
  go: { l: "Go", s: "Go", c: "#00ADD8" },
  c: { l: "C", s: "C", c: "#5C6BC0" },
  cpp: { l: "C++", s: "C+", c: "#00599C" },
  java: { l: "Java", s: "Jv", c: "#E76F00" },
  php: { l: "PHP", s: "php", c: "#777BB4" },
  rust: { l: "Rust", s: "Rs", c: "#D9844B" },
  kotlin: { l: "Kotlin", s: "Kt", c: "#7F52FF" },
  html: { l: "HTML", s: "<>", c: "#E34F26" },
  css: { l: "CSS", s: "#", c: "#1572B6" },
  json: { l: "JSON", s: "{}", c: "#A0A6B0" },
};
const LANG_LOGOS = new Set([
  "python",
  "javascript",
  "typescript",
  "bash",
  "go",
  "c",
  "cpp",
  "java",
  "php",
  "rust",
  "kotlin",
  "html",
  "css",
  "json",
]);
function LangIcon({ lang }) {
  const m = LANG_META[lang] || {
    l: lang,
    s: (lang || "?").slice(0, 2),
    c: "#7c8aa0",
  };
  if (LANG_LOGOS.has(lang))
    return (
      <img
        className="lang-logo"
        src={"/vendor/lang/" + lang + ".svg"}
        alt={m.l}
        loading="lazy"
        onError={(e) => {
          const sp = document.createElement("span");
          sp.className = "lang-badge";
          sp.style.background = m.c;
          sp.style.color = m.d ? "#111" : "#fff";
          sp.textContent = m.s;
          e.target.replaceWith(sp);
        }}
      />
    );
  return (
    <span
      className="lang-badge"
      style={{ background: m.c, color: m.d ? "#111" : "#fff" }}
    >
      {m.s}
    </span>
  );
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false);
  const [language, setLanguage] = useState((lang || "python").toLowerCase());
  const [runState, setRunState] = useState("idle");
  const [out, setOut] = useState(null);
  const [edReady, setEdReady] = useState(false); // Monaco mounted? else show <pre> fallback
  const hostRef = useRef(null);
  const edRef = useRef(null);
  const focusedRef = useRef(false);
  const getCode = () => (edRef.current ? edRef.current.getValue() : code);

  useEffect(() => {
    let disposed = false;
    if (!window.monacoReady) return;
    window.monacoReady.then((monaco) => {
      if (disposed || !hostRef.current) return;
      // One-time fix: kill Monaco's blue outline (always-on via .monaco-editor rule in editor.main.css)
      if (!document.getElementById("monaco-outline-fix")) {
        const s = document.createElement("style");
        s.id = "monaco-outline-fix";
        s.textContent =
          ".monaco-editor { outline: none !important; outline-offset: 0 !important; }";
        document.head.appendChild(s);
      }
      const ed = monaco.editor.create(hostRef.current, {
        value: code,
        language: mLang(language),
        theme: "vs-dark",
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineNumbers: "on",
        renderLineHighlight: "none",
        tabSize: 4,
        scrollbar: { alwaysConsumeMouseWheel: false },
        padding: { top: 8, bottom: 8 },
        wordWrap: "off",
        domReadOnly: false,
        readOnly: false,
        autoDetectHighContrast: false,
      });
      edRef.current = ed;
      setEdReady(true);
      const fit = () => {
        if (!hostRef.current) return;
        hostRef.current.style.height =
          Math.min(Math.max(ed.getContentHeight(), 38), 540) + "px";
        ed.layout();
      };
      ed.onDidContentSizeChange(fit);
      fit();
      ed.onDidFocusEditorText(() => {
        focusedRef.current = true;
      });
      ed.onDidBlurEditorText(() => {
        focusedRef.current = false;
      });
    });
    return () => {
      disposed = true;
      if (edRef.current) {
        edRef.current.dispose();
        edRef.current = null;
      }
    };
  }, []);
  // follow streaming text until the user starts editing
  useEffect(() => {
    const ed = edRef.current;
    if (ed && !focusedRef.current && ed.getValue() !== code) ed.setValue(code);
  }, [code]);
  useEffect(() => {
    const ed = edRef.current;
    if (ed && window.monaco)
      window.monaco.editor.setModelLanguage(ed.getModel(), mLang(language));
  }, [language]);

  const copyCode = () => {
    navigator.clipboard?.writeText(getCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const run = async () => {
    setRunState("running");
    setOut(null);
    try {
      const r = await fetch("/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: language, code: getCode() }),
      });
      setOut(await r.json());
    } catch (e) {
      setOut({ ok: false, error: "Server belum bisa dijangkau: " + e.message });
    }
    setRunState("done");
  };

  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-dots">
          <span style={{ background: "#ff5f57" }} />
          <span style={{ background: "#febc2e" }} />
          <span style={{ background: "#28c840" }} />
        </span>
        <span className="code-lang">{language}</span>
        <span className="lang-spacer" />
      </div>
      <div
        className="monaco-host"
        ref={hostRef}
        style={{ display: edReady ? "block" : "none" }}
      />
      {!edReady && (
        <pre
          className="code-fallback"
          style={{
            margin: 0,
            padding: "10px 14px",
            overflow: "auto",
            color: "#cbd5e1",
            background: "#0d1117",
            font: "13px/1.6 ui-monospace,Consolas,monospace",
            whiteSpace: "pre",
          }}
        >
          {code}
        </pre>
      )}
      <div className="code-toolbar">
        <button

          className={"ctb-btn" + (copied ? " copied" : "")}
          onClick={copyCode}
        >
          {copied ? <Icon.check /> : <Icon.copy />} {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {runState === "done" && out && (
        <div className={"code-output " + (out.ok ? "ok" : "err")}>
          <div className="output-head">
            <span className="ok-mark">
              {out.ok ? (
                <>
                  <Icon.check /> ran (exit 0)
                </>
              ) : (
                <>? error</>
              )}{" "}
              � {language}
            </span>
          </div>
          <div className="output-body">
            {(out.output || "") + (out.error ? "\n" + out.error : "") ||
              "(no output)"}
          </div>
        </div>
      )}
    </div>
  );
}

function parseMermaidFlowchart(code) {
  const lines = String(code || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line && !/^%%/.test(line) && !/^(flowchart|graph)\b/i.test(line),
    );

  const nodes = new Map();
  const edges = [];

  const getNode = (id) => {
    if (!nodes.has(id)) {
      nodes.set(id, { id, label: id, shape: "rect", order: nodes.size });
    }
    return nodes.get(id);
  };

  const parseNode = (token) => {
    const raw = String(token || "").trim();
    if (!raw) return null;
    const m = raw.match(
      /^([A-Za-z0-9_:-]+)\s*(?:\[\[([\s\S]+)\]\]|\[([\s\S]+)\]|\(\(([\s\S]+)\)\)|\(([^()]+)\)|\{([\s\S]+)\})?$/,
    );
    const id = m ? m[1] : raw.replace(/[^A-Za-z0-9_:-]/g, "_");
    const node = getNode(id);
    if (m) {
      const label = m[2] || m[3] || m[4] || m[5] || m[6];
      if (label) node.label = label.trim();
      if (m[2]) node.shape = "subroutine";
      else if (m[4]) node.shape = "circle";
      else if (m[5]) node.shape = "round";
      else if (m[6]) node.shape = "diamond";
      else if (m[3]) node.shape = "rect";
    }
    return node;
  };

  for (const line of lines) {
    const edgeMatch = line.match(
      /^(.*?)\s*(?:--\s*([^>-]+?)\s*-->|-+>|\.->)\s*(.*)$/,
    );
    if (!edgeMatch) {
      const nodeOnly = parseNode(line);
      if (nodeOnly) getNode(nodeOnly.id);
      continue;
    }
    const from = parseNode(edgeMatch[1]);
    const label = (edgeMatch[2] || "").trim();
    const to = parseNode(edgeMatch[3]);
    if (from && to) edges.push({ from: from.id, to: to.id, label });
  }

  if (!nodes.size) return null;

  const incoming = new Map();
  const outgoing = new Map();
  for (const n of nodes.keys()) {
    incoming.set(n, 0);
    outgoing.set(n, []);
  }
  for (const e of edges) {
    incoming.set(e.to, (incoming.get(e.to) || 0) + 1);
    outgoing.get(e.from).push(e.to);
  }

  const level = new Map();
  const queue = [];
  for (const [id, deg] of incoming.entries()) {
    if (deg === 0) {
      level.set(id, 0);
      queue.push(id);
    }
  }
  if (!queue.length) {
    const first = nodes.keys().next().value;
    level.set(first, 0);
    queue.push(first);
  }

  const processed = new Set();
  while (queue.length) {
    const cur = queue.shift();
    if (processed.has(cur)) continue;
    processed.add(cur);
    const curLevel = level.get(cur) || 0;
    const nextLevel = curLevel + 1;
    for (const nxt of outgoing.get(cur) || []) {
      const oldLevel = level.get(nxt);
      if (oldLevel === undefined || oldLevel < nextLevel) {
        level.set(nxt, nextLevel);
      }
      if (!processed.has(nxt)) {
        queue.push(nxt);
      }
    }
  }

  for (const id of nodes.keys()) {
    if (!level.has(id)) level.set(id, 0);
  }

  const layers = [];
  for (const [id, lv] of level.entries()) {
    if (!layers[lv]) layers[lv] = [];
    layers[lv].push(id);
  }
  layers.forEach((layer) =>
    layer.sort((a, b) => nodes.get(a).order - nodes.get(b).order),
  );

  const fontSize = 14;
  const padX = 18;
  const padY = 12;
  const gapX = 42;
  const gapY = 54;
  const layerGap = 86;
  const measure = (label) =>
    Math.max(96, Math.min(260, label.length * 8.5 + padX * 2));

  const positioned = new Map();
  let maxWidth = 0;
  let maxHeight = 0;
  for (let ly = 0; ly < layers.length; ly++) {
    const layer = layers[ly] || [];
    let rowWidth = 0;
    const sizes = layer.map((id) => ({
      id,
      w: measure(nodes.get(id).label),
      h: 54,
    }));
    rowWidth =
      sizes.reduce((sum, item) => sum + item.w, 0) +
      Math.max(0, sizes.length - 1) * gapX;
    let x = Math.max(24, Math.max(0, rowWidth) ? 0 : 0);
    const topY = 28 + ly * layerGap;
    const startX = 24;
    let cursorX = startX;
    for (const item of sizes) {
      positioned.set(item.id, {
        x: cursorX,
        y: topY,
        w: item.w,
        h: item.h,
        layer: ly,
      });
      cursorX += item.w + gapX;
      maxWidth = Math.max(maxWidth, cursorX);
      maxHeight = Math.max(maxHeight, topY + item.h);
    }
  }

  return {
    nodes,
    edges,
    positioned,
    width: Math.max(360, maxWidth + 24),
    height: Math.max(120, maxHeight + 28),
    fontSize,
    padX,
    padY,
  };
}

// ── Jembatan mermaid -> Cytoscape ──
// mermaid dipakai sebagai BAHASA MASUKAN (mudah bagi model menulisnya); kita ubah jadi
// elements Cytoscape supaya diagram jadi INTERAKTIF (drag/zoom/ganti-layout), bukan
// gambar mati. Mendaur ulang parseMermaidFlowchart yang sudah mengekstrak node+edge.
function mermaidToCytoElements(code) {
  const raw = String(code || "");
  // Subgraph -> compound node. parseMermaidFlowchart tak paham `subgraph`/`end` dan
  // malah membuat node sampah, jadi kita pisahkan baris itu dulu sambil merekam node
  // mana milik grup mana. Node bergrup dapat data.parent; grup jadi compound node.
  const subs = {};        // subId -> title
  const parentOf = {};    // nodeId -> subId (grup terdalam yang pertama merujuknya)
  const stack = [];
  const clean = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^subgraph\b/i.test(line)) {
      const rest = line.replace(/^subgraph\s+/i, "");
      const mB = rest.match(/^([A-Za-z0-9_:-]+)\s*\[([^\]]*)\]/) || rest.match(/^([A-Za-z0-9_:-]+)\s*"([^"]*)"/);
      let id, title;
      if (mB) { id = mB[1]; title = mB[2]; }
      else if (/^[A-Za-z0-9_:-]+$/.test(rest.trim())) { id = rest.trim(); title = id; }
      else { id = "sg" + Object.keys(subs).length; title = rest.replace(/["']/g, "").trim(); }
      subs[id] = String(title).replace(/^["']|["']$/g, "");
      stack.push(id);
      continue;
    }
    if (/^end$/i.test(line)) { stack.pop(); continue; }
    if (stack.length) {
      const cur = stack[stack.length - 1];
      for (const t of (line.match(/[A-Za-z0-9_:-]+/g) || [])) if (!parentOf[t]) parentOf[t] = cur;
    }
    clean.push(rawLine);
  }
  const parsed = parseMermaidFlowchart(clean.join("\n"));
  if (!parsed || !parsed.nodes || !parsed.nodes.size) return null;

  const cleanLabel = (l) => String(l || "").replace(/<br\s*\/?>/gi, "\n").replace(/^\s*["']|["']\s*$/g, "");
  const usedSubs = new Set();
  for (const id of parsed.nodes.keys()) if (parentOf[id] && subs[parentOf[id]]) usedSubs.add(parentOf[id]);
  const parents = [...usedSubs].map((id) => ({ data: { id, label: subs[id], isParent: 1 } }));

  const nodes = [...parsed.nodes.values()].map((n) => ({
    data: {
      id: n.id, label: cleanLabel(n.label || n.id), shape: n.shape || "rect", deg: 0,
      parent: (parentOf[n.id] && usedSubs.has(parentOf[n.id])) ? parentOf[n.id] : undefined,
    },
  }));
  const byId = new Map(nodes.map((n) => [n.data.id, n]));
  const edges = (parsed.edges || []).map((e, i) => {
    if (byId.get(e.from)) byId.get(e.from).data.deg++;
    if (byId.get(e.to)) byId.get(e.to).data.deg++;
    return { data: { id: "ce" + i, source: e.from, target: e.to, label: e.label || "" } };
  });
  return [...parents, ...nodes, ...edges];
}

function cyLayoutOpts(name) {
  const o = { name, padding: 22, animate: true, animationDuration: 350 };
  if (name === "breadthfirst") { o.directed = true; o.spacingFactor = 1.1; }
  else if (name === "cose") { o.idealEdgeLength = 80; o.nodeRepulsion = 8000; o.gravity = 0.3; }
  else if (name === "concentric") { o.concentric = (n) => n.degree(); o.levelWidth = () => 3; }
  return o;
}

const CY_STYLE = [
  { selector: "node", style: { "background-color": "#141d2b", "border-color": "#8fb3ff", "border-width": 1.5, "label": "data(label)", "color": "#dce4f0", "font-family": "ui-monospace, monospace", "font-size": 11, "text-valign": "center", "text-halign": "center", "text-wrap": "wrap", "text-max-width": 150, "shape": "round-rectangle", "width": "label", "height": "label", "padding": "9px" } },
  { selector: 'node[shape="diamond"]', style: { "shape": "diamond", "width": 76, "height": 54 } },
  { selector: 'node[shape="circle"]', style: { "shape": "ellipse" } },
  { selector: 'node[shape="round"]', style: { "shape": "round-rectangle" } },
  { selector: 'node[shape="subroutine"]', style: { "shape": "cut-rectangle" } },
  // compound node = grup subgraph: kotak transparan berlabel di atas, anak-anak di dalam
  { selector: "node[?isParent]", style: { "background-color": "#8fb3ff", "background-opacity": 0.05, "border-color": "#3a4a63", "border-width": 1, "shape": "round-rectangle", "label": "data(label)", "text-valign": "top", "text-halign": "center", "font-size": 10, "color": "#8fb3ff", "padding": "16px", "text-margin-y": 3, "width": "label", "height": "label" } },
  { selector: "node[deg >= 4]", style: { "border-width": 2.5, "border-color": "#a9c6ff", "background-color": "#182741" } },
  { selector: "edge", style: { "width": 1.4, "line-color": "#3f5578", "target-arrow-color": "#5f7bb0", "target-arrow-shape": "triangle", "curve-style": "bezier", "arrow-scale": 0.9, "opacity": 0.9, "label": "data(label)", "font-family": "ui-monospace, monospace", "font-size": 9, "color": "#9fb7d9", "text-background-color": "#0d1117", "text-background-opacity": 0.85, "text-background-padding": 2 } },
  { selector: "node.hl", style: { "border-color": "#ffd479", "border-width": 2.5 } },
  { selector: "edge.hl", style: { "line-color": "#8fb3ff", "target-arrow-color": "#8fb3ff", "opacity": 1, "width": 2 } },
];

// Renderer INTERAKTIF: mermaid (teks) -> Cytoscape (kanvas). Dipakai lewat DiagramBlock
// hanya saat user menekan "interaktif" (default tetap mermaid.js fidelitas-penuh).
function CytoscapeBlock({ code, onStatic }) {
  const ref = useRef(null);
  const cyRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [layout, setLayout] = useState("breadthfirst");
  const elements = useMemo(() => { try { return mermaidToCytoElements(code); } catch (e) { return null; } }, [code]);

  useEffect(() => {
    if (!elements || typeof window === "undefined" || typeof window.cytoscape !== "function" || !ref.current) { setFailed(true); return; }
    let cy;
    try {
      cy = window.cytoscape({ container: ref.current, elements, style: CY_STYLE, layout: cyLayoutOpts("breadthfirst"), wheelSensitivity: 0.2, minZoom: 0.2, maxZoom: 3 });
    } catch (e) { setFailed(true); return; }
    cyRef.current = cy;
    cy.on("mouseover", "node", (e) => { const n = e.target; n.addClass("hl"); n.connectedEdges().addClass("hl").connectedNodes().addClass("hl"); });
    cy.on("mouseout", "node", () => cy.elements().removeClass("hl"));
    return () => { try { cy.destroy(); } catch (_) {} cyRef.current = null; };
  }, [elements]);

  useEffect(() => { if (cyRef.current) cyRef.current.layout(cyLayoutOpts(layout)).run(); }, [layout]);

  if (failed || !elements) return <MermaidBlock code={code} />;
  const btn = (l) => ({ fontFamily: "ui-monospace,monospace", fontSize: 11, color: layout === l ? "#dce4f0" : "#8b98ac", background: layout === l ? "rgba(143,179,255,0.16)" : "transparent", border: "1px solid " + (layout === l ? "#8fb3ff" : "#2a3542"), borderRadius: 6, padding: "3px 9px", cursor: "pointer" });
  return (
    <div className="mermaid-block">
      <div className="code-head">
        <span className="code-dots">
          <span style={{ background: "#ff5f57" }} />
          <span style={{ background: "#febc2e" }} />
          <span style={{ background: "#28c840" }} />
        </span>
        <span className="code-lang">graph · interaktif</span>
        <span className="lang-spacer" />
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          {["breadthfirst", "cose", "concentric"].map((l) => (
            <button key={l} style={btn(l)} onClick={() => setLayout(l)}>{l}</button>
          ))}
          <button style={btn("_fit")} onClick={() => cyRef.current && cyRef.current.animate({ fit: { padding: 22 } }, { duration: 250 })}>fit</button>
          {onStatic ? <button style={btn("_st")} onClick={onStatic} title="Kembali ke diagram statis (fidelitas penuh)">← statis</button> : null}
        </div>
      </div>
      <div ref={ref} style={{ height: 360, width: "100%", background: "radial-gradient(circle at 50% 40%, #0f1620, #0d1117)", borderRadius: "0 0 8px 8px" }} />
    </div>
  );
}

// Wrapper yang dipakai chat untuk setiap blok ```mermaid. DEFAULT = mermaid.js asli
// (fidelitas penuh: semua jenis diagram, bentuk, subgraph, warna). Kalau diagram itu
// flowchart yang bisa dikonversi ke graph, tampilkan tombol "interaktif" -> Cytoscape.
// Jadi kekayaan mermaid tak pernah dikorbankan; interaktivitas bersifat opt-in.
function DiagramBlock({ code }) {
  const [interactive, setInteractive] = useState(false);
  const canInteractive = useMemo(() => {
    if (typeof window === "undefined" || typeof window.cytoscape !== "function") return false;
    try { const els = mermaidToCytoElements(code); return !!(els && els.some((e) => !e.data.source && !e.data.isParent)); }
    catch (e) { return false; }
  }, [code]);
  if (interactive && canInteractive) return <CytoscapeBlock code={code} onStatic={() => setInteractive(false)} />;
  return <MermaidBlock code={code} onInteractive={canInteractive ? () => setInteractive(true) : null} />;
}

// Renderer utama: mermaid.js ASLI (window.mermaid, di-vendor di index.html). Paham
// <br/>, subgraph, bentuk node, dan layout dagre yang rapih. Kalau mermaid gagal /
// belum termuat, jatuh ke MermaidBlockFallback (parser SVG custom) supaya tak pernah
// menampilkan kode mentah.
function MermaidBlock({ code, onInteractive }) {
  const ref = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const m = typeof window !== "undefined" ? window.mermaid : null;
    if (!m || !m.render) { setFailed(true); return; }
    let cancelled = false;
    try {
      if (!window.__mermaidInit) {
        m.initialize({
          startOnLoad: false, securityLevel: "loose", theme: "base",
          themeVariables: {
            background: "#0d1117", primaryColor: "#1c2634", primaryBorderColor: "#c8d3e0",
            primaryTextColor: "#eaf0f7", lineColor: "#8fb3ff", secondaryColor: "#161b22",
            tertiaryColor: "#0d1117", clusterBkg: "#12161d", clusterBorder: "#2b3546",
            edgeLabelBackground: "#0d1117", fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", fontSize: "15px",
          },
          flowchart: { curve: "basis", htmlLabels: true, nodeSpacing: 46, rankSpacing: 54, padding: 10, useMaxWidth: true },
        });
        window.__mermaidInit = true;
      }
      const id = "mmd-" + Math.random().toString(36).slice(2, 9);
      Promise.resolve(m.render(id, code)).then(({ svg }) => {
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      }).catch(() => { if (!cancelled) setFailed(true); });
    } catch (e) { setFailed(true); }
    return () => { cancelled = true; };
  }, [code]);

  if (failed) return <MermaidBlockFallback code={code} />;
  return (
    <div className="mermaid-block">
      <div className="code-head">
        <span className="code-dots">
          <span style={{ background: "#ff5f57" }} />
          <span style={{ background: "#febc2e" }} />
          <span style={{ background: "#28c840" }} />
        </span>
        <span className="code-lang">mermaid</span>
        <span className="lang-spacer" />
        {onInteractive ? (
          <button
            onClick={onInteractive}
            title="Buka sebagai graph interaktif (drag / zoom / layout)"
            style={{ marginLeft: "auto", fontFamily: "ui-monospace,monospace", fontSize: 11, color: "#8fb3ff", background: "rgba(143,179,255,0.12)", border: "1px solid #8fb3ff", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}
          >
            ⇱ interaktif
          </button>
        ) : null}
      </div>
      <div className="mermaid-canvas" ref={ref} style={{ overflowX: "auto", padding: "12px 14px 16px", display: "flex", justifyContent: "center" }} />
    </div>
  );
}

function MermaidBlockFallback({ code }) {
  const diagram = useMemo(() => parseMermaidFlowchart(code), [code]);
  if (!diagram) {
    return (
      <pre
        className="code-fallback"
        style={{
          margin: 0,
          padding: "10px 14px",
          overflow: "auto",
          color: "#cbd5e1",
          background: "#0d1117",
          font: "13px/1.6 ui-monospace,Consolas,monospace",
          whiteSpace: "pre",
        }}
      >
        {code}
      </pre>
    );
  }

  const { nodes, edges, positioned, width, height, fontSize, padX, padY } =
    diagram;

  const edgePath = (from, to) => {
    const a = positioned.get(from);
    const b = positioned.get(to);
    if (!a || !b) return "";
    const x1 = a.x + a.w / 2;
    const y1 = a.y + a.h;
    const x2 = b.x + b.w / 2;
    const y2 = b.y;
    const midY = y1 + Math.max(20, (y2 - y1) * 0.42);
    return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
  };

  return (
    <div className="mermaid-block">
      <div className="code-head">
        <span className="code-dots">
          <span style={{ background: "#ff5f57" }} />
          <span style={{ background: "#febc2e" }} />
          <span style={{ background: "#28c840" }} />
        </span>
        <span className="code-lang">mermaid</span>
        <span className="lang-spacer" />
      </div>
      <div
        className="mermaid-canvas"
        style={{ overflowX: "auto", padding: "10px 12px 14px" }}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Mermaid flowchart"
        >
          <defs>
            <marker
              id="mermaid-arrow"
              markerWidth="10"
              markerHeight="10"
              refX="8"
              refY="5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#8fb3ff" />
            </marker>
          </defs>
          <rect
            x="0"
            y="0"
            width={width}
            height={height}
            rx="14"
            fill="#0d1117"
          />
          {edges.map((e, idx) => {
            const a = positioned.get(e.from);
            const b = positioned.get(e.to);
            if (!a || !b) return null;
            const path = edgePath(e.from, e.to);
            const midX = (a.x + a.w / 2 + b.x + b.w / 2) / 2;
            const midY = (a.y + a.h + b.y) / 2 - 8;
            return (
              <g key={idx}>
                <path
                  d={path}
                  fill="none"
                  stroke="#8fb3ff"
                  strokeWidth="1.8"
                  markerEnd="url(#mermaid-arrow)"
                  opacity="0.95"
                />
                {e.label ? (
                  <text
                    x={midX}
                    y={midY}
                    textAnchor="middle"
                    fontSize="11"
                    fill="#9fb7d9"
                    style={{
                      paintOrder: "stroke",
                      stroke: "#0d1117",
                      strokeWidth: 3,
                    }}
                  >
                    {e.label}
                  </text>
                ) : null}
              </g>
            );
          })}
          {Array.from(nodes.values()).map((node) => {
            const p = positioned.get(node.id);
            if (!p) return null;
            const cx = p.x + p.w / 2;
            const cy = p.y + p.h / 2;
            const label = node.label || node.id;
            const commonStroke =
              node.shape === "diamond" ? "#93c5fd" : "#5eead4";
            return (
              <g key={node.id}>
                {node.shape === "diamond" ? (
                  <polygon
                    points={`${cx},${p.y} ${p.x + p.w},${cy} ${cx},${p.y + p.h} ${p.x},${cy}`}
                    fill="#111827"
                    stroke={commonStroke}
                    strokeWidth="2"
                  />
                ) : node.shape === "circle" ? (
                  <ellipse
                    cx={cx}
                    cy={cy}
                    rx={Math.max(48, p.w / 2)}
                    ry={p.h / 2}
                    fill="#111827"
                    stroke={commonStroke}
                    strokeWidth="2"
                  />
                ) : node.shape === "subroutine" ? (
                  <>
                    <rect
                      x={p.x}
                      y={p.y}
                      width={p.w}
                      height={p.h}
                      rx="14"
                      fill="#111827"
                      stroke={commonStroke}
                      strokeWidth="2"
                    />
                    <line
                      x1={p.x + 10}
                      y1={p.y}
                      x2={p.x + 10}
                      y2={p.y + p.h}
                      stroke={commonStroke}
                      strokeWidth="1.4"
                    />
                    <line
                      x1={p.x + p.w - 10}
                      y1={p.y}
                      x2={p.x + p.w - 10}
                      y2={p.y + p.h}
                      stroke={commonStroke}
                      strokeWidth="1.4"
                    />
                  </>
                ) : (
                  <rect
                    x={p.x}
                    y={p.y}
                    width={p.w}
                    height={p.h}
                    rx="14"
                    fill="#111827"
                    stroke={commonStroke}
                    strokeWidth="2"
                  />
                )}
                <text
                  x={cx}
                  y={cy + 5}
                  textAnchor="middle"
                  fontSize={fontSize}
                  fill="#e5e7eb"
                  fontWeight="600"
                >
                  {label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ----------------------------- Message ----------------------------- */
function Blocks({ text }) {
  const blocks = parseBlocks(text);
  if (!blocks.length)
    return (
      <div className="typing">
        <span />
        <span />
        <span />
      </div>
    );
  return blocks.map((b, i) =>
    b.type === "code" ? (
      b.lang && /^(mermaid|mmd)$/i.test(b.lang) ? (
        <MermaidBlock key={i} code={b.code} />
      ) : (
        <CodeBlock
          key={i}
          lang={b.lang}
          code={b.code}
        />
      )
    ) : b.type === "think" ? null : (
      <p key={i} dangerouslySetInnerHTML={{ __html: b.html }} />
    ),
  );
}
function Verdict({ run }) {
  if (!run) return null;
  const q = run.quality;
  const tier = !q
    ? ""
    : q.score >= 85
      ? "q-hi"
      : q.score >= 60
        ? "q-mid"
        : "q-lo";
  return (
    <div className="verdict-wrap">
      {q && (
        <div className={"quality " + tier}>
          <span className="q-score">kualitas {q.score}/100</span>
          {q.hasTest ? <span className="q-tag"> ada self-test</span> : null}
          {q.notes && q.notes.length > 0 && (
            <ul className="q-notes">
              {q.notes.map((n, i) => (
                <li key={i} className={"q-" + n.sev}>
                  {n.msg}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
function Message({ msg }) {
  if (msg.role === "user")
    return (
      <div className="msg user">
        <span className="msg-role">You</span>
        <div className="bubble-user">{msg.text}</div>
      </div>
    );
  if (msg.role === "agent")
    return (
      <div className="msg model">
        <span className="msg-role">Agent</span>
        <AgentSteps run={msg.agent || {}} />
      </div>
    );
  return (
    <div className="msg model">
      <span className="msg-role">WOLFSPACE</span>
      <div className="bubble-model">
        {msg.text ? (
          <Blocks text={msg.text} />
        ) : (
          <div className="typing">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
      <Verdict run={msg.run} />
    </div>
  );
}

/* ----------------------------- Composer ----------------------------- */
// Line icons for the composer "+" menu (match the reference design).
const svg = (p) => (
  <svg
    viewBox="0 0 24 24"
    width="19"
    height="19"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.7"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {p}
  </svg>
);
const MI = {
  plus: svg(
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>,
  ),
  upload: svg(
    <>
      <path d="M12 15V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
    </>,
  ),
  research: svg(
    <>
      <path d="M22 10L12 5 2 10l10 5 10-5z" />
      <path d="M6 12v4c0 1.1 2.7 3 6 3s6-1.9 6-3v-4" />
    </>,
  ),
  image: svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 16l-5-5L5 20" />
    </>,
  ),
  video: svg(
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M10 9l5 3-5 3V9z" />
    </>,
  ),
  slides: svg(
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M12 16v4" />
      <path d="M8 20h8" />
    </>,
  ),
  more: svg(
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>,
  ),
};

function LightboxModal({ item, onClose }) {
  if (!item) return null;
  const isImg = /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(item.name || item.path || "") || (item.type && item.type.startsWith("image/")) || (item.url && /\.(png|jpe?g|webp|gif|svg|bmp|ico)(?:\?.*)?$/i.test(item.url)) || (!item.snippet && !/\.(mp4|webm|mov|mkv)$/i.test(item.name || item.path || ""));
  const isVid = /\.(mp4|webm|mov|mkv)$/i.test(item.name || item.path || "") || (item.type && item.type.startsWith("video/"));
  const displayUrl = item.previewUrl || item.url;

  return (
    <div
      className="attachment-modal-overlay"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.85)",
        zIndex: 999999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        backdropFilter: "blur(6px)",
        animation: "fadeIn 0.2s ease"
      }}
    >
      <div
        className="attachment-modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          maxWidth: "92vw",
          maxHeight: "92vh",
          background: "var(--surface-2, #161b22)",
          border: "1px solid var(--line-strong, #30363d)",
          borderRadius: "12px",
          boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "12px 16px",
            borderBottom: "1px solid var(--line-strong, #30363d)",
            background: "var(--surface-3, #21262d)"
          }}
        >
          <span style={{ fontWeight: 600, color: "var(--text, #e5e5e5)", fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
            📄 {item.name || item.path || "Preview"}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted, #858585)",
              fontSize: "22px",
              cursor: "pointer",
              padding: "0 6px",
              lineHeight: 1
            }}
            title="Tutup"
          >
            ×
          </button>
        </div>
        <div style={{ padding: "16px", overflow: "auto", display: "flex", alignItems: "center", justifyContent: "center", maxHeight: "calc(92vh - 55px)", minWidth: "300px", minHeight: "200px" }}>
          {isImg && displayUrl ? (
            <img
              src={displayUrl}
              alt={item.name || item.path}
              style={{ maxWidth: "100%", maxHeight: "calc(85vh - 80px)", objectFit: "contain", borderRadius: "6px" }}
            />
          ) : isVid && displayUrl ? (
            <video
              src={displayUrl}
              controls
              autoPlay
              style={{ maxWidth: "100%", maxHeight: "calc(85vh - 80px)", borderRadius: "6px" }}
            />
          ) : item.snippet ? (
            <pre style={{ margin: 0, fontFamily: '"JetBrains Mono", Consolas, Courier New, monospace', fontSize: "13px", color: "#4ec9b0", whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#0d1117", padding: "16px", borderRadius: "8px", width: "100%", maxHeight: "calc(82vh - 80px)", overflow: "auto" }}>
              {item.snippet}
            </pre>
          ) : (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted, #858585)" }}>
              <div style={{ fontSize: "56px", marginBottom: "16px" }}>📄</div>
              <div style={{ fontSize: "15px", color: "var(--text, #e5e5e5)" }}>{item.name || item.path}</div>
              {item.size && <div style={{ fontSize: "12px", marginTop: "8px" }}>({Math.round(item.size / 1024)} KB)</div>}
              {displayUrl && (
                <div style={{ marginTop: "16px" }}>
                  <a href={displayUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand, #61afef)", textDecoration: "underline" }}>
                    Buka / Unduh File
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Composer({ onSend, onCancel, busy, onAgentCli, models = [], modelVal, setModelVal }) {
  const [val, setVal] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [previewAttachment, setPreviewAttachment] = useState(null);
  const [menu, setMenu] = useState(false);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showMcpMenu, setShowMcpMenu] = useState(false);
  const [mcpServers, setMcpServers] = useState([
    { id: 'github', name: 'GitHub & Git Tools', desc: 'Access repositories, issues, pull requests, and code diffs', active: true },
    { id: 'filesystem', name: 'Local Filesystem & Ripgrep', desc: 'Direct workspace editing, directory analysis, and fast pattern search', active: true },
    { id: 'browser', name: 'Browser Subagent (Puppeteer)', desc: 'Web scraping, DOM inspection, screenshot capture, and UI testing', active: false }
  ]);
  const [effort, setEffort] = useState(() => {
    try {
      const cl = getCloud();
      if (cl && typeof cl.effort !== "undefined") return Number(cl.effort);
      return parseInt(localStorage.getItem("quantum_effort") || "1", 10) || 0;
    } catch { return 1; }
  });
  useEffect(() => {
    try {
      localStorage.setItem("quantum_effort", String(effort));
      const cl = getCloud();
      if (cl) {
        cl.effort = effort;
        setCloudLS(cl);
      }
    } catch (_) {}
  }, [effort]);
  const [switchFlagged, setSwitchFlagged] = useState(false);
  const [soon, setSoon] = useState("");
  const ref = useRef(null);
  const wrapRef = useRef(null);
  
  useEffect(() => {
    if (!menu) {
      setShowModelMenu(false);
      setShowMcpMenu(false);
    }
  }, [menu]);
  
  const grow = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  };

  console.log("[Composer] render, busy:", busy, "val:", val);

  const handleAttachmentSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const target = e.target;
    for (const file of files) {
      const relPath = file.webkitRelativePath || file.name;
      const attId = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      const isImg = /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(file.name) || (file.type && file.type.startsWith("image/"));
      const isVid = /\.(mp4|webm|mov|mkv)$/i.test(file.name) || (file.type && file.type.startsWith("video/"));
      let previewUrl = (isImg || isVid) ? URL.createObjectURL(file) : null;
      let snippet = null;
      if (!isImg && !isVid && file.size < 100 * 1024 && /\.(js|py|jsx|ts|tsx|html|css|json|md|txt|sql|java|c|cpp|h|rust|go|sh|yml|yaml)$/i.test(file.name)) {
        try {
          snippet = await file.slice(0, 300).text();
        } catch (_) {}
      }
      setAttachments((prev) => [
        ...prev,
        { id: attId, name: file.name, path: relPath, size: file.size, type: file.type, previewUrl, snippet, status: "uploading" },
      ]);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = reader.result.split(',')[1] || reader.result;
            const payload = { name: relPath, data: base64 };
            let uploadedUrl = "";
            if (IPC && IPC.invoke) {
              const res = await IPC.invoke("api", { method: "POST", path: "/upload", body: payload });
              let parsed;
              try { parsed = typeof res.body === 'string' ? JSON.parse(res.body) : res; } catch (_) { parsed = res; }
              if (res.status >= 400 || parsed.error) throw new Error(parsed.error || "Upload failed");
              uploadedUrl = parsed.url || ("/uploads/" + parsed.name);
            } else {
              const r = await fetch("/upload", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              const res = await r.json();
              if (res.error) throw new Error(res.error);
              uploadedUrl = res.url || ("/uploads/" + res.name);
            }
            setAttachments((prev) =>
              prev.map((a) => (a.id === attId ? { ...a, status: "ready", url: uploadedUrl, previewUrl: a.previewUrl || (isImg ? uploadedUrl : null) } : a))
            );
          } catch (err) {
            console.error("[Attachment upload error]", err);
            setAttachments((prev) =>
              prev.map((a) => (a.id === attId ? { ...a, status: "error", error: err.message } : a))
            );
          }
        };
        reader.onerror = () => {
          setAttachments((prev) =>
            prev.map((a) => (a.id === attId ? { ...a, status: "error", error: "Failed reading file" } : a))
          );
        };
        reader.readAsDataURL(file);
      } catch (err) {
        setAttachments((prev) =>
          prev.map((a) => (a.id === attId ? { ...a, status: "error", error: err.message } : a))
        );
      }
    }
    target.value = "";
  };

  const submit = () => {
    const v = val.trim();
    console.log("[Composer submit] busy:", busy, "v:", v, "attachments:", attachments.length);
    if ((!v && attachments.length === 0) || busy) return;
    let fullText = v;
    if (attachments.length > 0) {
      const attSummary = attachments
        .map((a) => `- [Attached]: ${a.path} (${Math.round(a.size / 1024)} KB${a.url ? `, url: ${a.url}` : ""})`)
        .join("\n");
      fullText = v ? `${v}\n\nAttachments:\n${attSummary}` : `Attachments:\n${attSummary}`;
    }
    console.log("[Composer submit] calling onSend with:", fullText);
    onSend(fullText);
    console.log("[Composer submit] setting val to empty string and resetting attachments");
    setVal("");
    setAttachments([]);
    requestAnimationFrame(() => {
      if (ref.current) ref.current.style.height = "auto";
    });
  };

  // Debug val changes
  useEffect(() => {
    console.log("[Composer] val changed to:", val);
  }, [val]);
  useEffect(() => {
    const h = (e) => {
      const next = String(e.detail || "");
      setVal(next);
      requestAnimationFrame(() => {
        grow();
        ref.current?.focus();
      });
    };
    window.addEventListener("WOLFSPACE:set-composer", h);
    return () => window.removeEventListener("WOLFSPACE:set-composer", h);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const h = (e) => {
      // Keep menu open when clicking sidebar controls (e.g. Visual Picker button)
      // or when the visual picker overlay is active, so the user can select
      // elements inside the + menu with the picker.
      const inSidebar = e.target.closest && e.target.closest('.sidebar');
      if (inSidebar) return;
      if (document.body.classList.contains('vp-on')) return;
      if (wrapRef.current && !wrapRef.current.contains(e.target))
        setMenu(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menu]);
  const notYet = (name) => {
    setMenu(false);
    setSoon(name + " segera hadir.");
    setTimeout(() => setSoon(""), 2600);
  };
  return (
    <div className="composer-wrap">
      <div className="composer" style={{ flexDirection: "column", gap: "14px", padding: "16px 16px 12px 18px", alignItems: "stretch" }}>
        <input
          type="file"
          id="file-upload-input"
          multiple
          style={{ display: "none" }}
          onChange={handleAttachmentSelect}
        />
        <input
          type="file"
          id="folder-upload-input"
          webkitdirectory="true"
          directory="true"
          multiple
          style={{ display: "none" }}
          onChange={handleAttachmentSelect}
        />
        <div className="composer-input-col">
          {attachments.length > 0 && (
            <div className="composer-attachments">
              {attachments.map((att) => {
                const isImg = /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(att.name || att.path) || (att.type && att.type.startsWith("image/"));
                const isVid = /\.(mp4|webm|mov|mkv)$/i.test(att.name || att.path) || (att.type && att.type.startsWith("video/"));
                const isCode = att.snippet || /\.(js|py|jsx|ts|tsx|html|css|json|md|txt|sql|java|c|cpp|h|rust|go|sh|yml|yaml)$/i.test(att.name || att.path);
                const displayUrl = att.previewUrl || att.url;

                return (
                  <div
                    key={att.id}
                    className="composer-attachment-item"
                    title={att.path + " (Klik untuk melihat)"}
                    onClick={() => {
                      if (att.previewUrl || att.url || att.snippet) {
                        setPreviewAttachment(att);
                      }
                    }}
                    style={{
                      width: "60px",
                      height: "60px",
                      padding: (isImg && displayUrl) ? "0" : "6px",
                      overflow: "hidden",
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      alignItems: "center",
                      background: "var(--surface-2, #161b22)",
                      border: "1px solid var(--line-strong, #30363d)",
                      borderRadius: "8px",
                      cursor: (att.previewUrl || att.url || att.snippet) ? "pointer" : "default"
                    }}
                  >
                    {isImg && displayUrl ? (
                      <img
                        src={displayUrl}
                        alt={att.name || att.path}
                        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }}
                      />
                    ) : isVid && displayUrl ? (
                      <video
                        src={displayUrl}
                        style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "8px" }}
                        muted
                      />
                    ) : att.snippet ? (
                      <div style={{ width: "100%", height: "100%", padding: "4px", fontSize: "6.5px", fontFamily: "monospace", color: "#4ec9b0", overflow: "hidden", lineHeight: "1.25", wordBreak: "break-all", background: "#0d1117", borderRadius: "6px", textAlign: "left" }}>
                        {att.snippet}
                      </div>
                    ) : (
                      <>
                        <div className="composer-attachment-icon">
                          {att.status === "uploading" ? "⏳" : att.status === "error" ? "⚠️" : isCode ? "💻" : "📄"}
                        </div>
                        <div className="composer-attachment-name" style={{ fontSize: "9px", width: "100%", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {att.name || att.path}
                        </div>
                      </>
                    )}

                    {att.status === "uploading" && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", fontSize: "14px" }}>
                        ⏳
                      </div>
                    )}
                    {att.status === "error" && (
                      <div style={{ position: "absolute", inset: 0, background: "rgba(248,113,113,0.3)", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "8px", fontSize: "14px" }} title={att.error}>
                        ⚠️
                      </div>
                    )}

                    <button
                      type="button"
                      className="composer-attachment-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAttachments((p) => p.filter((x) => x.id !== att.id));
                      }}
                      title={att.status === "error" ? att.error : "Remove"}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <textarea
            ref={ref}
            rows={1}
            value={val}
            placeholder={
              busy
                ? "Lanjutkan percakapan..."
                : val.includes("/")
                  ? "Terus ketik perintah..."
                  : "Apa yang ingin kamu buat hari ini?"
            }
            onChange={(e) => {
              console.log("[Textarea] value changed:", e.target.value);
              setVal(e.target.value);
              grow();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                console.log("[Textarea] Enter pressed, calling submit");
                submit();
              }
              if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                setVal("");
                requestAnimationFrame(() => {
                  if (ref.current) ref.current.style.height = "auto";
                });
              }
              if (e.key === "/" && val === "") {
                console.log("[Textarea] / pressed, trigger command mode");
              }
            }}
            onFocus={() => console.log("[Textarea] focused")}
            onBlur={() => console.log("[Textarea] blurred")}
          />
        </div>
        <div className="picker-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="composer-add-wrap" ref={wrapRef}>
            <div className="composer-action-btns">
              <button
                className={"composer-add" + (menu ? " open" : "")}
                title="Tambah"
                onClick={() => { setMenu((m) => !m); setShowModelMenu(false); setShowMcpMenu(false); }}
              >
                {MI.plus}
              </button>
            </div>
            {menu && (
              <div className="am-menu" onMouseDown={(e) => e.stopPropagation()}>
                <input type="text" className="am-search" placeholder="Filter actions..." autoFocus />
                
                <div className="am-section-label">Context</div>
                <button className="am-item" onClick={() => { setMenu(false); document.getElementById("file-upload-input")?.click(); }}>
                  <span>Attach file...</span>
                </button>

                <div className="am-section-label" style={{ marginTop: '8px' }}>Model</div>
                <div style={{ position: 'relative' }}>
                  <button 
                    className={"am-item" + (showModelMenu ? " active" : "")} 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMcpMenu(false);
                      setShowModelMenu(!showModelMenu);
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Switch model...
                    </span>
                    <span className="am-item-right">{models.find(m => m.value === modelVal)?.label || "Sonnet"}</span>
                  </button>
                  {showModelMenu && (
                    <div className="am-submenu">
                      <div className="am-section-label" style={{ marginBottom: '4px' }}>Select a model</div>
                      {models.map(m => (
                        <button 
                          key={m.value}
                          className="am-item" 
                          style={{ padding: '8px 12px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (setModelVal) setModelVal(m.value);
                            setShowModelMenu(false);
                            // Keep main + menu open so user can continue configuring other options
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                            <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                              {m.label} 
                              {m.value === modelVal && <span>✓</span>}
                            </span>
                            <span className="am-item-desc">Efficient for routine tasks</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button className="am-item" onClick={(e) => { e.stopPropagation(); setEffort((effort + 1) % 3); }}>
                  <span>Effort ({effort === 0 ? "Low" : effort === 1 ? "Medium" : "High"})</span>
                  <span className="am-item-right">
                    <div className="am-slider">
                      <div className={"am-slider-dot" + (effort >= 0 ? " active" : "")}></div>
                      <div className={"am-slider-dot" + (effort >= 1 ? " active" : "")}></div>
                      <div className={"am-slider-dot" + (effort >= 2 ? " active" : "")}></div>
                    </div>
                  </span>
                </button>

                <div className="am-section-label" style={{ marginTop: '8px' }}>Connection</div>
                <div style={{ position: 'relative' }}>
                  <button 
                    className={"am-item" + (showMcpMenu ? " active" : "")} 
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowModelMenu(false);
                      setShowMcpMenu(!showMcpMenu);
                    }}
                  >
                    <span>MCP</span>
                    <span className="am-item-right">
                      <span>Manage servers</span>
                      <span style={{ fontSize: '10px' }}>▶</span>
                    </span>
                  </button>
                  {showMcpMenu && (
                    <div className="am-submenu">
                      <div className="am-section-label" style={{ marginBottom: '4px' }}>Select an MCP connection</div>
                      {mcpServers.map(srv => (
                        <button 
                          key={srv.id}
                          className="am-item" 
                          style={{ padding: '8px 12px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMcpServers(prev => prev.map(item => item.id === srv.id ? { ...item, active: !item.active } : item));
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: 500, color: '#fff' }}>{srv.name}</span>
                              {srv.active ? (
                                <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 6px', borderRadius: '10px', color: '#4ec9b0', background: 'rgba(78, 201, 176, 0.12)' }}>✓ Connected</span>
                              ) : (
                                <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 6px', borderRadius: '10px', color: '#858585', background: 'rgba(133, 133, 133, 0.12)' }}>○ Disabled</span>
                              )}
                            </span>
                            <span className="am-item-desc">{srv.desc}</span>
                          </div>
                        </button>
                      ))}
                      <div style={{ padding: '8px 12px', borderTop: '1px solid #3e3e42', marginTop: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#b594f5', cursor: 'pointer', fontWeight: 500 }} onClick={(e) => { e.stopPropagation(); notYet("Add custom MCP server"); }}>+ Add custom MCP server (JSON)...</span>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
          <button
            className={"send-btn" + (busy ? " cancel" : "")}
            onClick={busy ? onCancel : submit}
            disabled={!busy && !val.trim() && attachments.length === 0}
            onClickCapture={(e) => {
              console.log(
                "[Send button] clicked, busy:",
                busy,
                "disabled:",
                !busy && !val.trim() && attachments.length === 0,
              );
            }}
            style={{ height: "34px", width: "44px", borderRadius: "10px", padding: 0, justifyContent: "center" }}
          >
            {busy ? (
              <Icon.square />
            ) : (
              <Icon.send />
            )}
          </button>
        </div>
      </div>
      <div className="composer-hint">
        {soon ? (
          <b style={{ color: "var(--brand)" }}>{soon}</b>
        ) : (
          <>
            <span>Tekan <kbd>Shift+Enter</kbd> untuk baris baru</span>
            <span>•</span>
            <span>Tekan <kbd>Ctrl+K</kbd> untuk bersihkan</span>
            <span>•</span>
            <span>Ketik <kbd>/</kbd> untuk perintah</span>
          </>
        )}
      </div>
      <LightboxModal item={previewAttachment} onClose={() => setPreviewAttachment(null)} />
    </div>
  );
}

/* ----------------------------- Visual Picker ----------------------------- */
// Module-level guard: only ONE picker can ever be active, so re-clicking the
// sidebar item toggles it off instead of stacking capture-listeners that would
// keep swallowing clicks (the "chat jadi tak bisa diklik" bug).
let VP_STOP = null;
// getFrameDoc (opsional): fungsi yang mengembalikan contentDocument iframe preview
// (Web Dev Live Browser) bila sedang terbuka & same-origin. Tanpa ini, picker HANYA
// memantau document WOLFSPACE sendiri — hover di atas iframe cuma "mengenali" elemen
// <iframe>-nya, bukan apa pun di DALAM halaman yang di-render.
function useVisualPicker(getFrameDoc) {
  return useCallback(() => {
    if (VP_STOP) {
      VP_STOP();
      return;
    } // already active ? toggle off
    const docs = [document];
    try {
      const frameDoc = getFrameDoc && getFrameDoc();
      // .defaultView null bila dokumen cross-origin (akses ditolak browser sebelum
      // sampai sini pun sudah throw) — cek ini jaga-jaga untuk dokumen "mati"/lepas.
      if (frameDoc && frameDoc.defaultView) docs.push(frameDoc);
    } catch (_) {
      // Cross-origin (preview arah ke URL eksternal, bukan file lokal same-origin):
      // picker tetap jalan di WOLFSPACE saja, tanpa melempar error ke pengguna.
    }
    let hover = null;
    const cleanHovers = () =>
      docs.forEach((d) =>
        d.querySelectorAll(".vp-hover").forEach((el) => el.classList.remove("vp-hover")),
      );
    const move = (e) => {
      const el = e.target;
      if (hover && hover !== el) hover.classList.remove("vp-hover");
      hover = el;
      el.classList.add("vp-hover");
    };
    // real classes only (drop the picker's own vp-* runtime classes)
    const realCls = (el) =>
      typeof el.className === "string"
        ? el.className
            .trim()
            .split(/\s+/)
            .filter((c) => c && !/^vp-/.test(c))
        : [];
    const seg = (el) => {
      if (el.id) return "#" + el.id;
      let s = el.tagName.toLowerCase();
      const cls = realCls(el);
      if (cls.length) s += "." + cls.join(".");
      const p = el.parentElement; // disambiguate same-tag siblings
      if (p) {
        const same = Array.from(p.children).filter(
          (c) => c.tagName === el.tagName,
        );
        if (same.length > 1)
          s += ":nth-of-type(" + (same.indexOf(el) + 1) + ")";
      }
      return s;
    };
    // Build a selector that actually identifies the element: if it has no id/class,
    // walk up to the nearest classed/ided ancestor so "p" becomes ".composer-hint > p".
    const sel = (el) => {
      const parts = [];
      let cur = el,
        depth = 0;
      while (cur && cur.nodeType === 1 && depth < 6) {
        parts.unshift(seg(cur));
        if (cur.id || realCls(cur).length) break; // anchored ? enough to be unique
        cur = cur.parentElement;
        depth++;
      }
      return parts.join(" > ");
    };
    const click = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.target,
        selector = sel(el);
      
      let d = "";
      
      // Tambahkan struktur DOM agar agent lebih mudah mencari di source code
      let htmlSnippet = el.outerHTML || "";
      if (htmlSnippet) {
        // Potong htmlSnippet jika terlalu panjang, tapi tetap pertahankan strukturnya
        if (htmlSnippet.length > 300) {
          htmlSnippet = htmlSnippet.slice(0, 300) + "...";
        }
        d = "Struktur DOM:\n```html\n" + htmlSnippet + "\n```";
      }

      try {
        // writeText() mengembalikan Promise — try/catch TAK menangkap penolakan async
        // (mis. "Document is not focused"). .catch mencegahnya jadi unhandledrejection
        // yang dulu memicu auto-rollback (app reload sendiri saat proses jalan).
        navigator.clipboard && navigator.clipboard.writeText(d).catch(function () {});
      } catch (_) {}
      stop();
      // Gunakan alert yang rapi
      setTimeout(() => alert("Detail elemen berhasil disalin ke clipboard!\n\n" + selector), 0);
    };
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stop();
      }
    };
    // Halaman di dalam iframe punya <head> sendiri — tak kebagian styles.css
    // WOLFSPACE — jadi cursor crosshair & outline hover diinjeksi langsung ke situ
    // (nilai polos, bukan var() CSS, karena var itu tak terdefinisi di dokumen lain).
    const frameStyleEls = [];
    docs.forEach((d) => {
      if (d === document) return;
      try {
        const st = d.createElement("style");
        st.setAttribute("data-wf-vp", "1");
        st.textContent =
          ".vp-on, .vp-on * { cursor: crosshair !important; } .vp-hover { outline: 2px solid #8fb3ff !important; outline-offset: -2px; }";
        (d.head || d.documentElement).appendChild(st);
        frameStyleEls.push(st);
      } catch (_) {}
    });
    function stop() {
      VP_STOP = null;
      cleanHovers();
      docs.forEach((d) => {
        if (d.body) d.body.classList.remove("vp-on");
        d.removeEventListener("mouseover", move, true);
        d.removeEventListener("click", click, true);
        d.removeEventListener("keydown", key, true);
      });
      frameStyleEls.forEach((st) => { try { st.remove(); } catch (_) {} });
    }
    VP_STOP = stop;
    docs.forEach((d) => {
      if (d.body) d.body.classList.add("vp-on");
      d.addEventListener("mouseover", move, true);
      d.addEventListener("click", click, true);
      d.addEventListener("keydown", key, true);
    });
  }, [getFrameDoc]);
}

/* ----------------------------- Visual Draw ----------------------------- */
let VD_STOP = null;
function useVisualDraw() {
  return useCallback(() => {
    if (VD_STOP) {
      VD_STOP();
      return;
    }
    
    // Ubah kursor global menjadi crosshair untuk indikasi mode aktif
    document.body.classList.add("vp-on");
    
    const cWrap = document.createElement("div");
    cWrap.id = "vd-cwrap";
    Object.assign(cWrap.style, {
      position: "fixed",
      inset: "0",
      overflow: "hidden",
      background: "transparent",
      zIndex: "999999",
      pointerEvents: "none" // Biarkan event jatuh ke document agar bisa dicegat dengan useCapture
    });
    
    const activeSelections = document.createElement("div");
    Object.assign(activeSelections.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none"
    });
    cWrap.appendChild(activeSelections);
    
    document.body.appendChild(cWrap);
    
    const snap = (v) => Math.round(v/24)*24;
    
    const copyToClipboard = (domString, btnElement) => {
      const showSuccess = () => {
        const oldHTML = btnElement.innerHTML;
        const oldBg = btnElement.style.background;
        btnElement.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style="margin-right:4px; vertical-align:text-bottom"><polyline points="20 6 9 17 4 12"></polyline></svg> Berhasil Disalin!`;
        btnElement.style.background = 'var(--text-success, #2b8a3e)';
        setTimeout(() => { btnElement.innerHTML = oldHTML; btnElement.style.background = oldBg; }, 2000);
      };
      
      const fallbackCopy = (text) => {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try { document.execCommand('copy'); showSuccess(); } 
        catch (err) { alert("Salin manual:\\n\\n" + text); }
        textArea.remove();
      };
      
      if (navigator.clipboard) {
        navigator.clipboard.writeText(domString).then(showSuccess).catch(() => fallbackCopy(domString));
      } else {
        fallbackCopy(domString);
      }
    };
    
    const checkSidebarClick = (e) => {
      const btn = e.target.closest('.sb-item');
      if (btn && (btn.textContent.includes('Visual Picker') || btn.textContent.includes('Visual Draw'))) {
        return true;
      }
      return false;
    };
    
    // Cegah semua klik di aplikasi (kecuali sidebar & UI draw)
    const blockClick = (e) => {
      if (checkSidebarClick(e)) return;
      if (e.target.closest('.ui-panel')) return;
      e.preventDefault();
      e.stopPropagation();
    };
    
    const handleRightClick = (e) => {
      if (checkSidebarClick(e)) return;
      if (e.target.closest('.ui-panel')) return;
      
      e.preventDefault();
      e.stopPropagation();
      if (activeSelections.children.length > 0) {
        activeSelections.innerHTML = '';
      }
    };
    
    const cvsMD = (e) => {
      if (checkSidebarClick(e)) return;
      if (e.target.closest('.ui-panel')) return; 
      if (e.button !== 0) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const r = cWrap.getBoundingClientRect();
      const startX = e.clientX - r.left;
      const startY = e.clientY - r.top;
      
      const selBox = document.createElement('div');
      Object.assign(selBox.style, {
        position: 'absolute',
        border: '2px dashed var(--fill-accent, #339af0)',
        background: 'rgba(51, 154, 240, 0.15)',
        pointerEvents: 'none',
        zIndex: '9999',
        left: startX + 'px',
        top: startY + 'px',
        width: '0px',
        height: '0px',
        display: 'flex',
        flexDirection: 'column'
      });
      activeSelections.appendChild(selBox);
      
      const mm = ev => {
        ev.preventDefault();
        ev.stopPropagation();
        
        const currX = ev.clientX - r.left;
        const currY = ev.clientY - r.top;
        selBox.style.left = Math.min(startX, currX) + 'px';
        selBox.style.top = Math.min(startY, currY) + 'px';
        selBox.style.width = Math.abs(currX - startX) + 'px';
        selBox.style.height = Math.abs(currY - startY) + 'px';
      };
      
      const mu = ev => {
        ev.preventDefault();
        ev.stopPropagation();
        document.removeEventListener('mousemove', mm, true);
        document.removeEventListener('mouseup', mu, true);
        
        let currX = ev.clientX - r.left;
        let currY = ev.clientY - r.top;
        let w = Math.abs(currX - startX);
        let h = Math.abs(currY - startY);
        
        if (w < 10 && h < 10) {
          selBox.remove();
          return;
        }
        
        const finalX = snap(Math.min(startX, currX));
        const finalY = snap(Math.min(startY, currY));
        const finalW = Math.max(10, snap(w));
        const finalH = Math.max(10, snap(h));
        
        Object.assign(selBox.style, {
          left: finalX + 'px',
          top: finalY + 'px',
          width: finalW + 'px',
          height: finalH + 'px',
          pointerEvents: 'auto',
          border: '2px solid var(--fill-accent, #339af0)',
          boxShadow: '0 12px 32px rgba(51, 154, 240, 0.15)',
          overflow: 'visible'
        });
        
        // --- DOM Context Detection ---
        cWrap.style.pointerEvents = 'none';
        selBox.style.pointerEvents = 'none';
        const globalX = ev.clientX;
        const globalY = ev.clientY;
        const targetEl = document.elementFromPoint(globalX, globalY) || document.body;
        cWrap.style.pointerEvents = 'auto'; // (or back to whatever it was)
        selBox.style.pointerEvents = 'auto';
        
        // Generate selector (same logic as Picker)
        const realCls = (el) => typeof el.className === "string" ? el.className.trim().split(/\s+/).filter(c => c && !/^vp-/.test(c)) : [];
        const seg = (el) => {
          if (el.id) return "#" + el.id;
          let s = el.tagName.toLowerCase();
          const cls = realCls(el);
          if (cls.length) s += "." + cls.join(".");
          const p = el.parentElement;
          if (p) {
            const same = Array.from(p.children).filter(c => c.tagName === el.tagName);
            if (same.length > 1) s += ":nth-of-type(" + (same.indexOf(el) + 1) + ")";
          }
          return s;
        };
        const sel = (el) => {
          const parts = [];
          let cur = el, depth = 0;
          while (cur && cur.nodeType === 1 && depth < 6) {
            parts.unshift(seg(cur));
            if (cur.id || realCls(cur).length) break;
            cur = cur.parentElement;
            depth++;
          }
          return parts.join(" > ");
        };
        
        const targetSelector = sel(targetEl);
        const tr = targetEl.getBoundingClientRect();
        // Calculate relative coordinates
        const relX = Math.round((finalX + r.left) - tr.left);
        const relY = Math.round((finalY + r.top) - tr.top);
        
        const domString = `<div data-target="${targetSelector}" style="position: absolute; left: ${relX}px; top: ${relY}px; width: ${finalW}px; height: ${finalH}px;"></div>`;
        const escapedDom = domString.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        
        selBox.innerHTML = `
          <div style="position: absolute; top: 0; left: 0; background: var(--fill-accent, #339af0); color: white; font-size: 11px; font-weight: 600; padding: 4px 8px; border-bottom-right-radius: 4px; border-top-left-radius: 1px; display: inline-block; letter-spacing: 0.05em; pointer-events: none; white-space: nowrap; z-index: 2;">
            AREA KOSONG [X: ${finalX}, Y: ${finalY}]
          </div>
          <div class="ui-panel" style="position: absolute; top: calc(100% + 2px); left: -2px; width: max-content; max-width: 300px; padding: 12px; background: rgba(255, 255, 255, 0.98); border: 2px solid var(--fill-accent, #339af0); border-radius: 6px; box-shadow: 0 8px 24px rgba(0,0,0,0.15); display: flex; flex-direction: column; gap: 8px; z-index: 3;">
            <code style="display:block; padding:8px; background:var(--surface-2, #f1f3f5); border:1px solid var(--border, #e9ecef); border-radius:4px; font-size:11px; color:var(--text-secondary, #495057); word-break:break-all; font-family:monospace; white-space: normal;">${escapedDom}</code>
            <button class="vd-copy-btn" style="background: var(--text-primary, #212529); color: white; border: none; height: 34px; border-radius: 4px; font-weight: 500; font-size: 13px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#000'" onmouseout="this.style.background='var(--text-primary, #212529)'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style="margin-right:4px; vertical-align:text-bottom"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Salin Struktur DOM
            </button>
          </div>
        `;
        
        const btn = selBox.querySelector(".vd-copy-btn");
        btn.onclick = () => copyToClipboard(domString, btn);
      };
      
      document.addEventListener('mousemove', mm, true);
      document.addEventListener('mouseup', mu, true);
    };
    
    document.addEventListener("mousedown", cvsMD, true);
    document.addEventListener("click", blockClick, true);
    document.addEventListener("contextmenu", handleRightClick, true);
    
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stop();
      }
    };
    
    function stop() {
      VD_STOP = null;
      document.body.classList.remove("vp-on");
      cWrap.remove();
      document.removeEventListener("keydown", key, true);
      document.removeEventListener("mousedown", cvsMD, true);
      document.removeEventListener("click", blockClick, true);
      document.removeEventListener("contextmenu", handleRightClick, true);
    }
    
    VD_STOP = stop;
    document.addEventListener("keydown", key, true);
  }, []);
}

/* ----------------------------- Model Hub view (real HF) ----------------------------- */
const HUB_CATS = [
  { key: "all", label: "Semua", q: "gguf" },
  { key: "code", label: "Code", q: "coder gguf" },
  { key: "chat", label: "Chat", q: "instruct gguf" },
  { key: "small", label: "Kecil", q: "1b gguf" },
  { key: "qwen", label: "Qwen", q: "qwen gguf" },
  { key: "llama", label: "Llama", q: "llama gguf" },
];
function iconColorFor(s) {
  const c = ["blue", "purple", "green", "orange", "red"];
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return c[h % c.length];
}
function fmtN(n) {
  return n >= 1e6
    ? (n / 1e6).toFixed(1) + "M"
    : n >= 1e3
      ? (n / 1e3).toFixed(1) + "k"
      : "" + n;
}
function fmtDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "short",
    });
  } catch (e) {
    return "";
  }
}
// Map an Ollama model name ? its maker brand (real logo + brand color + monogram).
// Real SVGs live in /vendor/llm/<brand>.svg; if absent, the colored monogram shows.
const LLM_BRANDS = {
  meta: {
    c: "#0866FF",
    s: "8",
    re: /^(llama|codellama|llama-guard|tinyllama|meta)/,
  },
  qwen: { c: "#6E56CF", s: "Q", re: /^(qwen|qwq)/ },
  deepseek: { c: "#4D6BFE", s: "D", re: /^deepseek/ },
  google: { c: "#4285F4", s: "G", re: /^(gemma|codegemma|paligemma)/ },
  mistral: {
    c: "#FF7000",
    s: "M",
    re: /^(mistral|mixtral|codestral|mathstral|ministral|magistral|devstral)/,
  },
  microsoft: { c: "#00A4EF", s: "f", re: /^phi/ },
  openai: { c: "#10A37F", s: "O", re: /^gpt-oss/ },
  ibm: { c: "#0F62FE", s: "?", re: /^granite/ },
  cohere: { c: "#39594D", s: "C", re: /^command/ },
  huggingface: { c: "#FFB000", s: "??", re: /^(smollm|smol)/ },
  falcon: { c: "#1973E8", s: "F", re: /^falcon/ },
  vision: {
    c: "#14B8A6",
    s: "?",
    re: /^(llava|bakllava|moondream|minicpm|llama3.2-vision|llama-vision)/,
  },
  embed: {
    c: "#64748B",
    s: "�",
    re: /^(nomic|mxbai|snowflake|all-minilm|bge|paraphrase)/,
  },
  code: {
    c: "#22C55E",
    s: "</>",
    re: /^(starcoder|stable-code|codegeex|sqlcoder|wizardcoder)/,
  },
};
function ollamaBrand(name) {
  const n = (name || "").toLowerCase();
  for (const [k, v] of Object.entries(LLM_BRANDS))
    if (v.re.test(n)) return { key: k, ...v };
  return { key: "generic", c: "#7c8aa0", s: (n[0] || "?").toUpperCase() };
}
function LLMLogo({ name }) {
  const b = ollamaBrand(name);
  return (
    <>
      <img
        className="m-card-logo"
        src={"/vendor/llm/" + b.key + ".svg"}
        alt={b.key}
        loading="lazy"
        onError={(e) => {
          e.target.style.display = "none";
          e.target.nextSibling.style.display = "grid";
        }}
      />
      <span
        className="m-card-icon"
        style={{
          display: "none",
          background: b.c,
          color: "#fff",
          fontWeight: 700,
        }}
      >
        {b.s}
      </span>
    </>
  );
}
// Capability badge color
function capClass(c) {
  c = (c || "").toLowerCase();
  if (/vision/.test(c)) return "cap-vision";
  if (/tool/.test(c)) return "cap-tool";
  if (/think|reason/.test(c)) return "cap-think";
  if (/embed/.test(c)) return "cap-embed";
  return "cap-def";
}

function ModelHubView({ onBack, theme, setTheme, onUse, onChanged }) {
  const [source, setSource] = useState("hf"); // "hf" | "ollama"
  const [oll, setOll] = useState([]); // ollama results
  const [ollLoading, setOllLoading] = useState(false);
  const [oSize, setOSize] = useState({}); // chosen size tag per ollama model
  const [oBytes, setOBytes] = useState({}); // resolved download size: "name:tag" -> bytes (0=err, undefined=loading)
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [dl, setDl] = useState({});
  const [local, setLocal] = useState([]);
  const ctrls = useRef({});
  const loadLocal = useCallback(async () => {
    try {
      setLocal(await (await fetch("/models")).json());
    } catch (e) {}
  }, []);
  useEffect(() => {
    loadLocal();
  }, [loadLocal]);
  const stop = (id) => {
    const c = ctrls.current[id];
    if (c) {
      try {
        c.abort();
      } catch (e) {}
    }
    setDl((d) => ({ ...d, [id]: { state: "idle" } }));
  };
  const delModel = async (port) => {
    if (!window.confirm("Hapus model ini dari disk?")) return;
    try {
      await fetch("/model/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ port }),
      });
    } catch (e) {}
    loadLocal();
    onChanged && onChanged();
  };
  const [sizes, setSizes] = useState({}); // id -> {bytes, quant}  (the q4 download size)
  const sizeReq = useRef(0);
  const resolveSizes = useCallback(async (list) => {
    const token = ++sizeReq.current;
    for (const m of list) {
      if (token !== sizeReq.current) return; // a newer search started � stop
      try {
        const files = await (
          await fetch("/hf/files?id=" + encodeURIComponent(m.id))
        ).json();
        if (Array.isArray(files) && files.length) {
          const pick =
            files.find((f) => /q4_k_m/i.test(f.path)) ||
            files.find((f) => /q4/i.test(f.path)) ||
            files.slice().sort((a, b) => a.size - b.size)[0];
          const quant = (
            (pick.path.match(/q\d[a-z0-9_]*|f16|bf16/i) || [])[0] || ""
          ).toLowerCase();
          setSizes((s) => ({ ...s, [m.id]: { bytes: pick.size, quant } }));
        } else setSizes((s) => ({ ...s, [m.id]: { bytes: 0 } }));
      } catch (e) {}
    }
  }, []);
  const doSearch = useCallback(
    async (query) => {
      setLoading(true);
      setMsg("");
      try {
        const r = await (
          await fetch("/hf/search?q=" + encodeURIComponent(query))
        ).json();
        if (r.error) throw new Error(r.error);
        setResults(r);
        setSizes({});
        resolveSizes(r);
        if (!r.length) setMsg("Belum ada model yang tersedia.");
      } catch (e) {
        setResults([]);
        setMsg("Gagal memuat model: " + e.message);
      }
      setLoading(false);
    },
    [resolveSizes],
  );
  useEffect(() => {
    const c = HUB_CATS.find((x) => x.key === cat) || HUB_CATS[0];
    doSearch(q.trim() || c.q);
  }, [cat]);
  const submit = () => {
    const c = HUB_CATS.find((x) => x.key === cat) || HUB_CATS[0];
    doSearch(q.trim() || c.q);
  };
  const download = async (id) => {
    if (
      dl[id] &&
      (dl[id].state === "downloading" || dl[id].state === "resolving")
    )
      return;
    setDl((d) => ({ ...d, [id]: { state: "resolving", progress: 0 } }));
    try {
      const files = await (
        await fetch("/hf/files?id=" + encodeURIComponent(id))
      ).json();
      if (files.error || !files.length) {
        setDl((d) => ({ ...d, [id]: { state: "idle" } }));
        setMsg(
          'Repo "' +
            id +
            '" tak punya file .gguf � coba repo berakhiran "-GGUF".',
        );
        return;
      }
      const pick =
        files.find((f) => /q4_k_m/i.test(f.path)) ||
        files.find((f) => /q4/i.test(f.path)) ||
        files.slice().sort((a, b) => a.size - b.size)[0];
      setDl((d) => ({ ...d, [id]: { state: "downloading", progress: 0 } }));
      const ctrl = new AbortController();
      ctrls.current[id] = ctrl;
      const res = await fetch("/hf/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, file: pick.path }),
        signal: ctrl.signal,
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          const m = line.match(/^data:\s*(.*)$/);
          if (!m) continue;
          let j;
          try {
            j = JSON.parse(m[1]);
          } catch (e) {
            continue;
          }
          if (j.t === "progress")
            setDl((d) => ({
              ...d,
              [id]: { state: "downloading", progress: j.pct },
            }));
          else if (j.t === "done") {
            setDl((d) => ({
              ...d,
              [id]: { state: "done", progress: 100, port: j.model.port },
            }));
            loadLocal();
            onChanged && onChanged();
          } else if (j.t === "err") {
            setDl((d) => ({ ...d, [id]: { state: "idle" } }));
            setMsg("Gagal unduh: " + j.m);
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setDl((d) => ({ ...d, [id]: { state: "idle" } }));
        setMsg("Gagal: " + e.message);
      }
    }
  };
  // Ollama: realtime library (scraped server-side). Refetch on source/query change.
  const fetchOllama = useCallback(async (query) => {
    setOllLoading(true);
    try {
      const r = await (
        await fetch("/ollama/search?q=" + encodeURIComponent(query || ""))
      ).json();
      setOll(Array.isArray(r) ? r : []);
    } catch (e) {
      setOll([]);
    }
    setOllLoading(false);
  }, []);
  useEffect(() => {
    if (source === "ollama") fetchOllama(q.trim());
  }, [source]);
  const submitO = () => fetchOllama(q.trim());
  // Resolve real download size (bytes) for a model:tag, cached. Marks loading as null.
  const oReq = useRef(0);
  const resolveSize = useCallback((name, tag) => {
    const id = name + ":" + tag;
    setOBytes((b) =>
      id in b
        ? b
        : (() => {
            fetch(
              "/ollama/size?name=" +
                encodeURIComponent(name) +
                "&tag=" +
                encodeURIComponent(tag),
            )
              .then((r) => r.json())
              .then((d) => setOBytes((b2) => ({ ...b2, [id]: d.bytes || 0 })))
              .catch(() => setOBytes((b2) => ({ ...b2, [id]: 0 })));
            return { ...b, [id]: null };
          })(),
    );
  }, []);
  // When Ollama results arrive, resolve the smallest (default) tag's size per model.
  useEffect(() => {
    if (source !== "ollama" || !oll.length) return;
    const token = ++oReq.current;
    let i = 0; // throttle: one manifest fetch at a time-ish
    const tick = () => {
      if (token !== oReq.current || i >= oll.length) return;
      const m = oll[i++];
      resolveSize(m.name, smallestTag(m.sizes));
      setTimeout(tick, 120);
    };
    tick();
  }, [oll, source]);
  // pick the smallest parameter size as the default tag (safest local download)
  const smallestTag = (sizes) => {
    if (!sizes || !sizes.length) return "latest";
    const parse = (s) => {
      const m = (s || "").match(/([\d.]+)\s*([bm])/i);
      if (!m) return 1e9;
      return parseFloat(m[1]) * (m[2].toLowerCase() === "b" ? 1 : 0.001);
    };
    return sizes.slice().sort((a, b) => parse(a) - parse(b))[0];
  };
  // Download an Ollama model's GGUF blob ? launch llama-server (SSE progress, keyed by name:tag)
  const downloadOllama = async (name, tag) => {
    const id = name + ":" + tag;
    if (dl[id] && dl[id].state === "downloading") return;
    setDl((d) => ({ ...d, [id]: { state: "downloading", progress: 0 } }));
    const ctrl = new AbortController();
    ctrls.current[id] = ctrl;
    try {
      const res = await fetch("/ollama/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, tag }),
        signal: ctrl.signal,
      });
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          const m = line.match(/^data:\s*(.*)$/);
          if (!m) continue;
          let j;
          try {
            j = JSON.parse(m[1]);
          } catch (e) {
            continue;
          }
          if (j.t === "progress")
            setDl((d) => ({
              ...d,
              [id]: { state: "downloading", progress: j.pct },
            }));
          else if (j.t === "done") {
            setDl((d) => ({
              ...d,
              [id]: { state: "done", progress: 100, port: j.model.port },
            }));
            loadLocal();
            onChanged && onChanged();
          } else if (j.t === "err") {
            setDl((d) => ({ ...d, [id]: { state: "idle" } }));
            setMsg("Gagal unduh: " + j.m);
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setDl((d) => ({ ...d, [id]: { state: "idle" } }));
        setMsg("Gagal: " + e.message);
      }
    }
  };
  return (
    <div className="hub">
      <header className="hub-header">
        <div className="hub-title-group">
          <span className="hub-hf-mark">
            {source === "ollama" ? <HubIcon.ollama /> : <HubIcon.hf />}
          </span>
          <span className="hub-title">Model Hub</span>
        </div>
        <div className="tb-spacer" />
        <div className="hub-source">
          <button
            className={source === "hf" ? "active" : ""}
            onClick={() => setSource("hf")}
          >
            Hugging Face
          </button>
          <button
            className={source === "ollama" ? "active" : ""}
            onClick={() => setSource("ollama")}
          >
            Ollama
          </button>
        </div>
      </header>
      <div className="hub-body">
        <div className="hub-inner">
          {local.length > 0 && (
            <div className="hub-local">
              <div className="hub-local-title">
                ?? Model Terunduh ({local.length})
              </div>
              {local.map((m) => (
                <div className="hub-local-row" key={m.port}>
                  <div className="hub-local-info">
                    <b>{m.name}</b>
                    <span>
                      {m.size ? fmtSize(m.size) : ""} � port {m.port}
                    </span>
                  </div>
                  <button className="m-use-btn" onClick={() => onUse(m.port)}>
                    Gunakan
                  </button>
                  <button className="hub-del" onClick={() => delModel(m.port)}>
                    Hapus
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="hub-controls">
            <div className="hub-search">
              <HubIcon.search />
              <input
                placeholder={
                  source === "ollama"
                    ? "Cari model Ollama� (llama, qwen, deepseek, phi)"
                    : "Cari model GGUF� (llama, coder, qwen, phi)"
                }
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    source === "ollama" ? submitO() : submit();
                  }
                }}
              />
            </div>
          </div>
          {source === "hf" && (
            <div className="hub-filters">
              {HUB_CATS.map((c) => (
                <button
                  key={c.key}
                  className={"hub-filter" + (cat === c.key ? " active" : "")}
                  onClick={() => {
                    setQ("");
                    setCat(c.key);
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {source === "ollama" ? (
            ollLoading ? (
              <div className="hub-empty">
                <HubIcon.loader className="spin" />
                <div>Memuat dari Ollama�</div>
              </div>
            ) : oll.length ? (
              <div className="hub-grid">
                {oll.map((m) => (
                  <div className="m-card" key={m.name}>
                    <div className="m-card-head">
                      <LLMLogo name={m.name} />
                      <div className="m-card-info">
                        <div className="m-card-name">{m.name}</div>
                        <div className="m-card-id">
                          {ollamaBrand(m.name).key !== "generic"
                            ? ollamaBrand(m.name).key
                            : "ollama"}
                        </div>
                      </div>
                    </div>
                    <p className="m-card-desc">{m.description}</p>
                    {m.capabilities.length > 0 && (
                      <div className="m-card-tags">
                        {m.capabilities.map((c) => (
                          <span key={c} className={"m-cap " + capClass(c)}>
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                    {m.sizes.length > 0 &&
                      (() => {
                        const cur = oSize[m.name] || smallestTag(m.sizes);
                        return (
                          <div className="m-card-tags m-size-row">
                            {m.sizes.map((s) => (
                              <button
                                key={s}
                                className={"m-size" + (cur === s ? " sel" : "")}
                                onClick={() => {
                                  setOSize((o) => ({ ...o, [m.name]: s }));
                                  resolveSize(m.name, s);
                                }}
                              >
                                {s}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    {(() => {
                      const tag = oSize[m.name] || smallestTag(m.sizes);
                      const b = oBytes[m.name + ":" + tag];
                      return (
                        <div className="m-card-meta">
                          <span className="m-dlsize">
                            {b === undefined ? (
                              <span style={{ opacity: 0.5 }}>? �</span>
                            ) : b === null ? (
                              <span style={{ opacity: 0.5 }}>
                                ? menghitung�
                              </span>
                            ) : b > 0 ? (
                              <code>
                                ? {fmtSize(b)} � {tag}
                              </code>
                            ) : (
                              <span style={{ opacity: 0.5 }}>? ?</span>
                            )}
                          </span>
                          <span>
                            <HubIcon.dl style={{ width: 12, height: 12 }} />{" "}
                            {m.pulls}
                          </span>
                          <span>?? {m.tags}</span>
                          {m.updated && <span>? {m.updated}</span>}
                        </div>
                      );
                    })()}
                    {(() => {
                      const tag = oSize[m.name] || smallestTag(m.sizes);
                      const id = m.name + ":" + tag;
                      const d = dl[id] || {};
                      const st = d.state || "idle";
                      return (
                        <>
                          {st === "downloading" && (
                            <div className="m-progress">
                              <div className="m-progress-bar">
                                <div
                                  className="m-progress-fill"
                                  style={{ width: (d.progress || 0) + "%" }}
                                />
                              </div>
                              <div className="m-progress-info">
                                <span>Mengunduh {tag}�</span>
                                <span>{Math.round(d.progress || 0)}%</span>
                              </div>
                            </div>
                          )}
                          <div className="m-card-foot">
                            {st === "done" ? (
                              <>
                                <span className="m-done-badge">
                                  <HubIcon.check /> Terunduh
                                </span>
                                <button
                                  className="m-use-btn active"
                                  onClick={() => onUse(d.port)}
                                >
                                  Gunakan
                                </button>
                                <button
                                  className="hub-del"
                                  onClick={() => delModel(d.port)}
                                >
                                  Hapus
                                </button>
                              </>
                            ) : st === "downloading" ? (
                              <>
                                <button className="m-dl-btn" disabled>
                                  <HubIcon.loader className="spin" /> Mengunduh�
                                </button>
                                <button
                                  className="hub-del"
                                  onClick={() => stop(id)}
                                >
                                  Stop
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  className="m-dl-btn"
                                  onClick={() => downloadOllama(m.name, tag)}
                                >
                                  <HubIcon.download /> Download {m.name}:{tag}
                                </button>
                                <a
                                  className="hub-del"
                                  href={"https://ollama.com/library/" + m.name}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{ textDecoration: "none" }}
                                >
                                  ?
                                </a>
                              </>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ))}
              </div>
            ) : (
              <div className="hub-empty">
                <HubIcon.empty />
                <div>{q ? "Tidak ada model cocok." : "Memuat�"}</div>
              </div>
            )
          ) : loading ? (
            <div className="hub-empty">
              <HubIcon.loader className="spin" />
              <div>Memuat dari Hugging Face�</div>
            </div>
          ) : results.length ? (
            <div className="hub-grid">
              {results.map((m) => {
                const d = dl[m.id] || {};
                const st = d.state || "idle";
                const author = m.id.split("/")[0] || "?";
                const name = m.id.split("/").pop();
                return (
                  <div className="m-card" key={m.id}>
                    <div className="m-card-head">
                      {m.avatar ? (
                        <img
                          className="m-card-logo"
                          src={m.avatar}
                          alt={author}
                          loading="lazy"
                          onError={(e) => {
                            e.target.style.display = "none";
                            e.target.nextSibling.style.display = "grid";
                          }}
                        />
                      ) : null}
                      <div
                        className={"m-card-icon " + iconColorFor(author)}
                        style={{ display: m.avatar ? "none" : "grid" }}
                      >
                        {author[0].toUpperCase()}
                      </div>
                      <div className="m-card-info">
                        <div className="m-card-name">{name}</div>
                        <div className="m-card-id">{m.id}</div>
                      </div>
                    </div>
                    {(m.pipeline || (m.tags && m.tags.length) || m.library) && (
                      <div className="m-card-tags">
                        {m.pipeline && (
                          <span
                            className={
                              "m-tag " +
                              (/code/i.test(m.pipeline) ? "code" : "gen")
                            }
                          >
                            {m.pipeline}
                          </span>
                        )}
                        {m.library && (
                          <span className="m-tag-soft">{m.library}</span>
                        )}
                        {(m.tags || []).slice(0, 2).map((t) => (
                          <span className="m-tag-soft" key={t}>
                            {t}
                          </span>
                        ))}
                        {m.gated && (
                          <span className="m-tag-soft">?? gated</span>
                        )}
                      </div>
                    )}
                    <div className="m-card-meta">
                      <span>
                        <HubIcon.dl style={{ width: 12, height: 12 }} />{" "}
                        {fmtN(m.downloads)} unduhan
                      </span>
                      <span>
                        <HubIcon.star
                          style={{
                            width: 12,
                            height: 12,
                            color: "var(--brand)",
                          }}
                        />{" "}
                        {fmtN(m.likes)}
                      </span>
                      {m.updated && <span>? {fmtDate(m.updated)}</span>}
                      {sizes[m.id] ? (
                        <span>
                          <code>
                            {sizes[m.id].bytes
                              ? "? " +
                                fmtSize(sizes[m.id].bytes) +
                                (sizes[m.id].quant
                                  ? " � " + sizes[m.id].quant
                                  : "")
                              : "�"}
                          </code>
                        </span>
                      ) : (
                        <span style={{ opacity: 0.5 }}>? menghitung�</span>
                      )}
                    </div>
                    {st === "downloading" && (
                      <div className="m-progress">
                        <div className="m-progress-bar">
                          <div
                            className="m-progress-fill"
                            style={{ width: (d.progress || 0) + "%" }}
                          />
                        </div>
                        <div className="m-progress-info">
                          <span>Mengunduh�</span>
                          <span>{Math.round(d.progress || 0)}%</span>
                        </div>
                      </div>
                    )}
                    <div className="m-card-foot">
                      {st === "done" ? (
                        <>
                          <span className="m-done-badge">
                            <HubIcon.check /> Terunduh
                          </span>
                          <button
                            className="m-use-btn active"
                            onClick={() => onUse(d.port)}
                          >
                            Gunakan
                          </button>
                          <button
                            className="hub-del"
                            onClick={() => delModel(d.port)}
                          >
                            Hapus
                          </button>
                        </>
                      ) : st === "downloading" ? (
                        <>
                          <button className="m-dl-btn" disabled>
                            <HubIcon.loader className="spin" /> Mengunduh�
                          </button>
                          <button
                            className="hub-del"
                            onClick={() => stop(m.id)}
                          >
                            Stop
                          </button>
                        </>
                      ) : st === "resolving" ? (
                        <button className="m-dl-btn" disabled>
                          <HubIcon.loader className="spin" /> Menyiapkan�
                        </button>
                      ) : (
                        <button
                          className="m-dl-btn"
                          onClick={() => download(m.id)}
                        >
                          <HubIcon.download /> Download
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="hub-empty">
              <HubIcon.empty />
              <div>{msg || "Ketik untuk mencari model."}</div>
            </div>
          )}
          {msg && results.length > 0 && (
            <div className="hf-msg" style={{ marginTop: 14 }}>
              {msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- Sidebar (Claude-style) ----------------------------- */
const SB = {
  panel: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <line
        x1="9"
        y1="4"
        x2="9"
        y2="20"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  ),
  plus: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <line
        x1="12"
        y1="5"
        x2="12"
        y2="19"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <line
        x1="5"
        y1="12"
        x2="19"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  ),
  history: (p) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  ),
  chat: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M4 5h16v11H8l-4 4V5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  ),
  hub: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="4"
        y="4"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="13"
        y="4"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="4"
        y="13"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <rect
        x="13"
        y="13"
        width="7"
        height="7"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.7"
      />
    </svg>
  ),
  key: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="8" cy="8" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M11 11l8 8M16 16l2-2M18 18l2-2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  code: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M8 7l-5 5 5 5M16 7l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  target: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 2v4M12 18v4M2 12h4M18 12h4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  ),
  palette: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M12 3a9 9 0 100 18c1.7 0 2-1.3 1.2-2.2-.8-.9-.3-2.3 1-2.3H17a4 4 0 004-4 9 9 0 00-9-9.5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <circle cx="7.5" cy="11" r="1" fill="currentColor" />
      <circle cx="11" cy="7.5" r="1" fill="currentColor" />
      <circle cx="15" cy="8.5" r="1" fill="currentColor" />
    </svg>
  ),
  runner: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <path
        d="M5 5h14v10H5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9 9l2 3-2 3M13 9l2 3-2 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8 19h8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  ),
  // -- Agent-specific logos --
  quantumAgent: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3" />
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 2"
      />
      <circle cx="12" cy="3" r="1.8" fill="currentColor" />
      <circle cx="12" cy="21" r="1.8" fill="currentColor" />
      <circle cx="3" cy="12" r="1.8" fill="currentColor" />
      <circle cx="21" cy="12" r="1.8" fill="currentColor" />
      <line
        x1="12"
        y1="9"
        x2="12"
        y2="3"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.6"
      />
      <line
        x1="12"
        y1="15"
        x2="12"
        y2="21"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.6"
      />
      <line
        x1="9"
        y1="12"
        x2="3"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.6"
      />
      <line
        x1="15"
        y1="12"
        x2="21"
        y2="12"
        stroke="currentColor"
        strokeWidth="1.2"
        opacity="0.6"
      />
    </svg>
  ),
  opencode: (p) => (
    <svg viewBox="0 0 12 15" {...p}>
      <rect width="12" height="15" fill="#131010" />
      <path
        d="M0 0H12V15H0Z M3 3H9V12H3Z"
        fill="#FFFFFF"
        fillRule="evenodd"
      />
      <rect x="3" y="6" width="6" height="6" fill="#5A5858" />
    </svg>
  ),
  claude: (p) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  ),
};

// Identitas sebuah workspace = PATH-nya yang persis, bukan namanya. Windows tak
// peka huruf besar/kecil dan mencampur "/" vs "\", jadi normalkan sebelum banding.
function normDelPath(s) {
  return String(s || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}
// Apakah path ada di daftar-hapus? HANYA cocok berdasar path persis (dinormalkan)
// — TIDAK dengan nama telanjang/suffix. Ini memutus bug lama: menghapus folder
// bernama "x" tak boleh memblokir folder "x" lain di lokasi berbeda selamanya.
function isPathDeleted(deletedArr, p) {
  if (!p) return false;
  const np = normDelPath(p);
  for (const d of deletedArr || []) if (normDelPath(d) === np) return true;
  return false;
}
// Sekali-jalan: buang "racun" dari daftar-hapus lama — entri NAMA TELANJANG (bukan
// path absolut) yang, di bawah pencocokan-nama lama, memblokir folder apa pun yang
// namanya kebetulan sama. Setelah ini blacklist hanya berisi path (invarian baru).
function sanitizeDeletedWorkspaces() {
  try {
    const raw = localStorage.getItem("quantum_deleted_workspaces");
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return;
    const isAbsPath = (s) => /^[a-zA-Z]:[\\/]/.test(String(s || "")) || String(s || "").startsWith("/");
    const cleaned = arr.filter(isAbsPath);
    if (cleaned.length !== arr.length) {
      localStorage.setItem("quantum_deleted_workspaces", JSON.stringify(cleaned));
    }
  } catch (_) {}
}

// Bersihkan racun blacklist lama sekali, saat app.jsx dimuat (aman & idempoten).
try { sanitizeDeletedWorkspaces(); } catch (_) {}

// Ubah project terpilih -> PATH folder untuk dikirim sebagai workspace_root ke agent
// (mengurung agent + operasi file/bash ke folder itu). null = biarkan tak-terkurung:
// yaitu WOLFSPACE root (mode self-edit, seperti sekarang) atau tak bisa diresolusi.
const WOLFSPACE_ROOT = "c:/users/dave/quantum";
function resolveWorkspaceRoot(sel) {
  if (!sel) return null;
  let p = /[:\\/]/.test(sel) ? sel : null;
  if (!p) {
    try {
      const list = JSON.parse(localStorage.getItem("quantum_projects_list") || "[]");
      const hit = list.find((x) => x && (x.name === sel || (x.path && (x.path.endsWith("\\" + sel) || x.path.endsWith("/" + sel)))));
      if (hit && hit.path) p = hit.path;
    } catch (_) {}
  }
  if (!p) return null;
  const norm = String(p).replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  if (norm === WOLFSPACE_ROOT) return null;
  return p;
}

function deleteWorkspaceGlobal(wsToDelete) {
  try {
    if (!wsToDelete) return;
    const stored = JSON.parse(localStorage.getItem("quantum_projects_list") || "[]");
    // Cari path FISIK folder ini SEBELUM localStorage diubah — dipakai untuk hapus
    // nyata di disk. wsToDelete kadang berupa nama, kadang path; cari entri yang
    // cocok (persis logika filter di bawah) untuk mendapat p.path yang benar.
    const match = stored.find(
      (p) =>
        p.path === wsToDelete ||
        p.name === wsToDelete ||
        (p.path && (p.path.endsWith(`\\${wsToDelete}`) || p.path.endsWith(`/${wsToDelete}`))) ||
        wsToDelete.endsWith(`\\${p.name}`) ||
        wsToDelete.endsWith(`/${p.name}`),
    );
    const realPath =
      (match && match.path) ||
      (wsToDelete.includes(":") || wsToDelete.includes("/") || wsToDelete.includes("\\") ? wsToDelete : null);

    const updated = stored.filter((p) => {
      if (p.path === wsToDelete || p.name === wsToDelete) return false;
      if (wsToDelete.endsWith(`\\${p.name}`) || wsToDelete.endsWith(`/${p.name}`)) return false;
      if (p.path && (p.path.endsWith(`\\${wsToDelete}`) || p.path.endsWith(`/${wsToDelete}`))) return false;
      return true;
    });
    localStorage.setItem("quantum_projects_list", JSON.stringify(updated));

    // Blacklist HANYA menyimpan path penuh (identitas). Menyimpan nama telanjang
    // dulu (p.name / wsToDelete-nama) meracuni daftar: folder baru bernama sama
    // ikut tersaring selamanya. Bila path tak bisa diresolusi, entri sudah dibuang
    // dari projects_list di atas — cukup, tak perlu diblacklist by-name.
    const deleted = JSON.parse(localStorage.getItem("quantum_deleted_workspaces") || "[]");
    if (realPath && !isPathDeleted(deleted, realPath)) {
      deleted.push(realPath);
      localStorage.setItem("quantum_deleted_workspaces", JSON.stringify(deleted));
    }
    window.dispatchEvent(new Event("quantum_workspaces_changed"));

    // Hapus FISIK folder+repo dari disk (backend menolak kalau bukan workspace ww
    // yang sah — lihat POST /ww/delete). UI sudah bersih di atas terlepas hasil ini.
    if (realPath) {
      wwApi("/ww/delete", { method: "POST", body: { path: realPath } }).catch(() => {});
    }
  } catch (_) {}
}

// Ambil ringkasan git READ-ONLY untuk satu folder workspace. Pola decoupling:
// fetch fresh saat mount, tak pernah simpan di state parent — jadi tiap kali
// baris/popover ter-mount, datanya selalu terkini (bukan snapshot beku).
function useWwGit(path, refreshKey) {
  const [info, setInfo] = React.useState(null);
  React.useEffect(() => {
    let alive = true;
    // Hanya path absolut yang bermakna sbagai repo di disk; nama telanjang dilewati.
    const looksAbsolute = typeof path === "string" && /^[a-zA-Z]:[\\/]|^\//.test(path);
    if (!looksAbsolute) {
      setInfo({ repo: false });
      return;
    }
    wwApi("/ww/git?path=" + encodeURIComponent(path)).then((r) => {
      if (alive) setInfo(r || { repo: false });
    });
    return () => {
      alive = false;
    };
  }, [path, refreshKey]);
  return info;
}

// Perbarui localStorage setelah FOLDER di-rename di disk: ganti path+name di
// projects_list, lalu umumkan perubahan agar sidebar & picker menyusun ulang.
function applyFolderRenameLS(oldPath, newPath, newName) {
  try {
    const norm = (s) => String(s || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    const list = JSON.parse(localStorage.getItem("quantum_projects_list") || "[]");
    let changed = false;
    const upd = list.map((p) => {
      if (p && norm(p.path) === norm(oldPath)) { changed = true; return { ...p, path: newPath, name: newName }; }
      return p;
    });
    if (changed) localStorage.setItem("quantum_projects_list", JSON.stringify(upd));
    window.dispatchEvent(new Event("quantum_workspaces_changed"));
  } catch (_) {}
}

// Pill branch + titik status di baris sidebar (selalu terlihat, "sekilas").
// Titik: kuning = ada perubahan belum di-commit, hijau-abu = bersih.
function WorkspaceGitPill({ path }) {
  const g = useWwGit(path);
  if (!g || !g.repo) return null;
  const dot = g.dirty ? "#d29922" : "#3fb950";
  return (
    <span
      title={
        (g.dirty ? g.dirtyCount + " perubahan belum di-commit" : "bersih (tak ada perubahan)") +
        (g.branch ? " — branch " + g.branch : "")
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        flexShrink: 0,
        maxWidth: "130px",
        padding: "1px 6px 1px 5px",
        borderRadius: "10px",
        background: "rgba(255,255,255,0.05)",
        border: "1px solid rgba(255,255,255,0.07)",
        fontSize: "10.5px",
        color: "#8b949e",
        lineHeight: 1.4,
      }}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }}>
        <line x1="6" y1="3" x2="6" y2="15"></line>
        <circle cx="18" cy="6" r="3"></circle>
        <circle cx="6" cy="18" r="3"></circle>
        <path d="M18 9a9 9 0 0 1-9 9"></path>
      </svg>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.branch}</span>
      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: dot, flexShrink: 0 }}></span>
    </span>
  );
}

// Panel detail git di dalam popover "Folder options". Mount = fetch fresh.
// Normalkan input jadi nama branch git valid (mirror scripts/ww.cjs toBranch).
function toBranchName(name) {
  let b = String(name || "").trim()
    .replace(/[^\w.\-/]+/g, "-").replace(/\.\.+/g, ".")
    .replace(/^[-/.]+|[-/.]+$/g, "").replace(/-{2,}/g, "-");
  return b || "work";
}
const gitBranchIcon = (sz) => (
  <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <line x1="6" y1="3" x2="6" y2="15"></line>
    <circle cx="18" cy="6" r="3"></circle>
    <circle cx="6" cy="18" r="3"></circle>
    <path d="M18 9a9 9 0 0 1-9 9"></path>
  </svg>
);

// Panel git INTERAKTIF di popover "Folder options": rename folder (disk), ganti/
// buat/ganti-nama/hapus branch — semua lewat endpoint /ww/* nyata (git asli).
function WorkspaceGitPanel({ path, onClose }) {
  const [refreshKey, setRefreshKey] = React.useState(0);
  const g = useWwGit(path, refreshKey);
  const [br, setBr] = React.useState(null); // { repo, current, branches:[] }
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [renamingBranch, setRenamingBranch] = React.useState(null);
  const [editingFolder, setEditingFolder] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null); // { ok, text }

  React.useEffect(() => {
    let alive = true;
    const abs = typeof path === "string" && /^[a-zA-Z]:[\\/]|^\//.test(path);
    if (!abs) { setBr({ repo: false, current: null, branches: [] }); return; }
    wwApi("/ww/branches?path=" + encodeURIComponent(path)).then((r) => {
      if (alive) setBr(r || { repo: false, current: null, branches: [] });
    });
    return () => { alive = false; };
  }, [path, refreshKey]);

  const flash = (ok, text) => { setMsg({ ok, text }); setTimeout(() => setMsg((m) => (m && m.text === text ? null : m)), 2800); };
  const refresh = () => setRefreshKey((k) => k + 1);
  const run = async (url, body, okText, after) => {
    setBusy(true);
    const r = await wwApi(url, { method: "POST", body });
    setBusy(false);
    if (r && r.ok) { flash(true, typeof okText === "function" ? okText(r) : okText); if (after) after(r); refresh(); return true; }
    flash(false, (r && r.err) || "gagal");
    return false;
  };

  const doSwitch = (b) => run("/ww/branch/switch", { path, branch: b }, "beralih ke " + b, () => setPickerOpen(false));
  const doCreate = (name) => { const nm = toBranchName(name); run("/ww/branch/create", { path, branch: nm }, (r) => "branch dibuat: " + (r.name || nm), () => { setPickerOpen(false); setQuery(""); }); };
  const doRenameBranch = (oldN, newN) => { setRenamingBranch(null); const nn = toBranchName(newN); if (nn === oldN) return; run("/ww/branch/rename", { path, oldName: oldN, newName: nn }, (r) => "branch → " + (r.name || nn)); };
  const doDeleteBranch = (b) => run("/ww/branch/delete", { path, branch: b }, "branch dihapus: " + b);
  const doRenameFolder = (newName) => {
    const nm = String(newName || "").trim();
    setEditingFolder(false);
    if (!nm || nm === basename) return;
    run("/ww/rename", { path, newName: nm }, (r) => "folder → " + (r.name || nm), (r) => {
      applyFolderRenameLS(path, r.path || path, r.name || nm);
      if (onClose) setTimeout(onClose, 500);
    });
  };

  const basename = String(path || "").split(/[\\/]/).filter(Boolean).pop() || String(path || "");
  if (g === null || br === null) {
    return <div style={{ padding: "8px 14px", color: "#6b7280", fontSize: "12px" }}>memuat git…</div>;
  }
  if (!g.repo) {
    return <div style={{ padding: "8px 14px", color: "#6b7280", fontSize: "12px" }}>bukan repo git</div>;
  }
  const dot = g.dirty ? "#d29922" : "#3fb950";
  const cur = (br && br.current) || g.branch;
  const branches = (br && br.branches) || [];
  const q = query.trim();
  const norm = q ? toBranchName(q) : "";
  const filtered = branches.filter((b) => b.toLowerCase().includes(q.toLowerCase()));
  const typedNew = q && !branches.some((b) => b === norm);

  const miniBtn = (onClick, title, color, children) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      style={{ width: "22px", height: "22px", borderRadius: "5px", border: "none", cursor: "pointer", background: "transparent", color: color || "#6b7280", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.09)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >{children}</button>
  );
  const pencil = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>;
  const trash = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path></svg>;

  return (
    <div style={{ padding: "8px 12px", borderBottom: "1px solid #21262d", display: "flex", flexDirection: "column", gap: "7px", opacity: busy ? 0.7 : 1, pointerEvents: busy ? "none" : "auto" }}>
      {/* nama folder + rename */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8b949e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
        {editingFolder ? (
          <input
            autoFocus defaultValue={basename}
            onKeyDown={(e) => { if (e.key === "Enter") doRenameFolder(e.currentTarget.value); else if (e.key === "Escape") setEditingFolder(false); }}
            onBlur={(e) => doRenameFolder(e.currentTarget.value)}
            style={{ flex: 1, minWidth: 0, background: "#1c2128", border: "1px solid #2f81f7", borderRadius: "5px", color: "#e6edf3", fontFamily: "inherit", fontSize: "12.5px", fontWeight: 600, padding: "2px 6px", outline: "none" }}
          />
        ) : (
          <React.Fragment>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#e6edf3", fontSize: "12.5px", fontWeight: 600 }}>{basename}</span>
            {miniBtn(() => setEditingFolder(true), "Ganti nama folder (disk)", "#6b7280", pencil)}
          </React.Fragment>
        )}
      </div>

      {/* branch aktif → picker */}
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setPickerOpen((o) => !o)}
          title="Kelola branch"
          style={{ display: "flex", alignItems: "center", gap: "7px", width: "100%", textAlign: "left", background: "#1c2128", border: "1px solid #30363d", color: "#e6edf3", borderRadius: "6px", padding: "5px 8px", cursor: "pointer", fontFamily: "inherit", fontSize: "12px" }}
        >
          <span style={{ color: "#8b949e", display: "inline-flex" }}>{gitBranchIcon(13)}</span>
          <span style={{ flex: 1, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cur}</span>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: pickerOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>

        {pickerOpen && (
          <div style={{ marginTop: "5px", background: "#0d1117", border: "1px solid #30363d", borderRadius: "7px", overflow: "hidden" }}>
            <input
              autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && typedNew) doCreate(q); else if (e.key === "Escape") setPickerOpen(false); }}
              placeholder="Pilih branch / ketik untuk membuat…"
              style={{ margin: "7px", width: "calc(100% - 14px)", background: "#161b22", border: "1px solid #30363d", borderRadius: "5px", color: "#e6edf3", fontFamily: "inherit", fontSize: "12px", padding: "5px 8px", outline: "none" }}
            />
            <div style={{ maxHeight: "190px", overflowY: "auto", padding: "0 5px 7px" }}>
              {typedNew && (
                <div onClick={() => doCreate(q)} style={{ display: "flex", alignItems: "center", gap: "7px", padding: "6px 7px", borderRadius: "5px", cursor: "pointer", color: "#2f81f7", fontSize: "12px" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#21262d")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Buat branch “{norm}”</span>
                </div>
              )}
              {filtered.length === 0 && !typedNew && (
                <div style={{ padding: "8px 7px", fontSize: "11.5px", color: "#6b7280" }}>Tak ada branch cocok.</div>
              )}
              {filtered.map((b) => {
                const isCur = b === cur;
                if (renamingBranch === b) {
                  return (
                    <div key={b} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "5px 7px" }}>
                      <span style={{ width: "15px" }}></span>
                      <input autoFocus defaultValue={b}
                        onKeyDown={(e) => { if (e.key === "Enter") doRenameBranch(b, e.currentTarget.value); else if (e.key === "Escape") setRenamingBranch(null); }}
                        onBlur={(e) => doRenameBranch(b, e.currentTarget.value)}
                        style={{ flex: 1, minWidth: 0, background: "#1c2128", border: "1px solid #2f81f7", borderRadius: "5px", color: "#e6edf3", fontFamily: "ui-monospace, monospace", fontSize: "12px", padding: "2px 6px", outline: "none" }} />
                    </div>
                  );
                }
                return (
                  <div key={b} onClick={() => !isCur && doSwitch(b)} title={isCur ? "branch aktif" : "beralih ke " + b}
                    style={{ display: "flex", alignItems: "center", gap: "7px", padding: "6px 7px", borderRadius: "5px", cursor: isCur ? "default" : "pointer", background: isCur ? "#21262d" : "transparent", fontSize: "12px", color: "#e6edf3" }}
                    onMouseEnter={(e) => { if (!isCur) e.currentTarget.style.background = "#21262d"; }}
                    onMouseLeave={(e) => { if (!isCur) e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ width: "15px", display: "inline-flex", justifyContent: "center", color: "#3fb950", flexShrink: 0 }}>
                      {isCur && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                    </span>
                    <span style={{ flex: 1, fontFamily: "ui-monospace, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b}</span>
                    <span style={{ display: "flex", gap: "1px", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      {miniBtn(() => setRenamingBranch(b), "Ganti nama branch", "#6b7280", pencil)}
                      {miniBtn(() => { if (!isCur) doDeleteBranch(b); }, isCur ? "branch aktif tak bisa dihapus" : "Hapus branch", isCur ? "#3a3f46" : "#f85149", trash)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* status + commit */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11.5px", color: "#8b949e" }}>
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: dot, flexShrink: 0 }}></span>
        <span>{g.dirty ? g.dirtyCount + " perubahan belum di-commit" : "bersih — tak ada perubahan"}</span>
      </div>
      {g.lastCommit && (
        <div style={{ fontSize: "11px", color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.lastCommit.hash + " " + g.lastCommit.subject}>
          {g.lastCommit.hash} · {g.lastCommit.subject} · {g.lastCommit.when}
        </div>
      )}
      {msg && (
        <div style={{ fontSize: "11px", color: msg.ok ? "#3fb950" : "#f85149", overflow: "hidden", textOverflow: "ellipsis" }}>{msg.text}</div>
      )}
    </div>
  );
}

function Sidebar({
  collapsed,
  setCollapsed,
  view,
  setView,
  onNewChat,
  theme,
  setTheme,
  terminalOpen,
  setTerminalOpen,
  terminal,
  savedChats,
  showHistory,
  setShowHistory,
  restoreChat,
  deleteChat,
  renameChat,
  loadSavedChats,
  onAgentRunner,
  selectedProject,
  onOpenPicker,
}) {
  const [showTools, setShowTools] = useState(false);
  const [showView, setShowView] = useState(false);
  const [showConversation, setShowConversation] = useState(false);
  const [showWorkspaces, setShowWorkspaces] = useState(true);
  const [hoveredChatId, setHoveredChatId] = useState(null);
  const [openMenuChatId, setOpenMenuChatId] = useState(null);
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [filterGroupBy, setFilterGroupBy] = useState("Environment");
  const [filterSortBy, setFilterSortBy] = useState("Last Updated");
  const [filterSubtitle, setFilterSubtitle] = useState("Project + Worktree");
  const [filterScheduled, setFilterScheduled] = useState(false);
  const [openFolderMenuWs, setOpenFolderMenuWs] = useState(null);
  const [wsRefreshKey, setWsRefreshKey] = useState(0);
  // Folder ww dari DISK (kebenaran) — bukan localStorage. Diisi dari GET /ww/list.
  const [wwLive, setWwLive] = useState(null); // null=belum load; {root, paths:[]}
  React.useEffect(() => {
    let alive = true;
    const load = () =>
      wwListFetch()
        .then((d) => {
          if (alive && d && Array.isArray(d.workspaces))
            setWwLive({ root: d.root, paths: d.workspaces.map((w) => w.path) });
        })
        .catch(() => {});
    load();
    const iv = setInterval(load, 6000);
    window.addEventListener("quantum_workspaces_changed", load);
    return () => {
      alive = false;
      clearInterval(iv);
      window.removeEventListener("quantum_workspaces_changed", load);
    };
  }, []);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const w = parseInt(localStorage.getItem("quantum_sidebar_width") || "232", 10);
      return isNaN(w) ? 232 : Math.max(160, Math.min(600, w));
    } catch (_) {
      return 232;
    }
  });
  const [isResizing, setIsResizing] = useState(false);

  const handleResizerMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(160, Math.min(600, startWidth + deltaX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = (upEvent) => {
      const deltaX = upEvent.clientX - startX;
      const finalWidth = Math.max(160, Math.min(600, startWidth + deltaX));
      setIsResizing(false);
      try {
        localStorage.setItem("quantum_sidebar_width", String(finalWidth));
      } catch (_) {}
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  React.useEffect(() => {
    const handleWindowClick = () => {
      setOpenMenuChatId(null);
      setFilterMenuOpen(false);
      setOpenFolderMenuWs(null);
    };
    const handleWsChanged = () => {
      setWsRefreshKey((prev) => prev + 1);
    };
    window.addEventListener("click", handleWindowClick);
    window.addEventListener("quantum_workspaces_changed", handleWsChanged);
    return () => {
      window.removeEventListener("click", handleWindowClick);
      window.removeEventListener("quantum_workspaces_changed", handleWsChanged);
    };
  }, []);

  const handleDeleteFolder = (wsToDelete) => {
    deleteWorkspaceGlobal(wsToDelete);
  };

  const workspacesList = React.useMemo(() => {
    const set = new Set();
    let deleted = [];
    try {
      deleted = JSON.parse(localStorage.getItem("quantum_deleted_workspaces") || "[]");
    } catch (_) {}
    const isDel = (x) => isPathDeleted(deleted, x); // path-exact, bukan nama/suffix

    if (selectedProject && !isDel(selectedProject)) set.add(selectedProject);
    else if (!isDel("c:\\Users\\dave\\quantum")) set.add("c:\\Users\\dave\\quantum");
    try {
      const stored = JSON.parse(localStorage.getItem("quantum_projects_list") || "[]");
      stored.forEach((p) => {
        if (p.path && !isDel(p.path)) set.add(p.path);
        else if (p.name && !isDel(p.name)) set.add(p.name);
      });
    } catch (_) {}
    if (savedChats && savedChats.length > 0) {
      savedChats.forEach((c) => {
        if (c.project && !isDel(c.project)) set.add(c.project);
      });
    }
    // ── ww = kebenaran disk ── Tambah folder ww yang NYATA ada; buang "hantu"
    // (entri di bawah root ww yang sudah tak ada di disk, mis. dihapus di Explorer).
    if (wwLive && wwLive.root && Array.isArray(wwLive.paths)) {
      // Normalisasi separator (\\ vs /) + lowercase supaya prefix-check konsisten,
      // apa pun gaya path (config pakai /, path.join pakai \\ di Windows).
      const norm = (s) =>
        String(s)
          .replace(/\\/g, "/")
          .replace(/\/+$/, "")
          .toLowerCase();
      const rootN = norm(wwLive.root);
      const liveN = new Set(wwLive.paths.map(norm));
      for (const p of Array.from(set)) {
        const pn = norm(p);
        if (pn === rootN || pn.startsWith(rootN + "/")) {
          if (!liveN.has(pn)) set.delete(p); // hantu: di bawah root ww tapi tak ada di disk
        }
      }
      wwLive.paths.forEach((p) => {
        if (!isDel(p)) set.add(p);
      });
    }
    return Array.from(set);
  }, [savedChats, selectedProject, wsRefreshKey, wwLive]);

  const formatWsTimeAgo = (ts) => {
    if (!ts) return "8h";
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
    if (diff < 60) return "now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 2592000) return `${Math.floor(diff / 86400)}d`;
    return `${Math.floor(diff / 2592000)}mo`;
  };

  const Item = ({ icon, label, active, onClick, badge }) => (
    <button
      className={"sb-item" + (active ? " active" : "")}
      onClick={onClick}
      title={collapsed ? label : undefined}
    >
      <i className="sb-ico">{icon}</i>
      <span className="sb-label">{label}</span>
      {badge && <span className="sb-badge">{badge}</span>}
    </button>
  );
  return (
    <aside 
      className={"sidebar" + (collapsed ? " collapsed" : "") + (isResizing ? " resizing" : "")}
      style={{ width: collapsed ? undefined : `${sidebarWidth}px` }}
      onClickCapture={(e) => {
        const btn = e.target.closest('.sb-item');
        // Jika klik pada tombol Visual Draw, Picker, atau Terminal, biarkan onClick mereka yang toggle
        if (btn && (btn.textContent.includes('Visual Picker') || btn.textContent.includes('Visual Draw') || btn.textContent.includes('Terminal'))) {
          return;
        }
        // Jika klik di tempat lain di sidebar (Chat, Settings, logo, dll), paksa matikan semua mode
        if (typeof VP_STOP === 'function' && VP_STOP !== null) VP_STOP();
        if (typeof VD_STOP === 'function' && VD_STOP !== null) VD_STOP();
      }}
    > 
      {!collapsed && (
        <div
          className="sb-resizer"
          onMouseDown={handleResizerMouseDown}
          title="Geser untuk menyesuaikan ukuran sidebar"
        />
      )}


      <div className="sb-head">
        <span className="sb-brand">
          <BrandMark />
          <b>WOLFSPACE</b>
        </span>
        <button
          className="sb-toggle"
          title={collapsed ? "Buka panel" : "Tutup panel"}
          onClick={() => setCollapsed(!collapsed)}
        >
          {SB.panel({ width: 19, height: 19 })}
        </button>
      </div>
      <div
        className="sb-sec"
        style={{ cursor: "pointer" }}
        onClick={() => setShowConversation(!showConversation)}
      >
        Conversation
      </div>
      {showConversation && (
        <div className="sb-group">
          <Item
            icon={SB.plus({ width: 19, height: 19 })}
            label="New Conversation"
            onClick={onNewChat}
          />
          <Item
            icon={SB.history({ width: 19, height: 19 })}
            label="Conversation History"
            active={view === "history"}
            onClick={() => {
              setView("history");
              loadSavedChats();
            }}
          />
        </div>
      )}
      <div
        className="sb-sec"
        style={{
          display: collapsed ? "none" : "flex",
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "12px",
          color: "#8b98a9",
          position: "relative",
        }}
        onClick={() => setShowWorkspaces(!showWorkspaces)}
      >
        <span>Workspaces</span>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", color: "#6b7280" }}>
          <span
            title="Filter / Sort"
            style={{ cursor: "pointer", display: "flex", alignItems: "center" }}
            onClick={(e) => {
              e.stopPropagation();
              setFilterMenuOpen(!filterMenuOpen);
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"></line>
              <line x1="7" y1="12" x2="17" y2="12"></line>
              <line x1="10" y1="18" x2="14" y2="18"></line>
            </svg>
          </span>
          <span
            title="Add Workspace"
            style={{ cursor: "pointer", display: "flex", alignItems: "center" }}
            onClick={(e) => {
              e.stopPropagation();
              if (onOpenPicker) onOpenPicker();
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              <line x1="12" y1="11" x2="12" y2="17"></line>
              <line x1="9" y1="14" x2="15" y2="14"></line>
            </svg>
          </span>
        </div>
        {filterMenuOpen && (
          <div
            className="filter-sort-menu"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Section 1: Group By */}
            <div className="filter-sort-header">Group By</div>
            {["Project", "Environment", "Status", "None"].map((opt) => (
              <button
                key={opt}
                className={"filter-sort-item" + (filterGroupBy === opt ? " active" : "")}
                onClick={() => {
                  setFilterGroupBy(opt);
                  setFilterMenuOpen(false);
                }}
              >
                {opt}
              </button>
            ))}

            <div className="filter-sort-divider" />

            {/* Section 2: Sort Conversations */}
            <div className="filter-sort-header">Sort Conversations</div>
            {["Last Updated", "Alphabetical (A-Z)", "Date Added"].map((opt) => (
              <button
                key={opt}
                className={"filter-sort-item" + (filterSortBy === opt ? " active" : "")}
                onClick={() => {
                  setFilterSortBy(opt);
                  setFilterMenuOpen(false);
                }}
              >
                {opt}
              </button>
            ))}

            <div className="filter-sort-divider" />

            {/* Section 3: Subtitles */}
            <div className="filter-sort-header">Subtitles</div>
            {["Project + Worktree", "No Subtitle"].map((opt) => (
              <button
                key={opt}
                className={"filter-sort-item" + (filterSubtitle === opt ? " active" : "")}
                onClick={() => {
                  setFilterSubtitle(opt);
                  setFilterMenuOpen(false);
                }}
              >
                {opt}
              </button>
            ))}

            <div className="filter-sort-divider" />

            {/* Section 4: Filter */}
            <div className="filter-sort-header">Filter</div>
            <button
              className={"filter-sort-item" + (filterScheduled ? " active" : "")}
              onClick={() => {
                setFilterScheduled(!filterScheduled);
                setFilterMenuOpen(false);
              }}
            >
              Scheduled
            </button>
          </div>
        )}
      </div>
      {showWorkspaces && (
        collapsed ? (
          <div className="sb-group">
            <Item
              icon={
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
              }
              label="Workspaces"
              onClick={() => setCollapsed(false)}
            />
          </div>
        ) : (
          <div className="sb-group" style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "8px" }}>
            {workspacesList.map((ws) => {
              const wsChats = savedChats
                .slice()
                .reverse()
                .filter((c) => {
                  if (c.project) return c.project === ws || (ws.endsWith(`\\${c.project}`) || ws.endsWith(`/${c.project}`));
                  return ws === selectedProject || ws === "c:\\Users\\dave\\quantum";
                });

              return (
                <div key={ws} style={{ display: "flex", flexDirection: "column", position: "relative" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "8px",
                      padding: "6px 12px",
                      color: "#a1aab8",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: "pointer",
                      borderRadius: "6px",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, overflow: "hidden" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ws === "c:\\Users\\dave\\quantum" ? "WOLFSPACE" : ws}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                    <WorkspaceGitPill path={ws} />
                    <span
                      title="Folder options"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "4px",
                        borderRadius: "4px",
                        color: "#6b7280",
                        cursor: "pointer",
                        flexShrink: 0,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenFolderMenuWs(openFolderMenuWs === ws ? null : ws);
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
                        e.currentTarget.style.color = "#f8fafc";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                        e.currentTarget.style.color = "#6b7280";
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="12" cy="5" r="1"></circle>
                        <circle cx="12" cy="19" r="1"></circle>
                      </svg>
                    </span>
                    </div>
                  </div>
                  {openFolderMenuWs === ws && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute",
                        top: "-4px",
                        left: "calc(100% + 14px)",
                        right: "auto",
                        background: "#161b22",
                        border: "1px solid #30363d",
                        borderRadius: "8px",
                        boxShadow: "0 12px 36px rgba(0,0,0,0.65)",
                        padding: "4px 0",
                        zIndex: 2000,
                        minWidth: "250px",
                      }}
                    >
                      <WorkspaceGitPanel path={ws} onClose={() => setOpenFolderMenuWs(null)} />
                      <button
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          width: "100%",
                          padding: "8px 14px",
                          color: "#f85149",
                          fontSize: "13px",
                          border: "none",
                          background: "none",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          textAlign: "left",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(248, 81, 73, 0.12)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                        onClick={() => {
                          handleDeleteFolder(ws);
                          setOpenFolderMenuWs(null);
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                          <line x1="10" y1="11" x2="10" y2="17"></line>
                          <line x1="14" y1="11" x2="14" y2="17"></line>
                        </svg>
                        <span>Hapus folder</span>
                      </button>
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", paddingLeft: "20px", gap: "2px" }}>
                    {wsChats.map((chat, idx) => {
                      const showActions = hoveredChatId === chat.id || openMenuChatId === chat.id || (idx === 0 && hoveredChatId === null && openMenuChatId === null);
                      return (
                        <div
                          key={chat.id}
                          onClick={() => restoreChat?.(chat)}
                          onMouseEnter={(e) => {
                            setHoveredChatId(chat.id);
                            e.currentTarget.style.background = "rgba(255, 255, 255, 0.04)";
                          }}
                          onMouseLeave={(e) => {
                            setHoveredChatId(null);
                            e.currentTarget.style.background = "transparent";
                          }}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            padding: "6px 10px",
                            color: "#cbd5e1",
                            fontSize: "13px",
                            cursor: "pointer",
                            borderRadius: "6px",
                            transition: "background 0.15s",
                            position: "relative",
                          }}
                        >
                          {editingChatId === chat.id ? (
                            <input
                              autoFocus
                              type="text"
                              value={editingTitle}
                              onChange={(e) => setEditingTitle(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  renameChat?.(chat.id, editingTitle);
                                  setEditingChatId(null);
                                } else if (e.key === "Escape") {
                                  setEditingChatId(null);
                                }
                              }}
                              onBlur={() => {
                                renameChat?.(chat.id, editingTitle);
                                setEditingChatId(null);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                background: "rgba(0, 0, 0, 0.4)",
                                border: "1px solid rgba(255, 255, 255, 0.2)",
                                borderRadius: "4px",
                                color: "#fff",
                                padding: "2px 6px",
                                fontSize: "13px",
                                flex: 1,
                                outline: "none",
                                marginRight: "8px",
                              }}
                            />
                          ) : (
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, paddingRight: "8px" }}>
                              {chat.title || "Chat"}
                            </span>
                          )}
                          <div style={{ display: "flex", alignItems: "center", color: "#6b7280", fontSize: "12px", flexShrink: 0 }}>
                            {showActions ? (
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span
                                  title="More options"
                                  style={{ cursor: "pointer", padding: "2px", display: "flex" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuChatId(openMenuChatId === chat.id ? null : chat.id);
                                  }}
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                                </span>
                                <span title="Pin" style={{ cursor: "pointer", padding: "2px", display: "flex" }} onClick={(e) => e.stopPropagation()}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path></svg>
                                </span>
                              </div>
                            ) : (
                              <span>{formatWsTimeAgo(chat.savedAt)}</span>
                            )}
                          </div>
                          {openMenuChatId === chat.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                position: "absolute",
                                top: "100%",
                                right: "8px",
                                zIndex: 99999,
                                background: "#181a1f",
                                border: "1px solid rgba(255, 255, 255, 0.08)",
                                borderRadius: "8px",
                                padding: "6px 0",
                                boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.4)",
                                minWidth: "170px",
                                display: "flex",
                                flexDirection: "column",
                              }}
                            >
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuChatId(null);
                                  setEditingChatId(chat.id);
                                  setEditingTitle(chat.title || "Chat");
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
                                  e.currentTarget.style.color = "#f8fafc";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = "transparent";
                                  e.currentTarget.style.color = "#cbd5e1";
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                  padding: "8px 14px",
                                  color: "#cbd5e1",
                                  fontSize: "13px",
                                  fontWeight: 500,
                                  cursor: "pointer",
                                  transition: "background 0.15s, color 0.15s",
                                }}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                                </svg>
                                <span>Rename</span>
                              </div>
                              <div
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuChatId(null);
                                  deleteChat?.(chat.id);
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
                                  e.currentTarget.style.color = "#f8fafc";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = "transparent";
                                  e.currentTarget.style.color = "#cbd5e1";
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "10px",
                                  padding: "8px 14px",
                                  color: "#cbd5e1",
                                  fontSize: "13px",
                                  fontWeight: 500,
                                  cursor: "pointer",
                                  transition: "background 0.15s, color 0.15s",
                                }}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                  <line x1="10" y1="11" x2="10" y2="17"></line>
                                  <line x1="14" y1="11" x2="14" y2="17"></line>
                                </svg>
                                <span>Delete Conversation</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}
      <div
        className="sb-sec"
        style={{ cursor: "pointer" }}
        onClick={() => setShowView(!showView)}
      >
        View
      </div>
      {showView && (
        <div className="sb-group">
          <Item
            icon={SB.hub({ width: 19, height: 19 })}
            label="Model Hub"
            active={view === "hub"}
            onClick={() => setView("hub")}
          />
          <Item
            icon={SB.key({ width: 19, height: 19 })}
            label="API Key"
            active={view === "settings"}
            onClick={() => setView("settings")}
          />
          <Item
            icon={SB.runner({ width: 19, height: 19 })}
            label="Agent Runner"
            active={view === "agents"}
            onClick={() => {
              setView("agents");
              onAgentRunner?.();
            }}
          />
        </div>
      )}
      <div
        className="sb-sec"
        style={{ cursor: "pointer" }}
        onClick={() => setShowTools(!showTools)}
      >
        Alat
      </div>
      {showTools && (
        <div className="sb-group">
          {/* Visual Picker & Visual Draw dipindah ke tombol menu panel (⋮ vertikal)
              di header "Web Dev Live Browser" — tak lagi di sidebar. */}
          <Item
            icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>}
            label="Terminal"
            active={terminalOpen}
            onClick={() => setTerminalOpen(!terminalOpen)}
          />
          <Item
            icon={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="6" height="5" rx="1"></rect><rect x="15" y="9" width="6" height="5" rx="1"></rect><rect x="9" y="15" width="6" height="5" rx="1"></rect><path d="M9 6.5h3a2 2 0 0 1 2 2v.5M9 17.5H6a2 2 0 0 1-2-2V9"></path></svg>}
            label="Workflow"
            active={view === "workflow"}
            onClick={() => setView("workflow")}
          />
        </div>
      )}
    </aside>
  );
}

// Live agent process � animated bubbles showing each file/folder being worked on.
// ─── Agent Step UI v2 ── SVG icons per tool ────────────────────────────────
const AG_SVG = {
  list:  (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><path d="M2 3h3v3H2zM2 7h3v3H2zM2 11h3v3H2z" fill="currentColor" opacity=".4"/><path d="M7 4h7M7 8h7M7 12h7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>,
  glob:  (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 2.5C6 5 6 11 8 13.5M8 2.5C10 5 10 11 8 13.5M2.5 8h11" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>,
  read:  (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><rect x="3" y="1.5" width="10" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M5.5 5h5M5.5 7.5h5M5.5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>,
  grep:  (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.4"/><path d="M10 10l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/><path d="M5 6.5h3M6.5 5v3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>,
  edit:  (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><path d="M10.5 2.5l3 3L5 14H2v-3L10.5 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M8.5 4.5l3 3" stroke="currentColor" strokeWidth="1.2"/></svg>,
  write: (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><rect x="2" y="2" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v6M5 8h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
  run:   (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><path d="M4 2.5l10 5.5-10 5.5V2.5z" fill="currentColor" opacity=".9"/></svg>,
  bash:  (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.3"/><path d="M4 6l2.5 2.5L4 11M8.5 11h3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  err:   (p) => <svg viewBox="0 0 16 16" fill="none" {...p}><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>,
};
const AG_META = {
  list:  { label:"List",  color:"var(--text-muted, #94a3b8)", bg:"transparent" },
  glob:  { label:"Glob",  color:"var(--text-muted, #94a3b8)", bg:"transparent" },
  read:  { label:"Read",  color:"var(--text-muted, #94a3b8)", bg:"transparent" },
  grep:  { label:"Grep",  color:"var(--text-muted, #94a3b8)", bg:"transparent" },
  edit:  { label:"Edit",  color:"var(--text-muted, #94a3b8)", bg:"transparent" },
  write: { label:"Write", color:"var(--text-muted, #94a3b8)", bg:"transparent" },
  run:   { label:"Run",   color:"var(--text-muted, #94a3b8)", bg:"transparent" },
  bash:  { label:"Bash",  color:"var(--text-muted, #94a3b8)", bg:"transparent" },
  err:   { label:"Error", color:"#f87171", bg:"rgba(248,113,113,0.12)" },
};
// Strip the DONE protocol marker so the agent's answer reads clean.
function cleanAgentText(s) {
  return (s || "")
    .replace(/^\s*```+\s*done\b[^\n]*\n?/i, "") // leading ```DONE fence (old protocol)
    .replace(/^\s*done\b[:\s]*/i, "") // leading "DONE" / "DONE:"
    .replace(/\n*\s*\bdone\b\s*$/i, "") // trailing standalone DONE
    .trim();
}
function ToolOutput({ text, ok, kind, arg }) {
  const [edReady, setEdReady] = useState(false);
  const hostRef = useRef(null);
  const edRef = useRef(null);
  // detect language from tool kind + file extension + content
  const language = useMemo(() => {
    if (kind === "read" && arg) {
      const ext = (arg || "").split(".").pop().toLowerCase();
      const langMap = {
        js: "javascript",
        jsx: "javascript",
        ts: "typescript",
        tsx: "typescript",
        py: "python",
        rb: "ruby",
        go: "go",
        rs: "rust",
        java: "java",
        c: "c",
        cpp: "cpp",
        dart: "dart",
        php: "php",
        yml: "yaml",
        yaml: "yaml",
        json: "json",
        xml: "xml",
        html: "html",
        css: "css",
        md: "markdown",
        sql: "sql",
        sh: "shell",
        bash: "shell",
        ps1: "powershell",
        cjs: "javascript",
        mjs: "javascript",
        kt: "kotlin",
        swift: "swift",
      };
      return langMap[ext] || "plaintext";
    }
    if (text) {
      if (
        /^(?:import|export|const|let|var|function|class|async|await|require)\b/m.test(
          text,
        )
      )
        return "javascript";
      if (/^(?:def |class |import |from |print\b)/m.test(text)) return "python";
      if (/^(?:fn |pub |let |mut |impl |enum |struct )/m.test(text))
        return "rust";
      if (/^(?:func |package |import |fmt\.)/m.test(text)) return "go";
      if (/^</m.test(text) && /<\/?[a-z]/i.test(text)) return "html";
      if (/^\{/m.test(text) || /"[^"]*"\s*:/m.test(text)) return "json";
      if (/^(?:#!|\$ |npm |git |cd |ls |echo |cat )/m.test(text))
        return "shell";
    }
    return "plaintext";
  }, [kind, arg, text]);
  // create Monaco editor
  useEffect(() => {
    let disposed = false;
    let retries = 0;
    if (!window.monacoReady) return;
    window.monacoReady.then((monaco) => {
      if (disposed || !hostRef.current) return;
      const tryCreate = () => {
        if (disposed || !hostRef.current) return;
        try {
          const ed = monaco.editor.create(hostRef.current, {
            value: text || "",
            language,
            theme: "vs-dark",
            automaticLayout: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            fontSize: 12,
            lineNumbers: "on",
            renderLineHighlight: "none",
            tabSize: 2,
            scrollbar: { alwaysConsumeMouseWheel: false },
            padding: { top: 6, bottom: 6 },
            wordWrap: "on",
            readOnly: true,
            domReadOnly: true,
            contextmenu: false,
            folding: true,
            glyphMargin: false,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 1,
          });
          edRef.current = ed;
          setEdReady(true);
          const fit = () => {
            if (!hostRef.current) return;
            hostRef.current.style.height =
              Math.min(Math.max(ed.getContentHeight(), 28), 400) + "px";
            ed.layout();
          };
          ed.onDidContentSizeChange(fit);
          fit();
        } catch (e) {
          if (retries < 10) {
            retries++;
            if (hostRef.current) hostRef.current.style.display = "block";
            setTimeout(tryCreate, 0);
          } else {
            setEdReady(false);
          }
        }
      };
      tryCreate();
    });
    return () => {
      disposed = true;
      if (edRef.current) {
        edRef.current.dispose();
        edRef.current = null;
      }
    };
  }, [language]);
  // follow text changes
  useEffect(() => {
    const ed = edRef.current;
    if (ed && ed.getValue() !== text) ed.setValue(text || "");
  }, [text]);
  return (
    <div className={"ar-out" + (ok ? "" : " err")}>
      <div
        className="ar-out-mona-host"
        ref={hostRef}
        style={{ display: edReady ? "block" : "none" }}
      />
      {!edReady && (
        <pre
          style={{
            margin: 0,
            font: "inherit",
            color: "inherit",
            background: "transparent",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          {text}
        </pre>
      )}
    </div>
  );
}

/* ── Agent Action Log (IDE Style) ── */
function AgentActionLogRow({ e, i, expanded, setExpanded }) {
  const isOpen = !!expanded[i];
  
  if (e.type === "thought") {
    const text = e.output || e.arg || "Thinking...";
    const sections = [];
    const lines = text.split('\n');
    let current = null;
    for (const line of lines) {
      const headingMatch = line.match(/^##\s+(.+)$/);
      if (headingMatch) {
        if (current) sections.push(current);
        current = { heading: headingMatch[1].trim(), body: '' };
      } else if (current) {
        current.body += line + '\n';
      }
    }
    if (current) sections.push(current);
    const hasSections = sections.length > 0;
    const displaySections = hasSections ? sections : [{ heading: 'Thinking', body: text }];
    return (
      <React.Fragment>
        <div className="aal-row aal-thought-header" onClick={() => setExpanded(p => ({...p, [i]: !isOpen}))}>
          <span>Thought Process</span>
          <span className={"aal-chevron" + (isOpen ? " open" : "")}>
            <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
        </div>
        {isOpen && (
          <div className="aal-thought-content">
            {displaySections.map((s, idx) => (
              <div key={idx} className="aal-thought-section">
                <div className="aal-thought-heading">{s.heading}</div>
                <div className="aal-thought-body">{s.body.trim()}</div>
              </div>
            ))}
          </div>
        )}
      </React.Fragment>
    );
  }
  
  let verb = "Ran";
  let target = e.arg || "";
  let icon = AG_SVG.bash;
  let color = "var(--text-muted, #8c959f)";
  let fileLang = null;
  
  if (e.kind) {
    const k = e.kind.toLowerCase();
    if (k.includes("grep") || k.includes("search")) { verb = "Searched"; icon = AG_SVG.grep; }
    else if (k.includes("read") || k.includes("view")) { verb = "Analyzed"; icon = AG_SVG.read; color = "#61dafb"; }
    else if (k.includes("edit") || k.includes("replace") || k.includes("write")) { verb = "Edited"; icon = AG_SVG.edit; color = "#ef4444"; }
    else if (k.includes("list") || k.includes("glob")) { verb = "Explored"; icon = AG_SVG.glob; }
  }

  if (verb !== "Ran" && verb !== "Explored" && target.includes(".")) {
    const ext = target.split(".").pop().toLowerCase();
    const lMap = {
      js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
      py: "python", rb: "ruby", go: "go", rs: "rust", java: "java",
      c: "c", cpp: "cpp", dart: "dart", php: "php", yml: "yaml", yaml: "yaml",
      json: "json", xml: "xml", html: "html", css: "css", md: "markdown",
      sql: "sql", sh: "shell", bash: "shell", ps1: "powershell",
      cjs: "javascript", mjs: "javascript", kt: "kotlin", swift: "swift"
    };
    if (lMap[ext]) fileLang = lMap[ext];
  }

  let added = 0; let removed = 0;
  if (verb === "Edited" && e.output && e.output.includes("@@")) {
    const lines = e.output.split("\n");
    added = lines.filter(l => l.startsWith("+") && !l.startsWith("+++")).length;
    removed = lines.filter(l => l.startsWith("-") && !l.startsWith("---")).length;
  }
  
  const SvgIcon = icon;

  return (
    <React.Fragment>
      <div className={"aal-row" + (e.output ? "" : " no-hover")} onClick={e.output ? () => setExpanded(p => ({...p, [i]: !isOpen})) : undefined}>
        <span>{verb}</span>
        {fileLang ? (
          <span className="aal-icon" style={{marginTop: "1px"}}><LangIcon lang={fileLang} /></span>
        ) : (
          SvgIcon && <span className="aal-icon" style={{color: color}}><SvgIcon width={13} height={13}/></span>
        )}
        <span className="aal-code-highlight">{target.substring(0,60) + (target.length>60?"...":"")}</span>
        
        {verb === "Edited" && (added > 0 || removed > 0) ? (
          <React.Fragment>
            <span className="aal-diff-add">+{added}</span>
            <span className="aal-diff-sub">-{removed}</span>
          </React.Fragment>
        ) : null}
        
        {e.output && (
          <span className={"aal-chevron" + (isOpen ? " open" : "")} style={{marginLeft: "auto"}}>
            <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </span>
        )}
      </div>
      
      {isOpen && e.output && (
        <div style={{margin: "4px 8px 12px 24px", border: "1px solid rgba(175,184,193,0.3)", borderRadius: "6px", overflow: "hidden"}}>
          <ToolOutput text={e.output} ok={e.ok} kind={e.kind} arg={e.arg} />
        </div>
      )}
    </React.Fragment>
  );
}

function GroupedActionRow({ group, expanded, setExpanded }) {
  const acts = group.acts;
  const isError = acts.some(a => !a.ok);
  const isOpen = expanded[group.id] !== false;
  return (
    <React.Fragment>
      <div className={"aal-row aal-group " + (isError ? "aal-error" : "")} onClick={() => setExpanded(p => ({...p, [group.id]: !isOpen}))}>
        <span className="aal-chevron" style={{marginRight: "6px"}}>{isOpen ? "▼" : "▶"}</span>
        <span>{acts.length} perintah dieksekusi</span>
        <span style={{marginLeft: "auto", fontSize: "11px", opacity: 0.6}}>
          {isError ? "Gagal" : "Sukses"}
        </span>
      </div>
      {isOpen && (
        <div style={{margin: "4px 8px 12px 24px", border: "1px solid rgba(175,184,193,0.3)", borderRadius: "6px", overflow: "hidden", display: "flex", flexDirection: "column"}}>
          {acts.map((a, j) => (
            <div key={j} style={j > 0 ? { borderTop: "1px solid rgba(175,184,193,0.3)" } : {}}>
              <div style={{ background: "#21262d", padding: "4px 12px", fontSize: "12px", color: "#8c959f", fontFamily: "monospace", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "#3fb950" }}>...\wolfspace &gt;</span> {a.arg || a.kind}
              </div>
              <ToolOutput text={a.output} ok={a.ok} kind={a.kind} arg={a.arg} />
            </div>
          ))}
        </div>
      )}
    </React.Fragment>
  );
}

function ConsolidatedThoughtCard({ thoughts, expanded, setExpanded }) {
  const isOpen = expanded['thought_card'] === true;
  const allSections = [];
  const bullets = [];
  thoughts.forEach((thought) => {
    const text = (thought.output || thought.arg || '').trim();
    if (!text) return;
    const hasHeadings = /^##\s+/m.test(text);
    if (hasHeadings) {
      const lines = text.split('\n');
      let current = null;
      for (const line of lines) {
        const headingMatch = line.match(/^##\s+(.+)$/);
        if (headingMatch) {
          if (current) allSections.push(current);
          current = { heading: headingMatch[1].trim(), body: '' };
        } else if (current) {
          current.body += line + '\n';
        }
      }
      if (current) allSections.push(current);
    } else {
      bullets.push(text);
    }
  });
  const totalSteps = allSections.length + bullets.length;
  if (totalSteps === 0) return null;
  return (
    <React.Fragment>
      <div className="aal-row aal-thought-header" onClick={() => setExpanded(p => ({...p, thought_card: !isOpen}))}>
        <span>Thought Process ({totalSteps} step{totalSteps > 1 ? 's' : ''})</span>
        <span className={"aal-chevron" + (isOpen ? " open" : "")}>
          <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
      </div>
      {isOpen && (
        <div className="aal-thought-content">
          {bullets.map((b, idx) => (
            <div key={'b'+idx} className="aal-thought-bullet">• {b}</div>
          ))}
          {allSections.map((s, idx) => (
            <div key={'s'+idx} className="aal-thought-section">
              <div className="aal-thought-heading">{s.heading}</div>
              <div className="aal-thought-body">{s.body.trim()}</div>
            </div>
          ))}
        </div>
      )}
    </React.Fragment>
  );
}

function AgentSteps({ run }) {
  const [expanded, setExpanded] = React.useState({});
  const allActs = (run.events || []).filter(e => e.type === "act" || e.type === "err" || e.type === "thought");
  const thoughts = allActs.filter(e => e.type === "thought");
  const acts = allActs.filter(e => e.type !== "thought");
  const summary = cleanAgentText(run.summary);

  if (run.done && allActs.length === 0 && !run.error)
    return (<React.Fragment><div className="bubble-model"><Blocks text={summary} /></div><Verdict run={run.run} /></React.Fragment>);
  if (!run.busy && allActs.length === 0 && run.error)
    return <div className="bubble-model" style={{color:"#fca5a5"}}>{summary || (run.events&&run.events[0]&&run.events[0].m) || "error"}</div>;

  const isTopOpen = expanded.top !== false;

  return (
    <div className="aal-container">
      <div className="aal-row" onClick={() => setExpanded(p => ({...p, top: !isTopOpen}))}>
        <span className="aal-code-highlight">Worked for {run.busy ? "..." : "1m"}</span>
        <span className={"aal-chevron" + (isTopOpen ? " open" : "")} style={{marginLeft: "auto"}}>
          <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor"><path d="M5 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
      </div>

      <div className={"aal-indent" + (isTopOpen ? "" : " aal-hidden")}>
        {thoughts.length > 0 && (
          <ConsolidatedThoughtCard thoughts={thoughts} expanded={expanded} setExpanded={setExpanded} />
        )}
        {(() => {
          const groupedActs = [];
          let currentGroup = null;
          acts.forEach((e, idx) => {
            if (e.type === "act") {
              if (!currentGroup) {
                currentGroup = [];
                groupedActs.push({ type: "group", acts: currentGroup, id: "g" + idx });
              }
              currentGroup.push({ ...e, originalIndex: idx });
            } else {
              currentGroup = null;
              groupedActs.push({ type: "single", event: e, originalIndex: idx });
            }
          });
          return groupedActs.map((item, idx) => {
            if (item.type === "group") return <GroupedActionRow key={"g"+idx} group={item} expanded={expanded} setExpanded={setExpanded} />;
            return <AgentActionLogRow key={"s"+idx} e={item.event} i={item.originalIndex} expanded={expanded} setExpanded={setExpanded} />;
          });
        })()}
        {run.busy && (
           <div className="aal-row aal-thought-header">
             <span>{run.thinking ? "Thinking..." : "Memproses..."}</span>
           </div>
        )}
      </div>
      
      {run.done && (summary || run.run) ? (
        <div style={{marginTop: "8px"}}>
          {summary ? <div className="bubble-model av2-result-bubble"><Blocks text={summary} /></div> : null}
          <Verdict run={run.run} />
        </div>
      ) : null}
    </div>
  );
}

function HitlModal({ request, onResolve }) {
  const [selected, setSelected] = React.useState(0);
  if (!request) return null;

  return (
    <div className="hitl-overlay">
      <div className="hitl-modal">
        <div className="hitl-title">{request.title || "Allow action?"}</div>
        {request.code && (
          <div className="hitl-code-box">
            {request.code}
          </div>
        )}
        <div className="hitl-options">
          {(request.options || [
            { value: "allow_once", text: "Yes, allow this time" },
            { value: "allow_project", text: "Yes, and always allow in this project" },
            { value: "allow_always", text: "Yes, and always allow" },
            { value: "deny", text: "No (tell the agent what to do instead)" }
          ]).map((opt, i) => (
            <div 
              key={i} 
              className={"hitl-option " + (selected === i ? "selected" : "")}
              onClick={() => setSelected(i)}
            >
              <div className="hitl-badge">{i + 1}</div>
              <div className="hitl-text">
                {opt.text.replace(" (tell the agent what to do instead)", "")}
                {opt.text.includes("instead") && (
                  <span className="hitl-text-muted"> (tell the agent what to do instead)</span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="hitl-footer">
          <button className="hitl-btn-skip" onClick={() => onResolve(null)}>Skip</button>
          <button className="hitl-btn-submit" onClick={() => {
            const opts = request.options || [];
            const val = opts[selected] ? opts[selected].value : selected;
            onResolve(val);
          }}>
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- App ----------------------------- */
const SUGGESTIONS = [];

/* ═══════════════════════════════════════════════════════════
   PROJECT PICKER SCREEN
   Shown once on startup. Disappears after first message sent.
═══════════════════════════════════════════════════════════ */
const PICKER_WORKSPACES = [
  { name: "resilient-bose", active: true },
  { name: "excited-turing" },
  { name: "peaceful-maxwell" },
  { name: "eager-hertz" },
];
function PickerFolderIcon({ size = 15 }) {
  return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5" },
    React.createElement("path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" }));
}
function PickerMonitorIcon({ size = 15 }) {
  return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" },
    React.createElement("rect", { x: "2", y: "3", width: "20", height: "14", rx: "2", ry: "2" }),
    React.createElement("line", { x1: "8", y1: "21", x2: "16", y2: "21" }),
    React.createElement("line", { x1: "12", y1: "17", x2: "12", y2: "21" }));
}
function PickerChevIcon({ size = 12 }) {
  return React.createElement("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" },
    React.createElement("polyline", { points: "6 9 12 15 18 9" }));
}
function PickerPlusIcon() {
  return React.createElement("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5" },
    React.createElement("line", { x1: "12", y1: "5", x2: "12", y2: "19" }),
    React.createElement("line", { x1: "5", y1: "12", x2: "19", y2: "12" }));
}
function PickerSendIcon() {
  return React.createElement("svg", { width: 16, height: 16, viewBox: "0 0 24 24", fill: "#9bb1d1", stroke: "none" },
    React.createElement("path", { d: "M2 21L23 12 2 3v7l15 2-15 2z", transform: "rotate(-45 12 12)" }));
}
function getPickerProjectsList() {
  const defaultDefaults = [
    { name: "WOLFSPACE", path: "c:\\Users\\dave\\quantum" },
    { name: "project", path: "c:\\Users\\dave\\project" },
  ];
  try {
    const deleted = JSON.parse(localStorage.getItem("quantum_deleted_workspaces") || "[]");
    // Cocok HANYA berdasar path persis — bukan nama/suffix (lihat isPathDeleted).
    const isDel = (p) => isPathDeleted(deleted, p && p.path);
    const stored = JSON.parse(localStorage.getItem("quantum_projects_list") || "[]");
    if (stored && stored.length > 0) {
      const filtered = stored.filter((p) => !isDel(p));
      if (filtered.length > 0) return filtered;
    }
    return defaultDefaults.filter((p) => !isDel(p));
  } catch (_) {}
  return defaultDefaults;
}

// Isi dropdown project — DIPISAH dari ProjectPickerScreen supaya "hidup" hanya
// selama dropdown terbuka: setiap kali di-mount (dropdown dibuka), ia MEMBACA
// ULANG localStorage dari nol (bukan mewarisi state induk yang di-patch). Ini
// men-decouple "tulis data" (attachFolder, sudah selalu benar — terbukti lewat
// reload) dari "tampilkan data": render di sini tidak pernah bergantung pada
// apakah patch state sebelumnya sempat ter-commit+ter-paint saat window
// kehilangan/mendapat fokus OS (dialog folder native) — ia selalu mulai fresh,
// persis seperti reload manual, tanpa reload sungguhan dan tanpa reset layar lain.
function ProjectDropdownMenu({ currentProject, onSelectProject, onNewProject }) {
  const [projectsList] = useState(() => getPickerProjectsList());
  return (
    <div className="picker-ws-dropdown">
      <button className="picker-ws-item" onClick={onNewProject}>
        <PickerFolderIcon /> New Project
      </button>
      {projectsList.length > 0 && <div className="picker-ws-divider" />}
      <div className="picker-ws-scroll-area">
        {projectsList.map((p, idx) => (
          <button
            key={idx}
            className={"picker-ws-item" + (currentProject === p.name ? " active" : "")}
            onClick={() => onSelectProject(p.name)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, color: "#f8fafc" }}>
              <PickerFolderIcon />
              <span>{p.name}</span>
            </span>
            {p.path && (
              <span style={{ fontSize: "12px", color: "#6b7280", opacity: 0.85, whiteSpace: "nowrap" }}>
                {p.path}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ProjectPickerScreen({ onStart, models = [], modelVal, setModelVal }) {
  // CATATAN: daftar project TIDAK disimpan sebagai state di sini lagi — sengaja.
  // ProjectDropdownMenu membaca localStorage sendiri, fresh, tiap kali di-mount
  // (dropdown dibuka). Ini memutus ketergantungan pada patch state yang rentan
  // gagal ter-paint saat window kehilangan/mendapat fokus OS (dialog native).
  const [project, setProject] = useState(() => {
    const list = getPickerProjectsList();
    return list.length > 0 ? list[0].name : "WOLFSPACE";
  });
  React.useEffect(() => {
    const reloadProjects = () => {
      const list = getPickerProjectsList();
      setProject((cur) => {
        if (list.some((p) => p.name === cur)) return cur;
        return list.length > 0 ? list[0].name : "";
      });
    };
    window.addEventListener("quantum_workspaces_changed", reloadProjects);
    return () => window.removeEventListener("quantum_workspaces_changed", reloadProjects);
  }, []);
  // Rekonsiliasi disk: buang "hantu" dari quantum_projects_list — project yang
  // FOLDERNYA sudah tak ada di disk, DI MANA PUN lokasinya (bukan cuma di bawah root
  // ww). Verifikasi keberadaan tiap path ke backend (/ww/verify); hanya yang
  // dipastikan TIDAK ADA yang dibuang (konservatif). Membersihkan localStorage
  // permanen → picker & sidebar sama-sama bersih.
  React.useEffect(() => {
    (async () => {
      let stored;
      try {
        stored = JSON.parse(localStorage.getItem("quantum_projects_list") || "[]");
      } catch {
        return;
      }
      if (!Array.isArray(stored) || !stored.length) return;
      const paths = stored.map((p) => p && p.path).filter(Boolean);
      if (!paths.length) return;
      const res = await wwApi("/ww/verify", { method: "POST", body: { paths } });
      if (!res || !res.exists) return; // gagal cek → jangan buang apa-apa
      const gone = new Set(
        Object.entries(res.exists)
          .filter(([, ok]) => ok === false)
          .map(([p]) => p),
      );
      if (!gone.size) return;
      const kept = stored.filter((p) => !(p && p.path && gone.has(p.path)));
      if (kept.length !== stored.length) {
        localStorage.setItem("quantum_projects_list", JSON.stringify(kept));
        window.dispatchEvent(new Event("quantum_workspaces_changed"));
      }
    })();
  }, []);
  const [dropOpen, setDropOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showMcpMenu, setShowMcpMenu] = useState(false);
  const [pickerEffort, setPickerEffort] = useState(() => {
    try {
      const cl = getCloud();
      if (cl && typeof cl.effort !== "undefined") return Number(cl.effort);
      return parseInt(localStorage.getItem("quantum_effort") || "1", 10) || 0;
    } catch { return 1; }
  });
  const [pickerMcp, setPickerMcp] = useState([
    { id: 'github', name: 'GitHub & Git Tools', desc: 'Access repositories, issues, pull requests, and code diffs', active: true },
    { id: 'filesystem', name: 'Local Filesystem & Ripgrep', desc: 'Direct workspace editing, directory analysis, and fast pattern search', active: true },
    { id: 'browser', name: 'Browser Subagent (Puppeteer)', desc: 'Web scraping, DOM inspection, screenshot capture, and UI testing', active: false }
  ]);
  useEffect(() => {
    try {
      localStorage.setItem("quantum_effort", String(pickerEffort));
      const cl = getCloud();
      if (cl) { cl.effort = pickerEffort; setCloudLS(cl); }
    } catch (_) {}
  }, [pickerEffort]);
  const wrapRef = useRef(null);
  const taRef = useRef(null);
  // Penjaga anti-tutup BERBASIS STATUS (bukan tebakan durasi — terbukti rapuh,
  // penutupan pernah terjadi >500ms setelah attachFolder selesai). Aktif TERUS
  // sepanjang: dialog native dibuka → attach selesai → dropdown reopen dirender.
  // Root cause TERKONFIRMASI via trace: dropdown reopen (dropOpen=true, item baru
  // ADA di daftar) tapi tertutup lagi oleh mousedown pada DIV.project-picker-screen
  // (BUKAN item spesifik) — event "sisa" saat fokus jendela kembali dari dialog OS.
  const nativeDialogActiveRef = useRef(false);
  useEffect(() => {
    const h = (e) => {
      const outside = wrapRef.current && !wrapRef.current.contains(e.target);
      if (!outside) return;
      if (nativeDialogActiveRef.current) {
        return;
      }
      setDropOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const grow = () => {
    const el = taRef.current; if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };
  const handleAttachmentSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const target = e.target;
    for (const file of files) {
      const relPath = file.webkitRelativePath || file.name;
      const attId = Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      const isImg = /\.(png|jpe?g|webp|gif|svg|bmp|ico)$/i.test(file.name) || (file.type && file.type.startsWith("image/"));
      const isVid = /\.(mp4|webm|mov|mkv)$/i.test(file.name) || (file.type && file.type.startsWith("video/"));
      let previewUrl = (isImg || isVid) ? URL.createObjectURL(file) : null;
      let snippet = null;
      if (!isImg && !isVid && file.size < 100 * 1024 && /\.(js|py|jsx|ts|tsx|html|css|json|md|txt|sql|java|c|cpp|h|rust|go|sh|yml|yaml)$/i.test(file.name)) {
        try { snippet = await file.slice(0, 300).text(); } catch (_) {}
      }
      setAttachments((prev) => [
        ...prev,
        { id: attId, name: file.name, path: relPath, size: file.size, type: file.type, previewUrl, snippet, status: "uploading" },
      ]);
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = reader.result.split(',')[1] || reader.result;
            const payload = { name: relPath, data: base64 };
            let uploadedUrl = "";
            if (window.IPC && window.IPC.invoke) {
              const res = await window.IPC.invoke("api", { method: "POST", path: "/upload", body: payload });
              let parsed; try { parsed = typeof res.body === 'string' ? JSON.parse(res.body) : res; } catch (_) { parsed = res; }
              if (res.status >= 400 || parsed.error) throw new Error(parsed.error || "Upload failed");
              uploadedUrl = parsed.url || ("/uploads/" + parsed.name);
            } else {
              const r = await fetch("/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
              const res = await r.json();
              if (res.error) throw new Error(res.error);
              uploadedUrl = res.url || ("/uploads/" + res.name);
            }
            setAttachments((prev) => prev.map((a) => (a.id === attId ? { ...a, status: "ready", url: uploadedUrl, previewUrl: a.previewUrl || (isImg ? uploadedUrl : null) } : a)));
          } catch (err) {
            console.error("[Attachment upload error]", err);
            setAttachments((prev) => prev.map((a) => (a.id === attId ? { ...a, status: "error", error: err.message } : a)));
          }
        };
        reader.onerror = () => {
          setAttachments((prev) => prev.map((a) => (a.id === attId ? { ...a, status: "error", error: "Failed reading file" } : a)));
        };
        reader.readAsDataURL(file);
      } catch (err) {
        setAttachments((prev) => prev.map((a) => (a.id === attId ? { ...a, status: "error", error: err.message } : a)));
      }
    }
    target.value = "";
  };
  const onRemoveAttachment = (id) => setAttachments(prev => prev.filter(a => a.id !== id));
  const submit = () => { 
    const v = text.trim(); 
    if (!v && attachments.length === 0) return; 
    let fullText = v;
    if (attachments.length > 0) {
      const attSummary = attachments
        .map((a) => `- [Attached]: ${a.path} (${Math.round(a.size / 1024)} KB${a.url ? `, url: ${a.url}` : ""})`)
        .join("\n");
      fullText = v ? `${v}\n\nAttachments:\n${attSummary}` : `Attachments:\n${attSummary}`;
    }
    const selectedObj = getPickerProjectsList().find((p) => p.name === project);
    const chosenPath = selectedObj ? selectedObj.path : (project.includes(":") || project.includes("/") || project.includes("\\") ? project : `c:\\Users\\dave\\${project}`);
    onStart(fullText, chosenPath);
  };
  // Pasang folder ke WOLFSPACE = beri worktree+branch terikat ke alamat aslinya
  // (lewat /ww/attach). Idempoten & non-destruktif. Simpan dgn path yang benar.
  // Guard anti-dobel: cegah 2 panggilan attach untuk path yang sama nyaris bersamaan
  // (mis. double-fire dari native dialog / event) — bukan berbahaya (backend
  // idempoten), tapi tak perlu 2x panggilan untuk 1 aksi user.
  const attachInFlightRef = useRef(new Set());
  const attachFolder = async (folderPath, folderName) => {
    const key = folderPath.toLowerCase();
    if (attachInFlightRef.current.has(key)) {
      return;
    }
    attachInFlightRef.current.add(key);
    let att;
    try {
      att = await wwApi("/ww/attach", { method: "POST", body: { path: folderPath } });
    } finally {
      attachInFlightRef.current.delete(key);
    }
    const finalPath = (att && att.path) || folderPath;
    const finalName = (att && att.name) || folderName;
    // Tulis LANGSUNG ke localStorage (sumber kebenaran) — tanpa lewat state React.
    // ProjectDropdownMenu akan membaca ini FRESH begitu ia mount (lihat setDropOpen
    // di bawah), jadi urutan "tulis dulu, baru render" terjamin oleh urutan
    // eksekusi JS itu sendiri, bukan oleh timing commit/paint React yang rentan.
    const rest = getPickerProjectsList().filter((p) => (p.path || "") !== finalPath);
    const updated = [{ name: finalName, path: finalPath, branch: att && att.branch }, ...rest];
    localStorage.setItem("quantum_projects_list", JSON.stringify(updated));
    // Memasang ulang sebuah folder = MENCORETNYA dari daftar-hapus. Tanpa ini,
    // folder yang pernah dihapus lalu ditambах lagi akan tetap tersaring isDel.
    try {
      const del = JSON.parse(localStorage.getItem("quantum_deleted_workspaces") || "[]");
      const pruned = del.filter((d) => normDelPath(d) !== normDelPath(finalPath));
      if (pruned.length !== del.length) {
        localStorage.setItem("quantum_deleted_workspaces", JSON.stringify(pruned));
      }
    } catch (_) {}
    setProject(finalName);
    window.dispatchEvent(new Event("quantum_workspaces_changed"));
    // Dropdown tertutup sejak dialog native dibuka (handleOpenFolderPicker). Set
    // true di sini MEMBANGUN ProjectDropdownMenu dari NOL (mount baru, bukan
    // patch instance lama) — ia membaca localStorage yang BARU SAJA ditulis di
    // atas, sehingga folder baru LANGSUNG terlihat tanpa bergantung pada apakah
    // render sebelumnya sempat ter-paint saat window kehilangan fokus OS.
    setDropOpen(true);
    // Lepas penjaga SESAAT setelah render (2 frame) — bukan langsung, supaya mousedown
    // "sisa" yang tiba tepat bersamaan dengan render dropdown ini juga masih tertekan.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        nativeDialogActiveRef.current = false;
      }),
    );
  };
  const handleOpenFolderPicker = async () => {
    setDropOpen(false);
    nativeDialogActiveRef.current = true; // aktif dari SEBELUM dialog dibuka
    try {
      // Electron: dialog native → path absolut ASLI (folder di C:, D:, Desktop, mana pun).
      if (IPC && IPC.invoke) {
        const r = await IPC.invoke("selectFolder");
        if (!r || r.canceled || !r.path) {
          nativeDialogActiveRef.current = false;
          return;
        }
        const name = r.path.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
        await attachFolder(r.path, name);
        return;
      }
      nativeDialogActiveRef.current = false;
      // Browser: File System Access API (path tak asli — ditebak di home).
      if (window.showDirectoryPicker) {
        const dirHandle = await window.showDirectoryPicker();
        if (dirHandle && dirHandle.name) {
          await attachFolder(`c:\\Users\\dave\\${dirHandle.name}`, dirHandle.name);
          return;
        }
      }
    } catch (err) {
      nativeDialogActiveRef.current = false; // jangan macet permanen kalau error
      if (err && err.name === "AbortError") return;
      console.error("[FolderPicker]", err);
    }
    document.getElementById("picker-workspace-folder-input")?.click();
  };
  const handleWorkspaceFolderSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    let folderName = "New Project";
    let folderPath = "";
    const first = files[0];
    const relPath = first.webkitRelativePath || first.name || "";
    if (relPath.includes("/")) {
      folderName = relPath.split("/")[0];
    } else if (first.path) {
      const parts = first.path.replace(/\\/g, "/").split("/");
      const idx = parts.indexOf(relPath);
      if (idx > 0) {
        folderName = parts[idx - 1];
        folderPath = parts.slice(0, idx).join("\\");
      } else if (parts.length > 1) {
        folderName = parts[parts.length - 2];
        folderPath = parts.slice(0, parts.length - 1).join("\\");
      } else {
        folderName = relPath;
      }
    } else {
      folderName = relPath;
    }
    if (!folderPath) folderPath = `c:\\Users\\dave\\${folderName}`;
    e.target.value = "";
    attachFolder(folderPath, folderName); // pasang = isolasi terikat ke path
  };
  return (
    <div className="project-picker-screen" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}>
      <input type="file" id="picker-file-upload" multiple style={{ display: "none" }} onChange={handleAttachmentSelect} />
      <input type="file" id="picker-folder-upload" webkitdirectory="true" directory="true" multiple style={{ display: "none" }} onChange={handleAttachmentSelect} />
      <input type="file" id="picker-workspace-folder-input" webkitdirectory="true" directory="true" multiple style={{ display: "none" }} onChange={handleWorkspaceFolderSelect} />
      <div className="project-picker-inner">
        <div className="picker-brand-mark">
          <Icon.wolf />
          <span className="picker-brand-name">WOLFSPACE</span>
        </div>
        <div className="picker-input-box" style={{ position: 'relative' }}>
          {menu && (
            <div className="am-menu" style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 0, right: 0, zIndex: 200 }} onMouseDown={(e) => e.stopPropagation()}>
              <input type="text" className="am-search" placeholder="Filter actions..." autoFocus />

              <div className="am-section-label">Context</div>
              <button className="am-item" onClick={() => { setMenu(false); document.getElementById("picker-file-upload")?.click(); }}>
                <span>Attach file...</span>
              </button>

              <div className="am-section-label" style={{ marginTop: '8px' }}>Model</div>
              <div style={{ position: 'relative' }}>
                <button
                  className={"am-item" + (showModelMenu ? " active" : "")}
                  onClick={(e) => { e.stopPropagation(); setShowMcpMenu(false); setShowModelMenu(!showModelMenu); }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>Switch model...</span>
                  <span className="am-item-right">{models.find(m => m.value === modelVal)?.label || "Sonnet"}</span>
                </button>
                {showModelMenu && (
                  <div className="am-submenu">
                    <div className="am-section-label" style={{ marginBottom: '4px' }}>Select a model</div>
                    {models.filter(m => !m.disabled).map(m => (
                      <button key={m.value} className="am-item" style={{ padding: '8px 12px' }} onClick={(e) => { e.stopPropagation(); if (setModelVal) setModelVal(m.value); setShowModelMenu(false); }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                          <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                            {m.label} {m.value === modelVal && <span>✓</span>}
                          </span>
                          <span className="am-item-desc">Efficient for routine tasks</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="am-item" onClick={(e) => { e.stopPropagation(); setPickerEffort((pickerEffort + 1) % 3); }}>
                <span>Effort ({pickerEffort === 0 ? "Low" : pickerEffort === 1 ? "Medium" : "High"})</span>
                <span className="am-item-right">
                  <div className="am-slider">
                    <div className={"am-slider-dot" + (pickerEffort >= 0 ? " active" : "")}></div>
                    <div className={"am-slider-dot" + (pickerEffort >= 1 ? " active" : "")}></div>
                    <div className={"am-slider-dot" + (pickerEffort >= 2 ? " active" : "")}></div>
                  </div>
                </span>
              </button>

              <div className="am-section-label" style={{ marginTop: '8px' }}>Connection</div>
              <div style={{ position: 'relative' }}>
                <button
                  className={"am-item" + (showMcpMenu ? " active" : "")}
                  onClick={(e) => { e.stopPropagation(); setShowModelMenu(false); setShowMcpMenu(!showMcpMenu); }}
                >
                  <span>MCP</span>
                  <span className="am-item-right">
                    <span>Manage servers</span>
                    <span style={{ fontSize: '10px' }}>▶</span>
                  </span>
                </button>
                {showMcpMenu && (
                  <div className="am-submenu">
                    <div className="am-section-label" style={{ marginBottom: '4px' }}>Select an MCP connection</div>
                    {pickerMcp.map(srv => (
                      <button key={srv.id} className="am-item" style={{ padding: '8px 12px' }} onClick={(e) => { e.stopPropagation(); setPickerMcp(prev => prev.map(item => item.id === srv.id ? { ...item, active: !item.active } : item)); }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                          <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 500, color: '#fff' }}>{srv.name}</span>
                            {srv.active ? (
                              <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 6px', borderRadius: '10px', color: '#4ec9b0', background: 'rgba(78, 201, 176, 0.12)' }}>✓ Connected</span>
                            ) : (
                              <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 6px', borderRadius: '10px', color: '#858585', background: 'rgba(133, 133, 133, 0.12)' }}>○ Disabled</span>
                            )}
                          </span>
                          <span className="am-item-desc">{srv.desc}</span>
                        </div>
                      </button>
                    ))}
                    <div style={{ padding: '8px 12px', borderTop: '1px solid #3e3e42', marginTop: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#b594f5', cursor: 'pointer', fontWeight: 500 }}>+ Add custom MCP server (JSON)...</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="picker-input-area">
            {attachments.length > 0 && (
              <div className="composer-attachments" style={{ paddingBottom: '10px' }}>
                {attachments.map((a) => (
                  <div key={a.id} className="composer-attachment-item">
                    {a.previewUrl ? (
                      <img src={a.previewUrl} className="composer-attachment-icon" alt="" />
                    ) : (
                      <div className="composer-attachment-icon">{a.name.slice(0, 2).toUpperCase()}</div>
                    )}
                    <div className="composer-attachment-name" style={{ fontSize: "9px", width: "100%", textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                    <button className="composer-attachment-remove" onClick={() => onRemoveAttachment(a.id)}>×</button>
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={taRef}
              className="picker-textarea"
              rows={1}
              placeholder="Apa yang ingin kamu buat hari ini?"
              value={text}
              onChange={e => { setText(e.target.value); grow(); }}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            />
            <div className="picker-toolbar">
              <button className={"picker-plus-btn" + (menu ? " open" : "")} onClick={() => setMenu(m => !m)}>
                <PickerPlusIcon />
              </button>
              <button className="picker-send-btn" onClick={submit} disabled={!text.trim() && attachments.length === 0}>
                <PickerSendIcon />
              </button>
            </div>
          </div>
          <div className="picker-divider" />
          <div className="picker-bottom-row">
            <div className="picker-ws-wrap" ref={wrapRef}>
              <button className="picker-workspace-btn" onClick={() => setDropOpen(o => !o)}>
                {project === "Quick Start" ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="15 3 21 3 21 9" /><path d="M10 14L21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                  </svg>
                ) : (
                  <PickerFolderIcon />
                )}
                <span>{project}</span>
                <PickerChevIcon />
              </button>
              {dropOpen && (
                <ProjectDropdownMenu
                  currentProject={project}
                  onNewProject={handleOpenFolderPicker}
                  onSelectProject={(name) => {
                    setProject(name);
                    setDropOpen(false);
                  }}
                />
              )}
            </div>
            <button className="picker-bottom">
              <PickerMonitorIcon /> Local <PickerChevIcon size={11} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- VS Code Style Terminal ----------------------------- */
function VSCodeTerminal({ selectedProject, onClose, agentOutput, terminalOutput, messages = [] }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const sessionIdRef = useRef(null);
  const [activeTab, setActiveTab] = useState("TERMINAL");
  const [statusText, setStatusText] = useState("Connecting PTY...");

  // Build a clean, formatted AI output log from the main UI messages + any agent/terminal output
  const mainUiAiLog = useMemo(() => {
    if (agentOutput) return agentOutput;
    if (terminalOutput) return terminalOutput;

    // Filter for model / agent / assistant messages from main chat UI
    const aiMsgs = messages.filter(
      (m) => m && (m.role === "model" || m.role === "agent" || m.role === "assistant" || m.role === "ai")
    );

    if (aiMsgs.length === 0) return null;

    return aiMsgs
      .map((m, idx) => {
        if (m.role === "agent" && m.agent) {
          const ag = m.agent;
          let log = `[Main UI AI Agent Phase #${idx + 1}]`;
          if (ag.thinking) log += `\nThinking:\n${ag.thinking}`;
          if (ag.events && ag.events.length > 0) {
            log += `\nActions Executed (${ag.events.length}):`;
            ag.events.forEach((ev) => {
              if (ev.type === "thought") log += `\n  - Tool ${ev.kind || ""}: ${ev.arg || ev.output || ""}`;
              else if (ev.type === "act") log += `\n  - Executed ${ev.kind || ""}: ${ev.arg || ""} => ${ev.ok ? "OK" : "ERR"} ${ev.output || ""}`;
              else if (ev.type === "err") log += `\n  - Error: ${ev.m || ""}`;
            });
          }
          if (ag.summary) log += `\nSummary: ${ag.summary}`;
          return log;
        } else {
          return `[Main UI AI Output #${idx + 1}]\n${m.text || m.content || ""}`;
        }
      })
      .join("\n\n------------------------------------------------------------\n\n");
  }, [agentOutput, terminalOutput, messages]);

  const restartSession = async () => {
    if (sessionIdRef.current) {
      try {
        await fetch("/api/terminal/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: sessionIdRef.current }),
        });
      } catch (_) {}
      sessionIdRef.current = null;
    }
    if (termRef.current) {
      termRef.current.clear();
    }
    const targetCwd =
      typeof selectedProject === "object" && selectedProject !== null
        ? selectedProject.path || selectedProject.dir || undefined
        : typeof selectedProject === "string" && selectedProject.trim() !== ""
        ? selectedProject.trim()
        : undefined;
    try {
      const res = await fetch("/api/terminal/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cwd: targetCwd }),
      });
      if (res.ok) {
        const data = await res.json();
        sessionIdRef.current = data.id;
        setStatusText(`Shell: ${data.shell || "powershell"} (${targetCwd || "default"})`);
        if (termRef.current) {
          termRef.current.focus();
        }
      } else {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        setStatusText("Error spawning terminal");
        if (termRef.current) termRef.current.write(`\r\n\x1b[31m[Error] Failed to open PTY session: ${err.error || "Unknown error"}\x1b[0m\r\n`);
      }
    } catch (e) {
      setStatusText("Offline / No PTY");
      if (termRef.current) termRef.current.write(`\r\n\x1b[31m[Error] Cannot connect to /api/terminal/open (${e.message}). Ensure server is running.\x1b[0m\r\n`);
    }
  };

  useEffect(() => {
    if (!containerRef.current || !window.Terminal) return;
    const term = new window.Terminal({
      cols: 100,
      rows: 25,
      scrollback: 5000,
      fontFamily: '"JetBrains Mono", Consolas, "Cascadia Code", monospace',
      fontSize: 13,
      cursorStyle: "block",
      cursorBlink: true,
      theme: {
        background: "#181c20",
        foreground: "#e2e8f0",
        cursor: "#ffffff",
        cursorAccent: "#181c20",
        selection: "rgba(56, 139, 253, 0.4)",
      },
      allowProposedApi: true,
    });

    const FitAddonCtor =
      window.FitAddon?.FitAddon ||
      window.FitAddon ||
      window.fitAddon?.FitAddon ||
      window.xterm?.FitAddon;
    let fit = null;
    if (FitAddonCtor) {
      fit = new FitAddonCtor();
      term.loadAddon(fit);
    }

    term.open(containerRef.current);
    if (fit) {
      try { fit.fit(); } catch (_) {}
    }
    termRef.current = term;
    fitRef.current = fit;
    term.focus();

    term.onData((data) => {
      if (!sessionIdRef.current) return;
      fetch("/api/terminal/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionIdRef.current, data }),
      }).catch(() => {});
    });

    term.onResize(({ cols, rows }) => {
      if (!sessionIdRef.current) return;
      fetch("/api/terminal/resize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: sessionIdRef.current, cols, rows }),
      }).catch(() => {});
    });

    let resizeDebounce = null;
    const doFit = () => {
      clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(() => {
        if (fitRef.current) {
          try { fitRef.current.fit(); } catch (_) {}
        }
      }, 100);
    };
    const ro = new ResizeObserver(() => doFit());
    ro.observe(containerRef.current);
    window.addEventListener("resize", doFit);

    restartSession();

    const readInterval = setInterval(async () => {
      if (!sessionIdRef.current || !termRef.current) return;
      try {
        const res = await fetch("/api/terminal/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: sessionIdRef.current, clear: true }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.output && termRef.current) {
            termRef.current.write(data.output);
          }
        }
      } catch (_) {}
    }, 75);

    return () => {
      clearInterval(readInterval);
      clearTimeout(resizeDebounce);
      ro.disconnect();
      window.removeEventListener("resize", doFit);
      if (sessionIdRef.current) {
        fetch("/api/terminal/close", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: sessionIdRef.current }),
        }).catch(() => {});
      }
      try { term.dispose(); } catch (_) {}
      termRef.current = null;
    };
  }, [selectedProject]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "#181c20", borderTop: "1px solid var(--line, #1f2733)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: "36px", padding: "0 12px", background: "var(--surface-1, #0f1318)", borderBottom: "1px solid var(--line, #1f2733)", flexShrink: 0, userSelect: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "18px", height: "100%" }}>
          <button
            onClick={() => {
              setActiveTab("TERMINAL");
              setTimeout(() => {
                fitRef.current?.fit();
                termRef.current?.focus();
              }, 10);
            }}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "TERMINAL" ? "2px solid var(--brand, #5eead4)" : "2px solid transparent",
              color: activeTab === "TERMINAL" ? "#ffffff" : "#8b949e",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.5px",
              cursor: "pointer",
              height: "100%",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "0 4px",
              fontFamily: "inherit"
            }}
          >
            <span>TERMINAL</span>
            <span style={{ fontSize: "10px", background: "rgba(255,255,255,0.08)", padding: "1px 5px", borderRadius: "8px", color: "#8b949e" }}>local</span>
          </button>
          <button
            onClick={() => setActiveTab("OUTPUT")}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeTab === "OUTPUT" ? "2px solid var(--brand, #5eead4)" : "2px solid transparent",
              color: activeTab === "OUTPUT" ? "#ffffff" : "#8b949e",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.5px",
              cursor: "pointer",
              height: "100%",
              display: "flex",
              alignItems: "center",
              padding: "0 4px",
              fontFamily: "inherit"
            }}
          >
            OUTPUT
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "11px", color: "#6e7681", marginRight: "6px" }}>{statusText}</span>
          <button
            onClick={restartSession}
            title="New / Restart Terminal Session"
            style={{ background: "transparent", border: "none", color: "#c9d1d9", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px", borderRadius: "4px" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
          <button
            onClick={() => {
              if (termRef.current) termRef.current.clear();
            }}
            title="Clear Terminal"
            style={{ background: "transparent", border: "none", color: "#c9d1d9", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px", borderRadius: "4px" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
          </button>
          <button
            onClick={onClose}
            title="Close Terminal Panel"
            style={{ background: "transparent", border: "none", color: "#c9d1d9", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: "4px", borderRadius: "4px" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>

      <div style={{ flex: 1, width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
        <div
          ref={containerRef}
          style={{
            width: "100%",
            height: "100%",
            padding: "6px 8px",
            display: activeTab === "TERMINAL" ? "block" : "none",
          }}
        />
        <div
          style={{
            display: activeTab === "OUTPUT" ? "block" : "none",
            padding: "12px",
            color: "#c9d1d9",
            fontSize: "12px",
            fontFamily: '"JetBrains Mono", Consolas, "Cascadia Code", monospace',
            overflowY: "auto",
            height: "100%",
            whiteSpace: "pre-wrap",
            lineHeight: "1.5",
          }}
        >
          {mainUiAiLog ? (
            <div>{mainUiAiLog}</div>
          ) : (
            <div style={{ color: "#8b949e" }}>
              <div style={{ color: "#5eead4", fontWeight: 600, marginBottom: "6px" }}>[WOLFSPACE AI & System Output Stream]</div>
              Belum ada log aktivitas atau output AI dari UI utama saat ini.<br />
              Saat Anda mengobrol dengan AI di UI utama atau menjalankan perintah, semua log proses dan hasil respons AI akan otomatis mengalir ke panel ini.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  // Melaporkan ke index.html bahwa App berhasil dirender tanpa Runtime Error
  useEffect(() => {
    if (window.reportAppSuccess) window.reportAppSuccess();
  }, []);
  const [pickerDone, setPickerDone] = useState(false);
  const [panelMenuOpen, setPanelMenuOpen] = useState(false);
  useEffect(() => {
    const closePanelMenu = () => setPanelMenuOpen(false);
    window.addEventListener("click", closePanelMenu);
    return () => window.removeEventListener("click", closePanelMenu);
  }, []);

  // Command Palette state (VS Code fork). Lives here (App level, not
  // AgentRunnerView) because the trigger button that opens it is in App's own
  // panel menu — a sibling/child component's local state isn't reachable from
  // there, which previously threw "setCommandPaletteOpen is not defined".
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState("");
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const filteredCommands = useMemo(() => {
    if (!commandSearch.trim()) return COMMANDS;
    return COMMANDS.filter(cmd =>
      cmd.label.toLowerCase().includes(commandSearch.toLowerCase())
    );
  }, [commandSearch]);
  const runSelectedCommand = () => {
    const cmd = filteredCommands[selectedCommandIndex];
    if (cmd) {
      cmd.action();
      setCommandPaletteOpen(false);
      setCommandSearch("");
    }
  };
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        setCommandPaletteOpen(true);
        setCommandSearch("");
        setSelectedCommandIndex(0);
      }
      if (commandPaletteOpen) {
        if (e.key === 'Escape') {
          setCommandPaletteOpen(false);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedCommandIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedCommandIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
          runSelectedCommand();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen, selectedCommandIndex, filteredCommands]);
  const [selectedProject, setSelectedProject] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("quantum_projects_list") || "[]");
      if (stored && stored.length > 0 && stored[0].path) return stored[0].path;
    } catch (_) {}
    return "c:\\Users\\dave\\quantum";
  });
  const [hitlRequest, setHitlRequest] = React.useState(null);

  React.useEffect(() => {
    const checkSelectedProject = () => {
      try {
        const deleted = JSON.parse(localStorage.getItem("quantum_deleted_workspaces") || "[]");
        // Path-exact saja (lihat isPathDeleted) — tak lagi cocok nama/suffix.
        const isDel = (pStr) => isPathDeleted(deleted, pStr);
        if (isDel(selectedProject)) {
          const stored = JSON.parse(localStorage.getItem("quantum_projects_list") || "[]");
          const valid = stored.filter(p => !isDel(p.path));
          if (valid.length > 0 && valid[0].path) setSelectedProject(valid[0].path);
          else if (!isDel("c:\\Users\\dave\\quantum")) setSelectedProject("c:\\Users\\dave\\quantum");
          else setSelectedProject("");
        }
      } catch (_) {}
    };
    window.addEventListener("quantum_workspaces_changed", checkSelectedProject);
    return () => window.removeEventListener("quantum_workspaces_changed", checkSelectedProject);
  }, [selectedProject]);
  window.testHitl = function() {
    setHitlRequest({
      kind: 'hitl',
      title: "Allow check if node-pty is installed?",
      code: "cmd /c npm ls node-pty",
      options: [
        { value: "allow_once", text: "Yes, allow this time" },
        { value: "allow_project", text: "Yes, and always allow in this project" },
        { value: "allow_always", text: "Yes, and always allow" },
        { value: "deny", text: "No (tell the agent what to do instead)" }
      ]
    });
  };
  const handleHitlResolve = (val) => {
    console.log("HITL resolved with:", val);
    const req = hitlRequest;
    setHitlRequest(null);
    if (!req) return;
    if (req.kind === 'continue') {
      // Jeda batas-langkah (checkpoint) — bukan HITL persetujuan. "Lanjutkan"
      // meneruskan run dari checkpoint dengan plafon langkah diperpanjang.
      if (val === "continue") {
        doSend("", null, { thread_id: req.thread_id, continue_response: true });
      } else {
        setBusy(false); // user memilih berhenti; edit yang sudah ada dipertahankan
      }
      return;
    }
    if (req.kind === 'ask') {
      // Question tool: send the selected answer as a normal user message so the agent can continue.
      if (val === "deny" || val === null || val === undefined) {
        setBusy(false);
        setTimeout(() => doSend("User memilih untuk tidak menjawab. Silakan lanjutkan dengan asumsi terbaik.", null), 50);
      } else {
        setTimeout(() => doSend(String(val), null), 50);
      }
      return;
    }
    // HITL approval flow
    if (val === "deny" || val === null || val === undefined) {
      // Cancel: reset busy and send denial message as new user message
      setBusy(false);
      setTimeout(() => doSend("Tindakan dibatalkan oleh user. Silakan evaluasi kembali dan gunakan cara lain.", null), 50);
    } else {
      // Allow: resume the agent with HITL approval (content empty is OK now that doSend checks hitlData)
      doSend("", null, { thread_id: req.thread_id, hitl_response: true });
    }
  };


  const [models, setModels] = useState([
    { value: "", label: "Memuat model...", disabled: true },
  ]);
  const [modelVal, setModelVal] = useState("");
  const [cloudVersion, setCloudVersion] = useState(0); // Trigger reload when cloud config changes

  const [panelOpen, setPanelOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  // Sesi chat TERPISAH untuk panel Workflow (kokpit agent) — thread & konteksnya
  // sendiri, tak tercampur/terduplikasi dengan chat utama.
  const [wfMessages, setWfMessages] = useState([]);
  const [wfHistory, setWfHistory] = useState([]);
  const [wfBusy, setWfBusy] = useState(false);
  const wfCtrlRef = useRef(null);
  const [status, setStatus] = useState("Memuat model...");
  const [view, setView] = useState("chat");
  const [sbCollapsed, setSbCollapsed] = useState(() => {
    try {
      return localStorage.getItem("quantum_sb") === "1";
    } catch (e) {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("quantum_sb", sbCollapsed ? "1" : "0");
    } catch (e) {}
  }, [sbCollapsed]);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("quantum_theme") || "dark";
    } catch (e) {
      return "dark";
    }
  });

  const [terminalPct, setTerminalPct] = useState(30);
  const [panelPct, setPanelPct] = useState(35);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalInput, setTerminalInput] = useState("");
  const [terminalOutput, setTerminalOutput] = useState("");
  const [terminalLoading, setTerminalLoading] = useState(false);
  const [savedChats, setSavedChats] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("quantum_chats") || "[]");
    } catch (e) {
      return [];
    }
  });
  const [globalPreviewItem, setGlobalPreviewItem] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  // Agent Runner state
  const [agentRunnerOpen, setAgentRunnerOpen] = useState(false);
  const [availableAgents, setAvailableAgents] = useState([]);
  const [activeAgent, setActiveAgent] = useState("");
  const [agentOutput, setAgentOutput] = useState("");
  const [agentRunning, setAgentRunning] = useState(false);
  const agentEsRef = useRef(null);
  const loadAgents = async () => {
    try {
      const res = await fetch("/api/agents");
      const data = await res.json();
      setAvailableAgents(Array.isArray(data) ? data : data.agents || []);
    } catch (e) {
      console.error("loadAgents error:", e);
    }
  };
  const startAgent = async (id, model, cwd) => {
    if (!id) return;
    try {
      setAgentOutput("");
      setActiveAgent(id);
      const res = await fetch("/api/agents/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, model, cwd }),
      });
      if (res.ok) {
        setAgentRunning(true);
        subscribeAgentStream();
      } else {
        const data = await res.json().catch(() => ({}));
        setAgentOutput(data.error || "Gagal start agent");
        setActiveAgent("");
      }
    } catch (e) {
      console.error("startAgent error:", e);
    }
  };
  const sendToAgent = async (text) => {
    if (!text.trim() || !activeAgent) return;
    try {
      await fetch("/api/agents/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeAgent, text: text + "\n" }),
      });
    } catch (e) {
      console.error("sendToAgent error:", e);
    }
  };
  const stopAgent = async () => {
    try {
      await fetch("/api/agents/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: activeAgent }),
      });
      setAgentRunning(false);
      if (agentEsRef.current) {
        agentEsRef.current.close();
        agentEsRef.current = null;
      }
    } catch (e) {
      console.error("stopAgent error:", e);
    }
  };
  const subscribeAgentStream = () => {
    if (agentEsRef.current) {
      agentEsRef.current.close();
    }
    const es = new EventSource("/api/agents/stream");
    agentEsRef.current = es;
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === "output" || d.type === "text") {
          setAgentOutput((prev) => prev + (d.text || d.content || "") + "\n");
        } else if (d.type === "done" || d.type === "end") {
          setAgentRunning(false);
          es.close();
          agentEsRef.current = null;
        } else if (d.type === "error") {
          setAgentOutput(
            (prev) => prev + "[error] " + (d.message || "") + "\n",
          );
          setAgentRunning(false);
          es.close();
          agentEsRef.current = null;
        }
      } catch (_) {
        setAgentOutput((prev) => prev + ev.data + "\n");
      }
    };
    es.onerror = () => {
      es.close();
      agentEsRef.current = null;
    };
  };
  const loadSavedChats = () => {
    try {
      setSavedChats(JSON.parse(localStorage.getItem("quantum_chats") || "[]"));
    } catch (e) {}
  };
  const restoreChat = (chat) => {
    setMessages(chat.messages);
    setHistory(chat.history || []);
    setShowHistory(false);
    setView("chat");
  };
  const deleteChat = (id) => {
    try {
      const list = JSON.parse(localStorage.getItem("quantum_chats") || "[]");
      const updated = list.filter((c) => c.id !== id);
      localStorage.setItem("quantum_chats", JSON.stringify(updated));
      setSavedChats(updated);
    } catch (e) {}
  };
  const renameChat = (id, newTitle) => {
    try {
      if (!newTitle || !newTitle.trim()) return;
      const list = JSON.parse(localStorage.getItem("quantum_chats") || "[]");
      const updated = list.map((c) => (c.id === id ? { ...c, title: newTitle.trim() } : c));
      localStorage.setItem("quantum_chats", JSON.stringify(updated));
      setSavedChats(updated);
    } catch (e) {}
  };
  const runTerminalCommand = async (command = null) => {
    const cmd = (command === null ? terminalInput : command).trim();
    if (!cmd) return;
    setTerminalLoading(true);
    try {
      const res = await fetch("/api/bash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd }),
      });
      const data = await res.json();
      setTerminalOutput(data.output || "");
    } catch (err) {
      setTerminalOutput("Error: " + err);
    } finally {
      setTerminalLoading(false);
      setTerminalInput("");
    }
  };

  const handleSlashCommand = async (content) => {
    const trimmed = content.trim();
    if (!trimmed.startsWith("/")) return false;
    const parts = trimmed.slice(1).split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const args = parts.slice(1);
    if (cmd === "terminal" || cmd === "term" || cmd === "bash") {
      const sub = args[0]?.toLowerCase();
      if (!sub || sub === "help") {
        setTerminalOpen(true);
        setStatus("Gunakan /terminal run <perintah>, /terminal open, /terminal close");
        return true;
      }
      if (sub === "open") {
        setTerminalOpen(true);
        setStatus("Terminal sudah terbuka.");
        return true;
      }
      if (sub === "close" || sub === "exit" || sub === "quit") {
        setTerminalOpen(false);
        setStatus("Terminal ditutup.");
        return true;
      }
      if (sub === "toggle") {
        setTerminalOpen((v) => !v);
        setStatus("Status terminal diperbarui.");
        return true;
      }
      if (sub === "run") {
        const command = args.slice(1).join(" ");
        if (!command) {
          setTerminalOpen(true);
          setStatus("Terminal siap. Ketik perintah untuk mulai.");
          return true;
        }
        setTerminalOpen(true);
        await runTerminalCommand(command);
        return true;
      }
      const command = args.join(" ");
      if (command) {
        setTerminalOpen(true);
        await runTerminalCommand(command);
      } else {
        setTerminalOpen(true);
        setStatus("Terminal sudah terbuka.");
      }
      return true;
    }
    return false;
  };
  const terminal = {
    input: terminalInput,
    setInput: setTerminalInput,
    output: terminalOutput,
    setOutput: setTerminalOutput,
    loading: terminalLoading,
    setLoading: setTerminalLoading,
    run: runTerminalCommand,
  };
  const scrollRef = useRef(null);
  const wfChatScrollRef = useRef(null); // panel chat di view Workflow (split)
  const ctrlRef = useRef(null);
  const onTerminalDividerDown = (e) => {
    e.preventDefault();
    const move = (ev) => {
      const w = window.innerWidth;
      const pct = Math.min(60, Math.max(15, ((w - ev.clientX) / w) * 100));
      setTerminalPct(pct);
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };
  const onPanelDividerDown = (e) => {
    e.preventDefault();
    const move = (ev) => {
      const w = window.innerWidth;
      const pct = Math.min(60, Math.max(15, ((w - ev.clientX) / w) * 100));
      setPanelPct(pct);
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };
  const startPicker = useVisualPicker();
  const startVisualDraw = useVisualDraw();
  const doSendRef = useRef(void 0);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("quantum_theme", theme);
    } catch (e) {}
  }, [theme]);

  const loadModels = useCallback(async () => {
    let list = [];
    try {
      list = await (await fetch("/models")).json();
    } catch (e) {}
    const opts = list.map((m) => ({
      value: String(m.port),
      label: m.name + (m.size ? " � " + fmtSize(m.size) : ""),
      default: m.default,
    }));
    let cloud = getCloud();
    // Hydrate from server-configured providers (key stays server-side) when there is
    // no stored cloud OR the stored provider is no longer configured (e.g. stale key).
    try {
      const provs = await (await fetch("/cloud-providers")).json();
      if (Array.isArray(provs) && provs.length) {
        const pick =
          provs.find((p) => p.provider === "opencode") ||
          provs.find((p) => p.provider === "nvidia") ||
          provs.find((p) => p.provider === "gemini") ||
          provs.find((p) => p.provider === "puter") ||
          provs[0];
        // Only override if the user hasn't explicitly set a local key or custom baseUrl.
        // If they have, we respect their choice.
        const hasUserConfig = cloud && (cloud.key || cloud.baseUrl);
        if (!hasUserConfig) {
          if (
            !cloud ||
            cloud.provider !== pick.provider ||
            cloud.model !== pick.model
          ) {
            cloud = {
              provider: pick.provider,
              name: pick.name,
              model: pick.model,
            };
            setCloudLS(cloud);
          }
        }
      }
    } catch (e) {}
    const hasCloud = cloud && (cloud.key || cloud.provider);
    if (hasCloud)
      opts.push({
        value: "cloud",
        label:
          (cloud.model || cloud.name || cloud.provider || "").replace(/-/g, " ") +
          (cloud.key ? " •" + cloud.key.slice(-4) : ""),
      });
    if (!opts.length)
      opts.push({ value: "", label: "Belum ada model", disabled: true });
    setModels(opts);
    const def = hasCloud
      ? "cloud"
      : (opts.find((o) => o.default) || opts[0]).value;
    setModelVal((v) => (v && opts.some((o) => o.value === v) ? v : def));
    setStatus(
      hasCloud
        ? "cloud: " + (cloud.name || cloud.provider)
        : opts.length
          ? "siap"
          : "Jalankan start-models",
    );
  }, [cloudVersion]);
  useEffect(() => {
    loadModels();
  }, [cloudVersion]);
  // Warn if server isn't running (for browser users, not Electron)
  useEffect(() => {
    if (!IPC) {
      checkServerHealth().then((ok) => {
        if (!ok) setStatus("Jalankan 'npm start' di terminal.");
      });
    }
  }, []);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);
  useEffect(() => {
    const wf = wfChatScrollRef.current;
    if (wf) wf.scrollTop = wf.scrollHeight;
  }, [wfMessages]);

  const labelOf = (v) => (models.find((m) => m.value === v) || {}).label || v;

  const doSend = async (content, display, hitlData = null) => {
    if (!content && !hitlData) return;
    const trimmedContent = content.trim();
    if (trimmedContent.toLowerCase() === "/openclaw" || trimmedContent.toLowerCase().startsWith("/openclaw ")) {
      if (busy) return;
      const openclawMessage = trimmedContent.replace(/^\/openclaw\b/i, "").trim();
      if (!openclawMessage) {
        setMessages((m) => [
          ...m,
          { role: "user", text: display || content },
          { role: "model", text: "Pesan /openclaw tidak boleh kosong. Contoh: /openclaw ringkas project ini" },
        ]);
        setStatus("OpenClaw butuh pesan");
        return;
      }
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      setBusy(true);
      setStatus("Running OpenClaw...");
      setMessages((m) => [
        ...m,
        { role: "user", text: display || content },
        { role: "model", text: "Running OpenClaw..." },
      ]);
      try {
        const res = await runOpenClawChat(openclawMessage, ctrl.signal);
        const reply = res.text || res.raw || "OpenClaw selesai tanpa output.";
        setMessages((m) => {
          const c = m.slice();
          c[c.length - 1] = { role: "model", text: reply };
          return c;
        });
        setHistory((h) => [
          ...h,
          { role: "user", content },
          { role: "assistant", content: reply },
        ]);
        setStatus("OpenClaw selesai");
      } catch (e) {
        if (e.name === "AbortError") {
          setStatus("dibatalkan");
        } else {
          const msg = "[OpenClaw error: " + e.message + "]";
          setMessages((m) => {
            const c = m.slice();
            c[c.length - 1] = { role: "model", text: msg };
            return c;
          });
          setStatus("OpenClaw error");
        }
      } finally {
        ctrlRef.current = null;
        setBusy(false);
      }
      return;
    }
    // /ask: mode tanya EKSPLISIT — dijamin TANPA tool (tidak akan pernah edit atau
    // eksekusi file), bahkan pada model cloud. Ini escape-hatch keamanan, kebalikan
    // dari perilaku default di mana model sendiri yang memutuskan pakai tool atau tidak.
    let askMode = false;
    {
      const t = (content || "").trim();
      if (/^\/ask(\s|$)/i.test(t)) {
        askMode = true;
        content = t.replace(/^\/ask\b\s*/i, "");
        if (!content) { setStatus("Ketik pertanyaan setelah /ask, mis. /ask apa fungsi X"); return; }
      }
    }
    if (content.trim().startsWith("/") && (await handleSlashCommand(content))) return;
    if (busy && !hitlData) return;
    let newHist = history;
    if (!hitlData) {
      newHist = [...history, { role: "user", content }];
      setHistory(newHist);
    }
    setBusy(true);
    setStatus("typing");
    console.log("[doSend] Setting busy=true, content:", content);
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    // ONE smart chat: with a tool-capable cloud, the model itself decides (tool_choice
    // auto) whether to just answer (normal chat) or use tools (a command/edit)  like
    // chatting with Claude. Local/bridge endpoints can't do tools ? plain chat.
    const _cl = getCloud();
    const _localCloud =
      _cl && _cl.baseUrl && /(127\.0\.0\.1|localhost)/.test(_cl.baseUrl);
    
    // Default: model cloud tool-capable selalu lewat agent, dan MODEL sendiri yang
    // memutuskan (tool_choice auto) apakah cukup menjawab atau memakai tool. Tak ada
    // lagi gerbang regex tebak-menebak yang bisa salah-rute (dulu typo "jalaankan"
    // diam-diam jatuh ke chat tanpa-tool → model mengarang output). Pengecualian:
    //   - /ask  -> paksa jalur tanpa-tool (jaminan tak menyentuh file)
    //   - HITL/continue resume -> selalu agent
    //   - model lokal/bridge  -> memang tak bisa tool, plain chat
    const useAgent = !!hitlData || (modelVal === "cloud" && !_localCloud && !askMode);
    if (!useAgent) {
      // Bridge / local model: plain conversational chat (text streaming, no function-calling).
      setMessages((m) => [
        ...m,
        { role: "user", text: display || content },
        { role: "model", text: "", run: null },
      ]);
      try {
        const res = await streamChat(
          reqFor(modelVal, getCloud(), newHist),
          (t, run) => {
            setMessages((m) => {
              const c = m.slice();
              c[c.length - 1] = { role: "model", text: t, run };
              return c;
            });
          },
          ctrl.signal,
        );
        setHistory((h) => [...h, { role: "assistant", content: res.text }]);
        setStatus("siap");
        console.log("[doSend] Setting busy=false (normal chat complete)");
        setBusy(false); // Reset busy state after stream completes
      } catch (e) {
        if (e.name !== "AbortError") setStatus("error: " + e.message);
        else setStatus("dibatalkan");
        console.log("[doSend] Setting busy=false (normal chat error)");
        setBusy(false);
      }
    } else {
      // Agentic chat (like Claude Code): the model answers OR uses tools to edit
      // WOLFSPACE's own source. The live process renders as a clean timeline.
      if (!hitlData) {
        setMessages((m) => [
          ...m,
          { role: "user", text: display || content },
          { role: "agent", agent: { events: [], busy: true } },
        ]);
      } else {
        setMessages((m) => {
          const c = m.slice();
          const last = { ...c[c.length - 1] };
          last.agent = { ...last.agent, busy: true };
          c[c.length - 1] = last;
          return c;
        });
      }
      const upd = (patch) =>
        setMessages((m) => {
          const c = m.slice();
          const last = { ...c[c.length - 1] };
          last.agent = { ...last.agent, ...patch };
          c[c.length - 1] = last;
          return c;
        });
      const evlist = [];
      const phaseNodes = [];
      let think = "";
      let adoneSent = false;
      let waitingForInput = false;
      let hadError = false;
      try {
        const curEffort = (getCloud() && typeof getCloud().effort !== 'undefined') ? Number(getCloud().effort) : (parseInt(localStorage.getItem("quantum_effort") || "1", 10) || 1);
        await streamSelfAgent(
          { history: newHist, cloud: getCloud(), port: modelVal, effort: curEffort, workspace_root: resolveWorkspaceRoot(selectedProject) || undefined, ...hitlData },
          (j) => {
            if (j.t === "backup") upd({ backup: j.dir });
            else if (j.t === "step") {
              think = "";
              upd({ step: j.n, thinking: "" });
            } else if (j.t === "tok") {
              think += j.c;
              upd({ thinking: think });
            } else if (j.t === "thought") {
              think = "";
              evlist.push({ type: "thought", kind: j.tool, arg: j.c, ok: j.ok, output: j.c });
              upd({ events: [...evlist], thinking: "" });
            } else if (j.t === "act") {
              think = "";
              evlist.push({
                type: "act",
                kind: j.kind,
                arg: j.arg,
                ok: j.ok,
                output: j.output,
              });
              upd({ events: [...evlist], thinking: "" });
            } else if (j.t === "phase") {
              phaseNodes.push({
                phase: j.phase,
                tag: j.tag,
                status: j.status,
                time: j.time,
                attrs: j.attrs,
                chip: j.chip,
                evidence: j.evidence,
                children: j.children,
              });
              upd({ phaseNodes: [...phaseNodes] });
            } else if (j.t === "hitl") {
              adoneSent = true;
              waitingForInput = true;
              setHitlRequest({
                kind: 'hitl',
                title: j.request.title,
                code: j.request.code,
                thread_id: j.thread_id,
                options: [
                  { value: "allow_once", text: "Izinkan sekali ini" },
                  { value: "deny", text: "Tolak (Minta agen mencari cara lain)" }
                ]
              });
            } else if (j.t === "ask") {
              adoneSent = true;
              waitingForInput = true;
              setHitlRequest({
                kind: 'ask',
                title: "Pertanyaan dari Agent",
                code: j.question || "",
                thread_id: j.thread_id || null,
                options: (j.choices || []).map(c => ({ value: c, text: c }))
              });
              upd({ thinking: "Menunggu jawaban Anda...", busy: true });
            } else if (j.t === "adone") {
              if (j.hitlPending && j.thread_id) {
                // Agent paused for HITL — keep busy=true, just ensure thread_id is updated
                adoneSent = true;
                waitingForInput = true;
                setHitlRequest(prev => prev ? { ...prev, thread_id: j.thread_id } : {
                  kind: 'hitl',
                  title: "Menunggu Persetujuan",
                  code: "",
                  thread_id: j.thread_id,
                  options: [
                    { value: "allow_once", text: "Izinkan sekali ini" },
                    { value: "deny", text: "Tolak" }
                  ]
                });
                upd({ thinking: "Menunggu persetujuan Anda...", busy: true });
                return; // Don't set done/busy=false
              }
              if (j.continuable && j.thread_id) {
                // Agent dijeda karena plafon langkah (checkpoint) — belum selesai,
                // bukan gagal. Tutup timeline dengan rapi lalu tawarkan "Lanjutkan".
                adoneSent = true;
                waitingForInput = true;
                upd({ busy: false, done: true, summary: j.summary, editCount: j.edits, backup: j.backup });
                setHitlRequest({
                  kind: 'continue',
                  title: "Agent dijeda (batas langkah)",
                  code: j.summary || "",
                  thread_id: j.thread_id,
                  options: [
                    { value: "continue", text: "Lanjutkan" },
                    { value: "deny", text: "Selesai (berhenti di sini)" }
                  ]
                });
                return;
              }
              adoneSent = true;
              upd({
                busy: false,
                done: true,
                summary: j.summary,
                editCount: j.edits,
                backup: j.backup,
                run: j.run,
                phase: j.phase,
                phaseNodes: [...phaseNodes],
              });
              setHistory((h) => [
                ...h,
                { role: "assistant", content: j.summary || "" },
              ]);
            } else if (j.t === "err") {
              hadError = true;
              evlist.push({ type: "err", m: j.m });
              upd({ events: [...evlist], busy: false, error: true });
            }
          },
          ctrl.signal,
        );
      } catch (e) {
        if (e.name !== "AbortError")
          upd({
            busy: false,
            error: true,
            events: [...evlist, { type: "err", m: e.message }],
          });
      }
      console.log("[doSend] Setting busy=false (agent stream complete)");
      // If no "adone" event was sent, provide a default summary based on events
      if (!adoneSent) {
        if (!hadError) {
          const summary =
            evlist.length > 0
              ? `Selesai. ${evlist.length} operasi dieksekusi.`
              : "Selesai. Tidak ada operasi yang dilakukan.";
          upd({ busy: false, done: true, summary });
          setHistory((h) => [...h, { role: "assistant", content: summary }]);
        } else {
          upd({ busy: false });
        }
      }
      if (!waitingForInput) {
        setBusy(false); // Reset global busy state only when not waiting for HITL/answer
      }
      setStatus("siap");
    }
    ctrlRef.current = null;
    setBusy(false);
  };
  doSendRef.current = doSend;
    const cancel = () => {
    console.log("[cancel] Aborting and setting busy=false");
    if (ctrlRef.current) ctrlRef.current.abort();
    setBusy(false);
    setStatus("dibatalkan");
  };
  // Kirim untuk panel chat Workflow — sesi agent INDEPENDEN (wfMessages/wfHistory),
  // memakai streamSelfAgent yang sama tapi menulis ke state-nya sendiri. Hanya sesi
  // inilah yang menggerakkan live agent graph (dispatch event dari sini, bukan chat
  // utama), sehingga data kedua sisi tak tercampur.
  const wfSend = async (content) => {
    if (!content || !content.trim() || wfBusy) return;
    const newHist = [...wfHistory, { role: "user", content }];
    setWfHistory(newHist);
    setWfMessages((m) => [...m, { role: "user", text: content }, { role: "agent", agent: { events: [], busy: true } }]);
    setWfBusy(true);
    const upd = (patch) => setWfMessages((m) => {
      const c = m.slice();
      const last = { ...c[c.length - 1] };
      last.agent = { ...last.agent, ...patch };
      c[c.length - 1] = last;
      return c;
    });
    const evlist = [];
    let think = "", adoneSent = false, hadError = false;
    try { window.dispatchEvent(new CustomEvent("wolfspace_agent_run", { detail: { phase: "start" } })); } catch (_) {}
    const ctrl = new AbortController();
    wfCtrlRef.current = ctrl;
    try {
      const curEffort = (getCloud() && typeof getCloud().effort !== "undefined") ? Number(getCloud().effort) : (parseInt(localStorage.getItem("quantum_effort") || "1", 10) || 1);
      // Kirim pesan terakhir DENGAN hint pembuat-workflow (tampilan chat tetap bersih,
      // pakai `content` biasa). Riwayat tersimpan tetap versi bersih (newHist).
      const sendHist = [...wfHistory, { role: "user", content: content + "\n\n" + WF_GEN_HINT }];
      await streamSelfAgent(
        { history: sendHist, cloud: getCloud(), port: modelVal, effort: curEffort, workspace_root: resolveWorkspaceRoot(selectedProject) || undefined },
        (j) => {
          if (j.t === "step") { think = ""; upd({ thinking: "" }); }
          else if (j.t === "tok") { think += j.c; upd({ thinking: think }); }
          else if (j.t === "thought") { think = ""; evlist.push({ type: "thought", kind: j.tool, arg: j.c, ok: j.ok, output: j.c }); upd({ events: [...evlist], thinking: "" }); }
          else if (j.t === "act") {
            think = "";
            evlist.push({ type: "act", kind: j.kind, arg: j.arg, ok: j.ok, output: j.output });
            upd({ events: [...evlist], thinking: "" });
            try { window.dispatchEvent(new CustomEvent("wolfspace_agent_act", { detail: { kind: j.kind, arg: j.arg, ok: j.ok, output: j.output } })); } catch (_) {}
          } else if (j.t === "adone") {
            try { window.dispatchEvent(new CustomEvent("wolfspace_agent_run", { detail: { phase: "done" } })); } catch (_) {}
            adoneSent = true;
            // CHAT WORKFLOW (decoupled): desain DILEMPAR ke kanvas, TAK ditampilkan
            // di chat. Terima spec JSON atau (fallback) mermaid; lalu BUANG semua blok
            // desain (mermaid/JSON) dari teks — walau tak ter-parse, agar diagram
            // rusak pun tak pernah muncul di chat.
            const spec = extractWorkflowSpec(j.summary) || mermaidToSpec(j.summary);
            let disp = stripDesignBlocks(j.summary);
            if (spec) {
              try { window.dispatchEvent(new CustomEvent("wolfspace_workflow_spec", { detail: spec })); } catch (_) {}
              disp = (disp ? disp + "\n\n" : "") + "› Workflow dikirim ke kanvas ←";
            }
            upd({ busy: false, done: true, summary: disp, editCount: j.edits, backup: j.backup });
            setWfHistory((h) => [...h, { role: "assistant", content: j.summary || "" }]);
            // RAG ingest: simpan memori run (permintaan → hasil) agar bisa diingat
            // di sesi mendatang lewat tool `retrieve`. Fire-and-forget, store global.
            if (j.summary && j.summary.trim().length > 8) {
              const mem = ("Permintaan: " + content + "\nHasil: " + j.summary).slice(0, 1200);
              wwApi("/rag/ingest", { method: "POST", body: { project: "global", text: mem, kind: "memory", meta: { source: "wf-run" } } }).catch(() => {});
            }
          } else if (j.t === "err") {
            hadError = true;
            evlist.push({ type: "err", m: j.m });
            upd({ events: [...evlist], busy: false, error: true });
          }
        },
        ctrl.signal,
      );
    } catch (e) {
      if (e.name !== "AbortError") upd({ busy: false, error: true, events: [...evlist, { type: "err", m: e.message }] });
    }
    if (!adoneSent && !hadError) {
      const summary = evlist.length > 0 ? `Selesai. ${evlist.length} operasi dieksekusi.` : "Selesai. Tidak ada operasi.";
      upd({ busy: false, done: true, summary });
      setWfHistory((h) => [...h, { role: "assistant", content: summary }]);
    }
    setWfBusy(false);
    wfCtrlRef.current = null;
  };
  const wfCancel = () => { if (wfCtrlRef.current) wfCtrlRef.current.abort(); setWfBusy(false); };
  // Fase 2: jalankan SATU tahap graph Workflow (satu giliran agent), log ke panel
  // chat Workflow, kembalikan { ok, summary }. Sengaja TIDAK memancarkan event live-
  // graph (biar kanvas Builder yang menyala per-node, bukan pindah ke mode Live).
  const runWorkflowStage = React.useCallback((prompt, meta = {}) => {
    return new Promise((resolve) => {
      setWfMessages((m) => [...m, { role: "user", text: "▶ " + (meta.label || meta.kind || "tahap") }, { role: "agent", agent: { events: [], busy: true } }]);
      const upd = (patch) => setWfMessages((m) => {
        const c = m.slice(); const last = { ...c[c.length - 1] }; last.agent = { ...last.agent, ...patch }; c[c.length - 1] = last; return c;
      });
      let think = "", evlist = [], summary = "", done = false;
      const finish = (ok, s) => { if (done) return; done = true; resolve({ ok, summary: s }); };
      const ctrl = new AbortController();
      const curEffort = (getCloud() && typeof getCloud().effort !== "undefined") ? Number(getCloud().effort) : (parseInt(localStorage.getItem("quantum_effort") || "1", 10) || 1);
      streamSelfAgent(
        { history: [{ role: "user", content: prompt }], cloud: getCloud(), port: modelVal, effort: curEffort, workspace_root: meta.workspaceRoot || resolveWorkspaceRoot(selectedProject) || undefined },
        (j) => {
          if (j.t === "tok") { think += j.c; upd({ thinking: think }); }
          else if (j.t === "thought") { think = ""; evlist.push({ type: "thought", kind: j.tool, arg: j.c, ok: j.ok, output: j.c }); upd({ events: [...evlist], thinking: "" }); }
          else if (j.t === "act") { think = ""; evlist.push({ type: "act", kind: j.kind, arg: j.arg, ok: j.ok, output: j.output }); upd({ events: [...evlist], thinking: "" }); }
          else if (j.t === "adone") { summary = j.summary || summary; upd({ busy: false, done: true, summary }); finish(true, summary); }
          else if (j.t === "err") { upd({ busy: false, error: true, events: [...evlist, { type: "err", m: j.m }] }); finish(false, j.m || "error"); }
        },
        ctrl.signal,
      ).then(() => { upd({ busy: false, done: true, summary }); finish(true, summary); })
       .catch((e) => { if (e.name !== "AbortError") upd({ busy: false, error: true }); finish(false, e.message); });
    });
  }, [modelVal, selectedProject]);

  const reset = () => {
    setMessages([]);
    setHistory([]);
    setBusy(false);
    setStatus("Siap.");
  };
  const saveChat = () => {
    if (messages.length === 0) return;
    try {
      const saved = JSON.parse(localStorage.getItem("quantum_chats") || "[]");
      saved.push({
        id: Date.now(),
        title: messages[0]?.text?.slice(0, 60) || "Chat",
        messages: messages,
        history: history,
        savedAt: new Date().toISOString(),
        project: selectedProject,
      });
      localStorage.setItem("quantum_chats", JSON.stringify(saved));
      loadSavedChats();
    } catch (e) {
      /* ignore storage errors */
    }
  };

  return (
    <>
      <div className={"app has-sidebar" + (sbCollapsed ? " sb-collapsed" : "")}>
      {!pickerDone && (
        <ProjectPickerScreen
          models={models}
          modelVal={modelVal}
          setModelVal={setModelVal}
          onStart={(msg, project) => {
            setSelectedProject(project);
            setPickerDone(true);
            setTimeout(() => doSend(msg), 0);
          }}
        />
      )}
      <Sidebar
        collapsed={sbCollapsed}
        setCollapsed={setSbCollapsed}
        view={view}
        setView={setView}
        onNewChat={() => {
          saveChat();
          reset();
          setView("chat");
          loadSavedChats();
        }}
        theme={theme}
        setTheme={setTheme}
        terminalOpen={terminalOpen}
        setTerminalOpen={setTerminalOpen}
        terminal={terminal}
        savedChats={savedChats}
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        restoreChat={restoreChat}
        deleteChat={deleteChat}
        renameChat={renameChat}
        loadSavedChats={loadSavedChats}
        onAgentRunner={() => {
          setAgentRunnerOpen(true);
          loadAgents();
        }}
        selectedProject={selectedProject}
        onOpenPicker={() => {
          setPickerDone(false);
        }}
      />
      <div className="page-container">

        <div
          className={"page chat-page " + (view === "chat" ? "active" : "exit")}
        >
          <TopBar
            models={models}
            modelVal={modelVal}
            setModelVal={setModelVal}
            panelOpen={panelOpen}
            setPanelOpen={setPanelOpen}
            onReset={reset}
            status={status}
            theme={theme}
            setTheme={setTheme}
            terminalOpen={terminalOpen}
            setTerminalOpen={setTerminalOpen}
          />
          <div className="chat-split">
            <div
              className="chat-col"
              style={{
                flex: "1 1 " + Math.max(20, 100 - (terminalOpen ? terminalPct : 0) - (panelOpen ? panelPct : 0)) + "%",
              }}
            >
              <div
                className="chat-scroll"
                ref={scrollRef}
                onClick={(e) => {
                  if (e.target.tagName === "IMG" && (e.target.src || e.target.getAttribute("src"))) {
                    setGlobalPreviewItem({ url: e.target.src || e.target.getAttribute("src"), name: e.target.alt || "Preview Gambar / Screenshot" });
                  }
                }}
              >
                {messages.length === 0 ? (
                  <div className="chat-inner">
                  </div>
                ) : (
                  <div className="chat-inner">
                    {messages.map((m, i) => (
                      <Message
                        key={i}
                        msg={m}
                      />
                    ))}
                  </div>
                )}
              </div>
            <HitlModal request={hitlRequest} onResolve={handleHitlResolve} />
            <LightboxModal item={globalPreviewItem} onClose={() => setGlobalPreviewItem(null)} />
                            <Composer
                models={models}
                modelVal={modelVal}
                setModelVal={setModelVal}
                onSend={(t) => doSend(t)}
                onCancel={cancel}
                busy={busy || agentRunning}
                onAgentCli={() => setAgentRunnerOpen(true)}
              />
            </div>
            {terminalOpen && (
              <>
                <div className="split-divider" onMouseDown={onTerminalDividerDown} />
                <div className="terminal-col" style={{ flex: "0 0 " + terminalPct + "%", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
                  <VSCodeTerminal selectedProject={selectedProject} onClose={() => setTerminalOpen(false)} agentOutput={agentOutput} terminalOutput={terminalOutput} messages={messages} />
                </div>
              </>
            )}
            {panelOpen && (
              <>
                <div className="split-divider" onMouseDown={onPanelDividerDown} />
                <div
                  className="canvas-col"
                  style={{ flex: "0 0 " + panelPct + "%", background: "var(--surface-1)", display: "flex", flexDirection: "column" }}
                >
                  <div style={{ height: "46px", borderBottom: "1px solid var(--line)", padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, position: "relative" }}>
                    <div
                      style={{
                        position: "absolute",
                        left: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: "16px",
                        height: "28px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        color: "#ffffff",
                        zIndex: 10,
                      }}
                      title="Menu panel"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPanelMenuOpen(!panelMenuOpen);
                      }}
                    >
                      <svg width="10" height="20" viewBox="0 0 10 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="5" cy="4" r="1.6" fill="#ffffff"></circle>
                        <circle cx="5" cy="10" r="1.6" fill="#ffffff"></circle>
                        <circle cx="5" cy="16" r="1.6" fill="#ffffff"></circle>
                      </svg>
                    </div>
                    {panelMenuOpen && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: "absolute",
                          top: "38px",
                          left: "8px",
                          background: "#181c20",
                          border: "1px solid #282e36",
                          borderRadius: "6px",
                          boxShadow: "0 12px 36px rgba(0,0,0,0.65)",
                          padding: "6px 0",
                          zIndex: 2000,
                          minWidth: "235px",
                        }}
                      >
                        {/* Visual Picker & Visual Draw dipindah kemari dari sidebar (bagian "Alat")
                            — akses langsung dari tombol menu panel ini, bukan lagi di sidebar. */}
                        <button
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            width: "100%",
                            padding: "8px 16px",
                            color: "#e2e8f0",
                            fontSize: "13px",
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            textAlign: "left",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          onClick={() => {
                            setPanelMenuOpen(false);
                            startPicker();
                          }}
                        >
                          {SB.target({ width: 16, height: 16 })}
                          <span>Visual Picker</span>
                        </button>
                        <button
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            width: "100%",
                            padding: "8px 16px",
                            color: "#e2e8f0",
                            fontSize: "13px",
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            textAlign: "left",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          onClick={() => {
                            setPanelMenuOpen(false);
                            startVisualDraw();
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4"></path><path d="M13.5 6.5l4 4"></path></svg>
                          <span>Visual Draw</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, padding: "16px", overflowY: "auto", color: "var(--text-soft)", fontSize: "14px", position: "relative" }}>



                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <div
          className={"page hub-page " + (view === "hub" ? "active" : "enter")}
        >
          {view === "hub" && (
            <ModelHubView
              onBack={() => setView("chat")}
              theme={theme}
              setTheme={setTheme}
              onChanged={loadModels}
              onUse={(port) => {
                if (port) setModelVal(String(port));
                loadModels();
                setView("chat");
              }}
            />
          )}
        </div>
        <div
          className={
            "page hub-page " + (view === "settings" ? "active" : "enter")
          }
        >
          {view === "settings" && (
            <SettingsView
              onBack={() => setView("chat")}
              onSaved={loadModels}
              onCloudChanged={() => setCloudVersion((v) => v + 1)}
            />
          )}
        </div>
        <div
          className={
            "page hub-page " + (view === "agents" ? "active" : "enter")
          }
        >
          {view === "agents" && (
            <AgentRunnerView
              onBack={() => setView("chat")}
              agents={availableAgents}
              activeAgent={activeAgent}
              agentRunning={agentRunning}
              agentOutput={agentOutput}
              onLoadAgents={loadAgents}
              onStart={startAgent}
              onStop={stopAgent}
              onSend={sendToAgent}
              currentModel={modelVal}
              panelOpen={panelOpen}
              setPanelOpen={setPanelOpen}
            />
          )}
        </div>
        <div
          className={
            "page hub-page " + (view === "history" ? "active" : "enter")
          }
        >
          {view === "history" && (
            <HistoryView
              savedChats={savedChats}
              onSelect={(chat) => {
                restoreChat(chat);
                setView("chat");
              }}
              onDelete={(id) => deleteChat(id)}
            />
          )}
        </div>
        <div
          className={
            "page hub-page " + (view === "workflow" ? "active" : "enter")
          }
        >
          {view === "workflow" && (
            <div style={{ display: "flex", height: "100%", width: "100%", minHeight: 0 }}>
              {/* KIRI: React Flow (Workflow / live agent graph) */}
              <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                <WorkflowBuilder onBack={() => setView("chat")} runStage={runWorkflowStage} />
              </div>
              {/* KANAN: chat agent — pakai UI chat yang sama (Message + Composer) */}
              <div style={{ width: "400px", flexShrink: 0, borderLeft: "1px solid #212a36", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, background: "#0d1117" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderBottom: "1px solid #212a36", flexShrink: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: wfBusy ? "#3fb950" : "#6f7d92", boxShadow: wfBusy ? "0 0 6px #3fb950" : "none" }} />
                  <span style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px", letterSpacing: ".1em", textTransform: "uppercase", color: "#8b949e" }}>Agent</span>
                </div>
                <div
                  className="chat-scroll"
                  ref={wfChatScrollRef}
                  style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
                  onClick={(e) => {
                    if (e.target.tagName === "IMG" && (e.target.src || e.target.getAttribute("src"))) {
                      setGlobalPreviewItem({ url: e.target.src || e.target.getAttribute("src"), name: e.target.alt || "Preview Gambar / Screenshot" });
                    }
                  }}
                >
                  <div className="chat-inner">
                    {wfMessages.length === 0 && (
                      <div style={{ padding: "18px 16px", color: "#6f7d92", fontFamily: "ui-monospace, monospace", fontSize: "12px", lineHeight: 1.6 }}>
                        Sesi agent terpisah. Kirim perintah di sini — langkahnya muncul sebagai graph di kiri.
                      </div>
                    )}
                    {wfMessages.map((m, i) => (
                      <Message key={i} msg={m} />
                    ))}
                  </div>
                </div>
                <Composer
                  models={models}
                  modelVal={modelVal}
                  setModelVal={setModelVal}
                  onSend={(t) => wfSend(t)}
                  onCancel={wfCancel}
                  busy={wfBusy}
                  onAgentCli={() => setAgentRunnerOpen(true)}
                />

              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Command Palette UI (VS Code fork) */}
    {commandPaletteOpen && (
      <div className="command-palette-overlay" onClick={() => setCommandPaletteOpen(false)}>
        <div className="command-palette" onClick={e => e.stopPropagation()}>
          <input
            type="text"
            placeholder="Cari perintah... (Ctrl+Shift+P untuk membuka)"
            value={commandSearch}
            onChange={e => { setCommandSearch(e.target.value); setSelectedCommandIndex(0); }}
            autoFocus
            className="command-palette-input"
          />
          <div className="command-palette-list">
            {filteredCommands.map((cmd, idx) => (
              <div
                key={cmd.id}
                className={`command-palette-item ${idx === selectedCommandIndex ? 'selected' : ''}`}
                onClick={() => { setSelectedCommandIndex(idx); runSelectedCommand(); }}
              >
                <span className="command-icon">{cmd.icon}</span>
                <span className="command-label">{cmd.label}</span>
              </div>
            ))}
            {filteredCommands.length === 0 && (
              <div className="command-palette-empty">Tidak ada perintah yang cocok</div>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
/* ============================================================
   Workflow Builder (React Flow) — kanvas node/edge ala workflow: seret node dari
   palette, sambung antar-titik, export JSON. Memakai React Flow yang di-vendor
   (window.RFLib.XY) — tanpa bundler runtime, sama pola Monaco/mermaid/cytoscape.
   ============================================================ */
const WF_PALETTE = [
  { type: "prompt", label: "Prompt", accent: "#3fb950", desc: "input / instruksi awal" },
  { type: "agent", label: "Agent", accent: "#2f81f7", desc: "loop LLM + pemanggilan tool" },
  { type: "tool", label: "Tool", accent: "#d29922", desc: "bash / edit / grep / dst" },
  { type: "condition", label: "Condition", accent: "#bc8cff", desc: "cabang if / else" },
  { type: "output", label: "Output", accent: "#f85149", desc: "hasil akhir" },
];

// Warna node live per-`kind` langkah agent (dari event t:"act" self_agent.cjs).
const WF_KIND_ACCENT = {
  workspace: "#8b949e", planner: "#bc8cff", bash: "#d29922", task: "#2f81f7",
  read: "#3fb950", edit: "#f0883e", write: "#f0883e", grep: "#56d4dd",
  glob: "#56d4dd", list: "#8fb3ff", hitl_approved: "#3fb950", thought: "#6f7d92",
};
const wfKindAccent = (k) => WF_KIND_ACCENT[k] || "#8fb3ff";

// ── Fase 2: kompilasi graph tergambar → urutan eksekusi (topological) ──────────
// Kahn's algorithm. Kembalikan { ok, order:[node...] } atau { ok:false, error }.
function compileWorkflow(nodes, edges) {
  if (!nodes || nodes.length === 0) return { ok: false, error: "Kanvas kosong — tambah node dulu." };
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges || []) {
    if (adj.has(e.source) && indeg.has(e.target)) {
      adj.get(e.source).push(e.target);
      indeg.set(e.target, indeg.get(e.target) + 1);
    }
  }
  const ind = new Map(indeg);
  const q = nodes.filter((n) => ind.get(n.id) === 0).map((n) => n.id);
  const order = [];
  while (q.length) {
    const id = q.shift();
    order.push(id);
    for (const t of adj.get(id) || []) {
      ind.set(t, ind.get(t) - 1);
      if (ind.get(t) === 0) q.push(t);
    }
  }
  if (order.length !== nodes.length) return { ok: false, error: "Ada siklus di graph — alur harus searah." };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return { ok: true, order: order.map((id) => byId.get(id)) };
}
// Bingkai prompt per-tahap sesuai jenis node + konteks dari node hulu.
function buildStagePrompt(kind, label, ctx) {
  const c = ctx ? "\n\nKonteks dari tahap sebelumnya:\n" + ctx : "";
  const L = label || kind;
  if (kind === "agent") return `Kerjakan langkah ini sebagai agent: ${L}.${c}`;
  if (kind === "tool") return `Gunakan tool yang sesuai untuk: ${L}. Laporkan hasil nyatanya.${c}`;
  if (kind === "condition") return `Evaluasi kondisi/cabang: ${L}. Jelaskan keputusan berdasarkan konteks.${c}`;
  if (kind === "output") return `Susun hasil akhir/ringkasan untuk: ${L}, berdasarkan seluruh konteks.${c}`;
  return `${L}.${c}`;
}

// Instruksi (digabung ke pesan yang DIKIRIM, bukan yang ditampilkan): bila user
// minta MEMBUAT workflow, agent mengeluarkan satu blok spec yang bisa dirender.
const WF_GEN_HINT =
  "(Jika permintaan ini tentang MEMBUAT/merancang sebuah workflow/alur/pipeline: " +
  "keluarkan HANYA satu blok berpagar ```wolfspace-workflow berisi JSON valid: " +
  '{"nodes":[{"id":"n1","kind":"prompt","label":"..."}],"edges":[{"from":"n1","to":"n2","label":"opsional"}]} ' +
  "— kind salah satu dari prompt|agent|tool|condition|output, id unik & pendek, label RINGKAS tanpa \\n. " +
  "Untuk node kind:condition, beri >1 edge keluar dan isi \"label\" tiap edge dengan nama cabang (mis. ya/tidak). " +
  "DILARANG memakai mermaid atau format diagram lain. Boleh 1 kalimat penjelasan singkat di luar blok. " +
  "Jika BUKAN permintaan workflow, abaikan instruksi ini.)";

// Ambil spec workflow dari teks jawaban agent (blok ```wolfspace-workflow / ```json).
function extractWorkflowSpec(text) {
  const m = /```(?:wolfspace-workflow|json)\s*([\s\S]*?)```/i.exec(text || "");
  if (!m) return null;
  try {
    const j = JSON.parse(m[1].trim());
    if (j && Array.isArray(j.nodes) && j.nodes.length) return j;
  } catch (_) {}
  return null;
}
// Ubah spec {nodes,edges} → node/edge React Flow (type wf) + tata-letak snake.
function specToFlow(spec) {
  const nodes = (spec.nodes || []).map((n, i) => ({
    id: String(n.id || "n" + (i + 1)),
    type: "wf",
    position: { x: 0, y: 0 },
    data: { label: n.label || n.kind || "node", kind: n.kind || "agent", accent: wfKindAccent(n.kind) },
  }));
  const edges = (spec.edges || []).map((e, i) => ({
    id: "e" + i,
    source: String(e.from != null ? e.from : e.source),
    target: String(e.to != null ? e.to : e.target),
    type: "wf",
    data: e.label ? { label: String(e.label) } : undefined, // cabang kondisi ("ya"/"tidak")
  })).filter((e) => nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target));
  // Tata-letak: pakai dagre (arah aliran kiri→kanan, per-rank) supaya hasil generate
  // langsung terstruktur & rapih — sama seperti tombol "⇄ Rapikan". Fallback ke grid
  // serpentine berbasis urutan topological bila dagre tak tersedia.
  const dagre = window.RFLib && window.RFLib.dagre;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  if (dagre && nodes.length) {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "LR", nodesep: 42, ranksep: 96 });
    g.setDefaultEdgeLabel(() => ({}));
    const W = 168, H = 62;
    nodes.forEach((n) => g.setNode(n.id, { width: W, height: H }));
    edges.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);
    nodes.forEach((n) => { const p = g.node(n.id); if (p) n.position = { x: p.x - W / 2, y: p.y - H / 2 }; });
  } else {
    const comp = compileWorkflow(nodes, edges);
    const order = comp.ok ? comp.order : nodes;
    const COLS = 4, DX = 210, DY = 120;
    order.forEach((n, i) => {
      const col = i % COLS, row = Math.floor(i / COLS);
      const nn = byId.get(n.id);
      if (nn) nn.position = { x: (row % 2 === 0 ? col : COLS - 1 - col) * DX, y: row * DY };
    });
  }
  return { nodes, edges };
}

// Fallback: bila agent memberi mermaid flowchart (bukan JSON), parse best-effort
// jadi spec {nodes,edges}. Bentuk node → kind: {} kondisi, ([]) prompt, () tool.
function mermaidToSpec(text) {
  const body = (/```mermaid\s*([\s\S]*?)```/i.exec(text || "") || [])[1];
  if (!body) return null;
  const nodes = new Map(); // id -> {label, kind}
  const shapeKind = (open) => (open === "{" ? "condition" : open === "([" ? "prompt" : open === "(" ? "tool" : "agent");
  const clean = (s) => String(s || "").replace(/["'`]/g, "").replace(/\\n|<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
  const reNode = /([A-Za-z0-9_]+)\s*(\(\[|\{|\[|\()([^\]}\)]*)(?:\]\)|\}|\]|\))/g;
  const addNode = (id, open, label) => {
    if (!id) return;
    const k = shapeKind(open);
    const l = clean(label) || id;
    if (!nodes.has(id) || (open && nodes.get(id).kind === "agent")) nodes.set(id, { label: l, kind: k });
  };
  let m;
  while ((m = reNode.exec(body))) addNode(m[1], m[2], m[3]);
  const edges = [];
  const reEdge = /([A-Za-z0-9_]+)[^\n>]*?(?:--+>|-\.->|==+>)(?:\s*\|([^|]*)\|)?\s*([A-Za-z0-9_]+)/g;
  while ((m = reEdge.exec(body))) {
    const src = m[1], lbl = m[2], dst = m[3];
    if (!nodes.has(src)) nodes.set(src, { label: src, kind: "agent" });
    if (!nodes.has(dst)) nodes.set(dst, { label: dst, kind: "agent" });
    edges.push({ from: src, to: dst, label: lbl ? lbl.trim() : undefined });
  }
  if (!nodes.size) return null;
  return { nodes: [...nodes.entries()].map(([id, v]) => ({ id, label: v.label, kind: v.kind })), edges };
}
// Buang SEMUA blok desain (mermaid/JSON) dari teks agar tak dirender di chat workflow.
function stripDesignBlocks(text) {
  return String(text || "")
    .replace(/```(?:mermaid|wolfspace-workflow|json)\s*[\s\S]*?```/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Context: memberi node akses untuk MENGUBAH dirinya (label/kind) di state kanvas.
// editable=false di mode Live (cermin agent tak boleh diedit).
const WFNodeCtx = React.createContext(null);
const WF_KINDS = ["prompt", "agent", "tool", "condition", "output"];

function WFNodeCard({ id, data, selected }) {
  const XY = window.RFLib && window.RFLib.XY;
  const Handle = XY && XY.Handle;
  const Position = XY && XY.Position;
  const NodeToolbar = XY && XY.NodeToolbar;
  const ctx = React.useContext(WFNodeCtx);
  const editable = !!(ctx && ctx.editable);
  const [editing, setEditing] = React.useState(false);
  const accent = (data && data.accent) || wfKindAccent(data && data.kind);
  const err = data && data.ok === false;           // langkah agent gagal
  const active = data && data.active;               // langkah agent yang sedang jalan
  const edge = err ? "#f85149" : accent;
  const update = (patch) => ctx && ctx.setNodes && ctx.setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  const cycleKind = () => {
    if (!editable) return;
    const nx = WF_KINDS[(WF_KINDS.indexOf(data.kind) + 1) % WF_KINDS.length];
    update({ kind: nx, accent: wfKindAccent(nx) });
  };
  const commit = (v) => { const t = String(v || "").trim(); if (t) update({ label: t }); setEditing(false); };
  // Fase 3: tiap node bisa diikat ke FOLDER sendiri. Saat graph jalan, agent tahap
  // itu terkurung ke folder ini (workspace_root) — jadi satu graph bisa
  // mengorkestrasi banyak agent, masing-masing di folder/repo berbeda.
  const wsRoot = data && data.workspaceRoot;
  const wsBase = wsRoot ? String(wsRoot).replace(/[\\/]+$/, "").split(/[\\/]/).pop() : "";
  const setFolder = () => {
    const cur = wsRoot || "";
    const v = window.prompt("Folder untuk node ini (path absolut). Kosongkan = ikut folder aktif:", cur);
    if (v === null) return;
    update({ workspaceRoot: String(v).trim() || undefined });
  };
  // Bentuk per-kind (konvensi flowchart): condition = belah ketupat, prompt/output
  // = pil (terminator), agent/tool = kotak (proses).
  const kind = data && data.kind;
  const shape = kind === "condition" ? "diamond" : (kind === "prompt" || kind === "output") ? "pill" : "rect";
  const hStyle = { background: edge, width: 8, height: 8, border: "none" };
  const chip = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: shape === "diamond" ? "center" : "flex-start", gap: "5px", fontSize: "9px", letterSpacing: ".12em", textTransform: "uppercase", color: edge, marginBottom: "2px" }}>
      <span onClick={(e) => { e.stopPropagation(); cycleKind(); }} title={editable ? "klik: ganti jenis node" : undefined} style={{ cursor: editable ? "pointer" : "default", userSelect: "none" }}>{data.kind}{editable ? " ▾" : ""}</span>
      {active && <span style={{ width: 6, height: 6, borderRadius: "50%", background: edge, boxShadow: "0 0 6px " + edge }} />}
      {err && <span title="gagal">✕</span>}
      {wsBase && <span title={"terkurung ke folder: " + wsRoot} onClick={editable ? (e) => { e.stopPropagation(); setFolder(); } : undefined} style={{ marginLeft: "auto", color: "#d29922", cursor: editable ? "pointer" : "default", textTransform: "none", letterSpacing: 0, fontSize: "9px" }}>📁 {wsBase}</span>}
    </div>
  );
  const labelEl = editing ? (
    <input className="nodrag" autoFocus defaultValue={data.label}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commit(e.currentTarget.value); else if (e.key === "Escape") setEditing(false); }}
      onBlur={(e) => commit(e.currentTarget.value)}
      style={{ width: "100%", background: "#0d1117", border: "1px solid " + edge, borderRadius: "5px", color: "#dce4f0", fontFamily: "ui-monospace, monospace", fontSize: "12px", fontWeight: 600, padding: "2px 6px", outline: "none", textAlign: shape === "diamond" ? "center" : "left" }} />
  ) : (
    <div onDoubleClick={(e) => { e.stopPropagation(); if (editable) setEditing(true); }} title={editable ? "dobel-klik: ubah label" : undefined}
      style={{ fontSize: "12.5px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: editable ? "text" : "default", textAlign: shape === "diamond" ? "center" : "left" }}>{data.label}</div>
  );
  const resultEl = data && data.result ? (
    <div onClick={(e) => { e.stopPropagation(); ctx && ctx.openDetail && ctx.openDetail({ label: data.label, kind: data.kind, result: data.result, accent: edge }); }}
      title="klik: lihat hasil lengkap"
      style={{ marginTop: "5px", paddingTop: shape === "diamond" ? 0 : "5px", borderTop: shape === "diamond" ? "none" : "1px solid #21324a", fontSize: "10.5px", color: "#8fb3ff", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      📄 {shape === "diamond" ? "hasil" : (String(data.result).replace(/\s+/g, " ").slice(0, 40) + "…")}</div>
  ) : null;
  const _tb = { border: "1px solid #2f4056", background: "#131922", color: "#dce4f0", borderRadius: "5px", width: "24px", height: "22px", cursor: "pointer", fontSize: "11px", display: "inline-flex", alignItems: "center", justifyContent: "center" };
  const toolbar = (NodeToolbar && editable) ? (
    <NodeToolbar isVisible={selected} position={Position.Top} offset={8}>
      <div style={{ display: "flex", gap: "4px" }}>
        <button title="Duplikat (Ctrl+V dari salinan)" style={_tb} onClick={(e) => { e.stopPropagation(); ctx.duplicateNode && ctx.duplicateNode(id); }}>⧉</button>
        <button title={wsRoot ? "Folder node: " + wsRoot : "Ikat node ke folder sendiri (agent terkurung ke sana)"} style={{ ..._tb, color: wsRoot ? "#d29922" : "#dce4f0" }} onClick={(e) => { e.stopPropagation(); setFolder(); }}>📁</button>
        <button title="Hapus" style={{ ..._tb, color: "#f0776b" }} onClick={(e) => { e.stopPropagation(); ctx.deleteNode && ctx.deleteNode(id); }}>🗑</button>
      </div>
    </NodeToolbar>
  ) : null;

  if (shape === "diamond") {
    const diaClip = "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";
    return (
      <div style={{ position: "relative", width: "138px", height: "116px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {toolbar}
        {Handle && <Handle type="target" position={Position.Left} style={hStyle} />}
        <div style={{ position: "absolute", inset: 0, background: active ? edge : edge + "88", clipPath: diaClip }} />
        <div style={{ position: "absolute", inset: "1.6px", background: "#131922", clipPath: diaClip }} />
        <div style={{ position: "relative", textAlign: "center", maxWidth: "74%", color: "#dce4f0", fontFamily: "ui-monospace, monospace" }}>
          {chip}{labelEl}{resultEl}
        </div>
        {Handle && <Handle type="source" position={Position.Right} style={hStyle} />}
      </div>
    );
  }
  const pill = shape === "pill";
  return (
    <div style={{
      minWidth: pill ? "120px" : "128px", maxWidth: "220px", background: "#131922",
      border: "1px solid " + (active ? edge : edge + "55"),
      borderLeft: pill ? "1px solid " + (active ? edge : edge + "55") : "3px solid " + edge,
      borderRadius: pill ? "999px" : "8px", padding: pill ? "8px 18px" : "8px 12px",
      color: "#dce4f0", fontFamily: "ui-monospace, monospace",
      boxShadow: active ? "0 0 0 2px " + edge + "88, 0 4px 14px rgba(0,0,0,.5)" : "0 4px 14px rgba(0,0,0,.4)",
    }}>
      {toolbar}
      {Handle && <Handle type="target" position={Position.Left} style={hStyle} />}
      {chip}{labelEl}{resultEl}
      {Handle && <Handle type="source" position={Position.Right} style={hStyle} />}
    </div>
  );
}

// Edge custom WOLFSPACE: bezier dengan rel gelap + partikel mengalir (dash animasi).
// Label (mis. cabang "ya"/"tidak") dirender via EdgeLabelRenderer bila ada.
function WFEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, label, data }) {
  const XY = window.RFLib && window.RFLib.XY;
  const [path, labelX, labelY] = XY.getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const lbl = (data && data.label) || label;
  return (
    <React.Fragment>
      <path d={path} fill="none" stroke={selected ? "#8fb3ff" : "#24384f"} strokeWidth={3} strokeLinecap="round" />
      <path d={path} fill="none" stroke="#8fb3ff" strokeWidth={1.7} strokeLinecap="round" strokeDasharray="1 10" style={{ animation: "wfflow 0.7s linear infinite" }} />
      {lbl && XY.EdgeLabelRenderer && (
        <XY.EdgeLabelRenderer>
          <div className="nodrag nopan" style={{ position: "absolute", transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, background: "#0d1117", border: "1px solid #2f4056", borderRadius: "5px", padding: "1px 7px", fontSize: "10px", color: "#8fb3ff", fontFamily: "ui-monospace, monospace", pointerEvents: "all" }}>{lbl}</div>
        </XY.EdgeLabelRenderer>
      )}
    </React.Fragment>
  );
}

// Background diagonal cross-hatch WOLFSPACE — komponen kustom di atas API publik
// React Flow (useStore -> transform viewport), tanpa menyentuh internal library.
// Menggantikan varian fork "BackgroundVariant.Diagonal" (fork sudah dilepas ke npm).
function WFDiagonalBackground({ gap = 26, color = "#1c2a3a", lineWidth = 1 }) {
  const XY = window.RFLib.XY;
  const transform = XY.useStore((s) => s.transform); // [x, y, zoom]
  const g = gap * transform[2];
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
      <pattern id="wf-diag-bg" x={transform[0] % g} y={transform[1] % g} width={g} height={g} patternUnits="userSpaceOnUse">
        <path d={`M0 0 L${g} ${g} M${g} 0 L0 ${g}`} stroke={color} strokeWidth={lineWidth} fill="none" />
      </pattern>
      <rect x="0" y="0" width="100%" height="100%" fill="url(#wf-diag-bg)" />
    </svg>
  );
}

function WorkflowBuilderInner({ onBack, runStage }) {
  const XY = window.RFLib.XY;
  const { ReactFlow, useNodesState, useEdgesState, addEdge, useReactFlow, applyNodeChanges } = XY;
  const idRef = React.useRef(3);
  const [nodes, setNodes, onNodesChange] = useNodesState([
    { id: "n1", type: "wf", position: { x: 60, y: 110 }, data: { label: "User prompt", kind: "prompt", accent: "#3fb950" } },
    { id: "n2", type: "wf", position: { x: 320, y: 110 }, data: { label: "Coding agent", kind: "agent", accent: "#2f81f7" } },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([
    { id: "e1", source: "n1", target: "n2", type: "wf" },
  ]);
  const [showJson, setShowJson] = React.useState(false);
  // mode "builder" = kanvas manual; "live" = cermin eksekusi agent (Fase 1) —
  // tiap langkah t:"act" dari self_agent.cjs jadi node berurut, yang terbaru disorot.
  const [mode, setMode] = React.useState("builder");
  const [liveNodes, setLiveNodes] = React.useState([]);
  const [liveEdges, setLiveEdges] = React.useState([]);
  const liveRef = React.useRef({ i: 0, lastId: null });
  // Fase 2: eksekusi graph tergambar (Builder) sebagai pipeline agent berurutan.
  const [running, setRunning] = React.useState(false);
  const [runErr, setRunErr] = React.useState("");
  const runAbort = React.useRef(false);
  const [detailNode, setDetailNode] = React.useState(null); // #2 panel detail hasil node
  const [showLoad, setShowLoad] = React.useState(false);     // #1 menu muat
  const [savedList, setSavedList] = React.useState(() => {
    try { return Object.keys(JSON.parse(localStorage.getItem("wolfspace_workflows") || "{}")); } catch (_) { return []; }
  });
  const rf = useReactFlow();
  const isLive = mode === "live";
  const nodeTypes = React.useMemo(() => ({ wf: WFNodeCard }), []);
  const edgeTypes = React.useMemo(() => ({ wf: WFEdge }), []);

  // Dengar stream agent (dipancarkan dari doSend): bangun graph eksekusi live.
  React.useEffect(() => {
    // Live "loop nyata": cermin STRUKTUR LangGraph agent (planner → executor ⇄
    // tools → validate) sebagai node peran tetap dalam layout loop; langkah konkret
    // dikelompokkan per-peran (klik node → semua langkahnya). kind act → peran.
    const ROLES = [
      { id: "R_planner", role: "planner", pos: { x: 0, y: 30 }, accent: "#bc8cff" },
      { id: "R_executor", role: "executor", pos: { x: 250, y: 30 }, accent: "#2f81f7" },
      { id: "R_tools", role: "tools", pos: { x: 510, y: 30 }, accent: "#d29922" },
      { id: "R_validate", role: "validate", pos: { x: 250, y: 190 }, accent: "#3fb950" },
    ];
    const roleOf = (kind) => {
      if (kind === "planner") return "planner";
      if (kind === "validate" || kind === "verify") return "validate";
      if (["bash", "read", "edit", "write", "grep", "glob", "list", "task", "architecture_map"].indexOf(kind) >= 0) return "tools";
      return "executor"; // workspace, hitl, continue, thought, dll = giliran executor
    };
    const baseNodes = () => ROLES.map((r) => ({ id: r.id, type: "wf", position: { ...r.pos }, data: { label: r.role, kind: r.role, accent: r.accent, steps: [], active: false } }));
    const baseEdges = () => [
      { id: "le1", source: "R_planner", target: "R_executor", type: "wf" },
      { id: "le2", source: "R_executor", target: "R_tools", type: "wf", data: { label: "panggil" } },
      { id: "le3", source: "R_tools", target: "R_executor", type: "wf", data: { label: "hasil" } }, // loop-back
      { id: "le4", source: "R_executor", target: "R_validate", type: "wf" },
    ];
    const onRun = (e) => {
      const phase = e.detail && e.detail.phase;
      if (phase === "start") {
        liveRef.current = { steps: { planner: [], executor: [], tools: [], validate: [] } };
        setLiveNodes(baseNodes()); setLiveEdges(baseEdges());
        setMode("live");
        setTimeout(() => { try { rf && rf.fitView && rf.fitView({ duration: 300, padding: 0.25 }); } catch (_) {} }, 60);
      } else if (phase === "done") {
        setLiveNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, active: false } })));
      }
    };
    const onAct = (e) => {
      const d = e.detail || {};
      const role = roleOf(d.kind);
      const rid = "R_" + role;
      const st = liveRef.current || (liveRef.current = { steps: { planner: [], executor: [], tools: [], validate: [] } });
      if (!st.steps[role]) st.steps[role] = [];
      st.steps[role].push((String(d.arg || "").trim() || d.kind || "langkah").slice(0, 60));
      const list = st.steps[role];
      setLiveNodes((nds) => {
        const has = nds.some((n) => n.id === rid);
        const src = has ? nds : baseNodes();
        return src.map((n) => {
          if (n.id === rid) return { ...n, data: { ...n.data, active: true, ok: d.ok, label: role + " · " + list.length, result: list.map((s, i) => (i + 1) + ". " + s).join("\n") } };
          return { ...n, data: { ...n.data, active: false } };
        });
      });
      setLiveEdges((eds) => (eds.length ? eds : baseEdges()));
    };
    window.addEventListener("wolfspace_agent_run", onRun);
    window.addEventListener("wolfspace_agent_act", onAct);
    return () => { window.removeEventListener("wolfspace_agent_run", onRun); window.removeEventListener("wolfspace_agent_act", onAct); };
  }, [rf]);

  // Chat kanan minta "buat workflow" → agent kirim spec → render ke kanvas (Builder).
  React.useEffect(() => {
    const onSpec = (e) => {
      const spec = e.detail;
      if (!spec || !Array.isArray(spec.nodes) || !spec.nodes.length) return;
      const { nodes: nn, edges: ee } = specToFlow(spec);
      if (!nn.length) return;
      setMode("builder");
      setNodes(nn);
      setEdges(ee);
      setTimeout(() => { try { rf && rf.fitView && rf.fitView({ duration: 400, padding: 0.2 }); } catch (_) {} }, 80);
    };
    window.addEventListener("wolfspace_workflow_spec", onSpec);
    return () => window.removeEventListener("wolfspace_workflow_spec", onSpec);
  }, [rf, setNodes, setEdges]);

  const liveOnNodesChange = React.useCallback((changes) => setLiveNodes((nds) => applyNodeChanges(changes, nds)), [applyNodeChanges]);
  const noop = React.useCallback(() => {}, []);

  const onConnect = React.useCallback(
    (c) => setEdges((eds) => addEdge({ ...c, type: "wf" }, eds)),
    [setEdges, addEdge],
  );
  const onDragOver = React.useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }, []);
  const addNode = React.useCallback((item, clientX, clientY) => {
    const pos = rf && rf.screenToFlowPosition ? rf.screenToFlowPosition({ x: clientX, y: clientY }) : { x: 220, y: 180 };
    const id = "n" + idRef.current++;
    setNodes((nds) => nds.concat({ id, type: "wf", position: pos, data: { label: item.label, kind: item.type, accent: item.accent } }));
  }, [rf, setNodes]);
  const onDrop = React.useCallback((e) => {
    e.preventDefault();
    if (isLive) return;
    const raw = e.dataTransfer.getData("application/wf");
    if (!raw) return;
    try { addNode(JSON.parse(raw), e.clientX, e.clientY); } catch (_) {}
  }, [addNode, isLive]);

  // Fase 2: JALANKAN graph tergambar. Kompilasi → urutan topological → eksekusi tiap
  // node berurutan (prompt = seed; agent/tool/condition/output = 1 giliran agent),
  // node menyala saat berjalan, konteks di-thread antar-node. Hasil ke panel chat.
  const setNodeData = (id, patch) => setNodes((nds) => nds.map((x) => (x.id === id ? { ...x, data: { ...x.data, ...patch } } : x)));
  const clearActive = () => setNodes((nds) => nds.map((x) => ({ ...x, data: { ...x.data, active: false } })));
  const runGraph = async () => {
    if (running || !runStage) return;
    if (!nodes.length) { setRunErr("Kanvas kosong — tambah node dulu."); setTimeout(() => setRunErr(""), 4000); return; }
    setRunErr(""); setRunning(true); runAbort.current = false;
    setNodes((nds) => nds.map((x) => ({ ...x, data: { ...x.data, active: false, ok: undefined, result: undefined } })));
    // #4: TRAVERSAL BERCABANG. Mulai dari node tanpa masukan; di node Condition,
    // agent MEMILIH satu cabang (cocokkan jawaban ke label edge / label node target)
    // — hanya jalur itu diikuti. Non-condition mengikuti semua edge keluar.
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const outOf = (id) => edges.filter((e) => e.source === id);
    const edgeLabel = (e) => String((e.data && e.data.label) || e.label || "");
    const indeg = new Map(nodes.map((n) => [n.id, 0]));
    edges.forEach((e) => { if (indeg.has(e.target)) indeg.set(e.target, indeg.get(e.target) + 1); });
    let queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
    if (!queue.length) queue = [nodes[0].id];
    const visited = new Set();
    let ctx = "", steps = 0;
    try {
      while (queue.length && !runAbort.current && steps < 60) {
        const id = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id); steps++;
        const n = byId.get(id); if (!n) continue;
        clearActive(); setNodeData(id, { active: true });
        const kind = n.data.kind, label = n.data.label, outs = outOf(id);
        if (kind === "prompt") {
          ctx = label || "";
          outs.forEach((e) => queue.push(e.target));
          continue;
        }
        if (kind === "condition" && outs.length > 1) {
          const choices = outs.map((e) => edgeLabel(e) || (byId.get(e.target) && byId.get(e.target).data.label) || e.target);
          const q = `Evaluasi kondisi: "${label}". Pilih SATU cabang dari daftar berikut dan jawab HANYA dengan nama cabang itu: [${choices.join(", ")}].` + (ctx ? "\n\nKonteks:\n" + ctx : "");
          const r = await runStage(q, { kind, label, workspaceRoot: n.data.workspaceRoot });
          setNodeData(id, { ok: r.ok, result: r.summary || "" });
          const ans = String(r.summary || "").toLowerCase();
          let picked = outs.find((e) => { const l = edgeLabel(e).toLowerCase(); return l && ans.includes(l); });
          if (!picked) picked = outs.find((e) => { const t = byId.get(e.target); return t && t.data.label && ans.includes(String(t.data.label).toLowerCase()); });
          if (!picked) picked = outs[0];
          ctx += `\n\n[condition] ${label} → ${edgeLabel(picked) || (byId.get(picked.target) && byId.get(picked.target).data.label) || picked.target}`;
          queue.push(picked.target);
        } else {
          const r = await runStage(buildStagePrompt(kind, label, ctx), { kind, label, workspaceRoot: n.data.workspaceRoot });
          ctx += `\n\n[${kind}] ${label}:\n${(r.summary || "").slice(0, 700)}`;
          setNodeData(id, { ok: r.ok, result: r.summary || "" });
          outs.forEach((e) => queue.push(e.target));
        }
      }
    } catch (e) {
      setRunErr(e.message || "gagal menjalankan graph");
    }
    clearActive();
    setRunning(false);
  };

  // #1 Simpan/muat workflow ke localStorage (bertahan lintas reload).
  const _wfStore = () => { try { return JSON.parse(localStorage.getItem("wolfspace_workflows") || "{}"); } catch (_) { return {}; } };
  const saveWorkflow = () => {
    const name = (window.prompt("Simpan workflow sebagai:", "wf-" + new Date().toISOString().slice(0, 10)) || "").trim();
    if (!name) return;
    const all = _wfStore();
    all[name] = {
      nodes: nodes.map((n) => ({ id: n.id, type: "wf", position: n.position, data: { label: n.data.label, kind: n.data.kind, accent: n.data.accent, workspaceRoot: n.data.workspaceRoot } })),
      edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: "wf", label: e.label })),
    };
    try { localStorage.setItem("wolfspace_workflows", JSON.stringify(all)); setSavedList(Object.keys(all)); } catch (_) {}
  };
  const loadWorkflow = (name) => {
    const wf = _wfStore()[name];
    if (!wf) return;
    setNodes(wf.nodes); setEdges(wf.edges); setShowLoad(false);
    setTimeout(() => { try { rf.fitView({ duration: 300, padding: 0.2 }); } catch (_) {} }, 60);
  };
  const deleteWorkflow = (name) => {
    const all = _wfStore(); delete all[name];
    try { localStorage.setItem("wolfspace_workflows", JSON.stringify(all)); setSavedList(Object.keys(all)); } catch (_) {}
  };

  // #3 Auto-layout dengan dagre (aset sudah di-vendor: window.RFLib.dagre).
  const autoLayout = () => {
    const dagre = window.RFLib && window.RFLib.dagre;
    if (!dagre || !nodes.length) return;
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: "LR", nodesep: 42, ranksep: 96 });
    g.setDefaultEdgeLabel(() => ({}));
    const W = 168, H = 62;
    nodes.forEach((n) => g.setNode(n.id, { width: W, height: H }));
    edges.forEach((e) => g.setEdge(e.source, e.target));
    dagre.layout(g);
    setNodes((nds) => nds.map((n) => { const p = g.node(n.id); return p ? { ...n, position: { x: p.x - W / 2, y: p.y - H / 2 } } : n; }));
    setTimeout(() => { try { rf.fitView({ duration: 300, padding: 0.2 }); } catch (_) {} }, 60);
  };

  // ── Quick wins: undo, duplikat/hapus per-node (toolbar), copy-paste ──────────
  const historyRef = React.useRef([]);
  const clipboardRef = React.useRef(null);
  const snapshot = () => { try { historyRef.current.push({ nodes: JSON.parse(JSON.stringify(nodes)), edges: JSON.parse(JSON.stringify(edges)) }); if (historyRef.current.length > 40) historyRef.current.shift(); } catch (_) {} };
  const undo = () => { const h = historyRef.current.pop(); if (h) { setNodes(h.nodes); setEdges(h.edges); } };
  const duplicateNode = (nid) => {
    const n = nodes.find((x) => x.id === nid); if (!n) return;
    snapshot();
    const id2 = "n" + idRef.current++;
    setNodes((nds) => nds.map((x) => ({ ...x, selected: false })).concat({ ...n, id: id2, position: { x: n.position.x + 44, y: n.position.y + 44 }, selected: true, data: { ...n.data, active: false, ok: undefined, result: undefined } }));
  };
  const deleteNode = (nid) => { snapshot(); setNodes((nds) => nds.filter((x) => x.id !== nid)); setEdges((eds) => eds.filter((e) => e.source !== nid && e.target !== nid)); };
  const copySelected = () => { const sel = nodes.filter((n) => n.selected); if (sel.length) { try { clipboardRef.current = JSON.parse(JSON.stringify(sel)); } catch (_) {} } };
  const pasteClipboard = () => {
    const cb = clipboardRef.current; if (!cb || !cb.length) return;
    snapshot();
    const clones = cb.map((n) => ({ ...n, id: "n" + idRef.current++, position: { x: n.position.x + 50, y: n.position.y + 50 }, selected: true, data: { ...n.data, active: false, ok: undefined, result: undefined } }));
    setNodes((nds) => nds.map((n) => ({ ...n, selected: false })).concat(clones));
  };
  React.useEffect(() => {
    if (isLive) return;
    const onKey = (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable)) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === "c") copySelected();
      else if ((e.ctrlKey || e.metaKey) && k === "v") { e.preventDefault(); pasteClipboard(); }
      else if ((e.ctrlKey || e.metaKey) && k === "z") { e.preventDefault(); undo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLive, nodes, edges]);

  const wf = {
    nodes: nodes.map((n) => ({ id: n.id, kind: n.data.kind, label: n.data.label, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) } })),
    edges: edges.map((e) => ({ from: e.source, to: e.target })),
  };
  const btn = { fontFamily: "ui-monospace, monospace", fontSize: "11px", color: "#dce4f0", background: "#131922", border: "1px solid #2f4056", borderRadius: "6px", padding: "6px 9px", cursor: "pointer" };

  const shownNodes = isLive ? liveNodes : nodes;
  const shownEdges = isLive ? liveEdges : edges;

  return (
    <div style={{ display: "flex", height: "100%", width: "100%", background: "#0d1117" }}>
      <div style={{ width: "158px", flexShrink: 0, borderRight: "1px solid #212a36", background: "#0c1219", padding: "12px 10px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "2px" }}>
          <button onClick={onBack} title="Kembali ke chat" style={{ ...btn, padding: "3px 8px" }}>←</button>
          <span style={{ fontSize: "10px", letterSpacing: ".14em", textTransform: "uppercase", color: "#6f7d92", fontFamily: "ui-monospace, monospace" }}>{isLive ? "Live" : "Nodes"}</span>
        </div>
        {isLive ? (
          <div style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px", color: "#8fb3ff", lineHeight: 1.6, background: "#0f1620", border: "1px solid #212a36", borderRadius: "7px", padding: "8px 9px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#3fb950", boxShadow: "0 0 6px #3fb950" }} />
              cermin eksekusi agent
            </div>
            <div style={{ color: "#6f7d92", marginTop: "5px" }}>{liveNodes.length ? "struktur graph aktif" : "menunggu…"}</div>
            <div style={{ color: "#6f7d92", marginTop: "3px" }}>Jalankan agent di chat — langkahnya muncul di sini.</div>
          </div>
        ) : (
          WF_PALETTE.map((it) => (
            <div key={it.type} draggable
              onDragStart={(e) => { e.dataTransfer.setData("application/wf", JSON.stringify(it)); e.dataTransfer.effectAllowed = "move"; }}
              onDoubleClick={() => addNode(it, window.innerWidth / 2, window.innerHeight / 2)}
              title={it.desc + " — seret ke kanvas atau dobel-klik"}
              style={{ fontFamily: "ui-monospace, monospace", fontSize: "12px", color: "#dce4f0", background: "#131922", border: "1px solid #212a36", borderLeft: "3px solid " + it.accent, borderRadius: "7px", padding: "7px 9px", cursor: "grab", userSelect: "none" }}>
              {it.label}
            </div>
          ))
        )}
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
          <button style={{ ...btn, borderColor: isLive ? "#3fb95088" : "#2f4056" }} onClick={() => setMode((m) => (m === "live" ? "builder" : "live"))} title="Beralih antara kanvas manual dan cermin eksekusi agent">
            Mode: {isLive ? "Live" : "Builder"}
          </button>
          {!isLive && (
            <React.Fragment>
              <button
                style={{ ...btn, background: running ? "#21262d" : "#132a1c", borderColor: running ? "#2f4056" : "#2e6b3f", color: running ? "#8b949e" : "#7ee2a8", fontWeight: 600 }}
                onClick={() => (running ? (runAbort.current = true) : runGraph())}
                title="Kompilasi graph → jalankan node berurutan sebagai pipeline agent"
              >
                {running ? "■ Hentikan" : "▶ Jalankan graph"}
              </button>
              {runErr && <div style={{ fontSize: "10.5px", color: "#f0776b", lineHeight: 1.4 }}>{runErr}</div>}
              <button style={btn} onClick={autoLayout} title="Rapikan tata letak otomatis (dagre)">⇄ Rapikan</button>
              <div style={{ display: "flex", gap: "6px" }}>
                <button style={{ ...btn, flex: 1 }} onClick={saveWorkflow} title="Simpan workflow ini">💾 Simpan</button>
                <button style={{ ...btn, flex: 1 }} onClick={() => setShowLoad((s) => !s)} title="Muat workflow tersimpan" disabled={!savedList.length}>📂 Muat</button>
              </div>
              {showLoad && (
                <div style={{ background: "#0d1117", border: "1px solid #212a36", borderRadius: "7px", maxHeight: "160px", overflowY: "auto" }}>
                  {savedList.length === 0 ? (
                    <div style={{ padding: "8px", fontSize: "11px", color: "#6f7d92" }}>belum ada tersimpan</div>
                  ) : savedList.map((nm) => (
                    <div key={nm} style={{ display: "flex", alignItems: "center", gap: "4px", padding: "5px 7px", fontSize: "11.5px" }}>
                      <span onClick={() => loadWorkflow(nm)} style={{ flex: 1, cursor: "pointer", color: "#dce4f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title="klik: muat">{nm}</span>
                      <button onClick={() => deleteWorkflow(nm)} title="hapus" style={{ border: "none", background: "transparent", color: "#f0776b", cursor: "pointer", fontSize: "11px" }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <button style={btn} onClick={() => setShowJson((s) => !s)}>{showJson ? "Tutup JSON" : "Export JSON"}</button>
            </React.Fragment>
          )}
          <button style={btn} onClick={() => { if (isLive) { setLiveNodes([]); setLiveEdges([]); liveRef.current = { i: 0, lastId: null }; } else { setNodes([]); setEdges([]); } }}>Bersihkan</button>
        </div>
      </div>
      <div style={{ flex: 1, position: "relative" }} onDrop={onDrop} onDragOver={onDragOver}>
        <style>{"@keyframes wfflow{to{stroke-dashoffset:-22}}"}</style>
        <WFNodeCtx.Provider value={{ setNodes, editable: !isLive, openDetail: setDetailNode, duplicateNode, deleteNode }}>
          <ReactFlow nodes={shownNodes} edges={shownEdges} onNodesChange={isLive ? liveOnNodesChange : onNodesChange} onEdgesChange={isLive ? noop : onEdgesChange} onConnect={isLive ? noop : onConnect}
            onEdgeDoubleClick={isLive ? undefined : (ev, edge) => {
              const cur = (edge.data && edge.data.label) || edge.label || "";
              const l = window.prompt("Label edge (mis. cabang kondisi 'ya'/'tidak'):", cur);
              if (l !== null) setEdges((eds) => eds.map((x) => (x.id === edge.id ? { ...x, data: { ...x.data, label: l.trim() }, label: undefined } : x)));
            }}
            nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultEdgeOptions={{ type: "wf" }} colorMode="dark" fitView proOptions={{ hideAttribution: true }}>
            <WFDiagonalBackground gap={26} lineWidth={1} color="#1c2a3a" />
          </ReactFlow>
        </WFNodeCtx.Provider>
        {/* Kontrol custom WOLFSPACE (ganti <Controls> bawaan) */}
        <div style={{ position: "absolute", right: "14px", bottom: "14px", display: "flex", flexDirection: "column", gap: "4px", zIndex: 5 }}>
          {[["＋", () => rf.zoomIn({ duration: 150 }), "Perbesar"], ["－", () => rf.zoomOut({ duration: 150 }), "Perkecil"], ["⤢", () => rf.fitView({ duration: 300, padding: 0.2 }), "Pas ke layar"]].map(([lbl, fn, t]) => (
            <button key={t} onClick={fn} title={t}
              style={{ width: "30px", height: "30px", borderRadius: "7px", border: "1px solid #212a36", background: "#131922", color: "#8fb3ff", cursor: "pointer", fontSize: "15px", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#1a2430")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "#131922")}>{lbl}</button>
          ))}
        </div>
        {showJson && !isLive && (
          <pre style={{ position: "absolute", right: "14px", top: "14px", maxHeight: "60%", maxWidth: "340px", overflow: "auto", margin: 0, fontFamily: "ui-monospace, monospace", fontSize: "11px", lineHeight: 1.5, color: "#9fb7d9", background: "#0c1219", border: "1px solid #212a36", borderRadius: "8px", padding: "10px 12px" }}>{JSON.stringify(wf, null, 2)}</pre>
        )}
        {/* #2: panel detail hasil node (klik cuplikan hasil di kartu) */}
        {detailNode && (
          <div style={{ position: "absolute", right: "14px", top: "14px", maxHeight: "72%", width: "320px", display: "flex", flexDirection: "column", background: "#0c1219", border: "1px solid " + (detailNode.accent || "#2f4056"), borderRadius: "9px", boxShadow: "0 12px 36px rgba(0,0,0,.6)", zIndex: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "9px 12px", borderBottom: "1px solid #212a36" }}>
              <span style={{ fontSize: "9px", letterSpacing: ".12em", textTransform: "uppercase", color: detailNode.accent || "#8fb3ff", fontFamily: "ui-monospace, monospace" }}>{detailNode.kind}</span>
              <span style={{ flex: 1, fontSize: "12.5px", fontWeight: 600, color: "#dce4f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detailNode.label}</span>
              <button onClick={() => setDetailNode(null)} style={{ border: "none", background: "transparent", color: "#8b949e", cursor: "pointer", fontSize: "14px" }}>✕</button>
            </div>
            <div style={{ padding: "10px 12px", overflowY: "auto", fontSize: "12px", lineHeight: 1.55, color: "#c7d4e3", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{detailNode.result}</div>
          </div>
        )}
        <div style={{ position: "absolute", left: "14px", bottom: "14px", fontFamily: "ui-monospace, monospace", fontSize: "11px", color: "#6f7d92", background: "rgba(19,25,34,.82)", border: "1px solid #212a36", borderRadius: "7px", padding: "5px 11px", pointerEvents: "none" }}>
          {isLive
            ? (liveNodes.length ? "Struktur graph agent (planner→executor⇄tools→validate) — peran aktif disorot, klik node untuk langkahnya" : "Menunggu agent… jalankan sesuatu di chat")
            : "Seret node dari kiri · tarik antar-titik untuk menyambung · Del untuk hapus"}
        </div>
      </div>
    </div>
  );
}

function WorkflowBuilder({ onBack, runStage }) {
  const XY = window.RFLib && window.RFLib.XY;
  if (!XY || !XY.ReactFlow || !XY.ReactFlowProvider) {
    return <div style={{ padding: "40px", color: "#6f7d92", fontFamily: "ui-monospace, monospace" }}>React Flow tak termuat (window.RFLib.XY tak tersedia).</div>;
  }
  const { ReactFlowProvider } = XY;
  return (
    <ReactFlowProvider>
      <WorkflowBuilderInner onBack={onBack} runStage={runStage} />
    </ReactFlowProvider>
  );
}

/* ============================================================
   Agent Runner View
   ============================================================ */
function AgentRunnerView({
  onBack,
  agents,
  activeAgent,
  agentRunning,
  agentOutput,
  onLoadAgents,
  onStart,
  onStop,
  onSend,
  currentModel,
  panelOpen,
  setPanelOpen,
}) {
  // Command Palette: state/logic now lives in App() (see App's own hooks) —
  // this component's local copy was never reachable from App's trigger button.
  const [selected, setSelected] = useState("");
  const [fullScreenAgent, setFullScreenAgent] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState("");
  const [localRunning, setLocalRunning] = useState(false);
  const xtermRef = useRef(null); // DOM container for xterm.js
  const termRef = useRef(null); // xterm.js Terminal instance
  const fitRef = useRef(null); // xterm.js FitAddon
  const esRef = useRef(null); // EventSource for SSE
  const localRunningRef = useRef(false); // mirror of localRunning for closures
  const ensureStartedRef = useRef(null); // ref to ensureStarted function
  const inputQueueRef = useRef([]); // queue of pending keystrokes
  const sendingRef = useRef(false); // lock for sequential send
  const startingRef = useRef(false); // prevent concurrent agent starts
  const runnerAgents = agents.filter((a) => (a.id || a.name) !== "WOLFSPACE");

  const getAgentStyle = (id) => {
    if (id === "WOLFSPACE") {
      return {
        background: "rgba(139,109,255,0.12)",
        color: "#8b6dff",
        padding: "6px",
        borderRadius: "8px",
        display: "inline-flex",
      };
    }
    if (id === "opencode") {
      return {
        background: "rgba(16,185,129,0.12)",
        color: "#10b981",
        padding: "6px",
        borderRadius: "8px",
        display: "inline-flex",
      };
    }
    if (id === "claude") {
      return {
        background: "rgba(217,119,87,0.12)",
        color: "#D97757",
        padding: "6px",
        borderRadius: "8px",
        display: "inline-flex",
      };
    }
    return {};
  };

  const getAgentIcon = (id) => {
    if (id === "WOLFSPACE") return SB.quantumAgent;
    if (id === "opencode") return SB.opencode;
    if (id === "claude") return SB.claude;
    return SB.runner;
  };

  useEffect(() => {
    onLoadAgents();
  }, []);

  // Sync localRunningRef
  useEffect(() => {
    localRunningRef.current = localRunning;
  }, [localRunning]);

  // Set ensureStartedRef
  useEffect(() => {
    ensureStartedRef.current = ensureStarted;
  });

  // -- xterm.js init when fullscreen opens --
  useEffect(() => {
    if (!fullScreenAgent || !xtermRef.current) return;
    // Cleanup any existing terminal
    if (termRef.current) {
      try {
        termRef.current.dispose();
      } catch (_) {}
      termRef.current = null;
    }
    const term = new window.Terminal({
      cols: 120,
      rows: 40,
      scrollback: 10000,
      altClickMovesCursor: true,
      fontFamily: '"JetBrains Mono", Consolas, "Cascadia Code", monospace',
      fontSize: 13,
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#58a6ff",
      },
      cursorBlink: true,
      allowProposedApi: true,
    });
    // xterm.js: FitAddon should be provided by xterm-addon-fit.
    // Some builds expose it as a named export (FitAddon) rather than window.FitAddon.
    const FitAddonCtor =
      window.FitAddon?.FitAddon ||
      window.FitAddon ||
      window.fitAddon?.FitAddon ||
      window.xterm?.FitAddon;
    if (!FitAddonCtor) throw new Error('FitAddon not found/loaded');
    const fit = new FitAddonCtor();
    term.loadAddon(fit);
    const agentId = fullScreenAgent
      ? fullScreenAgent.id || fullScreenAgent.name
      : "";
    term.open(xtermRef.current);
    // Send resize to backend PTY so CLI process (e.g. opencode) adjusts its layout
    term.onResize(({ cols, rows }) => {
      if (agentId) {
        fetch("/api/agents/resize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: agentId, cols, rows }),
        }).catch(() => {});
      }
    });
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;
    term.focus();

    // -- Scroll support: Hanya izinkan scroll di normal buffer, tidak di alternate buffer (TUI)
    // Alternate buffer (yang dipakai opencode CLI/TUI) harus dikontrol penuh oleh aplikasi agar tampilan tidak rusak
    let wheelCleanup = () => {};
    try {
      const el = xtermRef.current;
      if (el && term) {
        const onWheel = (e) => {
          try {
            const buf = term.buffer && term.buffer.active;
            // Hanya proses scroll manual jika BUKAN alternate buffer (TUI)
            // Di alternate buffer, biarkan TUI yang menangani semua input agar tampilan tidak pecah
            if (buf && buf.type === 'alternate') return;
          } catch (_) {}
        };
        el.addEventListener('wheel', onWheel, { capture: true, passive: true });
        wheelCleanup = () => {
          try { el.removeEventListener('wheel', onWheel, { capture: true }); } catch (_) {}
        };
      }
    } catch (_) {}

    // xterm input ? auto-start agent on first keystroke, then send to PTY

    // -- Queue-based sender -- ensures sequential, ordered delivery to PTY
    const flushQueue = async () => {
      if (sendingRef.current) return; // already flushing
      sendingRef.current = true;
      try {
        // Wait for agent start if it's in progress
        while (startingRef.current) {
          await new Promise((r) => setTimeout(r, 50));
        }
        // Auto-start if not running
        if (!localRunningRef.current && agentId) {
          startingRef.current = true;
          const ok = await ensureStartedRef.current(agentId);
          startingRef.current = false;
          if (!ok) {
            sendingRef.current = false;
            return;
          }
          // Let PTY settle
          await new Promise((r) => setTimeout(r, 300));
        }
        // Drain queue � send all buffered chars as one batch
        while (inputQueueRef.current.length > 0) {
          const batch = inputQueueRef.current.splice(0).join("");
          await fetch("/api/agents/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: agentId, text: batch }),
          });
          // Brief pause to let more chars accumulate if user is still typing fast
          await new Promise((r) => setTimeout(r, 10));
        }
      } catch (_) {}
      sendingRef.current = false;
      // If more chars arrived during the last send, flush again
      if (inputQueueRef.current.length > 0) flushQueue();
    };

    term.onData((data) => {
      if (!agentId) return;
      inputQueueRef.current.push(data);
      flushQueue();
    });

    // Debounced resize � prevents flooding PTY with rapid SIGWINCH
    let resizeDebounce = null;
    const doFit = () => {
      clearTimeout(resizeDebounce);
      resizeDebounce = setTimeout(() => {
        try {
          fit.fit();
        } catch (_) {}
      }, 150);
    };
    const ro = new ResizeObserver(() => doFit());
    ro.observe(xtermRef.current);
    window.addEventListener("resize", doFit);

    return () => {
      clearTimeout(resizeDebounce);
      ro.disconnect();
      window.removeEventListener("resize", doFit);
      wheelCleanup();
      if (termRef.current) {
        try {
          termRef.current.dispose();
        } catch (_) {}
        termRef.current = null;
      }
    };
  }, [fullScreenAgent]);

  // -- SSE stream: raw PTY output ? xterm.js --
  const subscribeStream = (agentId) => {
    if (esRef.current) {
      try {
        esRef.current.close();
      } catch (_) {}
    }
    const es = new EventSource("/api/agents/stream");
    esRef.current = es;
    es.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data);
        if (d.type === "output" && d.id === agentId) {
          const raw = d.text || "";
          if (raw && termRef.current) termRef.current.write(raw);
        } else if (d.type === "done" && d.id === agentId) {
          setLocalRunning(false);
        } else if (d.type === "error" && d.id === agentId) {
          if (termRef.current)
            termRef.current.write("\n[ERROR] " + (d.message || "") + "\n");
          setLocalRunning(false);
        }
      } catch (_) {}
    };
    es.onerror = () => {
      esRef.current = null;
    };
  };

  // Open full-screen when card clicked
  const openFullScreen = (agent) => {
    const id = agent.id || agent.name;
    setFullScreenAgent(agent);
    setSelected(id);
    setInstallMsg("");
  };

  const closeFullScreen = () => {
    if (esRef.current) {
      try {
        esRef.current.close();
      } catch (_) {}
      esRef.current = null;
    }
    if (termRef.current) {
      try {
        termRef.current.dispose();
      } catch (_) {}
      termRef.current = null;
    }
    // Stop agent if running
    if (localRunning && selected) {
      fetch("/api/agents/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected }),
      }).catch(() => {});
    }
    setFullScreenAgent(null);
    setLocalRunning(false);
  };

  // Start agent � auto-start on first keystroke if not running
  const ensureStarted = async (agentId) => {
    const id = agentId || selected;
    if (localRunningRef.current || !id) return true;
    // Mark running immediately to prevent concurrent starts
    localRunningRef.current = true;
    try {
      const res = await fetch("/api/agents/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          model: currentModel || "",
          cwd: "",
          cols: termRef.current?.cols,
          rows: termRef.current?.rows,
        }),
      });
      if (res.ok) {
        setLocalRunning(true);
        subscribeStream(id);
        // Sync PTY size to actual xterm.js dimensions (PTY spawns at 120x40 but xterm may differ)
        if (termRef.current) {
          const { cols, rows } = termRef.current;
          fetch("/api/agents/resize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, cols, rows }),
          }).catch(() => {});
        }
        return true;
      } else {
        localRunningRef.current = false;
        const data = await res.json().catch(() => ({}));
        if (termRef.current)
          termRef.current.write(
            "\n? " + (data.error || "Gagal start agent") + "\n",
          );
        return false;
      }
    } catch (e) {
      localRunningRef.current = false;
      if (termRef.current)
        termRef.current.write("\n? " + e.message + "\n");
      return false;
    }
  };

  // Stop agent
  const handleStop = async () => {
    try {
      await fetch("/api/agents/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected }),
      });
    } catch (_) {}
    setLocalRunning(false);
    if (esRef.current) {
      try {
        esRef.current.close();
      } catch (_) {}
      esRef.current = null;
    }
  };

  // Install CLI
  const handleInstall = async () => {
    setInstalling(true);
    setInstallMsg("Installing...");
    try {
      const res = await fetch("/api/agents/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected }),
      });
      const data = await res.json();
      if (data.ok) {
        setInstallMsg("? Installed successfully!");
        setTimeout(() => onLoadAgents(), 500);
      } else {
        setInstallMsg("? " + (data.error || "Install failed"));
      }
    } catch (e) {
      setInstallMsg("? " + e.message);
    }
    setInstalling(false);
  };

  const fsAgent = fullScreenAgent;
  const fsId = fsAgent ? fsAgent.id || fsAgent.name : "";
  const FSIcon = getAgentIcon(fsId);
  const fsAvailable = fsAgent ? fsAgent.available : false;

  return (
    <div
      className="hub"
      style={{
        background:
          "radial-gradient(1200px 600px at 80% -10%, rgba(139,109,255,0.06), transparent 60%), radial-gradient(1000px 500px at 10% 110%, rgba(59,130,246,0.05), transparent 55%), var(--bg)",
      }}
    >
      {fsAgent ? (
        /* ----------- FULL-SCREEN AGENT VIEW ----------- */
        <div className="ar-fullscreen">
          {/* Header */}
          <header className="ar-fs-header">
            {typeof fsAgent.icon === "string" &&
            (fsAgent.icon.startsWith("data:") ||
              /\.(png|svg|jpg|jpeg|gif|webp|ico)$/i.test(fsAgent.icon)) ? (
              <img
                className="ar-fs-icon"
                src={fsAgent.icon}
                alt={fsAgent.name || ""}
              />
            ) : (
                            <span className="ar-fs-icon" style={getAgentStyle(fsId)}>
                {typeof FSIcon === "function" ? FSIcon({ width: 22, height: 22 }) : FSIcon}
              </span>
            )}
            <span className="ar-fs-name">{fsAgent.name || fsId}</span>
            <span
              className={
                "ar-fs-status " +
                (localRunning ? "running" : fsAvailable ? "ready" : "")
              }
            >
              <span className="ar-fs-dot" />
              {localRunning
                ? "Berjalan"
                : fsAvailable
                  ? "Siap"
                  : "Belum terpasang"}
            </span>
            <div className="tb-spacer" />
            {localRunning && (
              <button className="ar-fs-stop-btn" onClick={handleStop}>
                � Stop
              </button>
            )}
          </header>

          {/* Body: xterm.js terminal */}
          <div className="ar-fs-body">
            <div
              className="ar-fs-terminal"
              ref={xtermRef}
              style={{ flex: 1, padding: 0, overflow: "hidden" }}
            />
            {/* -- MINI SIDEBAR -- */}
            <div className="ar-fs-sidebar-mini">
              <div className="ar-fs-section">
                <div className="ar-fs-section-label">Status</div>
                <div className="ar-fs-status-row">
                  <span
                    className={"ar-fs-badge " + (fsAvailable ? "ok" : "warn")}
                  >
                    {fsAvailable ? "Terpasang" : "Belum terpasang"}
                  </span>
                  {!fsAvailable && (
                    <button
                      className="ar-fs-install-btn"
                      onClick={handleInstall}
                      disabled={installing}
                    >
                      {installing ? "Memasang..." : "Pasang CLI"}
                    </button>
                  )}
                </div>
                {installMsg && (
                  <div className="ar-fs-install-msg">{installMsg}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ----------- GRID VIEW ----------- */
        <>
          {/* Header */}
          <header className="hub-header">
            <div className="hub-title-group">
              <span
                className="hub-hf-mark"
                style={{
                  background: "linear-gradient(135deg,#8b6dff,#6d4aff)",
                }}
              >
                {SB.runner({ width: 16, height: 16 })}
              </span>
              <span className="hub-title">Agent Runner</span>
              <span className="hub-subtitle">Multi-agent host</span>
            </div>
            <div className="tb-spacer" />
            <button 
              className={`panel-toggle-btn ${panelOpen ? 'active' : ''}`}
              onClick={() => setPanelOpen(!panelOpen)}
              title="Toggle Right Panel"
              style={{ 
                opacity: panelOpen ? 1 : 0.7, 
                background: 'transparent', 
                border: 'none', 
                cursor: 'pointer', 
                color: 'inherit',
                padding: '6px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/>
                <line x1="15" x2="15" y1="3" y2="21"/>
              </svg>
            </button>
          </header>

          {/* Body */}
          <div className="hub-body">
            <div className="hub-inner">
              <div
                className="agent-runner-view"
                style={{ padding: "0", height: "auto", overflow: "visible" }}
              >
                <div>
                  <div className="agent-runner-section-label">Pilih Agent</div>
                  {runnerAgents.length === 0 ? (
                    <div className="agent-runner-empty">
                      Belum ada agent yang tersedia. Pastikan backend /api/agents
                      sedang berjalan.
                    </div>
                  ) : (
                    <div className="agent-runner-grid">
                      {runnerAgents.map((a) => {
                        const id = a.id || a.name;
                        const Icon = getAgentIcon(id);
                        return (
                          <div
                            key={id}
                            className={"agent-runner-card"}
                            onClick={() => openFullScreen(a)}
                          >
                            <div className="agent-runner-card-head">
                              <span
                                className={
                                  "agent-runner-card-icon" +
                                  (id === "WOLFSPACE"
                                    ? " agent-WOLFSPACE"
                                    : id === "opencode"
                                      ? " agent-opencode"
                                      : id === "claude"
                                        ? " agent-claude"
                                        : "")
                                }
                              >
                                {typeof Icon === "function" ? Icon({ width: 18, height: 18 }) : Icon}
                              </span>
                              <span className="agent-runner-card-name">
                                {a.name || id}
                              </span>
                              {a.available ? (
                                <span className="ar-card-badge">tersedia</span>
                              ) : (
                                <span
                                  className="ar-card-badge"
                                  style={{ color: "var(--text-faint)" }}
                                >
                                  belum terpasang
                                </span>
                              )}
                            </div>
                            <div className="agent-runner-card-desc">
                              {a.description || a.desc || "�"}
                            </div>
                            {a.model && (
                              <div className="agent-runner-card-model">
                                Model: {a.model}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   shadcn/ui-style Components (zero-dep, Tailwind classes)
   ============================================================ */

/* --- Badge --- */
function Badge({ variant = "default", className = "", children, ...props }) {
  const variants = {
    default: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    destructive: "bg-destructive text-destructive-foreground",
    outline: "border border-border text-foreground",
    success: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${variants[variant] || variants.default} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

/* --- Card --- */
function Card({ className = "", children, ...props }) {
  return (
    <div
      className={`rounded-lg border border-border bg-card text-card-foreground shadow-sm ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
function CardHeader({ className = "", children, ...props }) {
  return (
    <div className={`flex flex-col space-y-1.5 p-4 ${className}`} {...props}>
      {children}
    </div>
  );
}
function CardTitle({ className = "", children, ...props }) {
  return (
    <h3
      className={`text-base font-semibold leading-none tracking-tight ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
}
function CardDescription({ className = "", children, ...props }) {
  return (
    <p className={`text-sm text-muted-foreground ${className}`} {...props}>
      {children}
    </p>
  );
}
function CardContent({ className = "", children, ...props }) {
  return (
    <div className={`p-4 pt-0 ${className}`} {...props}>
      {children}
    </div>
  );
}
function CardFooter({ className = "", children, ...props }) {
  return (
    <div className={`flex items-center p-4 pt-0 ${className}`} {...props}>
      {children}
    </div>
  );
}

/* --- Tabs --- */
function Tabs({ tabs, active, onChange, className = "" }) {
  return (
    <div
      className={`inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground ${className}`}
    >
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${
            active === t.value
              ? "bg-background text-foreground shadow-sm"
              : "hover:text-foreground"
          }`}
        >
          {t.icon ? <span className="mr-1.5">{t.icon}</span> : null}
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* --- Dropdown --- */
function Dropdown({ trigger, items, align = "left", className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  return (
    <div className={`relative inline-block ${className}`} ref={ref}>
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <div
          className={`absolute z-50 mt-1 min-w-[12rem] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md ${align === "right" ? "right-0" : "left-0"}`}
        >
          {items.map((item, i) =>
            item.separator ? (
              <div key={i} className="my-1 h-px bg-border" />
            ) : (
              <button
                key={i}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
                className={`relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground ${
                  item.disabled ? "opacity-50 pointer-events-none" : ""
                } ${item.active ? "bg-accent/50" : ""}`}
              >
                {item.icon ? (
                  <span className="text-base">{item.icon}</span>
                ) : null}
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge ? (
                  <Badge variant="muted" className="text-xs">
                    {item.badge}
                  </Badge>
                ) : null}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* --- Dialog --- */
function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className = "",
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={`relative z-50 w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-lg ${className}`}
      >
        {title && (
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        )}
        {description && (
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        )}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* --- Tooltip --- */
function Tooltip({ content, children, side = "top", className = "" }) {
  const [show, setShow] = useState(false);
  const sides = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  };
  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && content && (
        <div
          className={`absolute z-50 whitespace-nowrap rounded-md bg-popover px-2.5 py-1.5 text-xs text-popover-foreground border border-border shadow-md pointer-events-none ${sides[side]} ${className}`}
        >
          {content}
        </div>
      )}
    </div>
  );
}

/* --- Button (shadcn variants) --- */
function Button({
  variant = "default",
  size = "default",
  className = "",
  children,
  ...props
}) {
  const variants = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    destructive:
      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    outline:
      "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "text-primary underline-offset-4 hover:underline",
  };
  const sizes = {
    default: "h-9 px-4 py-2",
    sm: "h-8 rounded-md px-3 text-xs",
    lg: "h-10 rounded-md px-8",
    icon: "h-9 w-9",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

/* --- Input --- */
function Input({ className = "", ...props }) {
  return (
    <input
      className={`flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}

/* --- Separator --- */
function Separator({ orientation = "horizontal", className = "" }) {
  return (
    <div
      className={`${orientation === "horizontal" ? "h-px w-full" : "w-px h-full"} bg-border ${className}`}
    />
  );
}

/* --- ScrollArea --- */
function ScrollArea({ className = "", children, ...props }) {
  return (
    <div className={`overflow-auto ${className}`} {...props}>
      {children}
    </div>
  );
}

/* --- Avatar --- */
function Avatar({ src, fallback, className = "", size = "default" }) {
  const [err, setErr] = useState(false);
  const sizes = {
    sm: "h-6 w-6 text-xs",
    default: "h-8 w-8 text-sm",
    lg: "h-10 w-10 text-base",
  };
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ${sizes[size]} ${className}`}
    >
      {src && !err ? (
        <img
          src={src}
          onError={() => setErr(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="font-medium text-muted-foreground">{fallback}</span>
      )}
    </div>
  );
}

/* ----------------------------- Error Boundary ----------------------------- */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught a Runtime Error:", error, errorInfo);
    this.setState({ error, errorInfo });
    // Rekam error + picu Auto-Rollback lewat guard terpusat di index.html
    // (triggerAppRollback punya anti-loop: tidak reload berulang jika versi aman pun error)
    const errText = (error ? error.toString() : 'Unknown Error') + "\n" + (errorInfo && errorInfo.componentStack ? errorInfo.componentStack : '');
    if (window.triggerAppRollback) {
      window.triggerAppRollback('[ErrorBoundary] ' + errText);
    } else {
      sessionStorage.setItem('wolfspace_rollback_error', errText);
      if (window.location.search.indexOf('rollback=true') === -1) {
        window.location.replace('/?rollback=true');
      }
    }
  }
  render() {
    if (this.state.hasError) {
      // User requested to only log to terminal/inspect and not show the giant crash UI.
      return null;
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
