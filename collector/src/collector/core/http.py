"""Shared HTTP client: fixed timeout, capped retries with backoff, a
descriptive User-Agent, and conditional-request helpers (ETag / Last-Modified).

Projekta konvencija: taimauts ~20s, ne vairāk kā 2 atkārtojumi ar pieaugošu pauzi.
"""

from __future__ import annotations

import time

import httpx

# TODO(pirms publicēšanas): nomainīt uz reālu domēnu un kontaktu, kad tas ir izvēlēts
# (pagaidām letadegviela.lv ir tikai darba placeholderis, sk. docs/IZPETE.md 11).
DEFAULT_USER_AGENT = "fuel-price-lv/0.1 (+https://letadegviela.lv; contact: TODO)"
DEFAULT_TIMEOUT = 20.0
MAX_RETRIES = 2


def make_client(user_agent: str = DEFAULT_USER_AGENT) -> httpx.Client:
    return httpx.Client(
        headers={"User-Agent": user_agent},
        timeout=DEFAULT_TIMEOUT,
        follow_redirects=True,
    )


def get_with_retries(
    client: httpx.Client,
    url: str,
    *,
    etag: str | None = None,
    last_modified: str | None = None,
) -> httpx.Response:
    """GET with conditional headers and capped retries with backoff.

    Retries only on transport errors (timeouts, connection failures) -- an
    HTTP error status is returned as-is for the caller to inspect.
    """
    headers: dict[str, str] = {}
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified

    last_exc: httpx.TransportError | None = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            return client.get(url, headers=headers)
        except httpx.TransportError as exc:
            last_exc = exc
            if attempt < MAX_RETRIES:
                time.sleep(2**attempt)  # 1s, 2s
    assert last_exc is not None
    raise last_exc
