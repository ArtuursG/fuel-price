from pathlib import Path

from collector.sources.fuel.straujupite import parse

FIXTURES = Path(__file__).parent / "fixtures" / "straujupite-fuel-web"


def test_parses_real_snapshot():
    html = (FIXTURES / "2026-09-18.html").read_text(encoding="utf-8")
    prices = parse(html)

    by_product = {p.product: p for p in prices}
    assert set(by_product) == {"P95", "DSL"}

    assert by_product["P95"].price_milli == 1874
    assert by_product["DSL"].price_milli == 1994

    for price in prices:
        assert price.network_id == "straujupite"
        assert price.scope == "cheapest"
        assert price.where_text == "Ainaži, Salacgrīvas nov."
        assert price.valid_from is None  # source has no "valid from" date, only "updated"


def test_edge_case_maps_english_variant_and_skips_unknown(caplog):
    html = (FIXTURES / "2026-01-01-edge-case.html").read_text(encoding="utf-8")
    prices = parse(html)

    by_product = {p.product: p for p in prices}
    # "LPG" isn't a Straujupīte product in PRODUCT_MAP -- must be skipped, not crash.
    assert set(by_product) == {"P95"}
    assert "Unknown Straujupīte product name" in caplog.text

    assert by_product["P95"].price_milli == 1799
    assert by_product["P95"].where_text == "Ainaži"
