"""Shared settings for the ETL."""

from __future__ import annotations

from pathlib import Path

ETL_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ETL_ROOT / "data"
RAW_DIR = DATA_DIR / "raw"

TOLL_CKAN_URL = "https://data.toll.no"
NORWAY_RAW_DIR = RAW_DIR / "norway"

# Datasets from data.toll.no used by Tollvakt v1.
# See the catalog (python -m tollvakt_etl.catalog) for the full list.
NORWAY_DATASETS: tuple[str, ...] = (
    # Tariff tree (Norwegian and English)
    "tolltariffstruktur",
    "customstariffstructure",
    # Commodity codes and validity
    "varenummer",
    "datogyldighetforvare",
    # Duty rates
    "tollavgiftssats",
    "ratetradeagreements",
    "tilleggstollavgiftssats",
    "raavaretollavgiftssats",
    # Countries and country groups
    "landgruppe",
    "medlemsland",
    # Other fees and restrictions
    "innfoerselsavgift",
    "utfoerselsavgift",
    "innfoerselsrestriksjon",
    "utfoerselsrestriksjon",
    # References (Norwegian and English)
    "henvisning",
    "reference",
    # Exchange rates
    "valutakurs",
)
