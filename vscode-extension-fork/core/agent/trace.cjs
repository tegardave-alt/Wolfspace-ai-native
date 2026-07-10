// Central tracing system for Quantum — end-to-end debugging
// Manages runId, event buffering, sensitive data masking, JSONL persistence

const fs = require('fs');
const path = require('path');
const os = require('os');

const TRACE_DIR = path.join(__dirname, '..', '.trace');
const RING_MAX_MB = 15; // max size of trace ring buffer before rotation
const RING_MAX = RING_MAX_MB * 1024 * 1024;

// Ensure trace directory exists
try { if (!fs.existsSync(TRACE_DIR)) fs.mkdirSync(TRACE_DIR, { recursive: true }); } catch (_) {}

// Global trace context: maps runId -> {events: [], startTime}
const RUNS = new Map();
const MAX_RUNS = 100;

// Generate unique run ID
function generateRunId() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = 'r_';
  for (let i = 0; i < 6; i++) id += alphabet[Math.floor(Math.random() * alphabet.length)];
  return id;
}

// Mask sensitive fields in metadata
function maskMeta(meta) {
  if (!meta || typeof meta !== 'object') return meta;
  const m = { ...meta };
  if (m.key) m.key = '***' + String(m.key).slice(-4);
  if (m.password) m.password = '***';
  if (m.token) m.token = '***' + String(m.token).slice(-6);
  if (m.content && typeof m.content === 'string' && m.content.length > 200) m.content = m.content.slice(0, 100) + '…';
  if (m.output && typeof m.output === 'string' && m.output.length > 500) m.output = m.output.slice(0, 250) + '…';
  return m;
}

// Write event to JSONL ring buffer
function writeEvent(event) {
  try {
    const logFile = path.join(TRACE_DIR, 'trace.jsonl');
    const line = JSON.stringify(event) + '\n';
    let stat = { size: 0 };
    try { stat = fs.statSync(logFile); } catch (_) {}
    
    if (stat.size + line.length > RING_MAX) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backup = path.join(TRACE_DIR, `trace-${ts}.jsonl`);
      try { fs.renameSync(logFile, backup); } catch (_) {}
    }
    
    fs.appendFileSync(logFile, line, 'utf8');
  } catch (_) {}
}

// Emit a trace event
function emit(phase, module, meta = {}) {
  const event = {
    ts: new Date().toISOString(),
    phase,
    module,
    ...maskMeta(meta),
  };
  writeEvent(event);
  
  // Also keep in memory per runId
  const runId = meta.runId;
  if (runId) {
    if (!RUNS.has(runId)) {
      if (RUNS.size > MAX_RUNS) {
        const oldest = Array.from(RUNS.keys())[0];
        RUNS.delete(oldest);
      }
      RUNS.set(runId, { events: [], startTime: Date.now() });
    }
    const run = RUNS.get(runId);
    run.events.push(event);
    if (run.events.length > 1000) run.events.shift(); // keep last 1000 events per run
  }
  
  return event;
}

// Get run timeline by ID
function getRunTimeline(runId) {
  const run = RUNS.get(runId);
  if (!run) return null;
  const ms = Date.now() - run.startTime;
  return {
    runId,
    duration_ms: ms,
    event_count: run.events.length,
    events: run.events,
  };
}

// Get recent run summaries
function listRuns(limit = 20) {
  const arr = Array.from(RUNS.entries())
    .sort((a, b) => b[1].startTime - a[1].startTime)
    .slice(0, limit)
    .map(([id, r]) => ({
      runId: id,
      duration_ms: Date.now() - r.startTime,
      events: r.events.length,
    }));
  return arr;
}

// Create a new run context
function createRun() {
  const runId = generateRunId();
  RUNS.set(runId, { events: [], startTime: Date.now() });
  return runId;
}

// Export debug bundle for a run (minimal snapshot for reproduction)
function exportBundle(runId, opts = {}) {
  const run = RUNS.get(runId);
  if (!run) return null;
  
  const bundle = {
    runId,
    exported_at: new Date().toISOString(),
    duration_ms: Date.now() - run.startTime,
    event_count: run.events.length,
    events: run.events.slice(-500), // last 500 events
    git_version: (() => {
      try {
        const { execSync } = require('child_process');
        return execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '..'), encoding: 'utf8' }).trim();
      } catch (_) { return 'unknown'; }
    })(),
    node_version: process.version,
    platform: os.platform(),
    app_version: (() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).version;
      } catch (_) { return 'unknown'; }
    })(),
  };
  
  if (opts.includeConfig) {
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8'));
      bundle.config = { port: cfg.port, model: cfg.model }; // non-sensitive fields only
    } catch (_) {}
  }
  
  return bundle;
}

module.exports = {
  generateRunId,
  createRun,
  emit,
  getRunTimeline,
  listRuns,
  exportBundle,
  TRACE_DIR,
};
