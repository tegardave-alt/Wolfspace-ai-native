// ── Capability zone (process-isolated) ──
// Runs untrusted task code in a SEPARATE Node process launched with
// `--permission` and zero --allow-fs-read/--allow-fs-write grants. Node's
// runtime denies fs access at the native binding layer for that whole
// process — this holds even against the classic vm-escape technique that
// broke the earlier vm.createContext-based zone (see agent/broker/README.md
// for the side-by-side test result).
//
// The zone process's ONLY channel to the outside world is IPC messages
// forwarded here and validated by the Broker before anything executes.
'use strict';

const { fork } = require('child_process');
const path = require('path');
const { getPlatformAdapter } = require('../platform/index.cjs');

const WORKER = path.join(__dirname, 'zone-worker.cjs');

function runInCapabilityZone(code, broker, opts = {}) {
  const timeoutMs = opts.timeout || 10000;

  return new Promise((resolve, reject) => {
    const child = fork(WORKER, [], {
      execArgv: ['--permission'], // no --allow-fs-read/write => fs denied process-wide
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });

    let settled = false;
    let stderr = '';
    child.stderr.on('data', (c) => { stderr += c.toString(); });

    const finish = (fn, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill('SIGKILL'); } catch (_) {}
      fn(val);
    };

    const timer = setTimeout(() => {
      const adapter = getPlatformAdapter();
      try { adapter.killTree(child); } catch (_) { try { child.kill('SIGKILL'); } catch (__) {} }
      finish(reject, new Error(`zone timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    child.on('message', async (msg) => {
      if (msg.type === 'capability-request') {
        try {
          const result = await broker.request(msg.capability, msg.params);
          if (!settled) child.send({ type: 'capability-response', id: msg.id, result });
        } catch (e) {
          if (!settled) child.send({ type: 'capability-response', id: msg.id, error: e.message, errCode: e.code });
        }
        return;
      }
      if (msg.type === 'done') finish(resolve, msg.result);
      else if (msg.type === 'error') finish(reject, Object.assign(new Error(msg.message), { code: msg.code }));
    });

    child.on('error', (e) => finish(reject, e));
    child.on('exit', (code) => {
      if (!settled && code !== 0) finish(reject, new Error(`zone process exited with code ${code}: ${stderr.slice(0, 500)}`));
    });

    child.send({ type: 'run', code });
  });
}

module.exports = { runInCapabilityZone };
