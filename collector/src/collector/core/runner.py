"""Generic single-source execution: robots.txt check, fetch, parse, range
validation. Shared by every fuel source so `run`/`check`/`snapshot` don't
each reimplement this. Jump detection is NOT here -- that needs the last
known price, which only the ingest Worker (with D1 access) has (ADR-006).
"""

from __future__ import annotations

import hashlib
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

import httpx

from collector.core import http, robots
from collector.core.models import FuelPrice, RunReport
from collector.core.validation import in_range, validate_product

logger = logging.getLogger(__name__)


@dataclass
class FuelSource:
    source_id: str
    network_id: str
    url: str
    parser: Callable[[str], list[FuelPrice]]
    parser_version: str
    # Dažam avotam cenas nav pašā lapā, bet gan otrā dokumentā, uz kuru lapa
    # norāda (piem. KOOL Readymag "HtmlSnippet"). Šī funkcija no pirmās lapas
    # atgriež otro URL; robots.txt tiek pārbaudīts arī tam. Parsētājs paliek
    # tīra funkcija -- tīklošana notiek šeit, ne avota modulī.
    follow: Callable[[str], str | None] | None = None


def _now() -> datetime:
    return datetime.now(UTC)


def run_fuel_source(
    source: FuelSource, client: httpx.Client | None = None
) -> tuple[RunReport, list[FuelPrice]]:
    started_at = _now()
    own_client = client is None
    client = client or http.make_client()
    try:
        if not robots.check_allowed(source.url, http.DEFAULT_USER_AGENT, client):
            return (
                RunReport(
                    source_id=source.source_id,
                    started_at=started_at,
                    finished_at=_now(),
                    status="blocked",
                    error="robots.txt disallows this path",
                ),
                [],
            )

        response = http.get_with_retries(client, source.url)
        if response.status_code == 304:
            return (
                RunReport(
                    source_id=source.source_id,
                    started_at=started_at,
                    finished_at=_now(),
                    status="not_modified",
                    http_status=304,
                ),
                [],
            )
        if response.status_code >= 400:
            return (
                RunReport(
                    source_id=source.source_id,
                    started_at=started_at,
                    finished_at=_now(),
                    status="error",
                    http_status=response.status_code,
                    error=f"HTTP {response.status_code}",
                ),
                [],
            )

        if source.follow is not None:
            followed_url = source.follow(response.text)
            if followed_url is None:
                return (
                    RunReport(
                        source_id=source.source_id,
                        started_at=started_at,
                        finished_at=_now(),
                        status="partial",
                        http_status=response.status_code,
                        error="could not locate the linked content document",
                    ),
                    [],
                )
            if not robots.check_allowed(followed_url, http.DEFAULT_USER_AGENT, client):
                return (
                    RunReport(
                        source_id=source.source_id,
                        started_at=started_at,
                        finished_at=_now(),
                        status="blocked",
                        error="robots.txt disallows the linked content document",
                    ),
                    [],
                )
            response = http.get_with_retries(client, followed_url)
            if response.status_code >= 400:
                return (
                    RunReport(
                        source_id=source.source_id,
                        started_at=started_at,
                        finished_at=_now(),
                        status="error",
                        http_status=response.status_code,
                        error=f"HTTP {response.status_code} for the linked content document",
                    ),
                    [],
                )

        content_sha256 = hashlib.sha256(response.content).hexdigest()
        raw_prices = source.parser(response.text)

        valid_prices: list[FuelPrice] = []
        for price in raw_prices:
            validate_product(price.product)
            if not in_range(price.product, price.price_milli):
                logger.warning(
                    "%s: %s price %d milli out of range, dropping",
                    source.source_id,
                    price.product,
                    price.price_milli,
                )
                continue
            valid_prices.append(price)

        status = "ok" if valid_prices else "partial"
        report = RunReport(
            source_id=source.source_id,
            started_at=started_at,
            finished_at=_now(),
            status=status,
            http_status=response.status_code,
            items=len(valid_prices),
            content_sha256=content_sha256,
            parser_version=source.parser_version,
        )
        return report, valid_prices
    finally:
        if own_client:
            client.close()


def check_fuel_source(source: FuelSource, client: httpx.Client | None = None) -> RunReport:
    started_at = _now()
    own_client = client is None
    client = client or http.make_client()
    try:
        if not robots.check_allowed(source.url, http.DEFAULT_USER_AGENT, client):
            return RunReport(
                source_id=source.source_id,
                started_at=started_at,
                finished_at=_now(),
                status="blocked",
                error="robots.txt disallows this path",
            )
        response = client.get(source.url)
        status = "ok" if response.status_code < 400 else "error"
        return RunReport(
            source_id=source.source_id,
            started_at=started_at,
            finished_at=_now(),
            status=status,
            http_status=response.status_code,
        )
    finally:
        if own_client:
            client.close()


def snapshot_fuel_source(
    source: FuelSource, fixtures_dir: Path, client: httpx.Client | None = None
) -> Path:
    own_client = client is None
    client = client or http.make_client()
    try:
        response = http.get_with_retries(client, source.url)
        response.raise_for_status()
        out_dir = fixtures_dir / source.source_id
        out_dir.mkdir(parents=True, exist_ok=True)
        path = out_dir / f"{_now().date().isoformat()}.html"
        path.write_bytes(response.content)
        return path
    finally:
        if own_client:
            client.close()
