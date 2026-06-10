"""
Persistent Jedi worker for Quantum: real Python autocomplete (static analysis,
library-aware, NO AI model). Imports jedi once, then answers one JSON request
per stdin line with one JSON response line.

Request : {"code": "...", "line": <1-based>, "column": <0-based>}
Response: [{"name": "...", "complete": "...", "type": "..."}, ...]
"""
import sys, json

try:
    import jedi
except Exception as e:
    sys.stdout.write(json.dumps({"error": "jedi not installed: " + str(e)}) + "\n")
    sys.stdout.flush()

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
        script = jedi.Script(req.get("code", ""))
        comps = script.complete(req.get("line", 1), req.get("column", 0))
        out = [{"name": c.name, "complete": c.complete, "type": c.type}
               for c in comps[:60]]
    except Exception:
        out = []
    sys.stdout.write(json.dumps(out) + "\n")
    sys.stdout.flush()
