"""Norway's external trade statistics from Statistics Norway (SSB).

Table 08801 has imports and exports per commodity code and country since
1988. Tollvakt uses it to find the codes that are imported most, for the
classification test set.

API: PxWebApi v2, no key needed; at most 800,000 cells per query and 30
queries a minute (https://www.ssb.no/en/api/pxwebapiv2).
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import product
from typing import Any

import requests

SSB_API_URL = "https://data.ssb.no/api/pxwebapi/v2"
TRADE_TABLE = "08801"

IMPORTS = "1"  # ImpEks: 1 = imports, 2 = exports
VALUE_NOK = "Verdi"  # ContentsCode: Verdi = value in NOK
# Confidential codes are added up and published under this code
CONFIDENTIAL_CODE = "99999999"


class SsbError(RuntimeError):
    """SSB could not be reached or gave an unexpected answer."""


@dataclass
class TradeValue:
    code: str  # 8-digit commodity code
    value_nok: float
    description_en: str  # SSB's English commodity text


def ssb_code(raw: str) -> str:
    """SSB writes codes with the year they started: '02011000_1988' -> '02011000'."""
    return raw.split("_", 1)[0]


def parse_json_stat(data: dict[str, Any]) -> list[tuple[dict[str, str], float | None]]:
    """JSON-stat 2 -> [({dimension: category code}, value)], one per cell.

    The values are a flat list in row-major order over the dimensions in "id".
    """
    try:
        ids: list[str] = data["id"]
        values: list[float | None] = data["value"]
        positions = []
        for dimension in ids:
            index: dict[str, int] = data["dimension"][dimension]["category"]["index"]
            positions.append(sorted(index, key=index.__getitem__))
    except (KeyError, TypeError) as error:
        raise SsbError(f"Unexpected answer from SSB: missing {error}") from error

    cells = []
    for flat, codes in enumerate(product(*positions)):
        cells.append((dict(zip(ids, codes, strict=True)), values[flat] if flat < len(values) else None))
    return cells


def imports_by_code(year: int, timeout: float = 120) -> list[TradeValue]:
    """Import value per commodity code for one year, all countries together.

    Leaving out the country dimension makes SSB add up all countries.
    """
    params = {
        "lang": "en",
        "valueCodes[Varekoder]": "*",
        "valueCodes[ImpEks]": IMPORTS,
        "valueCodes[ContentsCode]": VALUE_NOK,
        "valueCodes[Tid]": str(year),
    }
    try:
        response = requests.get(f"{SSB_API_URL}/tables/{TRADE_TABLE}/data", params=params, timeout=timeout)
    except requests.RequestException as error:
        raise SsbError(f"SSB could not be reached ({error.__class__.__name__})") from error
    if not response.ok:
        raise SsbError(f"SSB answered {response.status_code}: {response.text[:300]}")
    data = response.json()

    labels: dict[str, str] = data.get("dimension", {}).get("Varekoder", {}).get("category", {}).get("label", {})
    # A code can appear in several versions (with different start years);
    # their values are added up
    totals: dict[str, TradeValue] = {}
    for cell, value in parse_json_stat(data):
        raw = cell.get("Varekoder")
        if raw is None:
            raise SsbError("Unexpected answer from SSB: no Varekoder dimension")
        code = ssb_code(raw)
        if code == CONFIDENTIAL_CODE or not value:
            continue
        entry = totals.setdefault(code, TradeValue(code, 0.0, labels.get(raw, "")))
        entry.value_nok += float(value)
    return sorted(totals.values(), key=lambda t: (-t.value_nok, t.code))
