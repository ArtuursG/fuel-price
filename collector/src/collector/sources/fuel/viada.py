"""Parser for viada-fuel-web (docs/sources.yaml). Pure function: HTML in,
FuelPrice records out.

Page structure (confirmed 2026-09-19, see tests/fixtures/viada-fuel-web/):
a single price table, one row per product: <td><img src=".../FILENAME.png">
</td><td>"X.XXX EUR"</td><td>comma-separated station names + addresses</td>.
Product type has no alt text or visible label anywhere on the page --
identified purely by image filename (see PRODUCT_MAP). Price uses a PERIOD
as decimal separator. The "Cenas spēkā no" date is split across two adjacent
<strong> tags ("18.09" + ".2026.") that only read correctly when
concatenated with no separator.

"petrol_95ectoplus_new.png" is deliberately left OUT of PRODUCT_MAP: earlier
research guessed it also means P98, but the live page shows it priced
differently from "petrol_98_new.png" in the same snapshot (confirmed
2026-09-19, no legend/alt text anywhere to verify either guess). Our storage
model keys the latest price by (network_id, scope, product) -- two distinct
real prices sharing one product code would collide and flip unpredictably
between runs. Skipping it (logged as unknown, like any unrecognised product)
is safer than guessing wrong; revisit if Viada ever adds a legend.
"""

from __future__ import annotations

import logging
import re

from bs4 import BeautifulSoup

from collector.core.models import FuelPrice

logger = logging.getLogger(__name__)

SOURCE_ID = "viada-fuel-web"
NETWORK_ID = "viada"

PRODUCT_MAP = {
    "petrol_95ecto_new.png": "P95",
    "petrol_98_new.png": "P98",
    "petrol_d_new.png": "DSL",
    "petrol_d_ecto_new.png": "DSL_PLUS",
    "GAZE.png": "LPG",
    "petrol_e85_new.png": "E85",
}

_PRICE_RE = re.compile(r"([\d.]+)\s*EUR")
_VALID_FROM_RE = re.compile(r"Cenas sp[ēe]k[āa] no (\d{2})\.(\d{2})\.(\d{4})")


def _clean_text(text: str) -> str:
    return " ".join(text.replace("\xa0", " ").split())


def _parse_price_milli(text: str) -> int:
    match = _PRICE_RE.search(text)
    if not match:
        raise ValueError(f"Could not parse price from: {text!r}")
    return round(float(match.group(1)) * 1000)


def extract_valid_from(soup: BeautifulSoup) -> str | None:
    for p in soup.find_all("p"):
        match = _VALID_FROM_RE.search(p.get_text())
        if match:
            day, month, year = match.groups()
            return f"{year}-{month}-{day}"
    return None


def parse(html: str) -> list[FuelPrice]:
    soup = BeautifulSoup(html, "html.parser")
    valid_from = extract_valid_from(soup)
    prices: list[FuelPrice] = []

    for row in soup.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) < 3:
            continue
        img = cells[0].find("img")
        if img is None or not img.get("src"):
            continue

        filename = img["src"].rsplit("/", 1)[-1]
        product = PRODUCT_MAP.get(filename)
        if product is None:
            logger.warning("Unknown Viada product image: %s", filename)
            continue

        price_text = _clean_text(cells[1].get_text(" "))
        where_text = _clean_text(cells[2].get_text(" "))

        prices.append(
            FuelPrice(
                network_id=NETWORK_ID,
                scope="cheapest",
                product=product,
                price_milli=_parse_price_milli(price_text),
                where_text=where_text or None,
                valid_from=valid_from,
            )
        )

    return prices
