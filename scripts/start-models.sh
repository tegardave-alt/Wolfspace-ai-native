#!/usr/bin/env bash
# Quantum -- launch each model in config.json (Linux/macOS).
# Requires `llama-server` (from llama.cpp) on PATH or in config.modelDir.
set -e
cd "$(dirname "$0")/.."
python3 - <<'PY'
import json, os, subprocess, shutil, urllib.request
cfg = json.load(open('config.json'))
d = os.path.expanduser(cfg['modelDir'])
exe = shutil.which('llama-server') or os.path.join(d, 'llama-server')
th, ctx = cfg['llama']['threads'], cfg['llama']['ctxSize']
for m in cfg['models']:
    p = os.path.join(d, m['file'])
    if not os.path.exists(p):
        print('[skip]', m['name'], '-> not downloaded'); continue
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{m['port']}/health", timeout=2)
        print('[ok]', m['name'], 'already on', m['port']); continue
    except Exception:
        pass
    subprocess.Popen([exe, '-m', p, '--host', '127.0.0.1', '--port', str(m['port']),
                      '--ctx-size', str(ctx), '--threads', str(th)],
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print('[start]', m['name'], '->', f"http://127.0.0.1:{m['port']}")
print('Models starting. Then: npm start')
PY
