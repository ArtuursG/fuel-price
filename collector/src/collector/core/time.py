"""Time helpers. Storage is always UTC; `local_date` is what the site shows."""

from __future__ import annotations

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

RIGA_TZ = ZoneInfo("Europe/Riga")


def utcnow_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def local_date(dt: datetime) -> date:
    if dt.tzinfo is None:
        raise ValueError("dt must be timezone-aware")
    return dt.astimezone(RIGA_TZ).date()
