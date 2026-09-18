import pytest

from collector.cli import main


def test_run_without_source_prints_message_and_exits_zero(capsys):
    exit_code = main(["run"])
    assert exit_code == 0
    assert "Nav norādīts avots" in capsys.readouterr().out


def test_run_all_with_no_registered_sources_exits_zero():
    assert main(["run", "--all"]) == 0


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
