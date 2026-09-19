from pathlib import Path

from bs4 import BeautifulSoup

from collector.sources.fuel.viada import extract_valid_from, parse

FIXTURES = Path(__file__).parent / "fixtures" / "viada-fuel-web"


def test_parses_real_snapshot():
    html = (FIXTURES / "2026-09-19.html").read_text(encoding="utf-8")
    prices = parse(html)

    by_product = {p.product: p for p in prices}
    assert set(by_product) == {"P95", "P98", "DSL", "DSL_PLUS", "LPG", "E85"}

    assert by_product["P95"].price_milli == 1897
    assert by_product["P98"].price_milli == 2002
    assert by_product["DSL"].price_milli == 2184
    assert by_product["DSL_PLUS"].price_milli == 2067
    assert by_product["LPG"].price_milli == 825
    assert by_product["E85"].price_milli == 1995

    for price in prices:
        assert price.network_id == "viada"
        assert price.scope == "cheapest"
        assert price.valid_from == "2026-09-18"
        assert price.where_text  # every row lists station names/addresses


def test_extracts_valid_from_date_split_across_two_tags():
    html = (FIXTURES / "2026-09-19.html").read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")
    assert extract_valid_from(soup) == "2026-09-18"


def test_ambiguous_second_98_image_is_skipped_not_guessed(caplog):
    # petrol_95ectoplus_new.png is deliberately unmapped (see viada.py docstring):
    # earlier research guessed P98, but that collides with petrol_98_new.png,
    # which is also P98 at a different price in the same snapshot.
    html = (FIXTURES / "2026-09-19.html").read_text(encoding="utf-8")
    prices = parse(html)

    p98_prices = {p.price_milli for p in prices if p.product == "P98"}
    assert p98_prices == {2002}
    assert "Unknown Viada product image: petrol_95ectoplus_new.png" in caplog.text


def test_skips_row_with_unrecognised_image():
    html = """
    <table><tr><th>Degvielas veids</th><th>Cena EUR litrā</th><th>Stacijas</th></tr>
    <tr>
        <td><img src="https://example.com/mystery.png" /></td>
        <td>1.500 EUR</td>
        <td>Testa iela 1</td>
    </tr>
    </table>
    """
    assert parse(html) == []
