"""Source registry. Empty in Phase 1 -- Phase 2 registers real source
modules here (circlek-fuel-web, straujupite-fuel-web, ...), keyed by the
same id used in docs/sources.yaml.
"""

from __future__ import annotations

from typing import Protocol


class Source(Protocol):
    source_id: str

    def run(self) -> object: ...  # Phase 2 will replace `object` with IngestBatch


_SOURCES: dict[str, Source] = {}


def register(source: Source) -> None:
    _SOURCES[source.source_id] = source


def list_sources() -> list[str]:
    return sorted(_SOURCES)


def get_source(source_id: str | None) -> Source | None:
    if source_id is None:
        return None
    return _SOURCES.get(source_id)
