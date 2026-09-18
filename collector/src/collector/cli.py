"""CLI entry point: run | snapshot | check.

Phase 1 skeleton only -- no source is registered yet (that starts in
Phase 2), so `run`/`check` on a real source id will report "unknown" until
then. The commands still need to behave sensibly today so CI has something
real to test against.
"""

from __future__ import annotations

import argparse
import sys

from collector.core.registry import get_source, list_sources


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="collector", description="Latvijas degvielas un EV cenu kolektors"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    run_p = sub.add_parser("run", help="Nolasa vienu vai visus avotus")
    run_p.add_argument("--source", help="Avota ID (sk. docs/sources.yaml)")
    run_p.add_argument("--all", action="store_true", help="Nolasa visus reģistrētos avotus")
    run_p.add_argument("--dry-run", action="store_true", help="Neko nesūta, tikai izvada JSON")
    run_p.add_argument("--push", action="store_true", help="Sūta uz INGEST_URL")

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
        print(
            "Nav norādīts avots. Lieto --source <id> vai --all. "
            f"Reģistrēti avoti: {registered or '(nav - 2. fāzes darbs)'}"
        )
        return 0
    for source_id in source_ids:
        if get_source(source_id) is None:
            print(f"Nezināms avots: {source_id}", file=sys.stderr)
            return 1
        # Phase 2+ izpildīs source.run() un izvadīs/nosūtīs IngestBatch šeit.
    return 0


def _cmd_snapshot(args: argparse.Namespace) -> int:
    if get_source(args.source) is None:
        print(f"Nezināms avots: {args.source}", file=sys.stderr)
        return 1
    return 0


def _cmd_check(args: argparse.Namespace) -> int:
    source_ids = _resolve_source_ids(args.source, args.all)
    if not source_ids:
        print("Nav norādīts avots. Lieto --source <id> vai --all.")
        return 0
    for source_id in source_ids:
        if get_source(source_id) is None:
            print(f"Nezināms avots: {source_id}", file=sys.stderr)
            return 1
    return 0


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
