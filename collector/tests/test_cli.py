import pytest

from collector.cli import main


def test_run_without_source_prints_message_and_exits_zero(capsys):
    exit_code = main(["run"])
    assert exit_code == 0
    assert "Nav norādīts avots" in capsys.readouterr().out


def test_run_without_mode_flag_exits_nonzero(capsys):
    # Neither --dry-run nor --push given -- must fail before touching the
    # network for a real registered source, not silently default to one.
    exit_code = main(["run", "--all"])
    assert exit_code == 1
    assert "--dry-run" in capsys.readouterr().err


def test_run_push_without_config_reports_error(capsys, monkeypatch):
    monkeypatch.delenv("INGEST_URL", raising=False)
    monkeypatch.delenv("INGEST_SECRET", raising=False)
    exit_code = main(["run", "--all", "--push"])
    assert exit_code == 1
    assert "INGEST_URL" in capsys.readouterr().err


def test_run_unknown_source_exits_nonzero(capsys):
    exit_code = main(["run", "--source", "does-not-exist", "--dry-run"])
    assert exit_code == 1
    assert "Nezināms avots" in capsys.readouterr().err


def test_check_unknown_source_exits_nonzero():
    assert main(["check", "--source", "does-not-exist"]) == 1


def test_check_without_source_exits_zero():
    assert main(["check"]) == 0


def test_snapshot_unknown_source_exits_nonzero():
    assert main(["snapshot", "--source", "does-not-exist"]) == 1


def test_missing_command_raises_system_exit():
    with pytest.raises(SystemExit):
        main([])


def _fake_error_run(source):
    from datetime import UTC, datetime

    from collector.core.models import RunReport

    report = RunReport(
        source_id=source.source_id,
        started_at=datetime(2026, 10, 22, 6, 33, tzinfo=UTC),
        status="error",
        http_status=503,
        error="Service Unavailable\nretry later",
    )
    return report, []


def test_failed_source_is_annotated_in_github_actions(capsys, monkeypatch):
    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setattr("collector.cli.run_fuel_source", _fake_error_run)
    exit_code = main(["run", "--source", "circlek-fuel-web", "--dry-run"])
    assert exit_code == 1
    out = capsys.readouterr()
    # One annotation per failure, newlines escaped so the command stays on one line.
    assert (
        "::error title=circlek-fuel-web::error (HTTP 503): Service Unavailable%0Aretry later"
        in out.out
    )
    assert "circlek-fuel-web: error (HTTP 503)" in out.err


def test_failed_source_has_no_annotation_outside_github_actions(capsys, monkeypatch):
    monkeypatch.delenv("GITHUB_ACTIONS", raising=False)
    monkeypatch.setattr("collector.cli.run_fuel_source", _fake_error_run)
    exit_code = main(["run", "--source", "circlek-fuel-web", "--dry-run"])
    assert exit_code == 1
    out = capsys.readouterr()
    assert "::error" not in out.out
    assert "circlek-fuel-web: error (HTTP 503)" in out.err


def test_unreachable_ingest_does_not_stop_other_sources(capsys, monkeypatch):
    import httpx

    from collector.core.models import RunReport

    calls = []

    def ok_run(source):
        from datetime import UTC, datetime

        calls.append(source.source_id)
        return RunReport(
            source_id=source.source_id, started_at=datetime(2026, 10, 22, tzinfo=UTC), status="ok"
        ), []

    def boom(batch):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setenv("GITHUB_ACTIONS", "true")
    monkeypatch.setattr("collector.cli.run_fuel_source", ok_run)
    monkeypatch.setattr("collector.cli.push_batch", boom)
    exit_code = main(["run", "--all", "--push"])
    assert exit_code == 1
    from collector.core.registry import list_sources

    assert calls == list_sources()
    out = capsys.readouterr().out
    assert out.count("::error title=") == len(list_sources())
    assert "ingest nav sasniedzams" in out
