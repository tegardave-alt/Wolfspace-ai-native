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
