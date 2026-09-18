"""Loads .dev.vars (if present) into os.environ for local development.
Real environment variables (e.g. GitHub Actions secrets) always take
precedence and are never overwritten.
"""

from __future__ import annotations

import os
from pathlib import Path

_loaded = False


def load_dev_vars(path: Path | None = None) -> None:
    global _loaded
    if _loaded:
        return
    _loaded = True

    dev_vars_path = path or Path(__file__).resolve().parents[4] / ".dev.vars"
    if not dev_vars_path.exists():
        return

    for line in dev_vars_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())
