// Icons — diekstrak dari app.jsx (lihat public/app.jsx untuk App orkestrator).
// Dimuat via APP_MODULES di index.html: di-CONCAT SEBELUM app.jsx (prepend) lalu
// Babel sekali -> satu scope global. Body fungsi (hooks/React/SB) jalan saat render.

/* ----------------------------- Icons ----------------------------- */
const Icon = {
  // Traced (potrace) from the WOLFSPACE reference mark — a wolf head in profile.
  wolf: (p) => (
    <svg viewBox="0 0 416 416" fill="none" {...p}>
      <g
        transform="translate(0,416) scale(0.1,-0.1)"
        fill="currentColor"
        stroke="none"
      >
        <path
          d="M1704 3358 c6 -26 36 -252 36 -265 0 -2 -24 15 -52 38 -62 49 -152
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
81 0 54 -2 87 -10 138 -34z"
        />
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
      <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" />
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
  workflow: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="3"
        y="4"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="15"
        y="4"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="9"
        y="15"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M6 10v2c0 1.5 1.5 3 3 3h3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 10v2c0 1.5-1.5 3-3 3h-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="15" r="1.5" fill="currentColor" />
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
    <svg viewBox="0 0 36 36" fill="none" {...p}>
      <circle cx="18" cy="15.5" r="13.5" fill="#FFAC33" />
      <circle cx="18" cy="15.5" r="11.8" fill="#FFCC4D" />
      <path
        d="M11 13C12 11.5 14 11.5 15 13"
        stroke="#292F33"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M21 13C22 11.5 24 11.5 25 13"
        stroke="#292F33"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M12.5 16.5C15 17.5 21 17.5 23.5 16.5C23.8 20 20.5 22.2 18 22.2C15.5 22.2 12.2 20 12.5 16.5Z"
        fill="#292F33"
      />
      <path
        d="M15.5 20.2C16.5 18.8 19.5 18.8 20.5 20.2C20 21.8 16 21.8 15.5 20.2Z"
        fill="#DD2E44"
      />
      <path
        d="M15 30.5 C17 26 16 21.5 14.5 21.5 C13 21.5 12 23.5 12.5 25 C12.5 23.5 12.5 22 11 22.5 C9.5 23 9.5 25 10 26 C10 24.5 9.5 23 8 23.5 C6.5 24 7 26 7.8 27.2 C7 25.5 6.5 24.5 5 25.5 C3.5 26.5 4.5 28.5 6 29.5 C8.5 31.5 12.5 32 15 30.5 Z"
        fill="#FFCC4D"
        stroke="#FFAC33"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M21 30.5 C19 26 20 21.5 21.5 21.5 C23 21.5 24 23.5 23.5 25 C23.5 23.5 23.5 22 25 22.5 C26.5 23 26.5 25 26 26 C26 24.5 26.5 23 28 23.5 C29.5 24 29 26 28.2 27.2 C29 25.5 29.5 24.5 31 25.5 C32.5 26.5 31.5 28.5 30 29.5 C27.5 31.5 23.5 32 21 30.5 Z"
        fill="#FFCC4D"
        stroke="#FFAC33"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
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
  workflow: (p) => (
    <svg viewBox="0 0 24 24" fill="none" {...p}>
      <rect
        x="3"
        y="4"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="15"
        y="4"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <rect
        x="9"
        y="15"
        width="6"
        height="6"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M6 10v2c0 1.5 1.5 3 3 3h3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18 10v2c0 1.5-1.5 3-3 3h-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="15" r="1.5" fill="currentColor" />
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
