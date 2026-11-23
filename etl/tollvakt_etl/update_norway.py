"""Brings the database up to date with Tolletaten's newest data, in one go:
download, import and embed, each step only when the one before succeeded.

Usage (from the etl/ folder, or in the ETL container):

    python -m tollvakt_etl.update_norway            # skips the import when nothing changed
    python -m tollvakt_etl.update_norway --force    # imports even when nothing changed

Made to run on a schedule (see scripts/update-tariff.sh). When every
downloaded file is identical to the last successful import, the import and
the embedding are skipped, so a daily run changes nothing on most days.
Embedding only creates vectors for texts that have none yet, so a run after
a change costs little. Old download folders are deleted; the newest
ETL_KEEP_DOWNLOADS (7 by default) are kept for tracing.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any

from tollvakt_etl import download, embed_norway, import_norway
from tollvakt_etl.ckan import CkanClient
from tollvakt_etl.config import NORWAY_RAW_DIR, TOLL_CKAN_URL
from tollvakt_etl.db import connect

DEFAULT_KEEP_DOWNLOADS = 7


def file_hashes(manifest: dict[str, Any] | None) -> dict[str, str]:
    """The sha256 of each downloaded dataset in a download manifest."""
    if not manifest:
        return {}
    return {
        result["dataset"]: result["sha256"]
        for result in manifest.get("results", [])
        if result.get("ok") and result.get("sha256")
    }


def last_imported_hashes(conn) -> dict[str, str]:
    """The file hashes of the last successful Norwegian import."""
    row = conn.execute(
        "SELECT manifest FROM import_runs WHERE source = 'norway' AND status = 'succeeded' "
        "ORDER BY finished_at DESC LIMIT 1"
    ).fetchone()
    return file_hashes(row[0]) if row else {}


def is_unchanged(folder: Path, imported: dict[str, str]) -> bool:
    """True when every file in the download is identical to the last import."""
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    downloaded = file_hashes(manifest)
    return bool(downloaded) and downloaded == imported


def prune_downloads(raw_dir: Path, keep: int) -> list[Path]:
    """Deletes all download folders except the newest `keep`. Returns the deleted ones."""
    folders = sorted(p for p in raw_dir.iterdir() if p.is_dir())
    old = folders[:-keep] if keep > 0 else []
    for folder in old:
        shutil.rmtree(folder)
    return old


def keep_downloads() -> int:
    value = os.environ.get("ETL_KEEP_DOWNLOADS", "")
    return int(value) if value.strip() else DEFAULT_KEEP_DOWNLOADS


def run_download() -> tuple[int, Path]:
    folder, results = download.run(CkanClient(TOLL_CKAN_URL))
    failed = [r.dataset for r in results if not r.ok]
    if failed:
        print(f"\nFailed: {', '.join(failed)}")
        return 1, folder
    return 0, folder


def run_import(folder: Path) -> int:
    return import_norway.main(["--folder", str(folder)])


def run_embed() -> int:
    return embed_norway.main([])


def imported_hashes() -> dict[str, str]:
    with connect() as conn:
        return last_imported_hashes(conn)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Update Tollvakt with Tolletaten's newest data")
    parser.add_argument("--force", action="store_true", help="import even when nothing changed")
    args = parser.parse_args(argv)

    print("\n==== Download ====", flush=True)
    status, folder = run_download()
    if status != 0:
        print(f"\nDownload failed (exit {status}); nothing was imported.")
        return status

    if not args.force and is_unchanged(folder, imported_hashes()):
        print("\nNothing changed since the last import; the import was skipped.")
    else:
        for name, step in (("Import", lambda: run_import(folder)), ("Embed", run_embed)):
            print(f"\n==== {name} ====", flush=True)
            status = step()
            if status != 0:
                print(f"\n{name} failed (exit {status}); the steps after it were not run.")
                return status
        print("\nThe database is up to date.")

    for old in prune_downloads(NORWAY_RAW_DIR, keep_downloads()):
        print(f"Deleted old download {old.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
