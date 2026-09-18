"""Parser for straujupite-fuel-web (docs/sources.yaml). Pure function: HTML
in, FuelPrice records out.

Page structure (confirmed 2026-09-18, see tests/fixtures/straujupite-fuel-web/):
a single <script type="application/ld+json"> ItemList/Offer block, still
live (not removed, as we'd feared). Each ListItem.item is a Product with
offers.price (string, period decimal) and offers.areaServed (where_text).
JSON-LD is checked first, per project convention; HTML fallback is not
implemented since JSON-LD has been reliable so far -- add one if it ever
disappears.
"""

from __future__ import annotations

import json
import logging
import re

from collector.core.models import FuelPrice

logger = logging.getLogger(__name__)

SOURCE_ID = "straujupite-fuel-web"
NETWORK_ID = "straujupite"

PRODUCT_MAP = {
    "Benzīns 95": "P95",
    "Petrol 95": "P95",
    "Dīzeļdegviela": "DSL",
    "Diesel": "DSL",
}

_JSONLD_RE = re.compile(r'<script type="application/ld\+json">(.*?)</script>', re.S)


def _parse_price_milli(price: str) -> int:
    return round(float(price) * 1000)


def parse(html: str) -> list[FuelPrice]:
    prices: list[FuelPrice] = []

    for block in _JSONLD_RE.findall(html):
        try:
            data = json.loads(block)
        except json.JSONDecodeError:
            continue
        if data.get("@type") != "ItemList":
            continue

        for list_item in data.get("itemListElement", []):
            item = list_item.get("item", {})
            product_name = item.get("name")
            offer = item.get("offers", {})
            price_str = offer.get("price")
            if not product_name or not price_str:
                continue

            product = PRODUCT_MAP.get(product_name)
            if product is None:
                logger.warning("Unknown Straujupīte product name: %s", product_name)
                continue

            prices.append(
                FuelPrice(
                    network_id=NETWORK_ID,
                    scope="cheapest",
                    product=product,
                    price_milli=_parse_price_milli(price_str),
                    where_text=offer.get("areaServed"),
                    valid_from=None,
                )
            )

    return prices
