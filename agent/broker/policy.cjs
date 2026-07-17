// ── Capability policy ──
// Declarative allow-rules the Broker checks BEFORE executing anything.
// Deny-by-default: if no rule matches, the request is refused.
'use strict';

const path = require('path');

// A policy grants access per capability:
//   fetch:     { hosts: ['api.github.com', ...] }
//   readFile:  { roots: ['/abs/dir', ...] }
//   writeFile: { roots: ['/abs/dir', ...] }
class Policy {
  constructor(grants = {}) {
    this.grants = grants;
  }

  // Returns { allowed: bool, reason: string }
  evaluate(capability, params) {
    const grant = this.grants[capability];
    if (!grant) return { allowed: false, reason: `no grant for capability "${capability}"` };

    switch (capability) {
      case 'fetch': {
        let host;
        try { host = new URL(params.url).hostname; }
        catch (_) { return { allowed: false, reason: 'invalid URL' }; }
        const ok = (grant.hosts || []).includes(host);
        return ok ? { allowed: true } : { allowed: false, reason: `host "${host}" not in allowlist [${(grant.hosts||[]).join(', ')}]` };
      }
      case 'readFile':
      case 'writeFile': {
        const abs = path.resolve(params.path || '');
        const roots = (grant.roots || []).map(r => path.resolve(r));
        const ok = roots.some(root => abs === root || abs.startsWith(root + path.sep));
        return ok ? { allowed: true } : { allowed: false, reason: `path "${abs}" outside granted roots [${roots.join(', ')}]` };
      }
      default:
        return { allowed: false, reason: `unknown capability "${capability}"` };
    }
  }
}

module.exports = { Policy };
