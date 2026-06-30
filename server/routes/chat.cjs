'use strict';

/**
 * POST /chat - Stream tokens + auto run/fix loop (SSE)
 */
function handleChat(req, res, deps) {
  if (req.method !== 'POST' || req.url !== '/chat') return false;
  
  const { chatStream, fillCloudKey } = deps;
  let body = '';
  let cancelled = false, curReq = null;
  
  res.on('close', () => {
    if (!res.writableFinished) {
      cancelled = true;
      if (curReq) {
        try { curReq.destroy(); } catch (_) {}
      }
    }
  });
  
  req.on('data', c => body += c);
  req.on('end', async () => {
    let history, port, cloud, webdev;
    try {
      ({ history, port, cloud, webdev } = JSON.parse(body));
    } catch (e) {
      res.writeHead(400);
      return res.end('bad json');
    }
    
    fillCloudKey(cloud);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    
    const ev = o => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(o)}\n\n`);
    };
    
    await chatStream({ history, port, cloud, webdev }, ev, {
      isCancelled: () => cancelled,
      setCurReq: r => { curReq = r; }
    });
    
    if (!res.writableEnded) res.end();
  });
  
  return true;
}

module.exports = { handleChat };
