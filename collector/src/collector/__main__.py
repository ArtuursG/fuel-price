import sys

from collector.cli import main

if __name__ == "__main__":
    # Windows consoles default to cp1252, which can't encode Latvian
    # diacritics (ā, ģ, ī, ...) -- force UTF-8 regardless of platform locale.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    raise SystemExit(main())
