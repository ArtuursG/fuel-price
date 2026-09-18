import pytest

from collector.cli import main


def test_run_without_source_prints_message_and_exits_zero(capsys):
    exit_code = main(["run"])
    assert exit_code == 0
    assert "Nav norādīts avots" in capsys.readouterr().out


def test_run_push_without_dry_run_is_not_yet_supported(capsys):
    # --push is Phase 3 work; must fail clearly rather than silently no-op
    # or (worse) actually hit the network for a real registered source.
    exit_code = main(["run", "--all", "--push"])
    assert exit_code == 1
    assert "nav ieviests" in capsys.readouterr().err


def test_run_unknown_source_exits_nonzero(capsys):
    exit_code = main(["run", "--source", "does-not-exist"])
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
