// HFModels Component - HuggingFace model search and download
(function() {
  const { useState } = React;
  const { fmtSize } = window.Quantum.Utils;

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
      setMsg("mencari…");
      setResults([]);
      setSel("");
      setFiles([]);
      try {
        const r = await (
          await fetch("/hf/search?q=" + encodeURIComponent(t))
        ).json();
        if (r.error) throw new Error(r.error);
        setResults(r);
        setMsg(r.length ? "" : "tidak ada hasil");
      } catch (e) {
        setMsg("gagal: " + e.message);
      }
    };
    
    const pick = async (id) => {
      setSel(id);
      setFiles([]);
      setMsg("memuat file…");
      try {
        const r = await (
          await fetch("/hf/files?id=" + encodeURIComponent(id))
        ).json();
        if (r.error) throw new Error(r.error);
        setFiles(r);
        setMsg(r.length ? "" : "tak ada file .gguf di repo ini");
      } catch (e) {
        setMsg("gagal: " + e.message);
      }
    };
    
    const download = async (file) => {
      if (busy) return;
      setBusy(true);
      setProg(0);
      setMsg("mengunduh " + file.split("/").pop() + "…");
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
                "✓ " +
                  j.model.name +
                  " diunduh & dijalankan (port " +
                  j.model.port +
                  "). Tunggu ~30 dtk, lalu pilih di dropdown Model.",
              );
              onSaved && onSaved();
            } else if (j.t === "err") setMsg("gagal: " + j.m);
          }
        }
      } catch (e) {
        setMsg("gagal: " + e.message);
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
            placeholder="cari GGUF… (mis. qwen coder)"
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
                  ↓ {m.downloads.toLocaleString()} · ♥ {m.likes}
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
                  {heavy ? " ⚠" : ""}
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

  // Export to global namespace
  window.Quantum.Components.HFModels = HFModels;
})();
