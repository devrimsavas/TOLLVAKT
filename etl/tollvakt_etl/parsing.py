"""Small helpers for turning Tolletaten's string values into Python values."""

from __future__ import annotations

import html
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


SOFT_HYPHEN = "\u00ad"


def clean_text(value: str | None) -> str | None:
    """Plain text from Tolletaten's fields: decodes HTML entities (&#34; -> "),
    removes soft hyphens, which split words for search ("Oncor\u00adhynchus"),
    and trims whitespace. Returns None for empty text.

    Not for fields that are HTML (reference definitions), where entities
    must stay encoded."""
    if value is None:
        return None
    text = html.unescape(value).replace(SOFT_HYPHEN, "")
    text = " ".join(text.split())
    return text or None
