"""Parser for nap-ev: Latvia's National Access Point charging datasets.

Two subscribed DATEX II 3.4 datasets (both CC0) describe the same network
from two sides, and neither is useful alone:

  infrastructure  sites, operators, addresses, connectors   once a day
  status          availability and RATES                    every 15 min

They join cleanly, which is why this can replace scraping operator sites
one by one. Verified against the live files on 2026-10-11:

  site id            631 of 631 match
  refill point       2033 of 2033 match, through the infrastructure file's
                     fac:externalIdentifier (the EVSE id) -- NOT its own
                     id attribute, which holds a different value in each
                     of the two files
  DATEX station id   does not match at all: the infrastructure file numbers
                     stations 1, 2, 3 within each site, so rates are read
                     from the status file's own tree instead, where every
                     station status carries both its rates and its points

VAT: every rate says taxIncluded=false, and the tax rate is consistent per
operator -- Ignitis, Enefit, Eleport and IONITY state 21%, while Elektrum
and the small operators state 0. Reading 0 as "this is already the final
price" is what the numbers support: Elektrum then averages 0.445, in line
with the others once their 21% is added (Ignitis 0.302 -> 0.365), whereas
adding 21% to Elektrum as well would put it at 0.54, far above every
competitor. So VAT is added only where a rate states one, and what gets
stored is always the consumer price.
"""

from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from dataclasses import dataclass

from collector.core.models import EvTariff, Station

logger = logging.getLogger(__name__)

SOURCE_ID = "nap-ev"
FILE_INFO_URL = "https://www.transportdata.gov.lv/api/v1/metadata/file/info"
DOWNLOAD_URL = "https://www.transportdata.gov.lv/api/v1/get/file/download-file"

NS = {
    "egi": "http://datex2.eu/schema/3/energyInfrastructure",
    "fac": "http://datex2.eu/schema/3/facilities",
    "com": "http://datex2.eu/schema/3/common",
    "loc": "http://datex2.eu/schema/3/locationReferencing",
    "locx": "http://datex2.eu/schema/3/locationExtension",
}


def _q(tag: str, prefix: str) -> str:
    return "{" + NS[prefix] + "}" + tag


# Tikai tie operatori, kas mums ir networks tabula. Parejos izlaizam un
# pieminam zurnala -- svesa network_id ielikana nogaztu visu partiju uz
# arejas atslegas ierobezojuma.
OPERATOR_TO_NETWORK = {
    "elektrum drive": "elektrum",
    "ignitis on": "ignitis",
    "eleport": "eleport",
    "enefit volt": "enefit",
    "enefit": "enefit",
    "virsi": "virsi",
}

CONNECTOR_MAP = {
    "iec62196t2combo": "CCS2",
    "iec62196t2": "TYPE2",
    "chademo": "CHADEMO",
}

CURRENT_BY_MODE = {
    "mode4dc": "DC",
    "mode3ac3p": "AC",
    "mode3ac1p": "AC",
    "mode2ac1p": "AC",
    "mode1ac1p": "AC",
}

# Savienotajs nosaka stravas veidu tad, kad chargingMode ir "unknown".
CURRENT_BY_CONNECTOR = {"CCS2": "DC", "CHADEMO": "DC", "TYPE2": "AC"}

# Sanigas robezas. Zem 5 centiem par kWh publiskas uzlades nav, virs 2 EUR
# nav neviena LV operatora, un 400 kW ir lielaka LV uzstadita jauda.
MIN_PRICE_MILLI = 50
MAX_PRICE_MILLI = 2000
MIN_POWER_KW = 1.0
MAX_POWER_KW = 400.0


@dataclass(frozen=True)
class RefillPoint:
    """Uzlades punkts no infrastrukturas faila."""

    external_id: str
    site_id: str
    connector: str | None
    current_type: str
    power_kw: float | None


@dataclass(frozen=True)
class Rate:
    """Cena no statusa faila, jau parrekinata uz gala cenu."""

    energy_milli_per_kwh: int


def _text(node: ET.Element | None) -> str | None:
    if node is None or node.text is None:
        return None
    return node.text.strip() or None


def _looks_like_code(name: str) -> bool:
    """Dalai vietu "nosaukums" ir ieksejs kods (PLVRIXPB12_EDLV-52).

    Mazo burtu trukums to nodod: istie nosaukumi ("DUS Adazi", "Elektrum,
    DC 50kW") tos satur vienmer.
    """
    return not any(character.islower() for character in name)


def parse_infrastructure(xml: bytes | str) -> tuple[list[Station], dict[str, RefillPoint]]:
    """Vietas un uzlades punkti; punkti atslegoti pec EVSE identifikatora."""
    root = ET.fromstring(xml)
    stations: list[Station] = []
    points: dict[str, RefillPoint] = {}
    skipped: set[str] = set()

    for site in root.iter(_q("energyInfrastructureSite", "egi")):
        site_id = site.get("id")
        if not site_id:
            continue

        operator = _text(site.find(".//" + _q("operator", "fac") + "//" + _q("value", "com")))
        network_id = OPERATOR_TO_NETWORK.get((operator or "").strip().lower())
        if network_id is None:
            if operator:
                skipped.add(operator)
            continue

        street = _text(site.find(".//" + _q("text", "locx")))
        city = _text(site.find(".//" + _q("city", "locx")))
        raw_name = _text(
            site.find(_q("name", "fac") + "/" + _q("values", "com") + "/" + _q("value", "com"))
        )
        name = raw_name if raw_name and not _looks_like_code(raw_name) else street

        latitude = _text(site.find(".//" + _q("latitude", "loc")))
        longitude = _text(site.find(".//" + _q("longitude", "loc")))

        stations.append(
            Station(
                id="nap-" + site_id,
                network_id=network_id,
                name=name,
                address=street,
                city=city,
                lat=float(latitude) if latitude else None,
                lon=float(longitude) if longitude else None,
            )
        )

        for point in site.iter(_q("refillPoint", "egi")):
            external_id = _text(point.find(_q("externalIdentifier", "fac")))
            if not external_id:
                continue

            raw_connector = _text(point.find(".//" + _q("connectorType", "egi"))) or ""
            connector = CONNECTOR_MAP.get(raw_connector.lower())
            mode = (_text(point.find(".//" + _q("chargingMode", "egi"))) or "").lower()
            current_type = CURRENT_BY_MODE.get(mode) or CURRENT_BY_CONNECTOR.get(
                connector or "", "AC"
            )

            watts = _text(point.find(".//" + _q("maxPowerAtSocket", "egi")))
            power_kw = None
            if watts:
                candidate = float(watts) / 1000
                if MIN_POWER_KW <= candidate <= MAX_POWER_KW:
                    power_kw = candidate
                else:
                    logger.warning("NAP: power out of range for %s: %s W", external_id, watts)

            points[external_id] = RefillPoint(
                external_id=external_id,
                site_id=site_id,
                connector=connector,
                current_type=current_type,
                power_kw=power_kw,
            )

    if skipped:
        logger.info("NAP: operators with no network of ours: %s", sorted(skipped))
    return stations, points


def parse_status(xml: bytes | str) -> dict[str, Rate]:
    """Cena katram uzlades punktam.

    Cena karajas pie stacijas, un punkti ir zem tas pasas stacijas, tapec
    saistibu nem no koka, nevis no identifikatoru salidzinasanas.
    """
    root = ET.fromstring(xml)
    rates: dict[str, Rate] = {}

    for station in root.iter(_q("energyInfrastructureStationStatus", "egi")):
        rate = _station_rate(station)
        if rate is None:
            continue
        for point in station.iter(_q("refillPointStatus", "egi")):
            reference = point.find(_q("reference", "fac"))
            point_id = reference.get("id") if reference is not None else None
            if point_id:
                rates[point_id] = rate

    return rates


def _station_rate(station: ET.Element) -> Rate | None:
    for line in station.iter(_q("rateLine", "fac")):
        # Sobrid plusma satur tikai "perUnit" (cena par kWh). Cita veida
        # rinda nozimetu citu merivienibu, tapec to izlaizam, nevis
        # pienemam, ka ari ta ir par kWh.
        if (_text(line.find(_q("rateLineType", "fac"))) or "") != "perUnit":
            continue
        raw_value = _text(line.find(_q("value", "fac")))
        if raw_value is None:
            continue
        try:
            value = float(raw_value)
        except ValueError:
            continue

        included = (_text(line.find(".//" + _q("taxIncluded", "fac"))) or "").lower() == "true"
        try:
            tax_rate = float(_text(line.find(".//" + _q("taxRate", "fac"))) or "0")
        except ValueError:
            tax_rate = 0.0
        if not included and tax_rate > 0:
            value *= 1 + tax_rate / 100

        milli = round(value * 1000)
        if not MIN_PRICE_MILLI <= milli <= MAX_PRICE_MILLI:
            logger.warning("NAP: price out of range: %s", raw_value)
            continue
        return Rate(energy_milli_per_kwh=milli)
    return None


def build(
    infrastructure_xml: bytes | str, status_xml: bytes | str
) -> tuple[list[Station], list[EvTariff]]:
    """Stacijas un tarifi, gatavi ingest partijai."""
    stations, points = parse_infrastructure(infrastructure_xml)
    rates = parse_status(status_xml)
    by_id = {station.id: station for station in stations}

    tariffs: list[EvTariff] = []
    for external_id, point in points.items():
        rate = rates.get(external_id)
        if rate is None:
            continue
        station = by_id.get("nap-" + point.site_id)
        if station is None:
            continue
        tariffs.append(
            EvTariff(
                network_id=station.network_id,
                station_id=station.id,
                current_type=point.current_type,
                payment="app",
                power_max_kw=point.power_kw,
                connector=point.connector,
                energy_milli_per_kwh=rate.energy_milli_per_kwh,
                vat_included=True,
            )
        )

    return stations, tariffs
