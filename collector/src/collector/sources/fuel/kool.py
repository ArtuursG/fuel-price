"""Parser for kool-fuel-web (docs/sources.yaml). Pure functions: HTML in,
records out -- the two fetches it needs are done by the runner, not here.

Source structure (confirmed 2026-09-20; robots.txt has no Disallow rules):
https://www.kool.lv/degviela/ is a Readymag-built page whose server HTML
contains NO prices at all (zero occurrences of "EUR" or a euro sign). The
0. fāze note "nezinām, vai KOOL vispār publicē cenas" was right about the
shell but wrong about the conclusion: the prices DO exist, in a separate
Readymag "HtmlSnippet" document that the page's viewer fetches at runtime.
That snippet's URL is present in the served HTML, so no browser or JS
execution is needed -- fetch the page, pick the snippet, fetch it.

Picking the RIGHT snippet matters: the page lists a snippet for every page
of the site (vacancies, contacts, coffee subscription ...). Each URL is
preceded by its own `"pagePath":"<name>"`, so the fuel one is selected by
that key rather than by position or by fetching all nine and guessing.

Inside the snippet, every label and price is an absolutely positioned
widget (`<div class="rmwidget widget-text-v3" style="left:Npx; top:Npx">`).
Document order does NOT follow visual order, so a product is matched to
its price by sharing a `left` column, not by reading order -- parsing in
order pairs the wrong price with the wrong fuel, which is exactly the
mistake this file exists to avoid.

A price widget can hold more than one paragraph: at the time of writing
the DD cell contains "2.117" followed by an orphan "7" on a second line
that the widget's fixed 44px height clips out of sight. Only the first
paragraph is read.

The page mixes decimal separators between cells on the same row ("1,947"
next to "2.017"), so both are accepted.

Scope is "cheapest": the page itself says "Zemākās cenas DUS tīklā" and
warns the price "var mainīties vairākkārtīgi dienas laikā un atšķirties
dažādās stacijās", so this is a network-wide low, not a station price.
"""

from __future__ import annotations

import html
import logging
import re

from collector.core.models import FuelPrice

logger = logging.getLogger(__name__)

SOURCE_ID = "kool-fuel-web"
NETWORK_ID = "kool"
URL = "https://www.kool.lv/degviela/"

# Produktu apzīmējumi lapā; "*" un "**" ir atsauču zīmes uz staciju sarakstu,
# nevis daļa no nosaukuma.
PRODUCT_MAP = {
    "95E": "P95",
    "98": "P98",
    "DD": "DSL",
    "KOOL PREMIUM DIESEL": "DSL_PLUS",
}

# Cena tiek pieņemta tikai šajā diapazonā -- pasargā no tā, ka izkārtojuma
# maiņa klusi ievelk kādu citu skaitli (gadu, telefona daļu) kā cenu.
MIN_PRICE_MILLI = 500
MAX_PRICE_MILLI = 4000

_SNIPPET_RE = re.compile(
    r'"pagePath":"degviela".*?"htmlUrl":"(https://[^"]+?\.html)"',
    re.S,
)
_WIDGET_RE = re.compile(
    r'<div class="rmwidget widget-text-v3"[^>]*'
    r'style="left:\s*(-?[\d.]+)px;\s*top:\s*(-?[\d.]+)px;[^"]*"[^>]*>'
    r"(.*?)</div></div></div>",
    re.S,
)
_PARAGRAPH_RE = re.compile(r"<p[^>]*>(.*?)</p>", re.S)
_TAG_RE = re.compile(r"<[^>]+>")
_PRICE_RE = re.compile(r"^(\d+)[.,](\d{1,3})$")


def find_snippet_url(page_html: str) -> str | None:
    """Locate the fuel page's own Readymag content snippet."""
    unescaped = html.unescape(page_html)
    match = _SNIPPET_RE.search(unescaped)
    if not match:
        logger.warning("KOOL: could not find the degviela snippet URL on the page")
        return None
    return match.group(1)


def _widget_text(fragment: str) -> str:
    """First paragraph only -- later ones are clipped editing leftovers."""
    paragraphs = _PARAGRAPH_RE.findall(fragment)
    source = paragraphs[0] if paragraphs else fragment
    text = html.unescape(_TAG_RE.sub(" ", source)).replace("‍", " ")
    return " ".join(text.split())


def _normalize_label(text: str) -> str:
    return text.replace("*", "").strip().upper()


def _parse_price_milli(text: str) -> int | None:
    match = _PRICE_RE.match(text.replace(" ", ""))
    if not match:
        return None
    whole, fraction = match.groups()
    return round(float(f"{whole}.{fraction}") * 1000)


def parse(snippet_html: str) -> list[FuelPrice]:
    labels: dict[float, str] = {}
    prices: dict[float, int] = {}

    for left_raw, _top_raw, fragment in _WIDGET_RE.findall(snippet_html):
        text = _widget_text(fragment)
        if not text:
            continue
        left = round(float(left_raw) / 10) * 10  # kolonnas sakrīt ~1-2px robežās

        price_milli = _parse_price_milli(text)
        if price_milli is not None:
            if MIN_PRICE_MILLI <= price_milli <= MAX_PRICE_MILLI:
                prices[left] = price_milli
            else:
                logger.warning("KOOL: price %s milli out of range, ignoring", price_milli)
            continue

        product = PRODUCT_MAP.get(_normalize_label(text))
        if product is not None:
            labels[left] = product

    results: list[FuelPrice] = []
    for left, product in sorted(labels.items()):
        price_milli = prices.get(left)
        if price_milli is None:
            logger.warning("KOOL: no price found in column %s for %s", left, product)
            continue
        results.append(
            FuelPrice(
                network_id=NETWORK_ID,
                scope="cheapest",
                product=product,
                price_milli=price_milli,
                where_text=None,
                valid_from=None,
            )
        )
    return results
