"""Small helpers for turning Tolletaten's string values into Python values."""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation


def parse_date(value: str | None) -> date | None:
    """'2026-01-01' -> date; '' or None -> None (open-ended)."""
    if value is None or not value.strip():
        return None
    return date.fromisoformat(value.strip())


def parse_decimal(value: str | None) -> Decimal | None:
    """'24,67' -> Decimal('24.67'); '' or None -> None.

    Raises ValueError for anything that is not a number.
    """
    if value is None or not value.strip():
        return None
    text = value.strip().replace(" ", "").replace(",", ".")
    try:
        return Decimal(text)
    except InvalidOperation as exc:
        raise ValueError(f"not a number: {value!r}") from exc


def clean_text(value: str | None) -> str | None:
    """Trims whitespace; returns None for empty text."""
    if value is None:
        return None
    text = " ".join(value.split())
    return text or None
