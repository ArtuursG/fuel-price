"""Parser for virsi-fuel-web (docs/sources.yaml). Pure function: HTML in,
FuelPrice records out.

Page structure (confirmed 2026-09-19, see tests/fixtures/virsi-fuel-web/):
each product is a `<div class="price-card" data-type="dd|ad|95e|98e|lpg|cng|
adblue">` with `<p class="price"><span>LABEL</span><span>PRICE</span></p>` and
`<p class="address">WHERE</p>`. EV charging tariffs use the same price-card
markup with an extra "charging-card" class and data-type "ccs2"/"chademo" --
skipped here, handled by the EV collector (Phase 6). Price uses a PERIOD as
decimal separator, like Circle K.

IMPORTANT, differs from earlier research notes: scope is NOT uniformly
"network" for every product. DD/95E/98E showed one specific station address
("Brivibas gatve 297, Riga") in this snapshot, while AD/CNG/LPG/AdBlue showed
"Visa Virsu tikla" (network-wide). Scope is decided per product from the
address text, not assumed from the source as a whole.
"""

from __future__ import annotations

import logging
import re

from bs4 import BeautifulSoup

from collector.core.models import FuelPrice

logger = logging.getLogger(__name__)

SOURCE_ID = "virsi-fuel-web"
NETWORK_ID = "virsi"

PRODUCT_MAP = {
    "95e": "P95",
    "98e": "P98",
    "dd": "DSL",
    "ad": "DSL_AGRO",
    "lpg": "LPG",
    "cng": "CNG",
    "adblue": "ADBLUE",
}

_NETWORK_WIDE_TEXT = "Visā Viršu tīklā"
_PRICE_RE = re.compile(r"([\d.]+)")


def _parse_price_milli(text: str) -> int:
    match = _PRICE_RE.search(text)
    if not match:
        raise ValueError(f"Could not parse price from: {text!r}")
    return round(float(match.group(1)) * 1000)


def _scope_for(where_text: str) -> str:
    if where_text == _NETWORK_WIDE_TEXT:
        return "network"
    return "cheapest_riga" if "Rīga" in where_text else "cheapest"


def parse(html: str) -> list[FuelPrice]:
    soup = BeautifulSoup(html, "html.parser")
    prices: list[FuelPrice] = []

    for card in soup.find_all("div", class_="price-card"):
        if "charging-card" in card.get("class", []):
            continue

        data_type = card.get("data-type")
        product = PRODUCT_MAP.get(data_type or "")
        if product is None:
            logger.warning("Unknown Virši product data-type: %s", data_type)
            continue

        spans = card.select("p.price span")
        if len(spans) < 2:
            continue

        address_el = card.select_one("p.address")
        where_text = address_el.get_text(strip=True) if address_el else ""
        scope = _scope_for(where_text)

        prices.append(
            FuelPrice(
                network_id=NETWORK_ID,
                scope=scope,
                product=product,
                price_milli=_parse_price_milli(spans[1].get_text(strip=True)),
                where_text=None if scope == "network" else (where_text or None),
                valid_from=None,
            )
        )

    return prices
