"""Discover all datasets on data.toll.no and save a catalog snapshot.

Usage (from the etl/ folder, with the venv active):

    python -m tollvakt_etl.catalog
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from tollvakt_etl.ckan import CkanClient

TOLL_CKAN_URL = "https://data.toll.no"
RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "norway"


def summarize_dataset(dataset: dict[str, Any]) -> dict[str, Any]:
    """Keep only the fields we need to decide what to import."""
    return {
        "name": dataset.get("name"),
        "title": dataset.get("title"),
        "description": (dataset.get("notes") or "").strip(),
        "license": dataset.get("license_title"),
        "metadata_modified": dataset.get("metadata_modified"),
        "resources": [
            {
                "name": resource.get("name"),
                "format": (resource.get("format") or "").upper(),
                "url": resource.get("url"),
                "last_modified": resource.get("last_modified")
                or resource.get("created"),
            }
            for resource in dataset.get("resources", [])
        ],
    }


def build_catalog(client: CkanClient) -> list[dict[str, Any]]:
    """Fetch metadata for every dataset, sorted by name."""
    names = sorted(client.list_datasets())
    return [summarize_dataset(client.get_dataset(name)) for name in names]


def save_catalog(catalog: list[dict[str, Any]], directory: Path = RAW_DIR) -> Path:
    """Write the catalog as a dated JSON file and return its path."""
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    path = directory / f"catalog-{stamp}.json"
    path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def print_catalog(catalog: list[dict[str, Any]]) -> None:
    """Print a short, human-readable overview."""
    print(f"{len(catalog)} datasets found on {TOLL_CKAN_URL}\n")
    for dataset in catalog:
        formats = sorted({r["format"] for r in dataset["resources"] if r["format"]})
        print(f"- {dataset['name']}")
        print(f"    title:    {dataset['title']}")
        print(f"    formats:  {', '.join(formats) or '-'}")
        print(f"    modified: {dataset['metadata_modified']}")


def main() -> None:
    client = CkanClient(TOLL_CKAN_URL)
    catalog = build_catalog(client)
    print_catalog(catalog)
    path = save_catalog(catalog)
    print(f"\nCatalog saved to {path}")


if __name__ == "__main__":
    main()
