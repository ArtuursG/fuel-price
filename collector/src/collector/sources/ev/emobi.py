"""Parser for emobi-ev (docs/sources.yaml). Pure function: GeoJSON bytes in,
(Station, EvTariff) records out.

API structure (confirmed 2026-09-19, https://e-mobi.lv/api/stations): a
single unauthenticated GeoJSON FeatureCollection, 370 features. Despite the
source id "emobi", TWO real-world networks are mixed into this one feed,
distinguished by properties.companyName:
  - "csdd" (140 stations, address prefixed "(e-mobi)") -- CSDD's own e-mobi
    network -> network_id "emobi".
  - "echarge" (230 stations, 215 prefixed "(Elektrum Drive)", 1 a typo of
    that, 14 unlabelled) -- this is Elektrum Drive surfaced through the same
    aggregator platform, NOT a third network -> network_id "elektrum".
    Classified by companyName (a structured field), not the free-text
    address prefix, so the unlabelled remainder is still included correctly.

Each connector on a station becomes one EvTariff row: current_type/connector
type/power come from the connector, price from its `rate` field (unit "kwh"
or "min" -> energy_milli_per_kwh or time_milli_per_min). Payment is hardcoded
"app" for both networks -- confirmed from page text, not guessed: e-mobi's
own info text ("uzsāc uzlādi lietotnē" = "start charging in the app") and
Elektrum Drive's public charging page ("link your payment card on the app").
"""

from __future__ import annotations

import json
import logging

from collector.core.models import EvTariff, Station

logger = logging.getLogger(__name__)

SOURCE_ID = "emobi-ev"
URL = "https://e-mobi.lv/api/stations"

COMPANY_NETWORK_MAP = {
    "csdd": "emobi",
    "echarge": "elektrum",
}

CONNECTOR_MAP = {
    "CCS": "CCS2",
    "CHAdeMO": "CHADEMO",
    "Type2": "TYPE2",
}

PAYMENT = "app"


def parse(content: bytes) -> tuple[list[Station], list[EvTariff]]:
    data = json.loads(content)
    stations: list[Station] = []
    tariffs: list[EvTariff] = []

    for feature in data.get("features", []):
        props = feature.get("properties", {})
        network_id = COMPANY_NETWORK_MAP.get(props.get("companyName"))
        if network_id is None:
            logger.warning("Unknown e-mobi companyName: %s", props.get("companyName"))
            continue

        uuid = props.get("uuid")
        if not uuid:
            continue
        station_id = f"{network_id}:{uuid}"

        coords = (feature.get("geometry") or {}).get("coordinates") or []
        lon, lat = (coords[0], coords[1]) if len(coords) >= 2 else (None, None)
        address = props.get("address") or {}

        stations.append(
            Station(
                id=station_id,
                network_id=network_id,
                name=props.get("name") or None,
                address=address.get("street") or None,
                city=address.get("city") or None,
                lat=lat,
                lon=lon,
            )
        )

        for connector in props.get("connectors", []):
            current_type = connector.get("currentType")
            if current_type not in ("AC", "DC"):
                logger.warning("Unknown e-mobi connector currentType: %s", current_type)
                continue

            rate = connector.get("rate") or {}
            unit = rate.get("unit")
            rate_value = rate.get("rate")
            energy_milli = None
            time_milli = None
            if rate_value is not None:
                milli = round(float(rate_value) * 1000)
                if unit == "kwh":
                    energy_milli = milli
                elif unit == "min":
                    time_milli = milli
                else:
                    logger.warning("Unknown e-mobi rate unit: %s", unit)

            power = connector.get("maxPowerKw")
            tariffs.append(
                EvTariff(
                    network_id=network_id,
                    station_id=station_id,
                    current_type=current_type,
                    payment=PAYMENT,
                    power_min_kw=power,
                    power_max_kw=power,
                    connector=CONNECTOR_MAP.get(connector.get("type")),
                    energy_milli_per_kwh=energy_milli,
                    time_milli_per_min=time_milli,
                    vat_included=True,
                )
            )

    return stations, tariffs
