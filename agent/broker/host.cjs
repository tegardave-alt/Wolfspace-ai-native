// ── Broker (trusted host) ──
// The ONLY thing in the system with real fs/network access on behalf of a
// capability zone. Code in the zone never touches fs/https directly — it sends
// a request here, the Broker checks it against Policy, executes it itself if
// allowed, and returns just the result. The zone never sees credentials, real
// paths outside its grant, or raw sockets.
'use strict';

const fs = require('fs');
const https = require('https');
const http = require('http');

class Broker {
  constructor(policy) {
    this.policy = policy;
    this.audit = [];
  }

  _log(capability, params, decision, reason, extra) {
    const entry = { ts: Date.now(), capability, params, decision, reason, ...extra };
    this.audit.push(entry);
    return entry;
  }

  // The single entry point the capability zone calls. Deny-by-default:
  // Policy.evaluate must explicitly allow, otherwise this throws.
  async request(capability, params) {
    const { allowed, reason } = this.policy.evaluate(capability, params);
    if (!allowed) {
      this._log(capability, params, 'DENY', reason);
      const err = new Error(`Broker denied ${capability}: ${reason}`);
      err.code = 'BROKER_DENIED';
      throw err;
    }
    try {
      const result = await this._execute(capability, params);
      this._log(capability, params, 'ALLOW', null, { resultBytes: typeof result === 'string' ? result.length : undefined });
      return result;
    } catch (e) {
      this._log(capability, params, 'ALLOW_BUT_FAILED', e.message);
      throw e;
    }
  }

  async _execute(capability, params) {
    switch (capability) {
      case 'readFile':
        return fs.readFileSync(params.path, 'utf8');
      case 'writeFile':
        fs.mkdirSync(require('path').dirname(params.path), { recursive: true });
        fs.writeFileSync(params.path, params.content, 'utf8');
        return { ok: true };
      case 'fetch':
        return this._fetch(params.url, { timeout: params.timeout || 8000 });
      default:
        throw new Error(`no executor for capability "${capability}"`);
    }
  }

  _fetch(url, opts) {
    const lib = url.startsWith('https:') ? https : http;
    return new Promise((resolve, reject) => {
      const req = lib.get(url, { timeout: opts.timeout }, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => resolve({ status: res.statusCode, body: body.slice(0, 5000) }));
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('fetch timeout')); });
      req.on('error', reject);
    });
  }

  auditTrail() { return this.audit.slice(); }
}

module.exports = { Broker };
