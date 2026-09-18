"""Source registry, keyed by the same id used in docs/sources.yaml.
Populated by importing collector.sources.fuel (see its __init__.py).
"""

from __future__ import annotations

from collector.core.runner import FuelSource

_SOURCES: dict[str, FuelSource] = {}


def register(source: FuelSource) -> None:
    _SOURCES[source.source_id] = source


def list_sources() -> list[str]:
    return sorted(_SOURCES)


def get_source(source_id: str | None) -> FuelSource | None:
    if source_id is None:
        return None
    return _SOURCES.get(source_id)
