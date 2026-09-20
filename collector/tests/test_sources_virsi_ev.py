from pathlib import Path

from collector.sources.ev.virsi import parse

# The EV tariffs sit on the SAME page the fuel collector reads, so the test
# reuses that page's fixture instead of storing a second copy of it.
FIXTURE = Path(__file__).parent / "fixtures" / "virsi-fuel-web" / "2026-09-19.html"


def _parse_fixture():
    return parse(FIXTURE.read_text(encoding="utf-8"))


def test_reads_every_charging_card():
    tariffs = _parse_fixture()
    assert len(tariffs) == 6


def test_prices_match_the_published_table():
    by_power = {(t.connector, t.power_min_kw): t.energy_milli_per_kwh for t in _parse_fixture()}
    assert by_power[("CCS2", 40.0)] == 280
    assert by_power[("CCS2", 80.0)] == 320
    assert by_power[("CCS2", 120.0)] == 360
    assert by_power[("CCS2", 160.0)] == 380
    assert by_power[("CCS2", 320.0)] == 420
    assert by_power[("CHADEMO", 40.0)] == 280


def test_power_ranges_keep_both_ends():
    ranges = {(t.power_min_kw, t.power_max_kw) for t in _parse_fixture()}
    # "160 - 200 kW" must not collapse to a single number: the price covers
    # the whole band, and a charger at 200 kW is still on this tariff.
    assert (160.0, 200.0) in ranges
    assert (320.0, 400.0) in ranges
    # A single figure sets both ends, so range checks work the same way.
    assert (40.0, 40.0) in ranges


def test_connector_comes_from_the_attribute_not_the_label():
    connectors = {t.connector for t in _parse_fixture()}
    assert connectors == {"CCS2", "CHADEMO"}


def test_dc_standards_are_marked_dc():
    assert {t.current_type for t in _parse_fixture()} == {"DC"}


def test_tariffs_are_network_wide():
    # The page states the price applies across the whole network.
    assert all(t.station_id is None for t in _parse_fixture())


def _card(data_type: str, label: str, price: str) -> str:
    return (
        f'<div class="price-card charging-card" data-type="{data_type}">'
        f"<span>{label}</span><span>{price}</span></div></div>"
    )


def test_ignores_unknown_connector_type():
    assert parse(_card("wireless", "X 40kW", "0.28 EUR/kWh")) == []


def test_rejects_price_outside_sane_range():
    # A stray decimal would otherwise store 28 EUR/kWh as a real tariff.
    assert parse(_card("ccs2", "CCS 2 40kW", "28 EUR/kWh")) == []


def test_rejects_power_outside_sane_range():
    assert parse(_card("ccs2", "CCS 2 4000kW", "0.28 EUR/kWh")) == []


def test_returns_empty_for_page_without_cards():
    assert parse("<html><body>Nav uzlades</body></html>") == []
