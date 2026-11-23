"""Brings the database up to date with Tolletaten's newest data, in one go:
download, import and embed, each step only when the one before succeeded.

Usage (from the etl/ folder, or in the ETL container):

    python -m tollvakt_etl.update_norway

Run it on a fresh server once the API has created the tables, and again
whenever Tolletaten publishes new data. Embedding only creates vectors for
texts that have none yet, so a re-run costs little.
"""

from __future__ import annotations

import sys
from collections.abc import Callable

from tollvakt_etl import download, embed_norway, import_norway

STEPS: list[tuple[str, Callable[[], int]]] = [
    ("Download", download.main),
    ("Import", lambda: import_norway.main([])),
    ("Embed", lambda: embed_norway.main([])),
]


def main() -> int:
    for name, step in STEPS:
        print(f"\n==== {name} ====", flush=True)
        status = step()
        if status != 0:
            print(f"\n{name} failed (exit {status}); the steps after it were not run.")
            return status
    print("\nThe database is up to date.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
