import copy
from decimal import Decimal

from tests.fixtures import LANDGRUPPE, MEDLEMSLAND, TOLLAVGIFTSSATS, VALUTAKURS, VARENUMMER, write_folder
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
        "duty_rates": 4,
        "trade_agreement_rates": 2,
        "fees": 2,
        "restrictions": 1,
        "exchange_rates": 2,
    }
    # 00000011 is in varenummer but not in the tree
    assert any("00000011" in w and "tariff tree" in w for w in report.warnings)


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


def test_parses_duty_rates_and_flags_placeholders(tmp_path):
    dataset, report = load_dataset(write_folder(tmp_path))
    rates = {(r.commodity_code, r.duty_kind, r.country_group_code): r for r in dataset.duty_rates}

    horse = rates[("01012100", "customs", "TALL")]
    assert horse.rate_value == Decimal("2000.00")
    assert horse.rate_unit == "S"
    assert rates[("01012100", "additional", "TEF")].rate_value == Decimal("50.00")

    placeholder = rates[("00000011", "customs", "TALL")]
    assert placeholder.is_special_value is True
    assert placeholder.rate_value is None
    assert placeholder.rate_raw == "999999,99"
    assert placeholder.rate_unit is None
    assert any("placeholder" in w for w in report.warnings)


def test_parses_fees_restrictions_and_exchange_rates(tmp_path):
    dataset, _ = load_dataset(write_folder(tmp_path))

    vat = next(f for f in dataset.fees if f.fee_type == "MV")
    assert (vat.direction, vat.rate_value, vat.is_ore_rate) == ("import", Decimal("15.00"), False)
    assert next(f for f in dataset.fees if f.fee_type == "FF").direction == "export"

    restriction = dataset.restrictions[0]
    assert (restriction.restriction_type, restriction.applies_to) == ("V5", "avsenderland")

    nok = next(r for r in dataset.exchange_rates if r.currency_code == "NOK")
    assert (nok.rate, nok.unit, nok.valid_to) == (Decimal("100.000"), 100, None)


def test_reports_duty_rates_for_unknown_country_groups(tmp_path):
    rates = copy.deepcopy(TOLLAVGIFTSSATS)
    rates["varer"][0]["avtalesatser"][0]["landgruppe"] = "NOPE"

    _, report = load_dataset(write_folder(tmp_path, {"tollavgiftssats": rates}))

    assert any("Duty rates use unknown country groups: NOPE" in e for e in report.errors)


def test_reports_rates_that_are_not_numbers(tmp_path):
    rates = copy.deepcopy(TOLLAVGIFTSSATS)
    rates["varer"][0]["avtalesatser"][0]["sats"][0]["satsVerdi"] = "gratis"

    _, report = load_dataset(write_folder(tmp_path, {"tollavgiftssats": rates}))

    assert not report.ok
    assert "not a number" in report.errors[0]


def test_reports_duplicate_exchange_rates(tmp_path):
    rates = copy.deepcopy(VALUTAKURS)
    rates["omregningskurser"].append(rates["omregningskurser"][0])

    _, report = load_dataset(write_folder(tmp_path, {"valutakurs": rates}))

    assert any("Duplicate exchange rates" in e for e in report.errors)
