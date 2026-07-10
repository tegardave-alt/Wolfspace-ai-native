// HFModels Component - HuggingFace model search and download
(function() {
  const { useState } = React;
  const { fmtSize } = window.WOLFSPACE.Utils;

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
                  Unduhan {m.downloads.toLocaleString()} · Suka {m.likes}
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
  window.WOLFSPACE.Components.HFModels = HFModels;
})();

