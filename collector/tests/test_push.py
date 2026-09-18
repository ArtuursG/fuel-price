import hashlib
import hmac
from datetime import UTC, datetime

import httpx
import pytest

from collector.core.models import FuelPrice, IngestBatch, RunReport
from collector.core.push import PushConfigError, push_batch


def _make_batch() -> IngestBatch:
    return IngestBatch(
        run=RunReport(source_id="example-fuel-web", started_at=datetime.now(UTC), status="ok"),
        fuel=[FuelPrice(network_id="example", scope="cheapest", product="P95", price_milli=1900)],
    )


def test_push_batch_raises_without_config(monkeypatch):
    monkeypatch.delenv("INGEST_URL", raising=False)
    monkeypatch.delenv("INGEST_SECRET", raising=False)
    with pytest.raises(PushConfigError):
        push_batch(_make_batch())


def test_push_batch_sends_correctly_signed_request(monkeypatch):
    monkeypatch.setenv("INGEST_URL", "https://example.lv/ingest")
    monkeypatch.setenv("INGEST_SECRET", "test-secret")

    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["headers"] = request.headers
        captured["body"] = request.content
        return httpx.Response(200, json={"ok": True})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    response = push_batch(_make_batch(), client=client)

    assert response.status_code == 200
    timestamp = captured["headers"]["x-cenas-timestamp"]
    signature = captured["headers"]["x-cenas-signature"]
    body = captured["body"].decode()

    expected = (
        "sha256="
        + hmac.new(b"test-secret", f"{timestamp}.{body}".encode(), hashlib.sha256).hexdigest()
    )
    assert signature == expected


def test_push_batch_propagates_error_status(monkeypatch):
    monkeypatch.setenv("INGEST_URL", "https://example.lv/ingest")
    monkeypatch.setenv("INGEST_SECRET", "test-secret")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "x"})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    response = push_batch(_make_batch(), client=client)

    assert response.status_code == 401
