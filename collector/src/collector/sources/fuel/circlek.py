"""Parser for circlek-fuel-web (docs/sources.yaml). Pure function: HTML in,
FuelPrice records out -- no network calls here, see core/http.py for fetching.

Page structure (confirmed 2026-09-18, see tests/fixtures/circlek-fuel-web/):
a single Excel-pasted <table> with a "Degviela" header row, then one row per
product: <td>product name</td><td>"X.XXX EUR"</td><td>comma-separated
addresses</td>. Price uses a PERIOD as the decimal separator, not a comma.
Every row lists specific station addresses -- none of them say "visā tīklā",
so scope is always cheapest_riga for this source (not network-wide).
"""

from __future__ import annotations

import logging
import re
from datetime import date

from bs4 import BeautifulSoup

from collector.core.models import FuelPrice

logger = logging.getLogger(__name__)

SOURCE_ID = "circlek-fuel-web"
NETWORK_ID = "circlek"

PRODUCT_MAP = {
    "95miles": "P95",
    "98miles+": "P98",
    "Dmiles": "DSL",
    "Dmiles+": "DSL_PLUS",
    "miles+ XTL": "HVO",
    "Autogāze": "LPG",
}

_VALID_FROM_RE = re.compile(r"Cenas spēkā no (\d{2})\.(\d{2})\.(\d{4})")
_PRICE_RE = re.compile(r"([\d.]+)\s*EUR")


def _clean_text(text: str) -> str:
    return " ".join(text.replace("\xa0", " ").split())


def _parse_price_milli(text: str) -> int:
    match = _PRICE_RE.search(text)
    if not match:
        raise ValueError(f"Could not parse price from: {text!r}")
    return round(float(match.group(1)) * 1000)


def extract_valid_from(html: str) -> str | None:
    match = _VALID_FROM_RE.search(html)
    if not match:
        return None
    day, month, year = match.groups()
    return date(int(year), int(month), int(day)).isoformat()


def parse(html: str) -> list[FuelPrice]:
    soup = BeautifulSoup(html, "html.parser")
    valid_from = extract_valid_from(html)
    prices: list[FuelPrice] = []

    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if not rows or "Degviela" not in _clean_text(rows[0].get_text(" ")):
            continue

        for row in rows[1:]:
            cells = row.find_all("td")
            if len(cells) < 3:
                continue
            product_name = _clean_text(cells[0].get_text(" "))
            price_text = _clean_text(cells[1].get_text(" "))
            where_text = _clean_text(cells[2].get_text(" "))
            if not product_name or not price_text:
                continue

            product = PRODUCT_MAP.get(product_name)
            if product is None:
                logger.warning("Unknown Circle K product name: %s", product_name)
                continue

            prices.append(
                FuelPrice(
                    network_id=NETWORK_ID,
                    scope="cheapest_riga",
                    product=product,
                    price_milli=_parse_price_milli(price_text),
                    where_text=where_text or None,
                    valid_from=valid_from,
                )
            )
        break  # only one price table expected on this page

    return prices
