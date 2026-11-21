import copy

import pytest

from tests.fixtures import VARENUMMER, write_folder
from tollvakt_etl.norway.dataset import load_dataset
from tollvakt_etl.norway.load import import_dataset


def count(conn, table):
    return conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0]


def runs(conn):
    return conn.execute("SELECT status, error FROM import_runs ORDER BY id").fetchall()


def test_imports_everything_and_records_the_run(db, tmp_path):
    dataset, report = load_dataset(write_folder(tmp_path))

    run_id, status = import_dataset(db, dataset, report)

    assert status == "succeeded"
    assert count(db, "tariff_nodes") == 10
    assert count(db, "commodities") == 4
    assert count(db, "country_group_members") == 2
    row = db.execute(
        "SELECT status, row_counts->>'commodities', validation_report->'warnings' FROM import_runs WHERE id = %s",
        (run_id,),
    ).fetchone()
    assert row[0] == "succeeded"
    assert row[1] == "4"
    assert len(row[2]) == 1


def test_links_codes_to_their_tree_leaf(db, tmp_path):
    dataset, report = load_dataset(write_folder(tmp_path))
    import_dataset(db, dataset, report)

    leaf = db.execute(
        "SELECT n.description_nb, n.path FROM commodities c JOIN tariff_nodes n ON n.id = c.node_id WHERE c.code = '01012902'"
    ).fetchone()
    assert leaf == ("av vekt under 133 kg", "01/01/0101/01012~0/010129~1/01012902")
    # A code outside the tree is stored without a leaf
    assert db.execute("SELECT node_id FROM commodities WHERE code = '00000011'").fetchone() == (None,)


def test_a_second_import_replaces_the_data(db, tmp_path):
    for _ in range(2):
        dataset, report = load_dataset(write_folder(tmp_path))
        assert import_dataset(db, dataset, report)[1] == "succeeded"

    assert count(db, "tariff_nodes") == 10
    assert [r[0] for r in runs(db)] == ["succeeded", "succeeded"]
    # New nodes can still be inserted after the ETL set the ids itself
    db.execute("INSERT INTO tariff_nodes (node_type, sort_order, depth, path) VALUES ('section', 99, 0, 'x')")
    db.rollback()


def test_refuses_a_file_with_far_fewer_rows_and_keeps_the_old_data(db, tmp_path):
    dataset, report = load_dataset(write_folder(tmp_path / "a"))
    import_dataset(db, dataset, report)

    smaller = copy.deepcopy(VARENUMMER)
    smaller["varenummer"] = smaller["varenummer"][1:]  # drops the code outside the tree
    dataset, report = load_dataset(write_folder(tmp_path / "b", {"varenummer": smaller}))
    run_id, status = import_dataset(db, dataset, report)

    assert status == "failed"
    assert any("commodities: 3 rows, down from 4" in e for e in report.errors)
    assert count(db, "commodities") == 4
    assert runs(db)[-1] == ("failed", "Validation failed")


def test_does_not_write_when_validation_fails(db, tmp_path):
    folder = write_folder(tmp_path)
    (folder / "landgruppe.json").unlink()
    dataset, report = load_dataset(folder)

    _, status = import_dataset(db, dataset, report)

    assert status == "failed"
    assert count(db, "tariff_nodes") == 0


def test_a_failure_while_writing_rolls_back_and_is_recorded(db, tmp_path):
    dataset, report = load_dataset(write_folder(tmp_path / "a"))
    import_dataset(db, dataset, report)

    dataset, report = load_dataset(write_folder(tmp_path / "b"))
    dataset.nodes[0].node_type = "planet"  # breaks a database check
    with pytest.raises(Exception):
        import_dataset(db, dataset, report)

    assert count(db, "tariff_nodes") == 10
    status, error = runs(db)[-1]
    assert status == "failed"
    assert "tariff_nodes_node_type_check" in error
