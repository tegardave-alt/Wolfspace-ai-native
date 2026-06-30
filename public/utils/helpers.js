// Utility Functions - Common helpers
(function() {
  function escHtml(s) {
    return s.replace(
      /[&<>]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c],
    );
  }

  function mdToHtml(s) {
    let p = escHtml(s);
    p = p.replace(/`([^`\n]+)`/g, '<span class="inline-code">$1</span>');
    p = p.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    return p.replace(/\n/g, "<br/>");
  }

  function parseBlocks(text) {
    const out = [];
    const re = /```(\w*)\n?([\s\S]*?)```/g;
    let last = 0,
      m;
    while ((m = re.exec(text))) {
      const pre = text.slice(last, m.index);
      if (pre.trim()) out.push({ type: "text", html: mdToHtml(pre) });
      out.push({
        type: "code",
        lang: m[1] || "text",
        code: m[2].replace(/\n$/, ""),
      });
      last = re.lastIndex;
    }
    const tail = text.slice(last);
    const open = tail.indexOf("```");
    if (open >= 0) {
      const pre = tail.slice(0, open);
      if (pre.trim()) out.push({ type: "text", html: mdToHtml(pre) });
      out.push({
        type: "code",
        lang: "",
        code: tail.slice(open).replace(/^```\w*\n?/, ""),
      });
    } else if (tail.trim()) out.push({ type: "text", html: mdToHtml(tail) });
    return out;
  }

  function fmtSize(b) {
    if (!b) return "";
    const gb = b / 1073741824;
    return gb >= 1 ? gb.toFixed(2) + " GB" : (b / 1048576).toFixed(0) + " MB";
  }

  // Export to global namespace
  window.Quantum = window.Quantum || {};
  window.Quantum.Utils = {
    escHtml,
    mdToHtml,
    parseBlocks,
    fmtSize
  };
})();
