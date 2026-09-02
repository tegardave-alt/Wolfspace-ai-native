// Ambient declarations for the modules in public/app/.
//
// WHY THIS EXISTS. The files here are NOT ES modules — index.html fetches them
// one by one, transpiles each, and then CONCATENATES the results into a single
// <script>. They all share one global scope: the `useState` in Views.tsx
// is the same useState app.tsx destructured from React, with no import anywhere.
//
// Without this file TypeScript flags every one of those names "Cannot find
// name" — not because the code is wrong, but because its scope contract was
// never written down.
//
// DELIBERATELY MINIMAL. @types/react is not installed (React comes from a
// vendor <script>, not npm), and adding it purely for types would add a
// dependency for something that is not even shipped. Only what is actually used
// is declared here. A deliberate consequence: DOM element props are not
// checked — what is checked is component LOGIC, and that is the part that can
// actually be wrong.

declare namespace JSX {
  interface Element {}
  interface IntrinsicElements {
    [name: string]: any;
  }
  // TypeScript merges this into the props of EVERY component. Without it, `key`
  // on an element produced by .map() is rejected — the very thing React requires.
  interface IntrinsicAttributes {
    key?: string | number;
  }
}

// The hooks are declared standalone below because app.tsx destructures them, but
// some modules still reach for React.useState directly — so the object carries
// them too rather than forcing a rewrite of those call sites.
declare var React: {
  createElement(...args: any[]): JSX.Element;
  Fragment: any;
  useState<T>(
    initial: T | (() => T),
  ): [T, (value: T | ((previous: T) => T)) => void];
  useRef<T>(initial: T): { current: T };
  useEffect(effect: () => void | (() => void), deps?: readonly any[]): void;
  useCallback<F extends (...a: any[]) => any>(fn: F, deps?: readonly any[]): F;
  useMemo<T>(fn: () => T, deps?: readonly any[]): T;
  useLayoutEffect(
    effect: () => void | (() => void),
    deps?: readonly any[],
  ): void;
  memo<F>(component: F, areEqual?: (a: any, b: any) => boolean): F;
};

// The hooks are NOT declared standalone: app.tsx does
//   const { useState, useRef, useEffect, useCallback, useMemo } = React;
// at the head of the shared global scope, so those bindings come from the
// object above and every module sees them. Declaring them here as well would
// collide, and pointing the object's members at such declarations
// (`useState: typeof useState`) makes the reference circular once app.tsx is
// in scope — which silently degraded every hook to an untyped call.

// Monaco comes from a vendor <script> (public/vendor/monaco), not npm, so it
// exists only on window at runtime and TypeScript has no way to know it.
// Declared as narrowly as it is actually used, following this file's rule: what
// is checked is component LOGIC, not the full Monaco surface.
interface Window {
  monaco?: {
    Range: new (
      startLine: number,
      startCol: number,
      endLine: number,
      endCol: number,
    ) => unknown;
    [k: string]: any;
  };
}

// The preload bridge (electron/preload.ts). Its full contract lives in
// packages/contracts/ipc.ts — deliberately NOT imported here, because this file
// is ambient and a single import would turn it into a module, taking every
// global declaration above with it. Only what public/ code actually uses is
// declared, following this file's rule.
interface Window {
  WOLFSPACE?: {
    readonly ipc: boolean;
    readonly root: string;
    invoke(channel: string, payload?: unknown): Promise<any>;
    stream(
      channel: string,
      payload: unknown,
      onChunk: (data: any) => void,
      onDone?: () => void,
    ): () => void;
    onBrowser(cb: (m: PeristiwaBrowser) => void): () => void;
    onHmr(cb: (filename: string) => void): void;
    terminal: Record<string, (...args: any[]) => Promise<any>>;
  };
}

/** One BYOK key entry as stored in localStorage. */
declare interface KunciBYOK {
  key?: string;
  model?: string;
  baseUrl?: string;
  [k: string]: unknown;
}

// A browser-panel event sent by the main process over WOLFSPACE:browser.
// The shape is read from its use in usePreviewPanel.tsx, not invented.
declare interface PeristiwaBrowser {
  /** muat | gagal | pindah (wire values, kept verbatim) */
  t: string;
  url?: string;
  desc?: string;
  kode?: number | string;
  [k: string]: unknown;
}

// Cloud (BYOK) configuration as stored under localStorage "wolfspace_cloud".
declare interface KonfigCloud {
  provider?: string;
  name?: string;
  model?: string;
  key?: string;
  baseUrl?: string;
  effort?: unknown;
  [k: string]: unknown;
}

declare function setCloudLS(c: KonfigCloud | null): void;

// three.js is vendored offline and exposed on window by public/vendor/three3d
// (see scripts/three/build.cjs), not installed from npm. Only the handful of
// entry points Model3DViewer actually reaches for are named; everything below
// them is `any`, because typing three's full surface would mean shipping
// @types/three for a library that is not an npm dependency here.
interface Window {
  WOLFSPACE3D?: {
    THREE?: any;
    GLTFLoader?: any;
    STLLoader?: any;
    OrbitControls?: any;
    RoomEnvironment?: any;
    [k: string]: any;
  };
}

// Defined in files that have not migrated yet and reached through the shared
// global scope. Each of these declarations must be REMOVED when its own file
// migrates, or it collides (TS2451) — the pattern WOLFSPACE_ROOT and Icon both
// demonstrated.
declare function Blocks(props: { text?: string }): JSX.Element;

// monacoReady is a PROMISE set on window by index.html once the vendored Monaco
// loader finishes, so modules can await it instead of racing the <script> tag.
// Typed as a promise only — the callers all call .then() on it, and widening it
// to `| boolean` made that call a type error while changing nothing at runtime.
interface Window {
  monacoReady?: Promise<any>;
}

// Diagram libraries used by app/CodeBlocks.tsx. Both are vendored under
// public/vendor and attach themselves to window from their own <script> tag,
// so they are undefined until that runs — hence optional. Their surfaces are
// `any`: neither is an npm dependency here, so no types ship with them.
// __mermaidInit is WOLFSPACE's own once-only init latch, not part of mermaid.
interface Window {
  cytoscape?: any;
  mermaid?: any;
  __mermaidInit?: boolean;
}

// Reached through window by app/Screens.tsx.
//
// window.IPC is NOT the same binding as app.tsx's `const IPC`; Screens reads
// it off window, so this member has to exist independently of that const.
// xterm and its fit addon come from vendored <script> tags rather than npm, so
// they are optional and untyped — as with monaco and three.
// showDirectoryPicker is the File System Access API, which TypeScript's DOM
// lib does not declare and which only Chromium-based browsers implement.
// than npm, so they are optional and untyped — as with monaco and three.
// showDirectoryPicker is the File System Access API, which TypeScript's DOM
// lib does not declare and which only Chromium-based browsers implement.
interface Window {
  IPC?: any;
  Terminal?: any;
  FitAddon?: any;
  // Loaded by <script> in index.html, BEFORE Monaco's AMD loader. Both are UMD
  // bundles that prefer AMD, so they only reach the window from that position.
  SearchAddon?: any;
  WebLinksAddon?: any;
  fitAddon?: any;
  xterm?: any;
  showDirectoryPicker?: (opts?: any) => Promise<any>;
}

// Set on window by app.tsx itself, plus two names that come from elsewhere.
//
// The __ww*Shimmed flags are latches so the fetch and EventSource shims are
// installed once. reportAppSuccess / triggerAppRollback / _reactRoot are the
// hooks index.html's rollback machinery calls into. ReactDOM is not on window:
// it comes from a vendored <script>.
//
// IKON_BAHASA used to be declared here for the same reason, and no longer is.
// app/IkonBahasa.ts is TypeScript now and part of this project, so it declares
// the binding itself — an ambient declaration beside it is a second source of
// truth that tsc rejects outright (TS2451).
interface Window {
  __wwFetchShimmed?: boolean;
  __wwEventSourceShimmed?: boolean;
  reportAppSuccess?: (...a: any[]) => void;
  testHitl?: (...a: any[]) => void;
  triggerAppRollback?: (...a: any[]) => void;
  _reactRoot?: any;
}
declare const ReactDOM: any;
