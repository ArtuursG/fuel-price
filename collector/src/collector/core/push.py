"""Sends an IngestBatch to the ingest Worker with an HMAC signature.
Wire contract: docs/IZPETE.md 7.5 (kept locally, not pushed to the repo).

Signing: HMAC-SHA256 over `f"{timestamp}.{body}"`, hex-encoded, "sha256="
prefixed -- must byte-for-byte match apps/ingest/src/ingest-logic.ts.
"""

from __future__ import annotations

import hashlib
import hmac
import os

import httpx

from collector.core.env import load_dev_vars
from collector.core.models import IngestBatch
from collector.core.time import utcnow_iso


class PushConfigError(RuntimeError):
    pass


def _sign(secret: str, timestamp: str, body: str) -> str:
    digest = hmac.new(secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def push_batch(batch: IngestBatch, client: httpx.Client | None = None) -> httpx.Response:
    load_dev_vars()
    ingest_url = os.environ.get("INGEST_URL")
    ingest_secret = os.environ.get("INGEST_SECRET")
    if not ingest_url or not ingest_secret:
        raise PushConfigError("INGEST_URL un INGEST_SECRET jāiestata (.dev.vars vai secrets)")

    body = batch.model_dump_json()
    timestamp = utcnow_iso()
    signature = _sign(ingest_secret, timestamp, body)

    own_client = client is None
    client = client or httpx.Client(timeout=20.0)
    try:
        return client.post(
            ingest_url,
            content=body,
            headers={
                "Content-Type": "application/json",
                "X-Cenas-Timestamp": timestamp,
                "X-Cenas-Signature": signature,
            },
        )
    finally:
        if own_client:
            client.close()
