"""Parser for eleport-ev-web (docs/sources.yaml). Pure function: HTML in,
EvTariff records out -- no stations, this page gives network-wide LV
pricing structure, not station locations/coordinates.

Source: https://eleport.com/lv/uzlade/#pricing (confirmed 2026-09-19,
robots.txt fully open: "Allow: /"). An Elementor "nested tabs" widget holds
one tab per country (Latvia/Estonia/Lithuania/Poland/Croatia/Slovenia).
Each tab's price cards live inside a `<div id="e-n-tab-content-N">` that
the matching tab BUTTON links to via `aria-controls` -- parsed by matching
the Latvia button's `aria-controls` to its content div and slicing up to
the next tab-content id, NOT by text order or position: the raw HTML lists
all six countries' near-identical price blocks back to back, so parsing by
position risks silently reading a different country's price.

Two rate cards inside the LV tab: "AC" (up to 22kW) and "DC+" (up to
400kW). A separate "cenu izņēmumi" (price exceptions) table lists five
named Riga-area stations with a higher DC+ rate -- SKIPPED here: no
coordinates are given for them anywhere on this page, and inventing
placeholder coordinates would misrepresent real locations, so only the
two network-wide rates are captured. Connector standard (CCS2/CHAdeMO/
Type2) is left unset -- the page never names one anywhere, only power
tiers, so EvTariff.connector stays None rather than assuming the usual
EU convention without evidence from this specific source.

Payment: "adhoc", per this page's own text ("Autorizējieties ar sev
vēlamo metodi -- mobilo lietotni, RFID karti VAI maksājumu BEZ
REĢISTRĀCIJAS") -- it explicitly offers no-signup payment, unlike
e-mobi/Elektrum/Ignitis where app-based was the only option mentioned.
"""

from __future__ import annotations

import logging
import re

from collector.core.models import EvTariff

logger = logging.getLogger(__name__)

SOURCE_ID = "eleport-ev-web"
NETWORK_ID = "eleport"
URL = "https://eleport.com/lv/uzlade/"

PAYMENT = "adhoc"

_LATVIA_TAB_RE = re.compile(r"Latvija")
_ARIA_CONTROLS_RE = re.compile(r'aria-controls="([^"]+)"')
_RATE_RE = re.compile(
    r'<h2[^>]*>(AC|DC\+?)</h2>.*?<p>līdz\s*(\d+)\s*kW.*?</p>.*?elementor-widget-container">\s*([\d.]+)\s*€/kWh',
    re.S,
)

RATE_CURRENT_TYPE_MAP = {
    "AC": "AC",
    "DC+": "DC",
}


def _extract_latvia_block(html: str) -> str | None:
    tab_match = _LATVIA_TAB_RE.search(html)
    if not tab_match:
        return None
    btn_start = html.rfind("<button", 0, tab_match.start())
    if btn_start == -1:
        return None
    btn_tag_end = html.find(">", btn_start)
    controls_match = _ARIA_CONTROLS_RE.search(html[btn_start:btn_tag_end])
    if not controls_match:
        return None

    content_id = controls_match.group(1)
    content_start = html.find(f'id="{content_id}"')
    if content_start == -1:
        return None
    next_tab_start = html.find('id="e-n-tab-content-', content_start + len(content_id))
    if next_tab_start != -1:
        return html[content_start:next_tab_start]
    return html[content_start : content_start + 20000]


def parse(html: str) -> list[EvTariff]:
    block = _extract_latvia_block(html)
    if block is None:
        logger.warning("Eleport: could not isolate the Latvia pricing tab")
        return []

    tariffs: list[EvTariff] = []
    for rate_label, power_kw, price in _RATE_RE.findall(block):
        current_type = RATE_CURRENT_TYPE_MAP.get(rate_label)
        if current_type is None:
            logger.warning("Unknown Eleport rate label: %s", rate_label)
            continue

        tariffs.append(
            EvTariff(
                network_id=NETWORK_ID,
                station_id=None,
                current_type=current_type,
                payment=PAYMENT,
                power_max_kw=float(power_kw),
                connector=None,
                energy_milli_per_kwh=round(float(price) * 1000),
                vat_included=True,
            )
        )

    return tariffs
