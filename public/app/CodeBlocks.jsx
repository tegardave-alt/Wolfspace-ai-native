// CodeBlocks — diekstrak dari Components.jsx (app.jsx split). Prepend via APP_MODULES.

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
        const model = edRef.current.getModel();
        if (model) model.dispose();
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
  const subs = {}; // subId -> title
  const parentOf = {}; // nodeId -> subId (grup terdalam yang pertama merujuknya)
  const stack = [];
  const clean = [];
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^subgraph\b/i.test(line)) {
      const rest = line.replace(/^subgraph\s+/i, "");
      const mB =
        rest.match(/^([A-Za-z0-9_:-]+)\s*\[([^\]]*)\]/) ||
        rest.match(/^([A-Za-z0-9_:-]+)\s*"([^"]*)"/);
      let id, title;
      if (mB) {
        id = mB[1];
        title = mB[2];
      } else if (/^[A-Za-z0-9_:-]+$/.test(rest.trim())) {
        id = rest.trim();
        title = id;
      } else {
        id = "sg" + Object.keys(subs).length;
        title = rest.replace(/["']/g, "").trim();
      }
      subs[id] = String(title).replace(/^["']|["']$/g, "");
      stack.push(id);
      continue;
    }
    if (/^end$/i.test(line)) {
      stack.pop();
      continue;
    }
    if (stack.length) {
      const cur = stack[stack.length - 1];
      for (const t of line.match(/[A-Za-z0-9_:-]+/g) || [])
        if (!parentOf[t]) parentOf[t] = cur;
    }
    clean.push(rawLine);
  }
  const parsed = parseMermaidFlowchart(clean.join("\n"));
  if (!parsed || !parsed.nodes || !parsed.nodes.size) return null;

  const cleanLabel = (l) =>
    String(l || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/^\s*["']|["']\s*$/g, "");
  const usedSubs = new Set();
  for (const id of parsed.nodes.keys())
    if (parentOf[id] && subs[parentOf[id]]) usedSubs.add(parentOf[id]);
  const parents = [...usedSubs].map((id) => ({
    data: { id, label: subs[id], isParent: 1 },
  }));

  const nodes = [...parsed.nodes.values()].map((n) => ({
    data: {
      id: n.id,
      label: cleanLabel(n.label || n.id),
      shape: n.shape || "rect",
      deg: 0,
      parent:
        parentOf[n.id] && usedSubs.has(parentOf[n.id])
          ? parentOf[n.id]
          : undefined,
    },
  }));
  const byId = new Map(nodes.map((n) => [n.data.id, n]));
  const edges = (parsed.edges || []).map((e, i) => {
    if (byId.get(e.from)) byId.get(e.from).data.deg++;
    if (byId.get(e.to)) byId.get(e.to).data.deg++;
    return {
      data: {
        id: "ce" + i,
        source: e.from,
        target: e.to,
        label: e.label || "",
      },
    };
  });
  return [...parents, ...nodes, ...edges];
}

function cyLayoutOpts(name) {
  const o = { name, padding: 22, animate: true, animationDuration: 350 };
  if (name === "breadthfirst") {
    o.directed = true;
    o.spacingFactor = 1.1;
  } else if (name === "cose") {
    o.idealEdgeLength = 80;
    o.nodeRepulsion = 8000;
    o.gravity = 0.3;
  } else if (name === "concentric") {
    o.concentric = (n) => n.degree();
    o.levelWidth = () => 3;
  }
  return o;
}

const CY_STYLE = [
  {
    selector: "node",
    style: {
      "background-color": "#141d2b",
      "border-color": "#8fb3ff",
      "border-width": 1.5,
      label: "data(label)",
      color: "#dce4f0",
      "font-family": "ui-monospace, monospace",
      "font-size": 11,
      "text-valign": "center",
      "text-halign": "center",
      "text-wrap": "wrap",
      "text-max-width": 150,
      shape: "round-rectangle",
      width: "label",
      height: "label",
      padding: "9px",
    },
  },
  {
    selector: 'node[shape="diamond"]',
    style: { shape: "diamond", width: 76, height: 54 },
  },
  { selector: 'node[shape="circle"]', style: { shape: "ellipse" } },
  { selector: 'node[shape="round"]', style: { shape: "round-rectangle" } },
  { selector: 'node[shape="subroutine"]', style: { shape: "cut-rectangle" } },
  // compound node = grup subgraph: kotak transparan berlabel di atas, anak-anak di dalam
  {
    selector: "node[?isParent]",
    style: {
      "background-color": "#8fb3ff",
      "background-opacity": 0.05,
      "border-color": "#3a4a63",
      "border-width": 1,
      shape: "round-rectangle",
      label: "data(label)",
      "text-valign": "top",
      "text-halign": "center",
      "font-size": 10,
      color: "#8fb3ff",
      padding: "16px",
      "text-margin-y": 3,
      width: "label",
      height: "label",
    },
  },
  {
    selector: "node[deg >= 4]",
    style: {
      "border-width": 2.5,
      "border-color": "#a9c6ff",
      "background-color": "#182741",
    },
  },
  {
    selector: "edge",
    style: {
      width: 1.4,
      "line-color": "#3f5578",
      "target-arrow-color": "#5f7bb0",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      "arrow-scale": 0.9,
      opacity: 0.9,
      label: "data(label)",
      "font-family": "ui-monospace, monospace",
      "font-size": 9,
      color: "#9fb7d9",
      "text-background-color": "#0d1117",
      "text-background-opacity": 0.85,
      "text-background-padding": 2,
    },
  },
  {
    selector: "node.hl",
    style: { "border-color": "#ffd479", "border-width": 2.5 },
  },
  {
    selector: "edge.hl",
    style: {
      "line-color": "#8fb3ff",
      "target-arrow-color": "#8fb3ff",
      opacity: 1,
      width: 2,
    },
  },
];

// Renderer INTERAKTIF: mermaid (teks) -> Cytoscape (kanvas). Dipakai lewat DiagramBlock
// hanya saat user menekan "interaktif" (default tetap mermaid.js fidelitas-penuh).
function CytoscapeBlock({ code, onStatic }) {
  const ref = useRef(null);
  const cyRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [layout, setLayout] = useState("breadthfirst");
  const elements = useMemo(() => {
    try {
      return mermaidToCytoElements(code);
    } catch (e) {
      return null;
    }
  }, [code]);

  useEffect(() => {
    if (
      !elements ||
      typeof window === "undefined" ||
      typeof window.cytoscape !== "function" ||
      !ref.current
    ) {
      setFailed(true);
      return;
    }
    let cy;
    try {
      cy = window.cytoscape({
        container: ref.current,
        elements,
        style: CY_STYLE,
        layout: cyLayoutOpts("breadthfirst"),
        wheelSensitivity: 0.2,
        minZoom: 0.2,
        maxZoom: 3,
      });
    } catch (e) {
      setFailed(true);
      return;
    }
    cyRef.current = cy;
    cy.on("mouseover", "node", (e) => {
      const n = e.target;
      n.addClass("hl");
      n.connectedEdges().addClass("hl").connectedNodes().addClass("hl");
    });
    cy.on("mouseout", "node", () => cy.elements().removeClass("hl"));
    return () => {
      try {
        cy.destroy();
      } catch (_) {}
      cyRef.current = null;
    };
  }, [elements]);

  useEffect(() => {
    if (cyRef.current) cyRef.current.layout(cyLayoutOpts(layout)).run();
  }, [layout]);

  if (failed || !elements) return <MermaidBlock code={code} />;
  const btn = (l) => ({
    fontFamily: "ui-monospace,monospace",
    fontSize: 11,
    color: layout === l ? "#dce4f0" : "#8b98ac",
    background: layout === l ? "rgba(143,179,255,0.16)" : "transparent",
    border: "1px solid " + (layout === l ? "#8fb3ff" : "#2a3542"),
    borderRadius: 6,
    padding: "3px 9px",
    cursor: "pointer",
  });
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
            <button key={l} style={btn(l)} onClick={() => setLayout(l)}>
              {l}
            </button>
          ))}
          <button
            style={btn("_fit")}
            onClick={() =>
              cyRef.current &&
              cyRef.current.animate({ fit: { padding: 22 } }, { duration: 250 })
            }
          >
            fit
          </button>
          {onStatic ? (
            <button
              style={btn("_st")}
              onClick={onStatic}
              title="Kembali ke diagram statis (fidelitas penuh)"
            >
              ← statis
            </button>
          ) : null}
        </div>
      </div>
      <div
        ref={ref}
        style={{
          height: 360,
          width: "100%",
          background: "radial-gradient(circle at 50% 40%, #0f1620, #0d1117)",
          borderRadius: "0 0 8px 8px",
        }}
      />
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
    if (typeof window === "undefined" || typeof window.cytoscape !== "function")
      return false;
    try {
      const els = mermaidToCytoElements(code);
      return !!(els && els.some((e) => !e.data.source && !e.data.isParent));
    } catch (e) {
      return false;
    }
  }, [code]);
  if (interactive && canInteractive)
    return (
      <CytoscapeBlock code={code} onStatic={() => setInteractive(false)} />
    );
  return (
    <MermaidBlock
      code={code}
      onInteractive={canInteractive ? () => setInteractive(true) : null}
    />
  );
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
    if (!m || !m.render) {
      setFailed(true);
      return;
    }
    let cancelled = false;
    try {
      if (!window.__mermaidInit) {
        m.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: "base",
          themeVariables: {
            background: "#0d1117",
            primaryColor: "#1c2634",
            primaryBorderColor: "#c8d3e0",
            primaryTextColor: "#eaf0f7",
            lineColor: "#8fb3ff",
            secondaryColor: "#161b22",
            tertiaryColor: "#0d1117",
            clusterBkg: "#12161d",
            clusterBorder: "#2b3546",
            edgeLabelBackground: "#0d1117",
            fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
            fontSize: "15px",
          },
          flowchart: {
            curve: "basis",
            htmlLabels: true,
            nodeSpacing: 46,
            rankSpacing: 54,
            padding: 10,
            useMaxWidth: true,
          },
        });
        window.__mermaidInit = true;
      }
      const id = "mmd-" + Math.random().toString(36).slice(2, 9);
      Promise.resolve(m.render(id, code))
        .then(({ svg }) => {
          if (!cancelled && ref.current) ref.current.innerHTML = svg;
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    } catch (e) {
      setFailed(true);
    }
    return () => {
      cancelled = true;
    };
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
            style={{
              marginLeft: "auto",
              fontFamily: "ui-monospace,monospace",
              fontSize: 11,
              color: "#8fb3ff",
              background: "rgba(143,179,255,0.12)",
              border: "1px solid #8fb3ff",
              borderRadius: 6,
              padding: "3px 10px",
              cursor: "pointer",
            }}
          >
            ⇱ interaktif
          </button>
        ) : null}
      </div>
      <div
        className="mermaid-canvas"
        ref={ref}
        style={{
          overflowX: "auto",
          padding: "12px 14px 16px",
          display: "flex",
          justifyContent: "center",
        }}
      />
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
