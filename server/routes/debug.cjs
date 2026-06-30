'use strict';

function handle(req, res, deps) {
  const _path = (req.url || '/').split('?')[0];
  const { trace, LOG_RING, debugSubs, DEBUG_VIEWER, dlog } = deps;
  
  // Debug: list recent runs
  if (req.method === 'GET' && _path === '/debug/runs') {
    const runs = trace.listRuns(30);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(runs));
  }
  
  // Debug: get run timeline by ID
  if (req.method === 'GET' && _path.startsWith('/debug/runs/')) {
    const runId = (req.url || '').split('/').pop();
    const timeline = trace.getRunTimeline(runId);
    if (!timeline) { res.writeHead(404); return res.end(JSON.stringify({ error: 'run not found' })); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(timeline));
  }
  
  // Debug: export bundle for reproduction
  if (req.method === 'GET' && _path.startsWith('/debug/export/')) {
    const runId = (req.url || '').split('/').pop();
    const bundle = trace.exportBundle(runId, { includeConfig: true });
    if (!bundle) { res.writeHead(404); return res.end(JSON.stringify({ error: 'run not found' })); }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(bundle));
  }
  
  if (req.method === 'GET' && _path === '/debug/log') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(LOG_RING));
  }
  
  // Beacon: studio (Dart) + React shell post trace
  if (req.method === 'GET' && _path === '/dbg') {
    const sp = new URL('http://x' + req.url).searchParams;
    dlog('studio', 'info', (sp.get('src') || '?') + ': ' + (sp.get('m') || ''), sp.get('n') ? { n: +sp.get('n') } : {});
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    return res.end('ok');
  }
  
  if (req.method === 'GET' && _path === '/debug/stream') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const w = s => { if (!res.writableEnded) res.write(s); };
    for (const e of LOG_RING.slice(-120)) w('data: ' + JSON.stringify(e) + '\n\n');
    debugSubs.add(w);
    req.on('close', () => debugSubs.delete(w));
    res.on('close', () => debugSubs.delete(w));
    return true;
  }
  
  if (req.method === 'GET' && _path === '/debug') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(DEBUG_VIEWER);
  }
  
  return false;
}

module.exports = { handle };
