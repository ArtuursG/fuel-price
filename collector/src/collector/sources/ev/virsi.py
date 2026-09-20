"""Parser for virsi-ev-web (docs/sources.yaml). Pure function: HTML in,
EvTariff records out.

Source: https://www.virsi.lv/lv/privatpersonam/degviela/degvielas-un-
elektrouzlades-cenas (robots.txt open; confirmed 2026-09-20). This is the
SAME page the fuel collector already reads, so no extra request is made to
Virsi for EV tariffs -- the runner passes the fetched HTML to both parsers.

Layout: `<div class="price-card charging-card" data-type="ccs2|chademo">`
holding two spans, the first naming connector and power, the second the
price. `data-type` gives the connector directly, so it is read from the
attribute rather than guessed from the label text.

Power is a range for the larger chargers ("160 - 200 kW"), and the price
applies across that whole band, so both ends are recorded: power_min_kw
and power_max_kw. A single value sets both to the same number, which keeps
"is this tariff valid for my charger" a plain range test everywhere.

Scope is the whole network -- the page says "Visa Virsu tikla" -- so no
station_id is attached.

NOTE: these tariffs match circlek-ev's published table exactly (same five
power tiers, same prices). Circle K is a host site, not a price source
(that source is disabled), so this is not a duplicate feed, but it is a
useful cross-check if the two ever diverge.
"""

from __future__ import annotations

import logging
import re

from collector.core.models import EvTariff

logger = logging.getLogger(__name__)

SOURCE_ID = "virsi-ev-web"
NETWORK_ID = "virsi"
URL = "https://www.virsi.lv/lv/privatpersonam/degviela/degvielas-un-elektrouzlades-cenas"

# Uzlades maksa ir tikai par energiju; laika tarifu lapa nenosauc.
PAYMENT = "app"

CONNECTOR_MAP = {
    "ccs2": "CCS2",
    "chademo": "CHADEMO",
    "type2": "TYPE2",
}

# CCS2 un CHAdeMO ir lidzstravas standarti; Type 2 ir mainstravas.
CURRENT_TYPE_MAP = {
    "CCS2": "DC",
    "CHADEMO": "DC",
    "TYPE2": "AC",
}

# Sanigas robezas: zem 3 kW nav uzlades stacija, virs 400 kW LV nav.
MIN_POWER_KW = 3.0
MAX_POWER_KW = 400.0
# Cena EUR/kWh; ari straujakas stacijas LV nepartrauc so joslu.
MIN_PRICE_MILLI = 50
MAX_PRICE_MILLI = 1500

_CARD_RE = re.compile(
    r'<div class="price-card charging-card"[^>]*data-type="([^"]+)"(.*?)</div>\s*</div>',
    re.S,
)
_SPAN_RE = re.compile(r"<span[^>]*>(.*?)</span>", re.S)
_TAG_RE = re.compile(r"<[^>]+>")
_POWER_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:-\s*(\d+(?:[.,]\d+)?)\s*)?kW", re.I)
_PRICE_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*EUR\s*/\s*kWh", re.I)


def _text(value: str) -> str:
    return re.sub(r"\s+", " ", _TAG_RE.sub("", value)).strip()


def _number(value: str) -> float:
    return float(value.replace(",", "."))


def parse(html: str) -> list[EvTariff]:
    tariffs: list[EvTariff] = []

    for raw_type, body in _CARD_RE.findall(html):
        connector = CONNECTOR_MAP.get(raw_type.strip().lower())
        if connector is None:
            logger.warning("Virsi EV: unknown data-type %r", raw_type)
            continue

        spans = [_text(span) for span in _SPAN_RE.findall(body)]
        joined = " ".join(span for span in spans if span)

        power_match = _POWER_RE.search(joined)
        price_match = _PRICE_RE.search(joined)
        if power_match is None or price_match is None:
            logger.warning("Virsi EV: card without power or price: %r", joined)
            continue

        power_min = _number(power_match.group(1))
        power_max = _number(power_match.group(2)) if power_match.group(2) else power_min
        if not MIN_POWER_KW <= power_min <= power_max <= MAX_POWER_KW:
            logger.warning("Virsi EV: power out of range: %r", joined)
            continue

        energy_milli = round(_number(price_match.group(1)) * 1000)
        if not MIN_PRICE_MILLI <= energy_milli <= MAX_PRICE_MILLI:
            logger.warning("Virsi EV: price out of range: %r", joined)
            continue

        tariffs.append(
            EvTariff(
                network_id=NETWORK_ID,
                station_id=None,
                current_type=CURRENT_TYPE_MAP[connector],
                payment=PAYMENT,
                power_min_kw=power_min,
                power_max_kw=power_max,
                connector=connector,
                energy_milli_per_kwh=energy_milli,
                vat_included=True,
            )
        )

    if not tariffs:
        logger.warning("Virsi EV: no charging cards found")
    return tariffs
