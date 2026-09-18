import httpx

from collector.core.robots import check_allowed


def _client_for(body: str, status: int = 200) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, text=body)

    return httpx.Client(transport=httpx.MockTransport(handler))


def test_allows_when_robots_txt_missing():
    client = _client_for("", status=404)
    assert check_allowed("https://example.lv/degvielas-cenas", "fuel-price-lv/0.1", client) is True


def test_disallows_matching_path():
    body = "User-agent: *\nDisallow: /degvielas-cenas\n"
    client = _client_for(body)
    assert check_allowed("https://example.lv/degvielas-cenas", "fuel-price-lv/0.1", client) is False


def test_allows_non_matching_path():
    body = "User-agent: *\nDisallow: /admin\n"
    client = _client_for(body)
    assert check_allowed("https://example.lv/degvielas-cenas", "fuel-price-lv/0.1", client) is True
