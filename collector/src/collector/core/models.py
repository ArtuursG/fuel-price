"""Pydantic models shared by every source parser and the ingest CLI.

Field names mirror the D1 schema (docs/IZPETE.md 7.4) and the ingest contract
(docs/IZPETE.md 7.5), so a source module's output can be JSON-dumped directly
into an ingest batch.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Scope = Literal["network", "station", "cheapest_riga", "cheapest"]
CurrentType = Literal["AC", "DC"]
Payment = Literal["adhoc", "app", "subscription"]
RunStatus = Literal["ok", "not_modified", "partial", "error", "blocked", "unpublished"]


class FuelPrice(BaseModel):
    network_id: str
    scope: Scope
    product: str
    price_milli: int = Field(gt=0)
    station_id: str | None = None
    where_text: str | None = None
    valid_from: str | None = None


class EvTariff(BaseModel):
    network_id: str
    station_id: str | None = None
    current_type: CurrentType
    payment: Payment
    power_min_kw: float | None = None
    power_max_kw: float | None = None
    connector: str | None = None
    energy_milli_per_kwh: int | None = None
    time_milli_per_min: int | None = None
    session_fee_milli: int | None = None
    min_fee_milli: int | None = None
    idle_fee_milli_per_min: int | None = None
    idle_after_min: int | None = None
    time_from: str | None = None
    time_to: str | None = None
    weekdays: str | None = None
    vat_included: bool = True


class RunReport(BaseModel):
    source_id: str
    started_at: datetime
    status: RunStatus
    finished_at: datetime | None = None
    http_status: int | None = None
    items: int = 0
    content_sha256: str | None = None
    parser_version: str | None = None
    error: str | None = None


class IngestBatch(BaseModel):
    run: RunReport
    fuel: list[FuelPrice] = Field(default_factory=list)
    ev: list[EvTariff] = Field(default_factory=list)
