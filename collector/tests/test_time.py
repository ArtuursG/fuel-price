from datetime import UTC, datetime

import pytest

from collector.core.time import local_date, utcnow_iso


def test_local_date_converts_utc_evening_to_next_local_day():
    # Latvia is UTC+3 (EEST) in September -- 22:00 UTC is 01:00 the next day.
    dt = datetime(2026, 9, 17, 22, 0, tzinfo=UTC)
    assert local_date(dt).isoformat() == "2026-09-18"


def test_local_date_requires_tz_aware_input():
    with pytest.raises(ValueError):
        local_date(datetime(2026, 9, 17, 22, 0))


def test_utcnow_iso_ends_with_z():
    assert utcnow_iso().endswith("Z")
