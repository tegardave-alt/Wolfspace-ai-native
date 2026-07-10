// Model Interface Component - Collapsible model selector
(function() {
  const { useState, useRef, useEffect } = React;
  const { Icon } = window.WOLFSPACE.Icons;

  function ModelInterface({ models, modelVal, setModelVal }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    
    useEffect(() => {
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

  // Export to global namespace
  window.WOLFSPACE = window.WOLFSPACE || {};
  window.WOLFSPACE.Components = window.WOLFSPACE.Components || {};
  window.WOLFSPACE.Components.ModelInterface = ModelInterface;
})();

