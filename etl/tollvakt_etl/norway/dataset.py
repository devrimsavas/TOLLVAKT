"""Reads one download folder and turns it into validated rows."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from tollvakt_etl.norway.registry import (
    Commodity,
    CommodityClassification,
    Country,
    CountryGroup,
    CountryGroupMember,
    Reference,
    build_commodities,
    build_countries,
    build_country_groups,
    build_references,
)
from tollvakt_etl.norway.rates import (
    DutyRate,
    ExchangeRate,
    Fee,
    Restriction,
    TradeAgreementRate,
    build_duty_rates,
    build_exchange_rates,
    build_fees,
    build_restrictions,
    build_trade_agreement_rates,
)
from tollvakt_etl.norway.tree import TariffNode, TreeMismatchError, build_tree
from tollvakt_etl.validation import ValidationReport, find_duplicates, sample

REQUIRED_FILES = (
    "tolltariffstruktur",
    "customstariffstructure",
    "varenummer",
    "landgruppe",
    "medlemsland",
    "henvisning",
    "reference",
    "tollavgiftssats",
    "tilleggstollavgiftssats",
    "raavaretollavgiftssats",
    "ratetradeagreements",
    "innfoerselsavgift",
    "utfoerselsavgift",
    "innfoerselsrestriksjon",
    "utfoerselsrestriksjon",
    "valutakurs",
)

# Duty rate file -> duty_kind
DUTY_FILES = {
    "tollavgiftssats": "customs",
    "tilleggstollavgiftssats": "additional",
    "raavaretollavgiftssats": "raw_material",
}


@dataclass
class NorwayDataset:
    nodes: list[TariffNode] = field(default_factory=list)
    references: list[Reference] = field(default_factory=list)
    commodities: list[Commodity] = field(default_factory=list)
    classifications: list[CommodityClassification] = field(default_factory=list)
    countries: list[Country] = field(default_factory=list)
    country_groups: list[CountryGroup] = field(default_factory=list)
    members: list[CountryGroupMember] = field(default_factory=list)
    duty_rates: list[DutyRate] = field(default_factory=list)
    trade_agreement_rates: list[TradeAgreementRate] = field(default_factory=list)
    fees: list[Fee] = field(default_factory=list)
    restrictions: list[Restriction] = field(default_factory=list)
    exchange_rates: list[ExchangeRate] = field(default_factory=list)
    manifest: dict[str, Any] | None = None

    def node_reference_links(self) -> list[tuple[int, str]]:
        return [(node.id, code) for node in self.nodes for code in node.references]

    def row_counts(self) -> dict[str, int]:
        return {
            "tariff_nodes": len(self.nodes),
            "tariff_references": len(self.references),
            "tariff_node_references": len(self.node_reference_links()),
            "commodities": len(self.commodities),
            "commodity_classifications": len(self.classifications),
            "countries": len(self.countries),
            "country_groups": len(self.country_groups),
            "country_group_members": len(self.members),
            "duty_rates": len(self.duty_rates),
            "trade_agreement_rates": len(self.trade_agreement_rates),
            "fees": len(self.fees),
            "restrictions": len(self.restrictions),
            "exchange_rates": len(self.exchange_rates),
        }


def read_json(folder: Path, name: str) -> dict[str, Any]:
    with (folder / f"{name}.json").open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def load_dataset(folder: Path) -> tuple[NorwayDataset, ValidationReport]:
    """Transforms and validates a download folder. Never writes anything."""
    report = ValidationReport()
    dataset = NorwayDataset()

    missing = [name for name in REQUIRED_FILES if not (folder / f"{name}.json").exists()]
    if missing:
        report.error(f"Missing files in {folder}: {', '.join(missing)}")
        return dataset, report

    manifest_path = folder / "manifest.json"
    if manifest_path.exists():
        dataset.manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    try:
        dataset.nodes = build_tree(
            read_json(folder, "tolltariffstruktur"),
            read_json(folder, "customstariffstructure"),
        )
    except TreeMismatchError as exc:
        report.error(f"Tariff tree: {exc}")

    try:
        dataset.references = build_references(
            read_json(folder, "henvisning"), read_json(folder, "reference")
        )
        dataset.commodities, dataset.classifications = build_commodities(
            read_json(folder, "varenummer")
        )
        dataset.country_groups = build_country_groups(read_json(folder, "landgruppe"))
        dataset.countries, dataset.members = build_countries(read_json(folder, "medlemsland"))
        for name, kind in DUTY_FILES.items():
            dataset.duty_rates.extend(build_duty_rates(read_json(folder, name), kind))
        dataset.trade_agreement_rates = build_trade_agreement_rates(
            read_json(folder, "ratetradeagreements")
        )
        dataset.fees = build_fees(read_json(folder, "innfoerselsavgift"), "import") + build_fees(
            read_json(folder, "utfoerselsavgift"), "export"
        )
        dataset.restrictions = build_restrictions(
            read_json(folder, "innfoerselsrestriksjon"), "import"
        ) + build_restrictions(read_json(folder, "utfoerselsrestriksjon"), "export")
        dataset.exchange_rates = build_exchange_rates(read_json(folder, "valutakurs"))
    except (KeyError, ValueError) as exc:
        report.error(f"Could not read the source data: {exc!r}")
        return dataset, report

    validate(dataset, report)
    return dataset, report


def validate(dataset: NorwayDataset, report: ValidationReport) -> None:
    # Unique keys
    for what, values in (
        ("commodity codes", [c.code for c in dataset.commodities]),
        ("country codes", [c.code for c in dataset.countries]),
        ("country group codes", [g.code for g in dataset.country_groups]),
        ("reference codes", [r.code for r in dataset.references]),
        (
            "country group memberships",
            [f"{m.country_code}/{m.group_code}/{m.valid_from}" for m in dataset.members],
        ),
    ):
        duplicates = find_duplicates(values)
        if duplicates:
            report.error(f"Duplicate {what}: {sample(map(str, duplicates))}")

    # Every group a country belongs to must exist
    group_codes = {g.code for g in dataset.country_groups}
    unknown_groups = {m.group_code for m in dataset.members} - group_codes
    if unknown_groups:
        report.error(f"Countries refer to unknown country groups: {sample(unknown_groups)}")

    # Tree leaves and the commodity list should match
    tree_codes = {n.code for n in dataset.nodes if n.node_type == "commodity" and n.code}
    commodity_codes = {c.code for c in dataset.commodities}
    not_in_list = tree_codes - commodity_codes
    if not_in_list:
        report.error(f"Tree codes missing from varenummer: {sample(not_in_list)}")
    not_in_tree = commodity_codes - tree_codes
    if not_in_tree:
        report.warning(
            f"{len(not_in_tree)} codes in varenummer are not in the tariff tree: {sample(not_in_tree)}"
        )

    # Classifications must point at a known code
    orphan_classifications = {c.commodity_code for c in dataset.classifications} - commodity_codes
    if orphan_classifications:
        report.error(f"Classifications for unknown codes: {sample(orphan_classifications)}")

    # Rates must use known country groups (a foreign key); fees and
    # restrictions should too
    unknown_rate_groups = {r.country_group_code for r in dataset.duty_rates} - group_codes
    if unknown_rate_groups:
        report.error(f"Duty rates use unknown country groups: {sample(unknown_rate_groups)}")
    unknown_other_groups = (
        {f.country_group_code for f in dataset.fees}
        | {r.country_group_code for r in dataset.restrictions}
    ) - group_codes
    if unknown_other_groups:
        report.warning(
            f"Fees or restrictions use unknown country groups: {sample(unknown_other_groups)}"
        )

    # Codes in the rate files should exist in the code list
    used_codes = (
        {r.commodity_code for r in dataset.duty_rates}
        | {r.commodity_code for r in dataset.trade_agreement_rates}
        | {f.commodity_code for f in dataset.fees}
        | {r.commodity_code for r in dataset.restrictions}
    )
    unknown_codes = used_codes - commodity_codes
    if unknown_codes:
        report.warning(
            f"{len(unknown_codes)} codes in rate, fee or restriction files are not in varenummer: "
            f"{sample(unknown_codes)}"
        )

    special = [r for r in dataset.duty_rates if r.is_special_value]
    if special:
        report.warning(
            f"{len(special)} duty rates have placeholder values (e.g. 999999,99) and are not used "
            f"in calculations: {sample({r.commodity_code for r in special})}"
        )

    duplicate_rates = find_duplicates(
        (r.currency_code, r.valid_from) for r in dataset.exchange_rates
    )
    if duplicate_rates:
        report.error(f"Duplicate exchange rates: {sample(map(str, duplicate_rates))}")

    # References used in the tree should be defined; unknown ones are dropped
    reference_codes = {r.code for r in dataset.references}
    unknown_refs: set[str] = set()
    for node in dataset.nodes:
        kept = [code for code in node.references if code in reference_codes]
        unknown_refs.update(code for code in node.references if code not in reference_codes)
        node.references = kept
    if unknown_refs:
        report.warning(f"Tree refers to undefined references (left out): {sample(unknown_refs)}")
