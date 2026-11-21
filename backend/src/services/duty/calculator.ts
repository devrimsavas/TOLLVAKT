// Calculates customs duty, additional duty and VAT for one shipment.
// Pure function: all data comes in as arguments, nothing is read here.
// Every amount is in NOK, rounded to øre only in the result.
import type {
  CountryGroupInfo,
  DutyData,
  DutyInput,
  ExchangeRateRow,
  FeeRow,
  Money,
  RateRow,
} from "./types.js";

// Groups that apply to every country; they are not listed per country
export const ALL_COUNTRIES_GROUPS = new Set(["TALL", "ALLE", "RALL", "XALL", "UALL"]);
export const ORDINARY_GROUP = "TALL";

const STANDARD_VAT_GROUP = 1;
const REDUCED_VAT_GROUP = 2;
const FOOD_CLASSIFICATION = "NA";

export class MissingExchangeRateError extends Error {}

export interface DutyLine {
  group: string;
  groupName: string | null;
  rate: number | null;
  rateRaw: string;
  rateUnit: string | null;
  // null when it cannot be calculated (missing quantity or placeholder rate)
  amountNok: number | null;
  missing: "netWeightKg" | "liters" | "pieces" | null;
}

export interface DutyResult {
  date: string;
  commodity: DutyData["commodity"];
  origin: DutyData["country"];
  exchangeRates: ExchangeRateRow[];
  customsValueNok: number;
  duty: {
    ordinary: DutyLine | null;
    preferential: (DutyLine & { requiresProofOfOrigin: true }) | null;
    applied: "ordinary" | "preferential" | null;
    amountNok: number | null;
    // What a proof of origin would save, when it is not used
    possibleSavingNok: number | null;
  };
  additionalDuty: DutyLine[];
  vat: {
    rate: number;
    reducedRateAvailable: boolean;
    baseNok: number | null;
    amountNok: number | null;
  };
  otherFees: FeeRow[];
  restrictions: DutyData["restrictions"];
  totalNok: number | null;
  warnings: string[];
}

const round = (value: number) => Math.round(value * 100) / 100;

// NOK value of an amount, with Tolletaten's conversion rate for the date
export function toNok(money: Money, exchangeRates: ExchangeRateRow[]): number {
  const currency = money.currency.toUpperCase();
  if (currency === "NOK") return money.amount;
  const rate = exchangeRates.find((r) => r.currency === currency);
  if (!rate) {
    throw new MissingExchangeRateError(
      `No exchange rate for ${currency} on this date`,
    );
  }
  return (money.amount * rate.rate) / rate.unit;
}

// The quantity a rate unit needs, or which input is missing
function quantityFor(
  unit: string | null,
  input: DutyInput,
): { quantity: number | null; missing: DutyLine["missing"] } {
  switch (unit) {
    case "K":
      return input.netWeightKg === undefined
        ? { quantity: null, missing: "netWeightKg" }
        : { quantity: input.netWeightKg, missing: null };
    case "L":
      return input.liters === undefined
        ? { quantity: null, missing: "liters" }
        : { quantity: input.liters, missing: null };
    case "S":
      return input.pieces === undefined
        ? { quantity: null, missing: "pieces" }
        : { quantity: input.pieces, missing: null };
    default:
      return { quantity: null, missing: null };
  }
}

export function dutyLine(
  rate: RateRow,
  input: DutyInput,
  customsValueNok: number,
  groupName: string | null,
): DutyLine {
  const base = {
    group: rate.groupCode,
    groupName,
    rate: rate.rateValue,
    rateRaw: rate.rateRaw,
    rateUnit: rate.rateUnit,
  };
  if (rate.isSpecialValue || rate.rateValue === null) {
    return { ...base, amountNok: null, missing: null };
  }
  // A zero rate is zero whatever the unit, so no quantity is needed
  if (rate.rateValue === 0) {
    return { ...base, amountNok: 0, missing: null };
  }
  if (rate.rateUnit === "P" || rate.rateUnit === null) {
    return {
      ...base,
      amountNok: (customsValueNok * rate.rateValue) / 100,
      missing: null,
    };
  }
  const { quantity, missing } = quantityFor(rate.rateUnit, input);
  return {
    ...base,
    amountNok: quantity === null ? null : quantity * rate.rateValue,
    missing,
  };
}

function groupName(code: string, groups: CountryGroupInfo[]): string | null {
  if (code === ORDINARY_GROUP) return "Toll fra alle land (ordinær toll)";
  return groups.find((g) => g.code === code)?.name ?? null;
}

// A rate applies to the origin if its group is "all countries" or one the
// country belongs to
function appliesToOrigin(groupCode: string, groups: CountryGroupInfo[]): boolean {
  return ALL_COUNTRIES_GROUPS.has(groupCode) || groups.some((g) => g.code === groupCode);
}

// Is the date inside a seasonal code's period (MMDD to MMDD, may wrap the year)?
export function inSeason(date: string, from: string | null, to: string | null): boolean {
  if (!from || !to) return true;
  const day = date.slice(5, 7) + date.slice(8, 10);
  return from <= to ? day >= from && day <= to : day >= from || day <= to;
}

export function calculateDuty(input: DutyInput, data: DutyData): DutyResult {
  const warnings: string[] = [];
  const { commodity, countryGroups } = data;

  if (commodity.validFrom > input.date || (commodity.validTo && commodity.validTo < input.date)) {
    warnings.push(`Commodity code ${commodity.code} is not valid on ${input.date}.`);
  }
  if (!inSeason(input.date, commodity.seasonFrom, commodity.seasonTo)) {
    warnings.push(
      `Commodity code ${commodity.code} is a seasonal code (${commodity.seasonFrom}–${commodity.seasonTo}) and does not apply on ${input.date}.`,
    );
  }

  const customsValueNok =
    toNok(input.value, data.exchangeRates) +
    (input.freight ? toNok(input.freight, data.exchangeRates) : 0) +
    (input.insurance ? toNok(input.insurance, data.exchangeRates) : 0);

  // Customs duty: the ordinary rate, and the cheapest preferential one
  const customs = data.rates.filter((r) => r.dutyKind === "customs");
  const ordinaryRate = customs.find((r) => r.groupCode === ORDINARY_GROUP) ?? null;
  const ordinary = ordinaryRate
    ? dutyLine(ordinaryRate, input, customsValueNok, groupName(ORDINARY_GROUP, countryGroups))
    : null;
  if (!ordinary) {
    warnings.push(`No ordinary customs rate found for ${commodity.code} on ${input.date}.`);
  }

  const preferentialGroups = countryGroups.filter(
    (g) => g.preferenceCode && g.preferenceCode !== "N",
  );
  const candidates = customs
    .filter((r) => preferentialGroups.some((g) => g.code === r.groupCode))
    .map((r) => dutyLine(r, input, customsValueNok, groupName(r.groupCode, countryGroups)));
  const cheapest = candidates
    .filter((c) => c.amountNok !== null)
    .sort((a, b) => (a.amountNok ?? 0) - (b.amountNok ?? 0))[0];
  const preferential =
    cheapest &&
    ordinary?.amountNok !== null &&
    ordinary?.amountNok !== undefined &&
    (cheapest.amountNok ?? 0) < ordinary.amountNok
      ? { ...cheapest, requiresProofOfOrigin: true as const }
      : null;

  for (const line of [ordinary, ...candidates]) {
    if (line?.missing) {
      warnings.push(
        `The rate for group ${line.group} is per ${unitName(line.rateUnit)}; give ${line.missing} to calculate it.`,
      );
    }
  }
  for (const rate of data.rates.filter((r) => r.isSpecialValue)) {
    warnings.push(
      `The rate ${rate.rateRaw} for group ${rate.groupCode} is a placeholder in Tolletaten's data and is not used. Check with Tolletaten.`,
    );
  }

  const usePreferential = preferential !== null && input.hasProofOfOrigin;
  const appliedLine = usePreferential ? preferential : ordinary;
  const dutyAmount = appliedLine?.amountNok ?? null;
  const possibleSavingNok =
    preferential && !input.hasProofOfOrigin && ordinary?.amountNok != null
      ? round(ordinary.amountNok - (preferential.amountNok ?? 0))
      : null;

  // Additional duty (e.g. Russia and Belarus) comes on top, with no preference
  const additionalDuty = data.rates
    .filter((r) => r.dutyKind === "additional" && appliesToOrigin(r.groupCode, countryGroups))
    .map((r) => dutyLine(r, input, customsValueNok, groupName(r.groupCode, countryGroups)));

  if (data.rates.some((r) => r.dutyKind === "raw_material")) {
    warnings.push(
      "Raw material duty (råvaretoll) may apply to this code. It is set by Landbruksdirektoratet and is not included.",
    );
  }

  // VAT: on the customs value plus all duty. The reduced rate is for food.
  const vatFees = data.fees.filter((f) => f.feeType === "MV");
  const reduced = vatFees.find((f) => f.feeGroup === REDUCED_VAT_GROUP);
  const standard = vatFees.find((f) => f.feeGroup === STANDARD_VAT_GROUP);
  const isFood = commodity.classifications.includes(FOOD_CLASSIFICATION);
  const vatRate = (isFood && reduced?.rateValue) || standard?.rateValue || 25;
  if (reduced && !isFood) {
    warnings.push(
      `A reduced VAT rate of ${reduced.rateValue} % exists for this code when the goods are food; the standard rate is used.`,
    );
  }

  const additionalAmounts = additionalDuty.map((d) => d.amountNok);
  const allDutyKnown = dutyAmount !== null && additionalAmounts.every((a) => a !== null);
  const totalDuty = allDutyKnown
    ? dutyAmount + additionalAmounts.reduce<number>((sum, a) => sum + (a ?? 0), 0)
    : null;
  const vatBase = totalDuty === null ? null : customsValueNok + totalDuty;
  const vatAmount = vatBase === null ? null : (vatBase * vatRate) / 100;

  const otherFees = data.fees.filter((f) => f.feeType !== "MV");
  if (otherFees.length > 0) {
    warnings.push(
      "Other fees (særavgifter) may apply; they depend on details of the goods and are listed but not included in the total.",
    );
  }

  const restrictions = data.restrictions.filter((r) => appliesToOrigin(r.groupCode, countryGroups));

  const roundLine = <T extends DutyLine>(line: T): T => ({
    ...line,
    amountNok: line.amountNok === null ? null : round(line.amountNok),
  });

  return {
    date: input.date,
    commodity,
    origin: data.country,
    exchangeRates: data.exchangeRates,
    customsValueNok: round(customsValueNok),
    duty: {
      ordinary: ordinary ? roundLine(ordinary) : null,
      preferential: preferential ? roundLine(preferential) : null,
      applied: appliedLine ? (usePreferential ? "preferential" : "ordinary") : null,
      amountNok: dutyAmount === null ? null : round(dutyAmount),
      possibleSavingNok,
    },
    additionalDuty: additionalDuty.map(roundLine),
    vat: {
      rate: vatRate,
      reducedRateAvailable: reduced !== undefined,
      baseNok: vatBase === null ? null : round(vatBase),
      amountNok: vatAmount === null ? null : round(vatAmount),
    },
    otherFees,
    restrictions,
    totalNok:
      totalDuty === null || vatAmount === null ? null : round(totalDuty + vatAmount),
    warnings,
  };
}

function unitName(unit: string | null): string {
  switch (unit) {
    case "K":
      return "kg";
    case "L":
      return "liter";
    case "S":
      return "piece";
    default:
      return "unit";
  }
}
