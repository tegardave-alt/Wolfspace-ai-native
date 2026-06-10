#!/usr/bin/env bash
# Quantum setup (Linux/macOS) -- downloads the models in config.json.
# Note: install llama.cpp yourself (so `llama-server` is available) and set
# "modelDir" in config.json to a Linux path. Then run scripts/start-models.sh.
set -e
cd "$(dirname "$0")/.."
python3 - <<'PY'
import json, os, subprocess
cfg = json.load(open('config.json'))
d = os.path.expanduser(cfg['modelDir'])
os.makedirs(d, exist_ok=True)
for m in cfg['models']:
    p = os.path.join(d, m['file'])
    if os.path.exists(p) and os.path.getsize(p) > 100_000_000:
        print('[skip]', m['file']); continue
    print('[download]', m['file'])
    subprocess.run(['curl', '-L', '--fail', '-C', '-', '--retry', '10',
                    '--no-progress-meter', '-o', p, m['url']], check=True)
print('Done. Next: scripts/start-models.sh  then  npm start')
PY
