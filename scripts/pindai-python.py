"""Syntax diagnostics for Python files, for the INFO panel.

WHY THE STANDARD LIBRARY AND NOTHING ELSE. No linter is installed on this
machine -- ruff, pyflakes, flake8 and pylint were all checked and none is
present -- and INFO must not stop working because a tool is missing. compile()
ships with Python itself, so this always runs.

WHAT THAT COSTS. SYNTAX errors only. An undefined name, an unused import, a
type mismatch: none of those appear here. A Python file with no rows in INFO is
an unparsed-cleanly file, NOT a checked file, and the panel must not let anyone
believe otherwise.

Output matches the shape tsc produces with --pretty false, so one parser reads
both:

    path(line,col): error PY001: message
"""

import ast
import os
import sys

# Directories that hold dependencies, build output or history rather than the
# project's own source. Walking them is slow and every finding is noise.
LEWATI = {
    ".git",
    ".venv",
    ".wolfspace",
    "__pycache__",
    "build",
    "dist",
    "dist-app",
    "node_modules",
    "site-packages",
    "venv",
}

# A ceiling, so a scan of an enormous tree cannot hold the panel open forever.
BATAS_BERKAS = 4000


def pindai(akar):
    dilihat = 0
    for dirpath, dirnames, filenames in os.walk(akar):
        dirnames[:] = [d for d in dirnames if d not in LEWATI]
        for nama in filenames:
            if not nama.endswith(".py"):
                continue
            dilihat += 1
            if dilihat > BATAS_BERKAS:
                return
            jalur = os.path.join(dirpath, nama)
            try:
                with open(jalur, "r", encoding="utf-8", errors="replace") as f:
                    isi = f.read()
            except OSError:
                continue
            try:
                compile(isi, jalur, "exec", ast.PyCF_ONLY_AST)
            except SyntaxError as e:
                # A SyntaxError can carry None for either position, and it
                # reports the file it was given -- which is the absolute path
                # above, exactly what the parser expects to relativise.
                baris = e.lineno or 1
                kolom = e.offset or 1
                pesan = " ".join((e.msg or "syntax error").split())
                print("%s(%d,%d): error PY001: %s" % (jalur, baris, kolom, pesan))
            except ValueError as e:
                # A NUL byte or an out-of-range literal reaches here instead.
                print("%s(1,1): error PY002: %s" % (jalur, " ".join(str(e).split())))


if __name__ == "__main__":
    pindai(sys.argv[1] if len(sys.argv) > 1 else ".")
