// UI Components - Card, Tabs, Dropdown
(function() {
  const { useState, useRef, useEffect } = React;

  // Card Components
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

  // Tabs Component
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

  // Dropdown Component
  function Dropdown({ trigger, items, align = "left", className = "" }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    
    useEffect(() => {
      const handler = (e) => {
        if (ref.current && !ref.current.contains(e.target)) {
          setOpen(false);
        }
      };
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, []);

    return (
      <div className={`relative inline-block ${className}`} ref={ref}>
        <div onClick={() => setOpen(!open)}>{trigger}</div>
        {open && (
          <div
            className={`absolute z-50 mt-1 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md ${
              align === "right" ? "right-0" : "left-0"
            }`}
          >
            {items.map((item, idx) => (
              <button
                key={idx}
                className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  item.onClick && item.onClick();
                  setOpen(false);
                }}
              >
                {item.icon && <span className="mr-2">{item.icon}</span>}
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Export to global namespace
  window.Quantum.Components = window.Quantum.Components || {};
  window.Quantum.Components.Card = Card;
  window.Quantum.Components.CardHeader = CardHeader;
  window.Quantum.Components.CardTitle = CardTitle;
  window.Quantum.Components.CardDescription = CardDescription;
  window.Quantum.Components.CardContent = CardContent;
  window.Quantum.Components.CardFooter = CardFooter;
  window.Quantum.Components.Tabs = Tabs;
  window.Quantum.Components.Dropdown = Dropdown;
})();
