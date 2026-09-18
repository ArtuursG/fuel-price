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
