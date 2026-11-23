from tollvakt_etl import update_norway


def test_runs_every_step_in_order(monkeypatch):
    calls = []
    monkeypatch.setattr(
        update_norway,
        "STEPS",
        [(name, lambda name=name: calls.append(name) or 0) for name in ["Download", "Import", "Embed"]],
    )

    assert update_norway.main() == 0
    assert calls == ["Download", "Import", "Embed"]


def test_stops_at_the_first_failing_step(monkeypatch):
    calls = []

    def failing():
        calls.append("Import")
        return 1

    monkeypatch.setattr(
        update_norway,
        "STEPS",
        [
            ("Download", lambda: calls.append("Download") or 0),
            ("Import", failing),
            ("Embed", lambda: calls.append("Embed") or 0),
        ],
    )

    assert update_norway.main() == 1
    assert calls == ["Download", "Import"]
