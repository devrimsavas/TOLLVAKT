import json

from psycopg.types.json import Jsonb

from tollvakt_etl import update_norway


def manifest(**hashes):
    return {"results": [{"dataset": name, "ok": True, "sha256": sha} for name, sha in hashes.items()]}


def write_download(folder, **hashes):
    folder.mkdir(parents=True)
    (folder / "manifest.json").write_text(json.dumps(manifest(**hashes)), encoding="utf-8")
    return folder


def fake_steps(monkeypatch, tmp_path, *, imported, download_status=0, import_status=0):
    """Replaces every step with a recorder; returns the list of calls."""
    calls = []
    folder = write_download(tmp_path / "raw" / "20261123", a="1", b="2")

    def download():
        calls.append("Download")
        return download_status, folder

    def run_import(f):
        calls.append(("Import", f))
        return import_status

    monkeypatch.setattr(update_norway, "run_download", download)
    monkeypatch.setattr(update_norway, "run_import", run_import)
    monkeypatch.setattr(update_norway, "run_embed", lambda: calls.append("Embed") or 0)
    monkeypatch.setattr(update_norway, "imported_hashes", lambda: imported)
    monkeypatch.setattr(update_norway, "NORWAY_RAW_DIR", tmp_path / "raw")
    return calls, folder


def test_imports_and_embeds_the_new_download_when_something_changed(monkeypatch, tmp_path):
    calls, folder = fake_steps(monkeypatch, tmp_path, imported={"a": "1", "b": "old"})

    assert update_norway.main([]) == 0
    assert calls == ["Download", ("Import", folder), "Embed"]


def test_skips_import_and_embed_when_nothing_changed(monkeypatch, tmp_path):
    calls, _ = fake_steps(monkeypatch, tmp_path, imported={"a": "1", "b": "2"})

    assert update_norway.main([]) == 0
    assert calls == ["Download"]


def test_force_imports_even_when_nothing_changed(monkeypatch, tmp_path):
    calls, folder = fake_steps(monkeypatch, tmp_path, imported={"a": "1", "b": "2"})

    assert update_norway.main(["--force"]) == 0
    assert calls == ["Download", ("Import", folder), "Embed"]


def test_imports_when_there_was_no_import_before(monkeypatch, tmp_path):
    calls, folder = fake_steps(monkeypatch, tmp_path, imported={})

    assert update_norway.main([]) == 0
    assert calls == ["Download", ("Import", folder), "Embed"]


def test_stops_when_the_download_fails(monkeypatch, tmp_path):
    calls, _ = fake_steps(monkeypatch, tmp_path, imported={}, download_status=1)

    assert update_norway.main([]) == 1
    assert calls == ["Download"]


def test_stops_at_a_failing_import(monkeypatch, tmp_path):
    calls, folder = fake_steps(monkeypatch, tmp_path, imported={}, import_status=1)

    assert update_norway.main([]) == 1
    assert calls == ["Download", ("Import", folder)]


def test_is_unchanged_needs_every_file_to_match(tmp_path):
    folder = write_download(tmp_path / "d", a="1", b="2")

    assert update_norway.is_unchanged(folder, {"a": "1", "b": "2"})
    assert not update_norway.is_unchanged(folder, {"a": "1"})
    assert not update_norway.is_unchanged(folder, {"a": "1", "b": "2", "c": "3"})
    assert not update_norway.is_unchanged(folder, {})


def test_file_hashes_ignores_failed_downloads():
    data = {"results": [{"dataset": "a", "ok": True, "sha256": "1"}, {"dataset": "b", "ok": False}]}

    assert update_norway.file_hashes(data) == {"a": "1"}
    assert update_norway.file_hashes(None) == {}


def test_prune_keeps_the_newest_folders(tmp_path):
    for name in ["20261117", "20261118", "20261119", "20261120"]:
        (tmp_path / name).mkdir()

    deleted = update_norway.prune_downloads(tmp_path, keep=2)

    assert [p.name for p in deleted] == ["20261117", "20261118"]
    assert sorted(p.name for p in tmp_path.iterdir()) == ["20261119", "20261120"]


def test_prune_keeps_everything_when_there_are_few_folders(tmp_path):
    (tmp_path / "20261120").mkdir()

    assert update_norway.prune_downloads(tmp_path, keep=7) == []
    assert (tmp_path / "20261120").exists()


def test_keep_downloads_reads_the_environment(monkeypatch):
    monkeypatch.delenv("ETL_KEEP_DOWNLOADS", raising=False)
    assert update_norway.keep_downloads() == 7
    monkeypatch.setenv("ETL_KEEP_DOWNLOADS", "3")
    assert update_norway.keep_downloads() == 3


def test_last_imported_hashes_reads_the_newest_successful_run(db):
    rows = [
        ("succeeded", manifest(a="old"), "2026-11-20"),
        ("succeeded", manifest(a="new"), "2026-11-21"),
        ("failed", manifest(a="broken"), "2026-11-22"),
    ]
    for status, data, finished in rows:
        db.execute(
            "INSERT INTO import_runs (source, status, manifest, finished_at) VALUES ('norway', %s, %s, %s)",
            (status, Jsonb(data), finished),
        )
    db.commit()

    assert update_norway.last_imported_hashes(db) == {"a": "new"}


def test_last_imported_hashes_is_empty_without_runs(db):
    assert update_norway.last_imported_hashes(db) == {}
