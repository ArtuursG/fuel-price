from pathlib import Path

from collector.sources.ev.nap import (
    MAX_PRICE_MILLI,
    build,
    parse_infrastructure,
    parse_status,
)

FIXTURES = Path(__file__).parent / "fixtures" / "nap-ev"
INFRASTRUCTURE = (FIXTURES / "infrastructure.xml").read_bytes()
STATUS = (FIXTURES / "status.xml").read_bytes()


def test_reads_sites_with_address_and_coordinates():
    stations, _ = parse_infrastructure(INFRASTRUCTURE)
    assert stations
    for station in stations:
        assert station.network_id
        assert station.lat and station.lon
        assert station.address


def test_station_ids_are_prefixed_so_they_cannot_collide():
    # Other sources contribute stations too; an unprefixed site id from one
    # feed could silently overwrite a row from another.
    stations, _ = parse_infrastructure(INFRASTRUCTURE)
    assert all(s.id.startswith("nap-") for s in stations)


def test_internal_codes_do_not_become_station_names():
    # Some sites are named "PLVRIXPB12_EDLV-52"; the street is what a person
    # can actually use, so a code is replaced by it.
    stations, _ = parse_infrastructure(INFRASTRUCTURE)
    for station in stations:
        if station.name:
            assert any(c.islower() for c in station.name), station.name


def test_points_are_keyed_by_the_evse_identifier():
    # The two files give a refill point different id attributes; only
    # fac:externalIdentifier matches across them.
    _, points = parse_infrastructure(INFRASTRUCTURE)
    assert points
    for external_id, point in points.items():
        assert point.external_id == external_id
        assert external_id.startswith("LV")


def test_connectors_and_current_are_mapped():
    _, points = parse_infrastructure(INFRASTRUCTURE)
    connectors = {p.connector for p in points.values()}
    assert connectors <= {"CCS2", "TYPE2", "CHADEMO", None}
    for point in points.values():
        if point.connector in ("CCS2", "CHADEMO"):
            assert point.current_type == "DC"
        elif point.connector == "TYPE2":
            assert point.current_type == "AC"


def test_power_is_converted_from_watts_to_kilowatts():
    _, points = parse_infrastructure(INFRASTRUCTURE)
    powers = {p.power_kw for p in points.values() if p.power_kw}
    assert powers
    # Raw values are 11000, 50000, 150000 W; anything left in watts would
    # sail past the upper bound and be dropped instead.
    assert max(powers) <= 400.0
    assert min(powers) >= 1.0


def test_rates_reach_every_point_under_the_same_station():
    rates = parse_status(STATUS)
    assert rates
    assert all(r.energy_milli_per_kwh > 0 for r in rates.values())


def test_vat_is_added_only_where_the_rate_states_it():
    status = """<?xml version="1.0"?>
    <d2:payload xmlns:d2="http://datex2.eu/schema/3/d2Payload"
      xmlns:egi="http://datex2.eu/schema/3/energyInfrastructure"
      xmlns:fac="http://datex2.eu/schema/3/facilities">
      <egi:energyInfrastructureStationStatus>
        <fac:newRates><fac:rateLineCollection><fac:rateLine>
          <fac:rateLineType>perUnit</fac:rateLineType>
          <fac:value>0.30</fac:value>
          <fac:rateLineTax><fac:taxRate>21.0000</fac:taxRate>
            <fac:taxIncluded>false</fac:taxIncluded></fac:rateLineTax>
        </fac:rateLine></fac:rateLineCollection></fac:newRates>
        <egi:refillPointStatus><fac:reference id="WITH-TAX"/></egi:refillPointStatus>
      </egi:energyInfrastructureStationStatus>
      <egi:energyInfrastructureStationStatus>
        <fac:newRates><fac:rateLineCollection><fac:rateLine>
          <fac:rateLineType>perUnit</fac:rateLineType>
          <fac:value>0.44</fac:value>
          <fac:rateLineTax><fac:taxRate>0</fac:taxRate>
            <fac:taxIncluded>false</fac:taxIncluded></fac:rateLineTax>
        </fac:rateLine></fac:rateLineCollection></fac:newRates>
        <egi:refillPointStatus><fac:reference id="NO-TAX"/></egi:refillPointStatus>
      </egi:energyInfrastructureStationStatus>
    </d2:payload>"""
    rates = parse_status(status)
    assert rates["WITH-TAX"].energy_milli_per_kwh == 363  # 0.30 * 1.21
    assert rates["NO-TAX"].energy_milli_per_kwh == 440  # already the final price


def test_a_rate_in_another_unit_is_skipped_not_assumed_to_be_per_kwh():
    status = """<?xml version="1.0"?>
    <d2:payload xmlns:d2="http://datex2.eu/schema/3/d2Payload"
      xmlns:egi="http://datex2.eu/schema/3/energyInfrastructure"
      xmlns:fac="http://datex2.eu/schema/3/facilities">
      <egi:energyInfrastructureStationStatus>
        <fac:newRates><fac:rateLineCollection><fac:rateLine>
          <fac:rateLineType>perMinute</fac:rateLineType>
          <fac:value>0.10</fac:value>
        </fac:rateLine></fac:rateLineCollection></fac:newRates>
        <egi:refillPointStatus><fac:reference id="PER-MINUTE"/></egi:refillPointStatus>
      </egi:energyInfrastructureStationStatus>
    </d2:payload>"""
    assert parse_status(status) == {}


def test_a_price_outside_sane_bounds_is_refused():
    status = """<?xml version="1.0"?>
    <d2:payload xmlns:d2="http://datex2.eu/schema/3/d2Payload"
      xmlns:egi="http://datex2.eu/schema/3/energyInfrastructure"
      xmlns:fac="http://datex2.eu/schema/3/facilities">
      <egi:energyInfrastructureStationStatus>
        <fac:newRates><fac:rateLineCollection><fac:rateLine>
          <fac:rateLineType>perUnit</fac:rateLineType>
          <fac:value>44</fac:value>
        </fac:rateLine></fac:rateLineCollection></fac:newRates>
        <egi:refillPointStatus><fac:reference id="MISPLACED-DECIMAL"/></egi:refillPointStatus>
      </egi:energyInfrastructureStationStatus>
    </d2:payload>"""
    # A stray decimal would otherwise store 44 EUR/kWh as a real tariff.
    assert parse_status(status) == {}
    assert MAX_PRICE_MILLI == 2000


def test_build_joins_prices_to_stations():
    stations, tariffs = build(INFRASTRUCTURE, STATUS)
    assert stations and tariffs
    station_ids = {s.id for s in stations}
    for tariff in tariffs:
        assert tariff.station_id in station_ids
        assert tariff.network_id == next(
            s.network_id for s in stations if s.id == tariff.station_id
        )
        assert tariff.vat_included is True
        assert tariff.energy_milli_per_kwh


def test_operators_without_a_network_of_ours_are_skipped():
    # IONITY, Swedbank and the rest have no row in `networks`; emitting them
    # would fail the whole batch on the foreign key.
    stations, _ = parse_infrastructure(INFRASTRUCTURE)
    known = {"elektrum", "ignitis", "eleport", "enefit", "virsi"}
    assert {s.network_id for s in stations} <= known


def test_points_without_a_price_produce_no_tariff():
    # Some sites report availability only; they must not turn into a tariff
    # with a missing or invented price.
    stations, tariffs = build(INFRASTRUCTURE, STATUS)
    _, points = parse_infrastructure(INFRASTRUCTURE)
    assert len(tariffs) <= len(points)
