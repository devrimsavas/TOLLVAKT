"""Writes a validated Norwegian dataset to the database.

Everything is replaced inside one transaction: either the whole new
dataset is in place, or (on any error) the old data stays untouched.
"""

from __future__ import annotations

import json
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from tollvakt_etl.norway.dataset import NorwayDataset
from tollvakt_etl.validation import ValidationReport, check_row_counts

SOURCE = "norway"

# Tables this import owns. CASCADE also empties tables that point at them
# (e.g. duty_rates via country_groups); those are loaded in the same run.
OWNED_TABLES = (
    "tariff_node_references",
    "tariff_nodes",
    "tariff_references",
    "commodity_classifications",
    "commodities",
    "country_group_members",
    "countries",
    "country_groups",
)


def previous_row_counts(conn: psycopg.Connection) -> dict[str, int] | None:
    row = conn.execute(
        "SELECT row_counts FROM import_runs WHERE source = %s AND status = 'succeeded' "
        "ORDER BY finished_at DESC LIMIT 1",
        (SOURCE,),
    ).fetchone()
    return row[0] if row else None


def start_run(conn: psycopg.Connection, manifest: dict[str, Any] | None) -> int:
    with conn.transaction():
        row = conn.execute(
            "INSERT INTO import_runs (source, status, manifest) VALUES (%s, 'running', %s) RETURNING id",
            (SOURCE, Jsonb(manifest) if manifest is not None else None),
        ).fetchone()
    assert row is not None
    return int(row[0])


def finish_run(
    conn: psycopg.Connection,
    run_id: int,
    status: str,
    report: ValidationReport,
    row_counts: dict[str, int] | None = None,
    error: str | None = None,
) -> None:
    with conn.transaction():
        conn.execute(
            "UPDATE import_runs SET status = %s, finished_at = now(), row_counts = %s, "
            "validation_report = %s, error = %s WHERE id = %s",
            (
                status,
                Jsonb(row_counts) if row_counts is not None else None,
                Jsonb(report.as_dict()),
                error,
                run_id,
            ),
        )


def write_dataset(conn: psycopg.Connection, dataset: NorwayDataset) -> None:
    """Replaces the owned tables with the dataset. Must run in a transaction."""
    conn.execute(f"TRUNCATE {', '.join(OWNED_TABLES)} RESTART IDENTITY CASCADE")

    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO country_groups (code, name_nb, preference_code, valid_from, valid_to) "
            "VALUES (%s, %s, %s, %s, %s)",
            [(g.code, g.name_nb, g.preference_code, g.valid_from, g.valid_to) for g in dataset.country_groups],
        )
        cur.executemany(
            "INSERT INTO countries (code, name_nb) VALUES (%s, %s)",
            [(c.code, c.name_nb) for c in dataset.countries],
        )
        cur.executemany(
            "INSERT INTO country_group_members (country_code, group_code, valid_from, valid_to) "
            "VALUES (%s, %s, %s, %s)",
            [(m.country_code, m.group_code, m.valid_from, m.valid_to) for m in dataset.members],
        )
        cur.executemany(
            "INSERT INTO tariff_references (code, expression, definition_nb_html, definition_en_html) "
            "VALUES (%s, %s, %s, %s)",
            [(r.code, r.expression, r.definition_nb_html, r.definition_en_html) for r in dataset.references],
        )
        # Parents come before children in the list, so the foreign key holds
        cur.executemany(
            "INSERT INTO tariff_nodes (id, parent_id, node_type, code, hs_code, description_nb, "
            "description_en, agri_reduction, sort_order, depth, path) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            [
                (
                    n.id, n.parent_id, n.node_type, n.code, n.hs_code, n.description_nb,
                    n.description_en, n.agri_reduction, n.sort_order, n.depth, n.path,
                )
                for n in dataset.nodes
            ],
        )
        # The ids were given by the ETL, so the sequence is moved past them
        cur.execute(
            "SELECT setval(pg_get_serial_sequence('tariff_nodes', 'id'), "
            "GREATEST((SELECT max(id) FROM tariff_nodes), 1))"
        )
        cur.executemany(
            "INSERT INTO tariff_node_references (node_id, reference_code) VALUES (%s, %s)",
            dataset.node_reference_links(),
        )

        leaf_ids = {n.code: n.id for n in dataset.nodes if n.node_type == "commodity" and n.code}
        cur.executemany(
            "INSERT INTO commodities (code, node_id, unit, unit_description, secondary_unit, "
            "secondary_unit_description, valid_from, valid_to, season_from, season_to) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
            [
                (
                    c.code, leaf_ids.get(c.code), c.unit, c.unit_description, c.secondary_unit,
                    c.secondary_unit_description, c.valid_from, c.valid_to, c.season_from, c.season_to,
                )
                for c in dataset.commodities
            ],
        )
        cur.executemany(
            "INSERT INTO commodity_classifications (commodity_code, code, description, valid_from, valid_to) "
            "VALUES (%s, %s, %s, %s, %s)",
            [(c.commodity_code, c.code, c.description, c.valid_from, c.valid_to) for c in dataset.classifications],
        )


def import_dataset(
    conn: psycopg.Connection, dataset: NorwayDataset, report: ValidationReport
) -> tuple[int, str]:
    """Runs a full import and records it in import_runs.

    Returns (run id, final status). Nothing is written to the data tables
    unless validation passed and every insert succeeded.
    """
    run_id = start_run(conn, dataset.manifest)
    row_counts = dataset.row_counts()
    check_row_counts(report, row_counts, previous_row_counts(conn))

    if not report.ok:
        finish_run(conn, run_id, "failed", report, row_counts, "Validation failed")
        return run_id, "failed"

    try:
        with conn.transaction():
            write_dataset(conn, dataset)
    except Exception as exc:  # noqa: BLE001 - record any failure, old data stays
        finish_run(conn, run_id, "failed", report, row_counts, f"{type(exc).__name__}: {exc}")
        raise

    finish_run(conn, run_id, "succeeded", report, row_counts)
    return run_id, "succeeded"


def summary(row_counts: dict[str, int]) -> str:
    return json.dumps(row_counts, indent=2)
