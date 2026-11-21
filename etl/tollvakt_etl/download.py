"""Download the JSON files of the selected Norwegian datasets.

Files are saved in a dated folder together with a manifest that records
where each file came from, so every later step can be traced and re-run.

Usage (from the etl/ folder, with the venv active):

    python -m tollvakt_etl.download
"""

from __future__ import annotations

import hashlib
import json
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

from tollvakt_etl.ckan import CkanClient
from tollvakt_etl.config import NORWAY_DATASETS, NORWAY_RAW_DIR, TOLL_CKAN_URL

DOWNLOAD_TIMEOUT_SECONDS = 120
CHUNK_SIZE = 1024 * 256


@dataclass
class DownloadResult:
    dataset: str
    ok: bool
    file: str | None = None
    source_url: str | None = None
    source_last_modified: str | None = None
    size_bytes: int | None = None
    sha256: str | None = None
    error: str | None = None


def pick_json_resource(dataset: dict[str, Any]) -> dict[str, Any]:
    """Return the JSON resource of a dataset, newest first if there are several."""
    resources = [
        r
        for r in dataset.get("resources", [])
        if (r.get("format") or "").upper() == "JSON" and r.get("url")
    ]
    if not resources:
        raise ValueError("no JSON resource")

    def modified(resource: dict[str, Any]) -> str:
        return resource.get("last_modified") or resource.get("created") or ""

    return max(resources, key=modified)


def download_file(session: requests.Session, url: str, target: Path) -> tuple[int, str]:
    """Stream a file to disk. Returns (size in bytes, sha256 hex digest)."""
    digest = hashlib.sha256()
    size = 0
    temp = target.with_suffix(target.suffix + ".part")

    with session.get(url, stream=True, timeout=DOWNLOAD_TIMEOUT_SECONDS) as response:
        response.raise_for_status()
        with temp.open("wb") as handle:
            for chunk in response.iter_content(chunk_size=CHUNK_SIZE):
                if chunk:
                    handle.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)

    temp.replace(target)
    return size, digest.hexdigest()


def check_json(path: Path) -> None:
    """Raise ValueError if the file is not valid JSON."""
    with path.open("r", encoding="utf-8-sig") as handle:
        json.load(handle)


def download_dataset(client: CkanClient, name: str, folder: Path) -> DownloadResult:
    """Download one dataset's JSON file. Never raises; errors go in the result."""
    try:
        resource = pick_json_resource(client.get_dataset(name))
        target = folder / f"{name}.json"
        size, sha256 = download_file(client.session, resource["url"], target)
        check_json(target)
        return DownloadResult(
            dataset=name,
            ok=True,
            file=target.name,
            source_url=resource["url"],
            source_last_modified=resource.get("last_modified") or resource.get("created"),
            size_bytes=size,
            sha256=sha256,
        )
    except Exception as exc:  # noqa: BLE001 - report every failure, keep going
        return DownloadResult(dataset=name, ok=False, error=f"{type(exc).__name__}: {exc}")


def run(
    client: CkanClient,
    datasets: tuple[str, ...] = NORWAY_DATASETS,
    raw_dir: Path = NORWAY_RAW_DIR,
) -> tuple[Path, list[DownloadResult]]:
    """Download all datasets into raw_dir/YYYYMMDD and write a manifest."""
    started = datetime.now(timezone.utc)
    folder = raw_dir / started.strftime("%Y%m%d")
    folder.mkdir(parents=True, exist_ok=True)

    results = []
    for name in datasets:
        result = download_dataset(client, name, folder)
        status = f"{result.size_bytes:>12,} bytes" if result.ok else f"FAILED  {result.error}"
        print(f"{name:<26} {status}")
        results.append(result)

    manifest = {
        "source": client.base_url,
        "downloaded_at": started.isoformat(),
        "results": [asdict(r) for r in results],
    }
    (folder / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return folder, results


def main() -> int:
    folder, results = run(CkanClient(TOLL_CKAN_URL))
    failed = [r.dataset for r in results if not r.ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} datasets saved to {folder}")
    if failed:
        print(f"Failed: {', '.join(failed)}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
