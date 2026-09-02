"""
Persistent Jedi worker for WOLFSPACE: real Python code intelligence through
static analysis, library-aware, with NO AI model involved. jedi is imported once
and then answers one JSON request per stdin line with one JSON response line.

OPERATIONS

    {"op": "complete",   "code", "line", "column", "path"}
    {"op": "goto",       "code", "line", "column", "path"}
    {"op": "references", "code", "line", "column", "path"}
    {"op": "hover",      "code", "line", "column", "path"}

`line` is 1-based and `column` is 0-based, which is what jedi expects and what
Monaco's Position gives after subtracting one from the column.

`path` is OPTIONAL but changes the answer: with it, jedi resolves imports
relative to the real file and `goto` can leave the buffer and land in another
module. Without it every file is an island -- the same failure the editor had
when its Monaco models carried no URI.

BACKWARD COMPATIBILITY. A request with no "op" is treated as "complete" and
answers with a BARE ARRAY, exactly as this worker always did. server.ts's
jediComplete() reads that shape and must keep working untouched.

Every other operation answers with an object: {"ok": true, "hasil": [...]} or
{"ok": false, "err": "..."}. An operation that fails says so rather than
returning an empty list, because "no results" and "could not look" are
different answers and the editor should not present them the same way.
"""

import sys
import json

try:
    import jedi
except Exception as e:  # jedi missing is not fatal: say so and keep serving.
    sys.stdout.write(json.dumps({"error": "jedi not installed: " + str(e)}) + "\n")
    sys.stdout.flush()


def _skrip(req):
    """A jedi Script for this request, given a path when one was supplied."""
    kode = req.get("code", "")
    jalur = req.get("path") or None
    try:
        return jedi.Script(kode, path=jalur)
    except TypeError:
        # Older jedi versions take the path under a different name; falling back
        # to no path still answers, just without cross-file resolution.
        return jedi.Script(kode)


def _tempat(n):
    """One jedi Name as a location the editor can jump to."""
    try:
        jalur = str(n.module_path) if n.module_path else None
    except Exception:
        jalur = None
    return {
        "name": n.name,
        "path": jalur,
        "line": n.line,
        "column": n.column,
        "type": getattr(n, "type", None),
        # in_builtin_module: jumping into CPython's own source is rarely what
        # someone wants, and the path may not exist on disk at all.
        "builtin": bool(getattr(n, "in_builtin_module", lambda: False)()),
    }


def _lengkapi(script, req):
    comps = script.complete(req.get("line", 1), req.get("column", 0))
    return [
        {"name": c.name, "complete": c.complete, "type": c.type} for c in comps[:60]
    ]


def _tuju(script, req):
    # follow_imports: landing on the `import` line itself is not an answer to
    # "where is this defined".
    names = script.goto(
        req.get("line", 1), req.get("column", 0), follow_imports=True
    )
    return [_tempat(n) for n in names]


def _rujukan(script, req):
    names = script.get_references(req.get("line", 1), req.get("column", 0))
    return [_tempat(n) for n in names]


def _bantuan(script, req):
    names = script.help(req.get("line", 1), req.get("column", 0))
    keluar = []
    for n in names[:3]:
        try:
            doc = n.docstring()
        except Exception:
            doc = ""
        keluar.append(
            {
                "name": n.name,
                "type": getattr(n, "type", None),
                "description": getattr(n, "description", "") or "",
                "doc": doc or "",
            }
        )
    return keluar


OPERASI = {
    "complete": _lengkapi,
    "goto": _tuju,
    "references": _rujukan,
    "hover": _bantuan,
}

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    op = "complete"
    try:
        req = json.loads(line)
        op = req.get("op") or "complete"
        fn = OPERASI.get(op)
        if fn is None:
            raise ValueError("unknown op: " + str(op))
        hasil = fn(_skrip(req), req)
        # The bare array is the ORIGINAL contract and jediComplete still reads
        # it. Only the operations added later carry an envelope.
        out = hasil if op == "complete" else {"ok": True, "hasil": hasil}
    except Exception as e:
        out = [] if op == "complete" else {"ok": False, "err": str(e)}
    sys.stdout.write(json.dumps(out) + "\n")
    sys.stdout.flush()
