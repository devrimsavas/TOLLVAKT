import copy

import pytest

from tests.fixtures import VALUTAKURS, VARENUMMER, write_folder
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
    assert count(db, "duty_rates") == 4
    assert count(db, "trade_agreement_rates") == 2
    assert count(db, "fees") == 2
    assert count(db, "restrictions") == 1
    assert count(db, "exchange_rates") == 2
    row = db.execute(
        "SELECT status, row_counts->>'commodities', validation_report->'warnings' FROM import_runs WHERE id = %s",
        (run_id,),
    ).fetchone()
    assert row[0] == "succeeded"
    assert row[1] == "4"
    assert len(row[2]) == 2  # code outside the tree, placeholder rate


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


def test_stores_rates_with_raw_values_and_agreement_lists(db, tmp_path):
    dataset, report = load_dataset(write_folder(tmp_path))
    import_dataset(db, dataset, report)

    assert db.execute(
        "SELECT rate_value, rate_raw, is_special_value FROM duty_rates "
        "WHERE commodity_code = '00000011'"
    ).fetchone() == (None, "999999,99", True)
    assert db.execute(
        "SELECT agreement_codes FROM trade_agreement_rates WHERE classifier = 'FREE'"
    ).fetchone() == (["EU", "TR"],)


def test_keeps_old_exchange_rate_periods(db, tmp_path):
    dataset, report = load_dataset(write_folder(tmp_path / "a"))
    import_dataset(db, dataset, report)

    later = copy.deepcopy(VALUTAKURS)
    later["omregningskurser"][0].update(
        {"valutakurs": "10,532", "fomdato": "2026-11-26", "tomdato": "2026-12-09"}
    )
    dataset, report = load_dataset(write_folder(tmp_path / "b", {"valutakurs": later}))
    assert import_dataset(db, dataset, report)[1] == "succeeded"

    periods = db.execute(
        "SELECT valid_from::text, rate::text FROM exchange_rates WHERE currency_code = 'EUR' ORDER BY valid_from"
    ).fetchall()
    assert periods == [("2026-11-12", "10.454000"), ("2026-11-26", "10.532000")]


def test_stores_search_texts_that_full_text_search_can_find(db, tmp_path):
    dataset, report = load_dataset(write_folder(tmp_path))
    import_dataset(db, dataset, report)

    # "hest" is only in the parent's text, not in the code's own text
    found = db.execute(
        "SELECT code FROM tariff_nodes WHERE node_type = 'commodity' "
        "AND search_vector_nb @@ to_tsquery('norwegian', 'hest') ORDER BY code"
    ).fetchall()
    assert found == [("01012100",), ("01012902",)]
