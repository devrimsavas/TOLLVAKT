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
)


@dataclass
class NorwayDataset:
    nodes: list[TariffNode] = field(default_factory=list)
    references: list[Reference] = field(default_factory=list)
    commodities: list[Commodity] = field(default_factory=list)
    classifications: list[CommodityClassification] = field(default_factory=list)
    countries: list[Country] = field(default_factory=list)
    country_groups: list[CountryGroup] = field(default_factory=list)
    members: list[CountryGroupMember] = field(default_factory=list)
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

    # References used in the tree should be defined; unknown ones are dropped
    reference_codes = {r.code for r in dataset.references}
    unknown_refs: set[str] = set()
    for node in dataset.nodes:
        kept = [code for code in node.references if code in reference_codes]
        unknown_refs.update(code for code in node.references if code not in reference_codes)
        node.references = kept
    if unknown_refs:
        report.warning(f"Tree refers to undefined references (left out): {sample(unknown_refs)}")
