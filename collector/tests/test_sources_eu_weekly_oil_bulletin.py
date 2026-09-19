from pathlib import Path

from collector.sources.official.eu_weekly_oil_bulletin import parse

FIXTURES = Path(__file__).parent / "fixtures" / "eu-weekly-oil-bulletin"


def test_parses_real_snapshot_keeps_only_baltic_rows():
    content = (FIXTURES / "2026-09-19.xlsx").read_bytes()
    prices = parse(content)

    countries = {p.merchant for p in prices}
    assert countries == {"LV", "LT", "EE"}  # not Poland, Germany, etc.

    by_key = {(p.merchant, p.product): p for p in prices}
    assert set(by_key) == {
        ("LV", "P95"),
        ("LV", "DSL"),
        ("LV", "LPG"),
        ("LT", "P95"),
        ("LT", "DSL"),
        ("LT", "LPG"),
        ("EE", "P95"),
        ("EE", "DSL"),
        ("EE", "LPG"),
    }

    assert by_key[("LV", "P95")].avg_price_milli == 1976
    assert by_key[("LV", "DSL")].avg_price_milli == 2096
    assert by_key[("LV", "LPG")].avg_price_milli == 915

    for price in prices:
        assert price.week_monday == "2026-09-14"
        assert price.source_url.startswith("https://energy.ec.europa.eu/")


def test_empty_workbook_returns_no_prices():
    import io

    from openpyxl import Workbook

    wb = Workbook()
    buf = io.BytesIO()
    wb.save(buf)
    assert parse(buf.getvalue()) == []
