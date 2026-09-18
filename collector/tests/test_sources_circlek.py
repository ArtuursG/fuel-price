from pathlib import Path

from collector.sources.fuel.circlek import extract_valid_from, parse

FIXTURES = Path(__file__).parent / "fixtures" / "circlek-fuel-web"


def test_parses_real_snapshot():
    html = (FIXTURES / "2026-09-18.html").read_text(encoding="utf-8")
    prices = parse(html)

    by_product = {p.product: p for p in prices}
    assert set(by_product) == {"P95", "P98", "DSL", "DSL_PLUS", "HVO", "LPG"}

    assert by_product["P95"].price_milli == 1914
    assert by_product["P98"].price_milli == 1984
    assert by_product["DSL"].price_milli == 2054
    assert by_product["DSL_PLUS"].price_milli == 2184
    assert by_product["HVO"].price_milli == 2490
    assert by_product["LPG"].price_milli == 925

    for price in prices:
        assert price.network_id == "circlek"
        assert price.scope == "cheapest_riga"
        assert price.valid_from == "2026-09-18"
        assert price.where_text  # every row has station addresses on this source


def test_extracts_valid_from_date():
    html = (FIXTURES / "2026-09-18.html").read_text(encoding="utf-8")
    assert extract_valid_from(html) == "2026-09-18"


def test_edge_case_handles_split_product_name_and_skips_unknown(caplog):
    html = (FIXTURES / "2026-01-01-edge-case.html").read_text(encoding="utf-8")
    prices = parse(html)

    by_product = {p.product: p for p in prices}
    # "JaunsProdukts99" is not in PRODUCT_MAP -- must be skipped, not crash.
    assert set(by_product) == {"P95", "HVO"}
    assert "Unknown Circle K product name" in caplog.text

    # "miles+ XTL" is split across a <font> tag in the real markup --
    # get_text() must still reconstruct it correctly to match PRODUCT_MAP.
    assert by_product["HVO"].price_milli == 2399
    assert by_product["HVO"].where_text == "Testa iela 2, Testa iela 3"

    assert by_product["P95"].valid_from == "2026-01-01"
