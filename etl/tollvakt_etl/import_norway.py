"""Transform, validate and load the Norwegian data into the database.

Usage (from the etl/ folder, with the venv active):

    python -m tollvakt_etl.import_norway              # newest download folder
    python -m tollvakt_etl.import_norway --dry-run    # check only, write nothing
    python -m tollvakt_etl.import_norway --folder data/raw/norway/20261121
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from tollvakt_etl.db import connect
from tollvakt_etl.inspect_raw import newest_folder
from tollvakt_etl.norway.dataset import load_dataset
from tollvakt_etl.norway.load import import_dataset


def print_report(errors: list[str], warnings: list[str]) -> None:
    for message in warnings:
        print(f"  WARNING  {message}")
    for message in errors:
        print(f"  ERROR    {message}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Import Tolletaten data into Tollvakt")
    parser.add_argument("--folder", type=Path, help="download folder (default: newest)")
    parser.add_argument("--dry-run", action="store_true", help="validate only, write nothing")
    args = parser.parse_args(argv)

    folder = args.folder or newest_folder()
    print(f"Reading {folder}")
    dataset, report = load_dataset(folder)

    print("\nRows:")
    for table, count in dataset.row_counts().items():
        print(f"  {table:<28} {count:>7,}")
    print()
    print_report(report.errors, report.warnings)

    if args.dry_run:
        print("\nDry run: nothing written." if report.ok else "\nDry run: validation failed.")
        return 0 if report.ok else 1

    errors_before = len(report.errors)
    with connect() as conn:
        run_id, status = import_dataset(conn, dataset, report)

    # The row count check runs against the database, so it can add errors
    print_report(report.errors[errors_before:], [])
    print(f"\nImport run {run_id}: {status}")
    return 0 if status == "succeeded" else 1


if __name__ == "__main__":
    sys.exit(main())
