"""CLI entry point: run | snapshot | check."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import collector.sources.fuel  # noqa: F401 -- import side effect: registers sources
from collector.core.models import IngestBatch
from collector.core.registry import get_source, list_sources
from collector.core.runner import check_fuel_source, run_fuel_source, snapshot_fuel_source

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

    if args.push and not args.dry_run:
        print("--push nav ieviests (3. fāzes darbs). Lieto --dry-run.", file=sys.stderr)
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
        print(batch.model_dump_json(indent=2))
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


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "run":
        return _cmd_run(args)
    if args.command == "snapshot":
        return _cmd_snapshot(args)
    if args.command == "check":
        return _cmd_check(args)
    return 2  # pragma: no cover -- argparse's `required=True` already prevents this
