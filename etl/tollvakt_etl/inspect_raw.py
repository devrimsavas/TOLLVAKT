"""Print the structure of every downloaded JSON file.

Reads the newest download folder, infers each file's structure (keys, types,
list lengths, example values) and writes a compact report. The report is used
to design the database model from the real data instead of guessing.

Usage (from the etl/ folder, with the venv active):

    python -m tollvakt_etl.inspect_raw
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from tollvakt_etl.config import NORWAY_RAW_DIR

LIST_SAMPLE_SIZE = 200  # list items merged to infer the item structure
MAX_DEPTH = 8
MAX_EXAMPLE_LENGTH = 60


def type_name(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    if isinstance(value, float):
        return "float"
    if isinstance(value, str):
        return "str"
    if isinstance(value, list):
        return "list"
    if isinstance(value, dict):
        return "object"
    return type(value).__name__


def short(value: Any) -> str:
    text = json.dumps(value, ensure_ascii=False)
    return text if len(text) <= MAX_EXAMPLE_LENGTH else text[: MAX_EXAMPLE_LENGTH - 3] + "..."


class Node:
    """Merged structure of all values seen at one path."""

    def __init__(self) -> None:
        self.types: dict[str, int] = {}
        self.count = 0
        self.example: Any = None
        self.keys: dict[str, Node] = {}
        self.items: Node | None = None
        self.list_lengths: list[int] = []

    def add(self, value: Any, depth: int = 0) -> None:
        self.count += 1
        kind = type_name(value)
        self.types[kind] = self.types.get(kind, 0) + 1

        if depth >= MAX_DEPTH:
            return
        if isinstance(value, dict):
            for key, child in value.items():
                self.keys.setdefault(key, Node()).add(child, depth + 1)
        elif isinstance(value, list):
            self.list_lengths.append(len(value))
            if self.items is None:
                self.items = Node()
            for item in value[:LIST_SAMPLE_SIZE]:
                self.items.add(item, depth + 1)
        elif self.example is None and value not in (None, ""):
            self.example = value


def render(node: Node, name: str, lines: list[str], indent: int = 0, parent_count: int = 0) -> None:
    pad = "  " * indent
    types = "|".join(sorted(node.types))
    optional = " (optional)" if parent_count and node.count < parent_count else ""
    extra = ""
    if node.list_lengths:
        extra = f" [len {min(node.list_lengths)}..{max(node.list_lengths)}]"
    elif node.example is not None:
        extra = f"  e.g. {short(node.example)}"
    lines.append(f"{pad}{name}: {types}{optional}{extra}")

    for key, child in node.keys.items():
        render(child, key, lines, indent + 1, node.types.get("object", 0))
    if node.items is not None:
        render(node.items, "[]", lines, indent + 1)


def describe_file(path: Path) -> list[str]:
    with path.open("r", encoding="utf-8-sig") as handle:
        data = json.load(handle)
    root = Node()
    root.add(data)
    lines = [f"=== {path.name} ({path.stat().st_size:,} bytes) ==="]
    render(root, "root", lines)
    return lines


def newest_folder(raw_dir: Path = NORWAY_RAW_DIR) -> Path:
    folders = sorted(p for p in raw_dir.iterdir() if p.is_dir())
    if not folders:
        raise FileNotFoundError(f"No download folders in {raw_dir}. Run the download first.")
    return folders[-1]


def main() -> int:
    folder = newest_folder()
    report: list[str] = [f"Structure report for {folder}", ""]
    for path in sorted(folder.glob("*.json")):
        if path.name == "manifest.json":
            continue
        try:
            report.extend(describe_file(path))
        except Exception as exc:  # noqa: BLE001 - report and continue
            report.append(f"=== {path.name}: FAILED {type(exc).__name__}: {exc} ===")
        report.append("")

    text = "\n".join(report)
    out = folder / "structure.txt"
    out.write_text(text, encoding="utf-8")
    print(text)
    print(f"Report saved to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
