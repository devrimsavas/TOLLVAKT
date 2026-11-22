"""Database tests run only when TEST_DATABASE_URL is set.

It must point at a database migrated by the backend (for example the
backend's test database, tollvakt_test). Tables are emptied before each
test, so never point it at a database with data you want to keep.
"""

from __future__ import annotations

import os

import psycopg
import pytest
from dotenv import load_dotenv

from tollvakt_etl.config import ETL_ROOT
from tollvakt_etl.norway.load import OWNED_TABLES

load_dotenv(ETL_ROOT / ".env.test")


@pytest.fixture
def db():
    url = os.environ.get("TEST_DATABASE_URL")
    if not url:
        pytest.skip("TEST_DATABASE_URL is not set")
    with psycopg.connect(url) as conn:
        conn.execute(f"TRUNCATE import_runs, exchange_rates, text_embeddings, {', '.join(OWNED_TABLES)} RESTART IDENTITY CASCADE")
        conn.commit()
        yield conn
