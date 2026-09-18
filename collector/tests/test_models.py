import pytest
from pydantic import ValidationError

from collector.core.models import FuelPrice


def test_fuel_price_rejects_non_positive_price():
    with pytest.raises(ValidationError):
        FuelPrice(network_id="circlek", scope="network", product="P95", price_milli=0)


def test_fuel_price_accepts_valid_data():
    price = FuelPrice(
        network_id="circlek",
        scope="cheapest_riga",
        product="P95",
        price_milli=1969,
        where_text="Test iela 1",
    )
    assert price.price_milli == 1969
