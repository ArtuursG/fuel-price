from pathlib import Path

from collector.sources.ev.ignitis import extract_locations, parse

FIXTURES = Path(__file__).parent / "fixtures" / "ignitis-ev-web"


def test_parses_real_snapshot_lv_only():
    html = (FIXTURES / "2026-09-19.html").read_text(encoding="utf-8")
    stations, tariffs = parse(html)

    assert len(stations) == 220
    assert len(tariffs) == 337
    assert all(s.network_id == "ignitis" and s.country == "LV" for s in stations)
    assert all(t.network_id == "ignitis" for t in tariffs)


def test_extracts_locations_from_drupal_settings_block():
    html = (FIXTURES / "2026-09-19.html").read_text(encoding="utf-8")
    locations = extract_locations(html)
    assert len(locations) == 677  # LV + LT + EE combined, before country filtering


def test_prices_fall_within_published_tariff_ranges():
    # ignitison.lv/cenas: AC <=44kW 0.27-0.31, DC 45-149kW 0.32-0.38, HPC 150kW+ 0.39-0.43
    html = (FIXTURES / "2026-09-19.html").read_text(encoding="utf-8")
    _, tariffs = parse(html)
    for t in tariffs:
        assert 270 <= t.energy_milli_per_kwh <= 430
        assert t.time_milli_per_min is None


def test_current_type_matches_connector_type():
    html = (FIXTURES / "2026-09-19.html").read_text(encoding="utf-8")
    _, tariffs = parse(html)
    for t in tariffs:
        if t.connector == "TYPE2":
            assert t.current_type == "AC"
        else:
            assert t.current_type == "DC"


def test_idle_fee_applied_network_wide():
    html = (FIXTURES / "2026-09-19.html").read_text(encoding="utf-8")
    _, tariffs = parse(html)
    assert all(t.idle_fee_milli_per_min == 100 and t.idle_after_min == 20 for t in tariffs)


def test_skips_unrecognised_connector_type_not_guessed(caplog):
    html = """
    <script data-drupal-selector="drupal-settings-json">
    {"ignitisChargingMap": {"locations": [
        {"id": "1", "label": "Test", "address": "Test iela 1, Riga, Latvia",
         "latlng": ["56.9", "24.1"],
         "connectors_grouped": [{"type": "ccs1", "power": 50, "price": 0.3}]}
    ]}}
    </script>
    """
    stations, tariffs = parse(html)
    assert len(stations) == 1  # station still recorded, just no tariff for the odd connector
    assert tariffs == []
    assert "Unknown Ignitis connector type: ccs1" in caplog.text


def test_skips_connector_group_with_no_price():
    html = """
    <script data-drupal-selector="drupal-settings-json">
    {"ignitisChargingMap": {"locations": [
        {"id": "1", "label": "Test", "address": "Test iela 1, Riga, Latvia",
         "latlng": ["56.9", "24.1"],
         "connectors_grouped": [{"type": "ccs2", "power": 50, "price": null}]}
    ]}}
    </script>
    """
    _, tariffs = parse(html)
    assert tariffs == []


def test_non_lv_stations_are_excluded():
    html = """
    <script data-drupal-selector="drupal-settings-json">
    {"ignitisChargingMap": {"locations": [
        {"id": "1", "label": "Vilnius", "address": "Test g. 1, Vilnius, Lithuania",
         "latlng": ["54.7", "25.3"],
         "connectors_grouped": [{"type": "ccs2", "power": 50, "price": 0.3}]},
        {"id": "2", "label": "Riga", "address": "Test iela 1, Riga, Latvia",
         "latlng": ["56.9", "24.1"],
         "connectors_grouped": [{"type": "ccs2", "power": 50, "price": 0.3}]}
    ]}}
    </script>
    """
    stations, tariffs = parse(html)
    assert len(stations) == 1
    assert stations[0].name == "Riga"
