from pathlib import Path

from collector.sources.fuel.virsi import parse

FIXTURES = Path(__file__).parent / "fixtures" / "virsi-fuel-web"


def test_parses_real_snapshot():
    html = (FIXTURES / "2026-09-19.html").read_text(encoding="utf-8")
    prices = parse(html)

    by_product = {p.product: p for p in prices}
    assert set(by_product) == {"P95", "P98", "DSL", "DSL_AGRO", "LPG", "CNG", "ADBLUE"}

    assert by_product["DSL"].price_milli == 2177
    assert by_product["DSL_AGRO"].price_milli == 1774
    assert by_product["P95"].price_milli == 1997
    assert by_product["P98"].price_milli == 2064
    assert by_product["CNG"].price_milli == 1945
    assert by_product["LPG"].price_milli == 905
    assert by_product["ADBLUE"].price_milli == 865

    for price in prices:
        assert price.network_id == "virsi"


def test_scope_varies_per_product_by_address_text():
    html = (FIXTURES / "2026-09-19.html").read_text(encoding="utf-8")
    by_product = {p.product: p for p in parse(html)}

    # a real station address -> scope=cheapest_riga, where_text kept
    assert by_product["DSL"].scope == "cheapest_riga"
    assert by_product["DSL"].where_text == "Brīvības gatve 297, Rīga, LV-1006"

    # "Visā Viršu tīklā" -> scope=network, where_text dropped (not a real place)
    assert by_product["LPG"].scope == "network"
    assert by_product["LPG"].where_text is None


def test_ev_charging_cards_are_not_parsed_as_fuel():
    html = (FIXTURES / "2026-09-19.html").read_text(encoding="utf-8")
    prices = parse(html)
    # ccs2/chademo charging-card entries must never appear as fuel products
    assert all(
        p.product in {"P95", "P98", "DSL", "DSL_AGRO", "LPG", "CNG", "ADBLUE"} for p in prices
    )


def test_skips_unknown_data_type(caplog):
    html = """
    <div class="price-card" data-type="mystery">
        <p class="price"><span>XX</span><span>1.000</span></p>
        <p class="address">Visā Viršu tīklā</p>
    </div>
    """
    prices = parse(html)
    assert prices == []
    assert "Unknown Virši product data-type" in caplog.text
