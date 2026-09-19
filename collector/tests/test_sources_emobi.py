from pathlib import Path

from collector.sources.ev.emobi import parse

FIXTURES = Path(__file__).parent / "fixtures" / "emobi-ev"


def test_parses_real_snapshot_splits_into_two_networks():
    content = (FIXTURES / "2026-09-19.json").read_bytes()
    stations, tariffs = parse(content)

    assert len(stations) == 370
    assert len(tariffs) == 1239

    station_networks = {s.network_id for s in stations}
    assert station_networks == {"emobi", "elektrum"}

    emobi_stations = [s for s in stations if s.network_id == "emobi"]
    elektrum_stations = [s for s in stations if s.network_id == "elektrum"]
    assert len(emobi_stations) == 140
    assert len(elektrum_stations) == 230


def test_companyname_csdd_maps_to_emobi_network_by_address_prefix():
    content = (FIXTURES / "2026-09-19.json").read_bytes()
    stations, _ = parse(content)
    emobi_stations = [s for s in stations if s.network_id == "emobi"]
    assert all(s.address and s.address.startswith("(e-mobi)") for s in emobi_stations)


def test_station_and_tariffs_share_a_station_id():
    content = (FIXTURES / "2026-09-19.json").read_bytes()
    stations, tariffs = parse(content)

    adazi = next(s for s in stations if s.name == "ĀDAŽI" and s.network_id == "emobi")
    adazi_tariffs = [t for t in tariffs if t.station_id == adazi.id]

    assert len(adazi_tariffs) == 3
    by_connector = {t.connector: t for t in adazi_tariffs}
    assert set(by_connector) == {"CCS2", "CHADEMO", "TYPE2"}
    assert by_connector["CCS2"].current_type == "DC"
    assert by_connector["CCS2"].time_milli_per_min == 190
    assert by_connector["CCS2"].energy_milli_per_kwh is None
    assert by_connector["TYPE2"].current_type == "AC"


def test_kwh_rate_unit_fills_energy_not_time():
    content = (FIXTURES / "2026-09-19.json").read_bytes()
    _, tariffs = parse(content)

    kwh_priced = [t for t in tariffs if t.energy_milli_per_kwh is not None]
    assert kwh_priced  # real snapshot has kWh-priced connectors (echarge/Elektrum)
    for t in kwh_priced:
        assert t.time_milli_per_min is None


def test_all_tariffs_use_app_payment():
    content = (FIXTURES / "2026-09-19.json").read_bytes()
    _, tariffs = parse(content)
    assert all(t.payment == "app" for t in tariffs)


def test_unknown_company_name_is_skipped_not_guessed(caplog):
    content = (
        b'{"features": [{"properties": {"companyName": "mystery", "uuid": "x"}, '
        b'"geometry": {"coordinates": [1, 2]}}]}'
    )
    stations, tariffs = parse(content)
    assert stations == []
    assert tariffs == []
    assert "Unknown e-mobi companyName: mystery" in caplog.text
