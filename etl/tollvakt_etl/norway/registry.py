"""Turns the code, country and reference files into table rows."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from tollvakt_etl.parsing import clean_text, parse_date


@dataclass
class Commodity:
    code: str
    unit: str | None
    unit_description: str | None
    secondary_unit: str | None
    secondary_unit_description: str | None
    valid_from: date
    valid_to: date | None
    season_from: str | None
    season_to: str | None


@dataclass
class CommodityClassification:
    commodity_code: str
    code: str
    description: str | None
    valid_from: date
    valid_to: date | None


@dataclass
class Country:
    code: str
    name_nb: str


@dataclass
class CountryGroup:
    code: str
    name_nb: str
    preference_code: str | None
    valid_from: date
    valid_to: date | None


@dataclass
class CountryGroupMember:
    country_code: str
    group_code: str
    valid_from: date
    valid_to: date | None


@dataclass
class Reference:
    code: str
    expression: str | None
    definition_nb_html: str | None
    definition_en_html: str | None


def _required_date(value: str | None, what: str) -> date:
    parsed = parse_date(value)
    if parsed is None:
        raise ValueError(f"{what}: missing start date")
    return parsed


def build_commodities(
    data: dict[str, Any],
) -> tuple[list[Commodity], list[CommodityClassification]]:
    commodities: list[Commodity] = []
    classifications: list[CommodityClassification] = []
    for item in data.get("varenummer") or []:
        code = item["id"]
        commodities.append(
            Commodity(
                code=code,
                unit=clean_text(item.get("enhet")),
                unit_description=clean_text(item.get("enhetBeskrivelse")),
                secondary_unit=clean_text(item.get("annenEnhet")),
                secondary_unit_description=clean_text(item.get("annenEnhetBeskrivelse")),
                valid_from=_required_date(item.get("fomdato"), f"commodity {code}"),
                valid_to=parse_date(item.get("tomdato")),
                season_from=clean_text(item.get("fomperiode")),
                season_to=clean_text(item.get("tomperiode")),
            )
        )
        for entry in item.get("klassifiseringer") or []:
            classifications.append(
                CommodityClassification(
                    commodity_code=code,
                    code=entry["kode"],
                    description=clean_text(entry.get("klassifiseringBeskrivelse")),
                    valid_from=_required_date(
                        entry.get("fomdato"), f"classification of {code}"
                    ),
                    valid_to=parse_date(entry.get("tomdato")),
                )
            )
    return commodities, classifications


def build_country_groups(data: dict[str, Any]) -> list[CountryGroup]:
    return [
        CountryGroup(
            code=item["landgruppekode"],
            name_nb=clean_text(item.get("landgruppenavn")) or item["landgruppekode"],
            preference_code=clean_text(item.get("preferansekode")),
            valid_from=_required_date(item.get("fomdato"), item["landgruppekode"]),
            valid_to=parse_date(item.get("tomdato")),
        )
        for item in data.get("landgrupper") or []
    ]


def build_countries(
    data: dict[str, Any],
) -> tuple[list[Country], list[CountryGroupMember]]:
    countries: list[Country] = []
    members: list[CountryGroupMember] = []
    for item in data.get("medlemsland") or []:
        code = item["landkode"]
        countries.append(Country(code=code, name_nb=clean_text(item.get("landnavn")) or code))
        for group in item.get("landgrupper") or []:
            members.append(
                CountryGroupMember(
                    country_code=code,
                    group_code=group["landgruppekode"],
                    valid_from=_required_date(
                        group.get("fomdato"), f"{code} in {group['landgruppekode']}"
                    ),
                    valid_to=parse_date(group.get("tomdato")),
                )
            )
    return countries, members


def build_references(nb_data: dict[str, Any], en_data: dict[str, Any]) -> list[Reference]:
    """Joins the Norwegian and English reference texts on their code."""
    english = {item["code"]: item for item in en_data.get("references") or []}
    references: dict[str, Reference] = {}
    for item in nb_data.get("henvisninger") or []:
        code = item["kode"]
        en = english.get(code, {})
        references[code] = Reference(
            code=code,
            expression=clean_text(item.get("uttrykk")) or clean_text(en.get("expression")),
            definition_nb_html=item.get("definisjon") or None,
            definition_en_html=en.get("definition") or None,
        )
    # English-only codes are kept too
    for code, en in english.items():
        if code not in references:
            references[code] = Reference(
                code=code,
                expression=clean_text(en.get("expression")),
                definition_nb_html=None,
                definition_en_html=en.get("definition") or None,
            )
    return list(references.values())
