"""Importing this package registers every fuel source. `cli.py` imports it
for the side effect; individual parser modules stay import-free of the
registry so they're testable in isolation (see tests/test_sources_*.py).
"""

from collector.core.registry import register
from collector.core.runner import FuelSource
from collector.sources.fuel import circlek, kool, straujupite, viada, virsi

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

register(
    FuelSource(
        source_id=virsi.SOURCE_ID,
        network_id=virsi.NETWORK_ID,
        url="https://www.virsi.lv/lv/privatpersonam/degviela/degvielas-un-elektrouzlades-cenas",
        parser=virsi.parse,
        parser_version="virsi@1",
    )
)

register(
    FuelSource(
        source_id=viada.SOURCE_ID,
        network_id=viada.NETWORK_ID,
        url="https://www.viada.lv/zemakas-degvielas-cenas/",
        parser=viada.parse,
        parser_version="viada@1",
    )
)

register(
    FuelSource(
        source_id=kool.SOURCE_ID,
        network_id=kool.NETWORK_ID,
        url=kool.URL,
        parser=kool.parse,
        parser_version="kool@1",
        # Cenas ir otrā dokumentā, uz kuru lapa norāda -- sk. kool.py.
        follow=kool.find_snippet_url,
    )
)
