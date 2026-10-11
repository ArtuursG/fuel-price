"""Loads .dev.vars (if present) into os.environ for local development.
Real environment variables (e.g. GitHub Actions secrets) always take
precedence and are never overwritten.
"""

from __future__ import annotations

import os
from pathlib import Path

_loaded = False


def _candidate_paths() -> list[Path]:
    """Both places a .dev.vars sensibly lives, most specific first.

    The collector is its own project directory, so `collector/.dev.vars` is
    the natural spot for collector secrets; the repo root holds the shared
    one next to .dev.vars.example. Both are covered by .gitignore. Values
    from the more specific file win, because os.environ.setdefault keeps
    whatever was set first.
    """
    here = Path(__file__).resolve()
    return [here.parents[3] / ".dev.vars", here.parents[4] / ".dev.vars"]


def load_dev_vars(path: Path | None = None) -> None:
    global _loaded
    if _loaded:
        return
    _loaded = True

    for dev_vars_path in [path] if path else _candidate_paths():
        if not dev_vars_path.exists():
            continue
        for line in dev_vars_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())
