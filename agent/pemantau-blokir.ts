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
  };
  if (reset) {
    _h.reset();
    _sejak = Date.now();
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
    " ms"
  );
}
