"""CLI entry point: run | snapshot | check | official-weekly | emobi/ignitis/eleport/virsi-ev."""

from __future__ import annotations

import argparse
import hashlib
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

import httpx

import collector.sources.fuel  # noqa: F401 -- import side effect: registers sources
from collector.core import http, robots
from collector.core.env import load_dev_vars
from collector.core.models import IngestBatch, RunReport
from collector.core.push import PushConfigError, push_batch
from collector.core.registry import get_source, list_sources
from collector.core.runner import check_fuel_source, run_fuel_source, snapshot_fuel_source
from collector.sources.ev import eleport, emobi, ignitis, nap
from collector.sources.ev import virsi as virsi_ev
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

    eleport_p = sub.add_parser(
        "eleport-ev",
        help="Nolasa Eleport cenu lapu (LV tīkla tarifi, bez stacijām, sk. sources/ev/eleport.py)",
    )
    eleport_p.add_argument("--dry-run", action="store_true", help="Neko nesūta, tikai izvada JSON")
    eleport_p.add_argument("--push", action="store_true", help="Sūta uz INGEST_URL (3. fāze)")

    virsi_ev_p = sub.add_parser(
        "virsi-ev",
        help="Nolasa Viršu uzlādes tarifus (tā pati lapa, kas degvielai, sk. sources/ev/virsi.py)",
    )
    virsi_ev_p.add_argument("--dry-run", action="store_true", help="Neko nesūta, tikai izvada JSON")
    virsi_ev_p.add_argument("--push", action="store_true", help="Sūta uz INGEST_URL (3. fāze)")

    nap_p = sub.add_parser(
        "nap-ev",
        help="Nolasa NAP uzlādes datu kopas (stacijas + cenas, sk. sources/ev/nap.py)",
    )
    nap_p.add_argument("--dry-run", action="store_true", help="Neko nesūta, tikai izvada JSON")
    nap_p.add_argument("--push", action="store_true", help="Sūta uz INGEST_URL (3. fāze)")

    return parser


def _report_failure(source_id: str, message: str) -> None:
    """Print a source failure to stderr and, in GitHub Actions, as an annotation.

    The collect workflow runs sources with continue-on-error, so a failing
    source otherwise shows only as a generic "exit code 1" on the final step.
    An ::error:: line puts the source and the reason in the run summary,
    which can be read without downloading the log.
    """
    print(f"{source_id}: {message}", file=sys.stderr)
    if os.environ.get("GITHUB_ACTIONS") == "true":
        # Workflow commands end at a newline; %, CR and LF must be escaped.
        text = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print(f"::error title={source_id}::{text}")


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
            detail = f"HTTP {report.http_status}" if report.http_status else "bez HTTP atbildes"
            _report_failure(
                source_id, f"{report.status} ({detail}): {report.error or 'bez apraksta'}"
            )
        batch = IngestBatch(run=report, fuel=prices, ev=[])

        if args.dry_run:
            print(batch.model_dump_json(indent=2))

        if args.push:
            try:
                response = push_batch(batch)
            except PushConfigError as exc:
                _report_failure(source_id, str(exc))
                exit_code = 1
                continue
            except httpx.HTTPError as exc:
                _report_failure(source_id, f"ingest nav sasniedzams: {exc!r}")
                exit_code = 1
                continue
            if response.status_code >= 400:
                _report_failure(
                    source_id, f"ingest atbildēja {response.status_code}: {response.text[:500]}"
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


def _cmd_eleport_ev(args: argparse.Namespace) -> int:
    if not args.dry_run and not args.push:
        print("Norādi --dry-run (izvadīt JSON) vai --push (sūtīt uz INGEST_URL).", file=sys.stderr)
        return 1

    started_at = datetime.now(UTC)
    client = http.make_client()
    try:
        if not robots.check_allowed(eleport.URL, http.DEFAULT_USER_AGENT, client):
            report = RunReport(
                source_id=eleport.SOURCE_ID,
                started_at=started_at,
                finished_at=datetime.now(UTC),
                status="blocked",
                error="robots.txt disallows this path",
            )
            tariffs = []
        else:
            response = http.get_with_retries(client, eleport.URL)
            if response.status_code >= 400:
                report = RunReport(
                    source_id=eleport.SOURCE_ID,
                    started_at=started_at,
                    finished_at=datetime.now(UTC),
                    status="error",
                    http_status=response.status_code,
                    error=f"HTTP {response.status_code}",
                )
                tariffs = []
            else:
                tariffs = eleport.parse(response.text)
                report = RunReport(
                    source_id=eleport.SOURCE_ID,
                    started_at=started_at,
                    finished_at=datetime.now(UTC),
                    status="ok" if tariffs else "partial",
                    http_status=response.status_code,
                    items=len(tariffs),
                    content_sha256=hashlib.sha256(response.content).hexdigest(),
                    parser_version="eleport@1",
                )
    finally:
        client.close()

    exit_code = 1 if report.status in ("error", "blocked") else 0
    batch = IngestBatch(run=report, fuel=[], ev=tariffs)

    if args.dry_run:
        print(batch.model_dump_json(indent=2))

    if args.push:
        try:
            response = push_batch(batch)
        except PushConfigError as exc:
            print(f"{eleport.SOURCE_ID}: {exc}", file=sys.stderr)
            return 1
        if response.status_code >= 400:
            print(
                f"{eleport.SOURCE_ID}: ingest atbildēja {response.status_code}: {response.text}",
                file=sys.stderr,
            )
            exit_code = 1
        else:
            print(f"{eleport.SOURCE_ID}: pushots (HTTP {response.status_code})")

    return exit_code


def _cmd_virsi_ev(args: argparse.Namespace) -> int:
    if not args.dry_run and not args.push:
        print("Norādi --dry-run (izvadīt JSON) vai --push (sūtīt uz INGEST_URL).", file=sys.stderr)
        return 1

    started_at = datetime.now(UTC)
    client = http.make_client()
    try:
        if not robots.check_allowed(virsi_ev.URL, http.DEFAULT_USER_AGENT, client):
            report = RunReport(
                source_id=virsi_ev.SOURCE_ID,
                started_at=started_at,
                finished_at=datetime.now(UTC),
                status="blocked",
                error="robots.txt disallows this path",
            )
            tariffs = []
        else:
            response = http.get_with_retries(client, virsi_ev.URL)
            if response.status_code >= 400:
                report = RunReport(
                    source_id=virsi_ev.SOURCE_ID,
                    started_at=started_at,
                    finished_at=datetime.now(UTC),
                    status="error",
                    http_status=response.status_code,
                    error=f"HTTP {response.status_code}",
                )
                tariffs = []
            else:
                tariffs = virsi_ev.parse(response.text)
                report = RunReport(
                    source_id=virsi_ev.SOURCE_ID,
                    started_at=started_at,
                    finished_at=datetime.now(UTC),
                    status="ok" if tariffs else "partial",
                    http_status=response.status_code,
                    items=len(tariffs),
                    content_sha256=hashlib.sha256(response.content).hexdigest(),
                    parser_version="virsi-ev@1",
                )
    finally:
        client.close()

    exit_code = 1 if report.status in ("error", "blocked") else 0
    batch = IngestBatch(run=report, fuel=[], ev=tariffs)

    if args.dry_run:
        print(batch.model_dump_json(indent=2))

    if args.push:
        try:
            response = push_batch(batch)
        except PushConfigError as exc:
            print(f"{virsi_ev.SOURCE_ID}: {exc}", file=sys.stderr)
            return 1
        if response.status_code >= 400:
            print(
                f"{virsi_ev.SOURCE_ID}: ingest atbildēja {response.status_code}: {response.text}",
                file=sys.stderr,
            )
            exit_code = 1
        else:
            print(f"{virsi_ev.SOURCE_ID}: pushots (HTTP {response.status_code})")

    return exit_code


def _nap_fetch(client: httpx.Client, api_key: str) -> bytes:
    """Lejupiela vienas NAP datu kopas failu.

    Divos sojos, ka NAP piemeros: vispirms failu saraksts, tad lejupielade
    pec file_id. Saraksts parasti satur vienu failu; nemam jaunako.
    """
    headers = {"User-Agent": http.DEFAULT_USER_AGENT, "x-api-key": api_key}
    info = client.get(nap.FILE_INFO_URL, headers=headers, timeout=60.0)
    info.raise_for_status()
    files = info.json().get("files") or []
    if not files:
        raise RuntimeError("NAP datu kopai nav neviena faila")
    file_id = str(files[-1]["file_id"])

    data = client.post(nap.DOWNLOAD_URL, headers=headers, json={"file_id": file_id}, timeout=180.0)
    data.raise_for_status()
    return data.content


def _cmd_nap_ev(args: argparse.Namespace) -> int:
    if not args.dry_run and not args.push:
        print("Norādi --dry-run (izvadīt JSON) vai --push (sūtīt uz INGEST_URL).", file=sys.stderr)
        return 1

    load_dev_vars()
    infra_key = os.environ.get("NAP_EV_INFRA_ECO_KEY", "").strip()
    status_key = os.environ.get("NAP_EV_STATUS_KEY", "").strip()
    if not infra_key or not status_key:
        print(
            "Trūkst NAP_EV_INFRA_ECO_KEY vai NAP_EV_STATUS_KEY (.dev.vars vai secrets).",
            file=sys.stderr,
        )
        return 1

    started_at = datetime.now(UTC)
    client = http.make_client()
    stations: list = []
    tariffs: list = []
    try:
        # robots.txt attiecas uz lapu, ne uz abonementa API, bet parbaudam
        # tapat -- ja tas kadreiz aizliegs, apstasimies.
        if not robots.check_allowed(nap.FILE_INFO_URL, http.DEFAULT_USER_AGENT, client):
            report = RunReport(
                source_id=nap.SOURCE_ID,
                started_at=started_at,
                finished_at=datetime.now(UTC),
                status="blocked",
                error="robots.txt disallows this path",
            )
        else:
            infrastructure = _nap_fetch(client, infra_key)
            status_xml = _nap_fetch(client, status_key)
            stations, tariffs = nap.build(infrastructure, status_xml)
            report = RunReport(
                source_id=nap.SOURCE_ID,
                started_at=started_at,
                finished_at=datetime.now(UTC),
                status="ok" if tariffs else "partial",
                http_status=200,
                items=len(tariffs),
                content_sha256=hashlib.sha256(infrastructure + status_xml).hexdigest(),
                parser_version="nap@1",
            )
    except Exception as exc:  # noqa: BLE001 -- jebkura kļūda jāpaliek atskaitē
        report = RunReport(
            source_id=nap.SOURCE_ID,
            started_at=started_at,
            finished_at=datetime.now(UTC),
            status="error",
            error=f"{type(exc).__name__}: {exc}"[:300],
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
            print(f"{nap.SOURCE_ID}: {exc}", file=sys.stderr)
            return 1
        if response.status_code >= 400:
            print(
                f"{nap.SOURCE_ID}: ingest atbildēja {response.status_code}: {response.text}",
                file=sys.stderr,
            )
            exit_code = 1
        else:
            print(f"{nap.SOURCE_ID}: pushots (HTTP {response.status_code})")

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
    if args.command == "nap-ev":
        return _cmd_nap_ev(args)
    if args.command == "virsi-ev":
        return _cmd_virsi_ev(args)
    if args.command == "eleport-ev":
        return _cmd_eleport_ev(args)
    return 2  # pragma: no cover -- argparse's `required=True` already prevents this
