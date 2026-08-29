/**
 * Watches how long the event loop is held in one unbroken stretch.
 *
 * WHY THIS IS THE PIECE THAT WAS MISSING. Everything else in agent/anggaran.ts
 * is a ceiling chosen from a measurement taken once, by hand, on one machine.
 * That is enough to pick a number and not enough to know whether the number is
 * right, because nothing observed the app while it was actually being used. The
 * hang threshold was established at 5000 ms and then had no instrument at all —
 * a budget nobody could see being spent.
 *
 * WHAT IT MEASURES, AND WHY THAT AND NOT CPU OR MEMORY. In desktop mode the
 * backend runs in-process in Electron's main process, so the thread that draws
 * the window is the same thread that runs agent/. Windows marks a window "Not
 * Responding" after 5000 ms without the message queue being drained. Neither CPU
 * load nor heap size decides that; the length of one uninterrupted block does.
 *
 * CONSECUTIVE, NOT CUMULATIVE. This is why `max` is the number that matters and
 * an average would mislead: thirty 150 ms edits total 4.5 s and freeze nothing,
 * because the queue drains between them. One 5 s stretch freezes the window.
 * A mean over that same window reports 150 ms either way.
 *
 * The measurement itself is perf_hooks' own loop-delay histogram — a timer
 * scheduled every `resolusi` ms, recording how late it actually fired. When the
 * loop is blocked the timer cannot run, so the lateness IS the block. It is
 * sampled in C++ and costs nothing measurable, which matters: an instrument that
 * sat in the queue it is trying to measure would be measuring itself.
 */

import { monitorEventLoopDelay } from "perf_hooks";

const anggaran = require("./anggaran.ts");

type Laporan = {
  maksMs: number;
  p99Ms: number;
  medianMs: number;
  sampel: number;
  jendelaMs: number;
  vonis: "normal" | "naik" | "waspada" | "over";
  /** What the window was spent on, largest first. Empty when nothing crossed
   *  CATAT_MIN_MS — which is the normal case and is itself informative: the
   *  block came from somewhere that is not instrumented. */
  penyumbang: { label: string; ms: number; n: number }[];
};

let _h: any = null;
let _sejak = 0;

/**
 * Starts watching. Calling it twice is harmless — the existing histogram is
 * kept, so a second caller cannot silently reset the first one's window.
 *
 * IT BEGINS RECORDING ON THE NEXT TURN OF THE LOOP, not on this one. The
 * histogram samples through a timer, and that timer cannot be scheduled until
 * the current turn ends. Measured while writing the tests: a 300 ms block
 * started in the same tick as mulai() was reported as 16 ms, because almost all
 * of it happened before sampling began.
 *
 * This never matters in the app, where watching starts once at boot and the
 * blocks come seconds or minutes later. It matters a great deal to anyone
 * measuring it deliberately — so let the loop turn once first.
 */
export function mulai(resolusiMs = 10): boolean {
  if (_h) return false;
  _h = monitorEventLoopDelay({ resolution: resolusiMs });
  _h.enable();
  _sejak = Date.now();
  // The ledger starts WITH the histogram, or the two describe different spans.
  // The ledger lives on globalThis and is written to from the moment the
  // process starts — including the .ts transpiles that happen while modules are
  // still loading. Without this line the first report paired a 34 ms block with
  // "transpile-ts 154 ms", which is not just noisy: the two numbers cannot both
  // be true of the same window, and a reader would rightly stop trusting either.
  buku().clear();
  return true;
}

export function henti(): void {
  if (!_h) return;
  _h.disable();
  _h = null;
}

export function berjalan(): boolean {
  return !!_h;
}

/* ── Attribution: what the block was SPENT ON ──────────────────────────────
 *
 * WHY THIS EXISTS. The watchdog above answers "when" and "how big" and stops
 * there. That gap is not theoretical: a real 1214 ms block was observed, traced
 * by hand through the logs to a burst of five failed model requests, and the
 * fallback handler then turned out to be pure object lookups with no
 * synchronous work in it at all. So the correlation was wrong and the cause is
 * still unknown. A number nobody can attribute cannot be acted on.
 *
 * THE LEDGER LIVES ON globalThis, and that is not laziness. scripts/
 * ts-register.cjs installs the .ts require hook, so it runs BEFORE any .ts
 * module can be imported — it cannot import this one. Several other writers are
 * .cjs for the same reason. A well-known global lets any of them contribute
 * without an import and without caring about load order, which this repo has
 * been bitten by before.
 *
 * ONLY REAL WORK IS RECORDED. Anything under CATAT_MIN_MS is dropped: an
 * instrument that logs every 0.2 ms call would cost more than the thing it
 * measures, and would bury the entry that matters.
 */
const KUNCI_BUKU = "__wolfspaceBukuBlok";

type Entri = { ms: number; n: number };

/** Smallest single call worth attributing. Below this it is noise. */
export const CATAT_MIN_MS = 5;

function buku(): Map<string, Entri> {
  const g = globalThis as any;
  if (!g[KUNCI_BUKU]) g[KUNCI_BUKU] = new Map<string, Entri>();
  return g[KUNCI_BUKU];
}

/** Records that `label` held the thread for `ms`. Safe to call from anywhere,
 *  including before this module is loadable. */
export function catat(label: string, ms: number): void {
  if (!(ms >= CATAT_MIN_MS)) return;
  const b = buku();
  const e = b.get(label) || { ms: 0, n: 0 };
  e.ms += ms;
  e.n++;
  b.set(label, e);
}

/**
 * Times one synchronous call and attributes it.
 *
 * The result is returned untouched and a throw still propagates — an
 * instrument that changes behaviour is worse than no instrument. The timing is
 * taken in `finally`, so work that ends in an exception is still attributed
 * rather than silently vanishing from the ledger.
 */
export function ukur<T>(label: string, fn: () => T): T {
  const t0 = process.hrtime.bigint();
  try {
    return fn();
  } finally {
    catat(label, Number(process.hrtime.bigint() - t0) / 1e6);
  }
}

/** The window's contributors, largest first. */
export function penyumbang(
  batas = 3,
): { label: string; ms: number; n: number }[] {
  return [...buku().entries()]
    .map(([label, e]) => ({ label, ms: Math.round(e.ms), n: e.n }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, batas);
}

/**
 * Reads the current window. With `reset`, the histogram starts fresh so the
 * next reading describes the next window rather than the whole session — which
 * is what a periodic reporter wants: one bad stretch should not stain every
 * report that follows it.
 */
export function ambil(reset = false): Laporan | null {
  if (!_h) return null;
  const ms = (n: number) => Math.round((n || 0) / 1e6);
  const lap: Laporan = {
    maksMs: ms(_h.max),
    p99Ms: ms(_h.percentile(99)),
    medianMs: ms(_h.percentile(50)),
    sampel: _h.count || 0,
    jendelaMs: Date.now() - _sejak,
    vonis: anggaran.vonisBlokir(ms(_h.max)),
    penyumbang: penyumbang(),
  };
  if (reset) {
    _h.reset();
    _sejak = Date.now();
    // The ledger is cleared WITH the histogram, or a report would pair this
    // window's block with contributors accumulated since the process started.
    buku().clear();
  }
  return lap;
}

/**
 * Reports every `tiapMs`, but only when the window is worth reporting.
 *
 * SILENCE IS THE POINT. The app's measured idle latency is p99 = 1 ms with a
 * worst case of 44 ms over 2840 samples, so a reporter that spoke every tick
 * would produce thousands of lines saying nothing happened — and the one line
 * that mattered would be lost in them. It speaks only once a stretch crosses
 * BLOKIR_NORMAL_MS.
 *
 * The interval is unref'd: an instrument must never be the reason a process
 * stays alive.
 *
 * @returns a function that stops the reporting (not the watching).
 */
export function pasangLaporan(
  lapor: (l: Laporan) => void,
  tiapMs = 10000,
): () => void {
  const t = setInterval(() => {
    const l = ambil(true);
    if (l && l.maksMs >= anggaran.BLOKIR_NORMAL_MS) lapor(l);
  }, tiapMs);
  if (typeof (t as any).unref === "function") (t as any).unref();
  return () => clearInterval(t);
}

/** One-line form for logs: the numbers plus the verdict they earn. */
export function ringkas(l: Laporan): string {
  // "(untracked)" is a real answer, not a missing one: it says the block came
  // from somewhere with no instrument on it, which is the first thing worth
  // knowing when deciding where to add one.
  const jejak = l.penyumbang.length
    ? l.penyumbang
        .map((p) => p.label + " " + p.ms + "ms" + (p.n > 1 ? " x" + p.n : ""))
        .join(", ")
    : "(untracked)";
  return (
    "blokir maks " +
    l.maksMs +
    " ms (" +
    l.vonis +
    ") p99 " +
    l.p99Ms +
    " ms, jendela " +
    Math.round(l.jendelaMs / 1000) +
    " dtk, anggaran " +
    anggaran.AMBANG_HANG_MS +
    " ms — " +
    jejak
  );
}
