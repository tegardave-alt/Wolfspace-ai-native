// Icon Components
(function() {
  const Icon = {
    wolf: (p) => (
      <svg viewBox="0 0 512 512" fill="none" {...p}>
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M206 112L185 160C175 190 160 215 150 235C140 255 125 270 108 285C100 292 100 302 108 306C125 315 140 318 158 318C145 325 145 333 158 335C175 338 195 332 215 345L215 365L225 348C230 375 238 395 245 408C255 385 265 370 275 358L290 380C300 360 310 340 315 325L338 355C345 335 348 315 350 295L378 308C370 280 360 250 335 218C310 190 295 175 278 165L260 115L250 155C238 152 225 152 218 155L206 112ZM185 125L210 152L190 152L185 125ZM165 215C178 210 188 215 195 220C185 224 175 224 165 215ZM155 255C185 245 225 245 255 242C275 255 292 262 295 260C275 266 265 268 265 268C280 280 285 285 285 285C268 286 255 288 255 288C262 298 265 305 265 305C240 295 210 285 185 280C170 268 160 260 155 255Z"
          fill="currentColor"
        />
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
        <Icon.wolf />
      </span>
    );
  }

  // Export to global namespace
  window.WOLFSPACE = window.WOLFSPACE || {};
  window.WOLFSPACE.Icons = { Icon, HubIcon, BrandMark };
})();

