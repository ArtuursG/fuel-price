from pathlib import Path

from collector.sources.fuel.kool import find_snippet_url, parse

FIXTURES = Path(__file__).parent / "fixtures" / "kool-fuel-web"

PAGE = (FIXTURES / "2026-09-20-page.html").read_text(encoding="utf-8")
SNIPPET = (FIXTURES / "2026-09-20-snippet.html").read_text(encoding="utf-8")


def test_finds_the_fuel_pages_own_snippet_not_another_pages():
    # The page references a snippet for every page of the site (vacancies,
    # contacts, coffee subscription...). Picking by position instead of by
    # pagePath would silently read a page with no prices on it.
    url = find_snippet_url(PAGE)
    assert url is not None
    assert "475a5a73" in url  # the degviela snippet
    assert url.startswith("https://c-p.rmcdn.net/")


def test_missing_snippet_returns_none_rather_than_a_wrong_guess(caplog):
    assert find_snippet_url("<html><body>nothing here</body></html>") is None
    assert "could not find the degviela snippet URL" in caplog.text


def test_parses_real_snapshot():
    prices = parse(SNIPPET)
    by_product = {p.product: p for p in prices}

    assert set(by_product) == {"P95", "P98", "DSL", "DSL_PLUS"}
    assert by_product["P95"].price_milli == 1947
    assert by_product["P98"].price_milli == 2017
    assert by_product["DSL"].price_milli == 2117
    assert by_product["DSL_PLUS"].price_milli == 2167

    for price in prices:
        assert price.network_id == "kool"
        # The page says "Zemākās cenas DUS tīklā" and warns prices differ
        # between stations, so this is a network low, not a station price.
        assert price.scope == "cheapest"


def test_reads_only_the_first_paragraph_of_a_price_cell():
    # The real DD cell contains "2.117" followed by an orphan "7" on a
    # second line that the widget's fixed height clips out of view.
    # Concatenating them would yield a nonsense price.
    assert parse(SNIPPET)[0].price_milli != 21177
    assert {p.price_milli for p in parse(SNIPPET)} == {1947, 2017, 2117, 2167}


def test_matches_products_to_prices_by_column_not_document_order():
    # Same widgets, shuffled in the document: the pairing must not change.
    import re

    widgets = re.findall(
        r'<div class="rmwidget widget-text-v3".*?</div></div></div>', SNIPPET, re.S
    )
    shuffled = "".join(reversed(widgets))
    assert {(p.product, p.price_milli) for p in parse(shuffled)} == {
        ("P95", 1947),
        ("P98", 2017),
        ("DSL", 2117),
        ("DSL_PLUS", 2167),
    }


def test_ignores_numbers_outside_a_plausible_price_range(caplog):
    widget = (
        '<div class="rmwidget widget-text-v3" style="left: 290px; top: 279px; z-index: 1;">'
        "<div><div><p><span>95E</span></p></div></div></div>"
        '<div class="rmwidget widget-text-v3" style="left: 290px; top: 315px; z-index: 2;">'
        "<div><div><p><span>19,470</span></p></div></div></div>"
    )
    assert parse(widget) == []
    assert "out of range" in caplog.text
