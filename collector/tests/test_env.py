import collector.core.env as env_module
from collector.core.env import load_dev_vars


def _reset():
    env_module._loaded = False


def test_reads_an_explicit_path(tmp_path, monkeypatch):
    _reset()
    dev_vars = tmp_path / ".dev.vars"
    dev_vars.write_text("SOME_KEY=some-value\n", encoding="utf-8")
    monkeypatch.delenv("SOME_KEY", raising=False)
    load_dev_vars(dev_vars)
    import os

    assert os.environ["SOME_KEY"] == "some-value"


def test_looks_in_the_collector_directory_as_well_as_the_repo_root():
    # collector/.dev.vars is where collector secrets naturally live; the repo
    # root holds the shared file next to .dev.vars.example. Both must work.
    candidates = [p.parent.name for p in env_module._candidate_paths()]
    assert candidates[0] == "collector"
    assert candidates[1] == "fuel-price"


def test_real_environment_wins_over_the_file(tmp_path, monkeypatch):
    _reset()
    dev_vars = tmp_path / ".dev.vars"
    dev_vars.write_text("TAKEN=from-file\n", encoding="utf-8")
    monkeypatch.setenv("TAKEN", "from-environment")
    load_dev_vars(dev_vars)
    import os

    assert os.environ["TAKEN"] == "from-environment"


def test_ignores_comments_and_blank_lines(tmp_path, monkeypatch):
    _reset()
    dev_vars = tmp_path / ".dev.vars"
    dev_vars.write_text("# comment\n\nA_KEY=a\n", encoding="utf-8")
    monkeypatch.delenv("A_KEY", raising=False)
    monkeypatch.delenv("# comment", raising=False)
    load_dev_vars(dev_vars)
    import os

    assert os.environ["A_KEY"] == "a"


def test_missing_file_is_not_an_error(tmp_path):
    _reset()
    load_dev_vars(tmp_path / "nope" / ".dev.vars")
