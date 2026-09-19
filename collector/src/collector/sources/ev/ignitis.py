"""Parser for ignitis-ev-web (docs/sources.yaml). Pure function: HTML in,
(Station, EvTariff) records out.

Source: https://ignitison.lt/zemelapis -- NOT ignitison.lv (that domain's
/cenas page has the tariff STRUCTURE in text, e.g. idle fees, but no
per-station numbers; .lt hosts the shared Baltic map for all three
countries, per-station JSON included). The full station list is embedded as
JSON in a `data-drupal-selector="drupal-settings-json"` script block
(settings.ignitisChargingMap.locations), no API key needed -- the same
approach already used by ev-charge-lv/scripts/fetch_ignitis.py, re-verified
live 2026-09-19 (677 locations, structure unchanged).

Only LV stations are kept -- every other network in this project is LV-only
so far; cross-Baltic comparison is Phase 7. Country is inferred from the
address text's country-name suffix, falling back to a latitude band for the
~20% of records with no country name in their address at all -- both the
approach and the band boundaries are carried over from ev-charge-lv's own
empirical check against this exact dataset, not a fresh guess (see
infer_country there).

current_type is derived from connector type, not the API (Type2 is always
AC, CCS2/CHAdeMO are always DC by definition -- not a per-source guess,
matches what e-mobi's API independently confirmed for the same three types).

Idle fee (0.10 EUR/min after 20 min free) and payment method ("app", per
ignitison.lv/cenas: payment history in-app, card pre-authorization) are
network-wide policy text, not present in the per-station JSON -- applied
uniformly to every tariff row, confirmed from that page's own text.
"""

from __future__ import annotations

import json
import logging
import re

from collector.core.models import EvTariff, Station

logger = logging.getLogger(__name__)

SOURCE_ID = "ignitis-ev-web"
NETWORK_ID = "ignitis"
URL = "https://ignitison.lt/zemelapis"

_SETTINGS_RE = re.compile(r'data-drupal-selector="drupal-settings-json">(.*?)</script>', re.S)

CONNECTOR_MAP = {
    "ccs2": "CCS2",
    "chademo": "CHADEMO",
    "type2": "TYPE2",
}
AC_CONNECTORS = {"TYPE2"}

COUNTRY_SUFFIXES = [
    ("Latvia", "LV"),
    ("Latvija", "LV"),
    ("Lithuania", "LT"),
    ("Lietuva", "LT"),
    ("Estonia", "EE"),
    ("Eesti", "EE"),
]

PAYMENT = "app"
IDLE_FEE_MILLI_PER_MIN = 100
IDLE_AFTER_MIN = 20


def _infer_country(address: str, lat: float) -> str:
    for suffix, code in COUNTRY_SUFFIXES:
        if address.endswith(suffix):
            return code
    if lat >= 57.9:
        return "EE"
    if lat < 56.5:
        return "LT"
    return "LV"


def extract_locations(html: str) -> list[dict]:
    match = _SETTINGS_RE.search(html)
    if not match:
        raise ValueError("Could not find drupal-settings-json block on Ignitis map page")
    settings = json.loads(match.group(1))
    locations = (settings.get("ignitisChargingMap") or {}).get("locations")
    if locations is None:
        raise ValueError("ignitisChargingMap.locations missing from Ignitis page settings")
    return locations


def parse(html: str) -> tuple[list[Station], list[EvTariff]]:
    locations = extract_locations(html)
    stations: list[Station] = []
    tariffs: list[EvTariff] = []

    for loc in locations:
        latlng = loc.get("latlng") or []
        if len(latlng) < 2:
            continue
        try:
            lat, lon = float(latlng[0]), float(latlng[1])
        except (TypeError, ValueError):
            continue

        address = loc.get("address") or ""
        if _infer_country(address, lat) != "LV":
            continue

        loc_id = loc.get("id")
        if not loc_id:
            continue
        station_id = f"{NETWORK_ID}:{loc_id}"

        stations.append(
            Station(
                id=station_id,
                network_id=NETWORK_ID,
                name=loc.get("label") or None,
                address=address or None,
                lat=lat,
                lon=lon,
            )
        )

        for connector in loc.get("connectors_grouped") or []:
            conn_type = CONNECTOR_MAP.get(str(connector.get("type", "")).lower())
            if conn_type is None:
                logger.warning("Unknown Ignitis connector type: %s", connector.get("type"))
                continue

            price = connector.get("price")
            if price is None:
                continue

            power = connector.get("power")
            tariffs.append(
                EvTariff(
                    network_id=NETWORK_ID,
                    station_id=station_id,
                    current_type="AC" if conn_type in AC_CONNECTORS else "DC",
                    payment=PAYMENT,
                    power_min_kw=power,
                    power_max_kw=power,
                    connector=conn_type,
                    energy_milli_per_kwh=round(float(price) * 1000),
                    idle_fee_milli_per_min=IDLE_FEE_MILLI_PER_MIN,
                    idle_after_min=IDLE_AFTER_MIN,
                    vat_included=True,
                )
            )

    return stations, tariffs
