import httpx

from collector.core.models import FuelPrice
from collector.core.runner import FuelSource, check_fuel_source, run_fuel_source


def _client_with(robots_body: str, page_body: str, page_status: int = 200) -> httpx.Client:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text=robots_body)
        return httpx.Response(page_status, text=page_body)

    return httpx.Client(transport=httpx.MockTransport(handler))


def _fixed_price_parser(html: str) -> list[FuelPrice]:
    return [FuelPrice(network_id="example", scope="cheapest", product="P95", price_milli=1900)]


def _fake_source(parser=_fixed_price_parser) -> FuelSource:
    return FuelSource(
        source_id="example-fuel-web",
        network_id="example",
        url="https://example.lv/cenas",
        parser=parser,
        parser_version="example@1",
    )


def test_run_fuel_source_returns_ok_report_and_prices():
    client = _client_with("User-agent: *\nDisallow:\n", "<html>ignored by fake parser</html>")
    report, prices = run_fuel_source(_fake_source(), client)

    assert report.status == "ok"
    assert report.http_status == 200
    assert report.items == 1
    assert report.content_sha256  # computed from the fetched body
    assert prices[0].price_milli == 1900


def test_run_fuel_source_respects_robots_disallow():
    client = _client_with("User-agent: *\nDisallow: /cenas\n", "<html></html>")
    report, prices = run_fuel_source(_fake_source(), client)

    assert report.status == "blocked"
    assert prices == []


def test_run_fuel_source_drops_out_of_range_price():
    def out_of_range_parser(html: str) -> list[FuelPrice]:
        return [FuelPrice(network_id="example", scope="cheapest", product="P95", price_milli=50)]

    client = _client_with("User-agent: *\nDisallow:\n", "<html></html>")
    report, prices = run_fuel_source(_fake_source(parser=out_of_range_parser), client)

    assert prices == []
    assert report.status == "partial"


def test_run_fuel_source_reports_http_error():
    client = _client_with("User-agent: *\nDisallow:\n", "server error", page_status=500)
    report, prices = run_fuel_source(_fake_source(), client)

    assert report.status == "error"
    assert report.http_status == 500
    assert prices == []


def test_check_fuel_source_ok():
    client = _client_with("User-agent: *\nDisallow:\n", "<html></html>")
    report = check_fuel_source(_fake_source(), client)

    assert report.status == "ok"
    assert report.http_status == 200
