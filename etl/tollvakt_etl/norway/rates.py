"""Turns the rate, fee, restriction and exchange rate files into rows."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from tollvakt_etl.parsing import clean_text, parse_date, parse_decimal

# Values from this size up are placeholders in Tolletaten's data
# (e.g. 999999,99), not real rates. They are kept, flagged and never used
# in calculations until their meaning is confirmed.
SPECIAL_VALUE_FROM = Decimal("999999")


@dataclass
class DutyRate:
    commodity_code: str
    duty_kind: str
    country_group_code: str
    measure_unit: str | None
    measure_secondary_unit: str | None
    rate_unit: str | None
    rate_unit_description: str | None
    rate_value: Decimal | None
    rate_raw: str
    is_special_value: bool
    valid_from: date
    valid_to: date | None


@dataclass
class TradeAgreementRate:
    commodity_code: str
    agreement_codes: list[str]
    value: Decimal | None
    value_type: str | None
    classifier: str


@dataclass
class Fee:
    direction: str
    commodity_code: str
    country_group_code: str
    fee_type: str
    fee_type_description: str | None
    fee_group: int | None
    fee_group_description: str | None
    rate_value: Decimal | None
    rate_raw: str
    is_ore_rate: bool
    rate_unit: str | None
    rate_unit_description: str | None
    valid_from: date
    valid_to: date | None


@dataclass
class Restriction:
    direction: str
    commodity_code: str
    country_group_code: str
    applies_to: str | None
    restriction_type: str
    restriction_type_description: str | None
    restriction_group: int | None
    restriction_group_description: str | None
    valid_from: date
    valid_to: date | None


@dataclass
class ExchangeRate:
    currency_code: str
    valid_from: date
    valid_to: date | None
    description: str | None
    rate: Decimal
    rate_raw: str
    unit: int


def _start(value: str | None, what: str) -> date:
    parsed = parse_date(value)
    if parsed is None:
        raise ValueError(f"{what}: missing start date")
    return parsed


def _value(raw: str, what: str) -> tuple[Decimal | None, bool]:
    """Parsed value and whether it is a placeholder."""
    try:
        value = parse_decimal(raw)
    except ValueError as exc:
        raise ValueError(f"{what}: {exc}") from exc
    if value is not None and value >= SPECIAL_VALUE_FROM:
        return None, True
    return value, False


def build_duty_rates(data: dict[str, Any], duty_kind: str) -> list[DutyRate]:
    rows: list[DutyRate] = []
    for item in data.get("varer") or []:
        code = item["id"]
        for agreement in item.get("avtalesatser") or []:
            group = agreement["landgruppe"]
            for rate in agreement.get("sats") or []:
                what = f"{duty_kind} {code}/{group}"
                value, special = _value(rate["satsVerdi"], what)
                rows.append(
                    DutyRate(
                        commodity_code=code,
                        duty_kind=duty_kind,
                        country_group_code=group,
                        measure_unit=clean_text(item.get("enhet")),
                        measure_secondary_unit=clean_text(item.get("annenEnhet")),
                        rate_unit=clean_text(rate.get("satsEnhet")),
                        rate_unit_description=clean_text(rate.get("satsEnhetBeskrivelse")),
                        rate_value=value,
                        rate_raw=rate["satsVerdi"],
                        is_special_value=special,
                        valid_from=_start(rate.get("fomdato"), what),
                        valid_to=parse_date(rate.get("tomdato")),
                    )
                )
    return rows


def build_trade_agreement_rates(data: dict[str, Any]) -> list[TradeAgreementRate]:
    rows: list[TradeAgreementRate] = []
    for item in data.get("commodities") or []:
        for agreement in item.get("rateTradeAgreements") or []:
            duty = agreement.get("customDuty") or {}
            value = duty.get("value")
            rows.append(
                TradeAgreementRate(
                    commodity_code=item["id"],
                    agreement_codes=list(agreement.get("landCodes") or []),
                    value=Decimal(str(value)) if value is not None else None,
                    value_type=clean_text(duty.get("type")),
                    classifier=duty["classifier"],
                )
            )
    return rows


def build_fees(data: dict[str, Any], direction: str) -> list[Fee]:
    rows: list[Fee] = []
    for item in data.get("varer") or []:
        code = item["id"]
        for group_entry in item.get("avgiftsatser") or []:
            group = group_entry["landgruppe"]
            for fee_type in group_entry.get("avgiftstyper") or []:
                for fee in fee_type.get("avgiftsgrupper") or []:
                    what = f"{direction} fee {code}/{fee_type['avgiftstype']}"
                    value, _ = _value(fee["sats"], what)
                    rows.append(
                        Fee(
                            direction=direction,
                            commodity_code=code,
                            country_group_code=group,
                            fee_type=fee_type["avgiftstype"],
                            fee_type_description=clean_text(fee_type.get("avgiftstypebeskrivelse")),
                            fee_group=fee.get("avgiftsgruppe"),
                            fee_group_description=clean_text(fee.get("avgiftsgruppebeskrivelse")),
                            rate_value=value,
                            rate_raw=fee["sats"],
                            is_ore_rate=str(fee.get("oresats")).lower() == "true",
                            rate_unit=clean_text(fee.get("enhet")),
                            rate_unit_description=clean_text(fee.get("enhetbeskrivelse")),
                            valid_from=_start(fee.get("fomdato"), what),
                            valid_to=parse_date(fee.get("tomdato")),
                        )
                    )
    return rows


def build_restrictions(data: dict[str, Any], direction: str) -> list[Restriction]:
    rows: list[Restriction] = []
    for item in data.get("varer") or []:
        code = item["id"]
        for entry in item.get("restriksjoner") or []:
            rows.append(
                Restriction(
                    direction=direction,
                    commodity_code=code,
                    country_group_code=entry["landgruppe"],
                    applies_to=clean_text(entry.get("gjelder")),
                    restriction_type=entry["restriksjontype"],
                    restriction_type_description=clean_text(entry.get("restriksjonstypebeskrivelse")),
                    restriction_group=entry.get("restriksjonsgruppe"),
                    restriction_group_description=clean_text(entry.get("restriksjonsgruppebeskrivelse")),
                    valid_from=_start(entry.get("fomdato"), f"{direction} restriction {code}"),
                    valid_to=parse_date(entry.get("tomdato")),
                )
            )
    return rows


def build_exchange_rates(data: dict[str, Any]) -> list[ExchangeRate]:
    rows: list[ExchangeRate] = []
    for item in data.get("omregningskurser") or []:
        code = item["valutakode"]
        rate = parse_decimal(item["valutakurs"])
        if rate is None:
            raise ValueError(f"exchange rate {code}: missing rate")
        rows.append(
            ExchangeRate(
                currency_code=code,
                valid_from=_start(item.get("fomdato"), f"exchange rate {code}"),
                valid_to=parse_date(item.get("tomdato")),
                description=clean_text(item.get("valutabeskrivelse")),
                rate=rate,
                rate_raw=item["valutakurs"],
                unit=int(item.get("omregningsenhet") or 1),
            )
        )
    return rows
