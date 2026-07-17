'use strict';

// ── OpenClaw CLI bridge (status + one-shot chat) ──
// Extracted verbatim from server.cjs. The spawn helpers (openclawCommand,
// runOpenClawAgent, friendlyOpenClawError, stripAnsi, writeJson) stay in
// server.cjs and are injected via deps.

function handle(req, res, deps) {
  const _path = (req.url || '/').split('?')[0];
  const {
    spawn,
    __dirname: serverDir,
    openclawCommand,
    friendlyOpenClawError,
    stripAnsi,
    runOpenClawAgent,
    writeJson,
  } = deps;

  if (req.method === 'GET' && _path === '/api/openclaw/status') {
    let child;
    try {
      // Node >=20 melempar EINVAL SINKRON saat spawn file .cmd tanpa shell —
      // tanpa try/catch ini, satu request /status bisa men-crash seluruh server.
      child = spawn(openclawCommand(), ['--version'], {
        cwd: serverDir,
        windowsHide: true,
        shell: process.platform === 'win32',
      });
    } catch (err) {
      writeJson(res, 200, {
        installed: false,
        version: '',
        error: friendlyOpenClawError('', '', err),
      });
      return true;
    }
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) =>
      writeJson(res, 200, {
        installed: false,
        version: '',
        error: friendlyOpenClawError(stderr, stdout, err),
      }),
    );
    child.on('close', (code) =>
      writeJson(res, 200, {
        installed: code === 0,
        version: code === 0 ? stripAnsi(stdout).trim() : '',
        error: code === 0 ? '' : friendlyOpenClawError(stderr, stdout),
      }),
    );
    return true;
  }

  if (req.method === 'POST' && _path === '/api/openclaw/chat') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      let message = '';
      try {
        message = String((JSON.parse(body || '{}') || {}).message || '').trim();
      } catch (err) {
        return writeJson(res, 400, {
          ok: false,
          text: '',
          raw: '',
          error: 'bad request: ' + err.message,
          exitCode: null,
        });
      }
      if (!message) {
        return writeJson(res, 400, {
          ok: false,
          text: '',
          raw: '',
          error: 'Pesan /openclaw tidak boleh kosong.',
          exitCode: null,
        });
      }
      const result = await runOpenClawAgent(message);
      writeJson(res, result.ok ? 200 : 500, result);
    });
    return true;
  }

  return false;
}

module.exports = { handle };
