"""Database connection for the ETL."""

from __future__ import annotations

import os

import psycopg
from dotenv import load_dotenv

from tollvakt_etl.config import ETL_ROOT


def database_url() -> str:
    load_dotenv(ETL_ROOT / ".env")
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set (etl/.env)")
    return url


def connect(url: str | None = None) -> psycopg.Connection:
    return psycopg.connect(url or database_url())
