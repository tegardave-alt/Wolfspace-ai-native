// Icon Components
(function() {
  const Icon = {
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
        <path
          d="M7.5 7.5a2.5 2.5 0 015 0v3h-5v-3zm4 0a2.5 2.5 0 015 0v3h-5v-3zm-5 5h5v4a2 2 0 01-2 2h-1a2 2 0 01-2-2v-4zm6 0h5v4a2 2 0 01-2 2h-1a2 2 0 01-2-2v-4z"
          fill="currentColor"
        />
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
        <Icon.spark style={{ color: "#fff" }} />
      </span>
    );
  }

  // Export to global namespace
  window.Quantum = window.Quantum || {};
  window.Quantum.Icons = { Icon, HubIcon, BrandMark };
})();
