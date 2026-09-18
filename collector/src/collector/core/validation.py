"""Price validation: known product codes, allowed ranges, jump detection.

Ranges and the jump threshold come from docs/IZPETE.md 8.1. The jump policy
itself (publish immediately with a flag, checked AFTER range validation) is
ADR-006 in docs/DECISIONS.md.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

KNOWN_PRODUCTS = {
    "P95",
    "P98",
    "DSL",
    "DSL_PLUS",
    "DSL_AGRO",
    "LPG",
    "CNG",
    "HVO",
    "ADBLUE",
    "E85",
}

# NOT road-legal for passenger cars -- must never be shown without a clear
# disclaimer if it ever ends up in a UI list next to P95/P98/DSL.
NOT_ROAD_LEGAL = {"DSL_AGRO"}

# (min, max) price_milli per product, i.e. milli-EUR per litre (or per kg for CNG).
PRICE_RANGE_MILLI: dict[str, tuple[int, int]] = {
    "P95": (800, 3500),
    "P98": (800, 3500),
    "DSL": (800, 3500),
    "DSL_PLUS": (800, 3500),
    "DSL_AGRO": (300, 3500),
    "LPG": (300, 2000),
    "CNG": (300, 2500),
    "HVO": (800, 3500),
    "E85": (500, 3000),
    "ADBLUE": (300, 3000),
}

EV_ENERGY_RANGE_MILLI: tuple[int, int] = (50, 1500)  # milli-EUR per kWh

JUMP_THRESHOLD_PCT = 8.0


def validate_product(product: str) -> None:
    if product not in KNOWN_PRODUCTS:
        logger.warning("Unknown product code: %s", product)


def in_range(product: str, price_milli: int) -> bool:
    lo, hi = PRICE_RANGE_MILLI.get(product, (1, 10**9))
    return lo <= price_milli <= hi


def ev_energy_in_range(energy_milli_per_kwh: int) -> bool:
    lo, hi = EV_ENERGY_RANGE_MILLI
    return lo <= energy_milli_per_kwh <= hi


def is_jump(previous_milli: int, new_milli: int, threshold_pct: float = JUMP_THRESHOLD_PCT) -> bool:
    if previous_milli <= 0:
        return False
    change_pct = abs(new_milli - previous_milli) / previous_milli * 100
    return change_pct >= threshold_pct
