import copy

from tests.fixtures import LANDGRUPPE, MEDLEMSLAND, VARENUMMER, write_folder
from tollvakt_etl.norway.dataset import load_dataset


def test_valid_folder_gives_rows_and_only_expected_warnings(tmp_path):
    dataset, report = load_dataset(write_folder(tmp_path))

    assert report.ok
    assert dataset.row_counts() == {
        "tariff_nodes": 10,
        "tariff_references": 3,
        "tariff_node_references": 2,
        "commodities": 4,
        "commodity_classifications": 1,
        "countries": 2,
        "country_groups": 3,
        "country_group_members": 2,
    }
    # 00000011 is in varenummer but not in the tree
    assert any("00000011" in w for w in report.warnings)


def test_joins_reference_texts_from_both_languages(tmp_path):
    dataset, _ = load_dataset(write_folder(tmp_path))
    by_code = {r.code: r for r in dataset.references}

    assert by_code["TKV 031"].definition_nb_html == "<p>Hester</p>"
    assert by_code["TKV 031"].definition_en_html == "<p>Horses</p>"
    assert by_code["EN 1"].definition_nb_html is None


def test_reports_missing_files(tmp_path):
    folder = write_folder(tmp_path)
    (folder / "landgruppe.json").unlink()

    _, report = load_dataset(folder)

    assert not report.ok
    assert "landgruppe" in report.errors[0]


def test_reports_unknown_country_groups(tmp_path):
    medlemsland = copy.deepcopy(MEDLEMSLAND)
    medlemsland["medlemsland"][0]["landgrupper"].append(
        {"landgruppekode": "NOPE", "fomdato": "2020-01-01", "tomdato": ""}
    )

    _, report = load_dataset(write_folder(tmp_path, {"medlemsland": medlemsland}))

    assert any("NOPE" in e for e in report.errors)


def test_reports_duplicate_codes(tmp_path):
    groups = copy.deepcopy(LANDGRUPPE)
    groups["landgrupper"].append(groups["landgrupper"][0])

    _, report = load_dataset(write_folder(tmp_path, {"landgruppe": groups}))

    assert any("Duplicate country group codes: TALL" in e for e in report.errors)


def test_reports_tree_codes_missing_from_the_code_list(tmp_path):
    varenummer = copy.deepcopy(VARENUMMER)
    varenummer["varenummer"] = [v for v in varenummer["varenummer"] if v["id"] != "01061100"]

    _, report = load_dataset(write_folder(tmp_path, {"varenummer": varenummer}))

    assert any("01061100" in e for e in report.errors)
