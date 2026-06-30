'use strict';
const { getProcessManager } = require('../../process-manager.cjs');

function handle(req, res, deps) {
  const _path = (req.url || '/').split('?')[0];
  
  if (req.method === 'GET' && _path === '/health') {
    const pm = getProcessManager();
    const status = pm.getStatus();
    const healthy = status.agentRunner && status.terminalWorker;
    res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      processes: status,
    }));
  }
  
  if (req.method === 'GET' && _path === '/process-status') {
    const pm = getProcessManager();
    const status = pm.getStatus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ...status,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    }));
  }
  
  return false;
}

module.exports = { handle };
