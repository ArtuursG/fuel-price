"""CLI entry point: run | snapshot | check | official-weekly | emobi-ev | ignitis-ev."""

from __future__ import annotations

import argparse
import hashlib
import sys
from datetime import UTC, datetime
from pathlib import Path

import collector.sources.fuel  # noqa: F401 -- import side effect: registers sources
from collector.core import http, robots
from collector.core.models import IngestBatch, RunReport
from collector.core.push import PushConfigError, push_batch
from collector.core.registry import get_source, list_sources
from collector.core.runner import check_fuel_source, run_fuel_source, snapshot_fuel_source
from collector.sources.ev import emobi, ignitis
from collector.sources.official import eu_weekly_oil_bulletin

FIXTURES_DIR = Path(__file__).resolve().parent.parent.parent / "tests" / "fixtures"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="collector", description="Latvijas degvielas un EV cenu kolektors"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    run_p = sub.add_parser("run", help="Nolasa vienu vai visus avotus")
    run_p.add_argument("--source", help="Avota ID (sk. docs/sources.yaml)")
    run_p.add_argument("--all", action="store_true", help="Nolasa visus reģistrētos avotus")
    run_p.add_argument("--dry-run", action="store_true", help="Neko nesūta, tikai izvada JSON")
    run_p.add_argument("--push", action="store_true", help="Sūta uz INGEST_URL (3. fāze)")

    snapshot_p = sub.add_parser("snapshot", help="Saglabā dzīva avota paraugu testiem")
    snapshot_p.add_argument("--source", required=True)

    check_p = sub.add_parser(
        "check", help="Pārbauda avota pieejamību (robots.txt + savienojums), neko neparsē"
    )
    check_p.add_argument("--source")
    check_p.add_argument("--all", action="store_true")

    official_p = sub.add_parser(
        "official-weekly",
        help="Nolasa ES nedēļas degvielas biļetenu (LV/LT/EE vidējās cenas, ne tīklu cenas)",
    )
    official_p.add_argument("--dry-run", action="store_true", help="Neko nesūta, tikai izvada JSON")
    official_p.add_argument("--push", action="store_true", help="Sūta uz INGEST_URL (3. fāze)")

    emobi_p = sub.add_parser(
        "emobi-ev",
        help="Nolasa e-mobi API (CSDD + Elektrum Drive stacijas/tarifi, sk. sources/ev/emobi.py)",
    )
    emobi_p.add_argument("--dry-run", action="store_true", help="Neko nesūta, tikai izvada JSON")
    emobi_p.add_argument("--push", action="store_true", help="Sūta uz INGEST_URL (3. fāze)")

    ignitis_p = sub.add_parser(
        "ignitis-ev",
        help="Nolasa Ignitis ON kartes lapu (LV stacijas/tarifi, sk. sources/ev/ignitis.py)",
    )
    ignitis_p.add_argument("--dry-run", action="store_true", help="Neko nesūta, tikai izvada JSON")
    ignitis_p.add_argument("--push", action="store_true", help="Sūta uz INGEST_URL (3. fāze)")

    return parser


def _resolve_source_ids(source: str | None, use_all: bool) -> list[str]:
    if use_all:
        return list_sources()
    return [source] if source else []


def _cmd_run(args: argparse.Namespace) -> int:
    source_ids = _resolve_source_ids(args.source, args.all)
    if not source_ids:
        registered = list_sources()
        print(f"Nav norādīts avots. Lieto --source <id> vai --all. Reģistrēti avoti: {registered}")
        return 0

    if not args.dry_run and not args.push:
        print("Norādi --dry-run (izvadīt JSON) vai --push (sūtīt uz INGEST_URL).", file=sys.stderr)
        return 1

    exit_code = 0
    for source_id in source_ids:
        source = get_source(source_id)
        if source is None:
            print(f"Nezināms avots: {source_id}", file=sys.stderr)
            exit_code = 1
            continue

        report, prices = run_fuel_source(source)
        if report.status in ("error", "blocked"):
            exit_code = 1
        batch = IngestBatch(run=report, fuel=prices, ev=[])

        if args.dry_run:
            print(batch.model_dump_json(indent=2))

        if args.push:
            try:
                response = push_batch(batch)
            except PushConfigError as exc:
                print(f"{source_id}: {exc}", file=sys.stderr)
                exit_code = 1
                continue
            if response.status_code >= 400:
                print(
                    f"{source_id}: ingest atbildēja {response.status_code}: {response.text}",
                    file=sys.stderr,
                )
                exit_code = 1
            else:
                print(f"{source_id}: pushots (HTTP {response.status_code})")
    return exit_code


def _cmd_snapshot(args: argparse.Namespace) -> int:
    source = get_source(args.source)
    if source is None:
        print(f"Nezināms avots: {args.source}", file=sys.stderr)
        return 1
    path = snapshot_fuel_source(source, FIXTURES_DIR)
    print(f"Saglabāts: {path}")
    return 0


def _cmd_check(args: argparse.Namespace) -> int:
    source_ids = _resolve_source_ids(args.source, args.all)
    if not source_ids:
        print("Nav norādīts avots. Lieto --source <id> vai --all.")
        return 0

    exit_code = 0
    for source_id in source_ids:
        source = get_source(source_id)
        if source is None:
            print(f"Nezināms avots: {source_id}", file=sys.stderr)
            exit_code = 1
            continue
        report = check_fuel_source(source)
        print(f"{source_id}: {report.status} (http {report.http_status})")
        if report.status != "ok":
            exit_code = 1
    return exit_code


def _cmd_official_weekly(args: argparse.Namespace) -> int:
    if not args.dry_run and not args.push:
        print("Norādi --dry-run (izvadīt JSON) vai --push (sūtīt uz INGEST_URL).", file=sys.stderr)
        return 1

    started_at = datetime.now(UTC)
    client = http.make_client()
    try:
        if not robots.check_allowed(eu_weekly_oil_bulletin.URL, http.DEFAULT_USER_AGENT, client):
            report = RunReport(
                source_id=eu_weekly_oil_bulletin.SOURCE_ID,
                started_at=started_at,
                finished_at=datetime.now(UTC),
                status="blocked",
                error="robots.txt disallows this path",
            )
            prices = []
        else:
            response = http.get_with_retries(client, eu_weekly_oil_bulletin.URL)
            if response.status_code >= 400:
                report = RunReport(
                    source_id=eu_weekly_oil_bulletin.SOURCE_ID,
                    started_at=started_at,
                    finished_at=datetime.now(UTC),
                    status="error",
                    http_status=response.status_code,
                    error=f"HTTP {response.status_code}",
                )
                prices = []
            else:
                prices = eu_weekly_oil_bulletin.parse(response.content)
                report = RunReport(
                    source_id=eu_weekly_oil_bulletin.SOURCE_ID,
                    started_at=started_at,
                    finished_at=datetime.now(UTC),
                    status="ok" if prices else "partial",
                    http_status=response.status_code,
                    items=len(prices),
                    content_sha256=hashlib.sha256(response.content).hexdigest(),
                    parser_version="eu_weekly_oil_bulletin@1",
                )
    finally:
        client.close()

    exit_code = 1 if report.status in ("error", "blocked") else 0
    batch = IngestBatch(run=report, fuel=[], ev=[], official_weekly=prices)

    if args.dry_run:
        print(batch.model_dump_json(indent=2))

    if args.push:
        try:
            response = push_batch(batch)
        except PushConfigError as exc:
            print(f"{eu_weekly_oil_bulletin.SOURCE_ID}: {exc}", file=sys.stderr)
            return 1
        if response.status_code >= 400:
            print(
                f"{eu_weekly_oil_bulletin.SOURCE_ID}: ingest atbildēja "
                f"{response.status_code}: {response.text}",
                file=sys.stderr,
            )
            exit_code = 1
        else:
            print(f"{eu_weekly_oil_bulletin.SOURCE_ID}: pushots (HTTP {response.status_code})")

    return exit_code


def _cmd_emobi_ev(args: argparse.Namespace) -> int:
    if not args.dry_run and not args.push:
        print("Norādi --dry-run (izvadīt JSON) vai --push (sūtīt uz INGEST_URL).", file=sys.stderr)
        return 1

    started_at = datetime.now(UTC)
    client = http.make_client()
    try:
        if not robots.check_allowed(emobi.URL, http.DEFAULT_USER_AGENT, client):
            report = RunReport(
                source_id=emobi.SOURCE_ID,
                started_at=started_at,
                finished_at=datetime.now(UTC),
                status="blocked",
                error="robots.txt disallows this path",
            )
            stations, tariffs = [], []
        else:
            response = http.get_with_retries(client, emobi.URL)
            if response.status_code >= 400:
                report = RunReport(
                    source_id=emobi.SOURCE_ID,
                    started_at=started_at,
                    finished_at=datetime.now(UTC),
                    status="error",
                    http_status=response.status_code,
                    error=f"HTTP {response.status_code}",
                )
                stations, tariffs = [], []
            else:
                stations, tariffs = emobi.parse(response.content)
                report = RunReport(
                    source_id=emobi.SOURCE_ID,
                    started_at=started_at,
                    finished_at=datetime.now(UTC),
                    status="ok" if tariffs else "partial",
                    http_status=response.status_code,
                    items=len(tariffs),
                    content_sha256=hashlib.sha256(response.content).hexdigest(),
                    parser_version="emobi@1",
                )
    finally:
        client.close()

    exit_code = 1 if report.status in ("error", "blocked") else 0
    batch = IngestBatch(run=report, fuel=[], ev=tariffs, stations=stations)

    if args.dry_run:
        print(batch.model_dump_json(indent=2))

    if args.push:
        try:
            response = push_batch(batch)
        except PushConfigError as exc:
            print(f"{emobi.SOURCE_ID}: {exc}", file=sys.stderr)
            return 1
        if response.status_code >= 400:
            print(
                f"{emobi.SOURCE_ID}: ingest atbildēja {response.status_code}: {response.text}",
                file=sys.stderr,
            )
            exit_code = 1
        else:
            print(f"{emobi.SOURCE_ID}: pushots (HTTP {response.status_code})")

    return exit_code


def _cmd_ignitis_ev(args: argparse.Namespace) -> int:
    if not args.dry_run and not args.push:
        print("Norādi --dry-run (izvadīt JSON) vai --push (sūtīt uz INGEST_URL).", file=sys.stderr)
        return 1

    started_at = datetime.now(UTC)
    client = http.make_client()
    try:
        if not robots.check_allowed(ignitis.URL, http.DEFAULT_USER_AGENT, client):
            report = RunReport(
                source_id=ignitis.SOURCE_ID,
                started_at=started_at,
                finished_at=datetime.now(UTC),
                status="blocked",
                error="robots.txt disallows this path",
            )
            stations, tariffs = [], []
        else:
            response = http.get_with_retries(client, ignitis.URL)
            if response.status_code >= 400:
                report = RunReport(
                    source_id=ignitis.SOURCE_ID,
                    started_at=started_at,
                    finished_at=datetime.now(UTC),
                    status="error",
                    http_status=response.status_code,
                    error=f"HTTP {response.status_code}",
                )
                stations, tariffs = [], []
            else:
                stations, tariffs = ignitis.parse(response.text)
                report = RunReport(
                    source_id=ignitis.SOURCE_ID,
                    started_at=started_at,
                    finished_at=datetime.now(UTC),
                    status="ok" if tariffs else "partial",
                    http_status=response.status_code,
                    items=len(tariffs),
                    content_sha256=hashlib.sha256(response.content).hexdigest(),
                    parser_version="ignitis@1",
                )
    finally:
        client.close()

    exit_code = 1 if report.status in ("error", "blocked") else 0
    batch = IngestBatch(run=report, fuel=[], ev=tariffs, stations=stations)

    if args.dry_run:
        print(batch.model_dump_json(indent=2))

    if args.push:
        try:
            response = push_batch(batch)
        except PushConfigError as exc:
            print(f"{ignitis.SOURCE_ID}: {exc}", file=sys.stderr)
            return 1
        if response.status_code >= 400:
            print(
                f"{ignitis.SOURCE_ID}: ingest atbildēja {response.status_code}: {response.text}",
                file=sys.stderr,
            )
            exit_code = 1
        else:
            print(f"{ignitis.SOURCE_ID}: pushots (HTTP {response.status_code})")

    return exit_code


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "run":
        return _cmd_run(args)
    if args.command == "snapshot":
        return _cmd_snapshot(args)
    if args.command == "check":
        return _cmd_check(args)
    if args.command == "official-weekly":
        return _cmd_official_weekly(args)
    if args.command == "emobi-ev":
        return _cmd_emobi_ev(args)
    if args.command == "ignitis-ev":
        return _cmd_ignitis_ev(args)
    return 2  # pragma: no cover -- argparse's `required=True` already prevents this
