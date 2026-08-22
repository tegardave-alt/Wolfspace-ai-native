// Ambient declarations for the modules in public/app/.
//
// WHY THIS EXISTS. The files here are NOT ES modules — index.html fetches them
// one by one, transpiles each, and then CONCATENATES the results into a single
// <script>. They all share one global scope: the `useState` in PluginsView.tsx
// is the same useState app.jsx destructured from React, with no import anywhere.
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

declare var React: {
  createElement(...args: any[]): JSX.Element;
  Fragment: any;
};

// Destructured at the head of app.jsx:
//   const { useState, useRef, useEffect, useCallback, useMemo } = React;
declare function useState<T>(
  initial: T | (() => T),
): [T, (value: T | ((previous: T) => T)) => void];
declare function useRef<T>(initial: T): { current: T };
declare function useEffect(
  effect: () => void | (() => void),
  deps?: readonly any[],
): void;
declare function useCallback<F extends (...a: any[]) => any>(
  fn: F,
  deps?: readonly any[],
): F;
declare function useMemo<T>(fn: () => T, deps?: readonly any[]): T;

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

// Defined in public/app.jsx and used across modules through the shared global
// scope — the same arrangement as the React hooks above.
declare function resolveWorkspaceRoot(proyek?: unknown): string | undefined;
// WOLFSPACE_ROOT is NOT declared here: Config.tsx is already .tsx and inside the
// tsconfig scope, so its own definition is the source. Adding a `declare` here
// would collide with it (TS2451). Only names from files that have NOT migrated
// yet need declaring — resolveWorkspaceRoot in app.jsx, for instance.

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

// Defined in public/app.jsx and reached from other modules through the shared
// global scope. They are declared here rather than imported because app.jsx has
// not migrated yet; once it does, these declarations must be removed or they
// will collide (TS2451), exactly as WOLFSPACE_ROOT did.
declare const CLOUD_DEFAULT: Record<string, string>;
declare const PROVIDER_LABELS: Record<string, string>;
declare const PROVIDER_OPTS: readonly string[];
declare function detectPrefix(
  key: string,
): { provider: string; name: string } | null;
declare function keyish(s: unknown): boolean;
declare function getCloud(): KonfigCloud | null;
declare function setCloudLS(c: KonfigCloud | null): void;

// SB is the Sidebar glyph table, defined in app/Sidebar.jsx.
//
// Deliberately `any`: naming every glyph would mean enumerating dozens of keys
// from a file that has not migrated yet, and Record<string, fn> collides with
// noUncheckedIndexedAccess — every SB.x() call would read as possibly undefined.
// Drop this declaration when Sidebar.jsx migrates, or it will collide (TS2451),
// exactly as Icon did once Icons.tsx started declaring itself.
declare const SB: any;
