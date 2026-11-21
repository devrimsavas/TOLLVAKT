"""Collects problems found in the data before anything is written.

Errors stop the import; warnings are recorded in import_runs and the
import goes on.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from typing import Iterable

# A table may not shrink more than this compared to the last good import
MAX_ROW_DROP = 0.05


@dataclass
class ValidationReport:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not self.errors

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warning(self, message: str) -> None:
        self.warnings.append(message)

    def as_dict(self) -> dict[str, list[str]]:
        return {"errors": self.errors, "warnings": self.warnings}


def sample(values: Iterable[str], limit: int = 10) -> str:
    """'a, b, c' with at most `limit` values, for readable messages."""
    items = sorted(values)
    text = ", ".join(items[:limit])
    return text + (f" (+{len(items) - limit} more)" if len(items) > limit else "")


def find_duplicates(values: Iterable[object]) -> list[object]:
    return [value for value, count in Counter(values).items() if count > 1]


def check_row_counts(
    report: ValidationReport,
    new_counts: dict[str, int],
    previous_counts: dict[str, int] | None,
) -> None:
    """Fails when a table would lose more than MAX_ROW_DROP of its rows."""
    if not previous_counts:
        return
    for table, new in new_counts.items():
        old = previous_counts.get(table)
        if old and new < old * (1 - MAX_ROW_DROP):
            report.error(
                f"{table}: {new} rows, down from {old} in the last import "
                f"(more than {MAX_ROW_DROP:.0%} fewer); the source file may be broken"
            )
