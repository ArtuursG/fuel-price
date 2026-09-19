from pathlib import Path

from collector.sources.ev.eleport import parse

FIXTURES = Path(__file__).parent / "fixtures" / "eleport-ev-web"


def test_parses_real_snapshot_latvia_rates():
    html = (FIXTURES / "2026-09-19.html").read_text(encoding="utf-8")
    tariffs = parse(html)

    assert len(tariffs) == 2
    by_type = {t.current_type: t for t in tariffs}
    assert set(by_type) == {"AC", "DC"}

    assert by_type["AC"].energy_milli_per_kwh == 320
    assert by_type["AC"].power_max_kw == 22.0
    assert by_type["DC"].energy_milli_per_kwh == 390
    assert by_type["DC"].power_max_kw == 400.0

    for t in tariffs:
        assert t.network_id == "eleport"
        assert t.station_id is None
        assert t.payment == "adhoc"
        assert t.connector is None  # source never names a connector standard


def test_does_not_read_a_different_countrys_price():
    # Regression guard: the page lists near-identical price blocks for six
    # countries back to back. Parsing by position instead of aria-controls
    # would silently pick up a different country's rate.
    html = (FIXTURES / "2026-09-19.html").read_text(encoding="utf-8")
    tariffs = parse(html)
    prices = {t.energy_milli_per_kwh for t in tariffs}
    assert prices == {320, 390}  # confirmed real LV rates, not another country's


def test_missing_latvia_tab_returns_empty(caplog):
    assert parse("<html><body>no tabs here</body></html>") == []
    assert "could not isolate the Latvia pricing tab" in caplog.text
