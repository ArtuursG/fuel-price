"""Importing this package registers every fuel source. `cli.py` imports it
for the side effect; individual parser modules stay import-free of the
registry so they're testable in isolation (see tests/test_sources_*.py).
"""

from collector.core.registry import register
from collector.core.runner import FuelSource
from collector.sources.fuel import circlek, straujupite

register(
    FuelSource(
        source_id=circlek.SOURCE_ID,
        network_id=circlek.NETWORK_ID,
        url="https://www.circlek.lv/degviela-miles/degvielas-cenas",
        parser=circlek.parse,
        parser_version="circlek@1",
    )
)

register(
    FuelSource(
        source_id=straujupite.SOURCE_ID,
        network_id=straujupite.NETWORK_ID,
        url="https://straujupite.lv/degvielas-cenas/",
        parser=straujupite.parse,
        parser_version="straujupite@1",
    )
)
