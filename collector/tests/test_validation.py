from collector.core.validation import in_range, is_jump, validate_product


def test_in_range_accepts_typical_petrol_price():
    assert in_range("P95", 1969) is True


def test_in_range_rejects_price_outside_bounds():
    assert in_range("P95", 50) is False
    assert in_range("P95", 999_999) is False


def test_dsl_agro_has_lower_floor_than_regular_diesel():
    # Agro diesel is tax-reduced and genuinely priced far below road diesel
    # (seen ~1.774 vs ~2.177 EUR/l on Virši) -- the range must allow that.
    assert in_range("DSL_AGRO", 500) is True
    assert in_range("DSL", 500) is False


def test_is_jump_detects_large_relative_change():
    assert is_jump(1900, 2100) is True  # ~10.5%


def test_is_jump_ignores_small_change():
    assert is_jump(1900, 1950) is False  # ~2.6%


def test_is_jump_ignores_missing_previous_price():
    assert is_jump(0, 1900) is False


def test_validate_product_warns_on_unknown(caplog):
    validate_product("MADE_UP")
    assert "Unknown product code" in caplog.text


def test_validate_product_silent_on_known(caplog):
    validate_product("P95")
    assert caplog.text == ""
