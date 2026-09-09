// probe.js — startup timing for the desktop app: what took how long, printed
// as it happens.
//
// ROLE IN THE SYSTEM. The launch path is a chain of things that each look
// instant and together were not — this repo cut startup from 1071 ms to 314 ms
// by reading this output. Anything slower than WOLFSPACE_PROBE_SLOW (default
// 50 ms) is called out; set WOLFSPACE_PROBE=0 to silence it entirely.
//
// CONNECTS TO
//   imports  perf_hooks
//   used by  electron/main.ts, which also puts it on global.__probe so code
//            loaded later can time itself without threading it through
const { performance } = require("perf_hooks");

const TIMING_ON = process.env.WOLFSPACE_PROBE !== "0";
const SLOW_MS = Number(process.env.WOLFSPACE_PROBE_SLOW || 50);

function stamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 23);
}

function say(msg) {
  console.log("[probe] " + stamp() + " " + msg);
}

function timeSync(label, fn) {
  if (!TIMING_ON) return fn();
  const t0 = performance.now();
  const out = fn();
  const ms = performance.now() - t0;
  if (ms >= SLOW_MS) say(label + " " + ms.toFixed(0) + "ms");
  return out;
}

function startStopProbe() {
  const CHECK_MS = 250;
  let last = performance.now();
  const tick = () => {
    const n = performance.now();
    const overshoot = n - last - CHECK_MS;
    last = n;
    if (overshoot > 500)
      say("STOP main-thread terblokir ~" + overshoot.toFixed(0) + "ms");
    const t = setTimeout(tick, CHECK_MS);
    if (t.unref) t.unref();
  };
  const t = setTimeout(tick, CHECK_MS);
  if (t.unref) t.unref();
}

// NO LONGER STARTED BY THE APP. agent/pemantau-blokir.ts replaced it: this one
// recurses through setImmediate on every turn of the loop forever, reports each
// event in isolation, and has no budget to judge them against. Kept because it
// is still a serviceable one-liner for ad-hoc debugging.
function startLoopProbe() {
  let last = performance.now();
  const tick = () => {
    const n = performance.now();
    const lag = n - last;
    last = n;
    if (lag > 200) say("loop event-loop turn " + lag.toFixed(0) + "ms");
    setImmediate(tick);
  };
  setImmediate(tick);
}

module.exports = { timeSync, startStopProbe, startLoopProbe, say, TIMING_ON };
