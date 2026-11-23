import { describe, expect, it } from "vitest";
import { calculateDuty, inSeason, toNok, MissingExchangeRateError } from "../src/services/duty/calculator.js";
import type { DutyData, DutyInput, RateRow } from "../src/services/duty/types.js";

function rate(groupCode: string, rateValue: number | null, rateUnit: string | null, extra: Partial<RateRow> = {}): RateRow {
  return {
    dutyKind: "customs",
    groupCode,
    rateUnit,
    rateValue,
    rateRaw: rateValue === null ? "999999,99" : String(rateValue).replace(".", ","),
    isSpecialValue: false,
    validFrom: "2000-01-01",
    validTo: null,
    ...extra,
  };
}

function data(overrides: Partial<DutyData> = {}): DutyData {
  return {
    commodity: {
      code: "61091000",
      descriptionNb: "av bomull",
      descriptionEn: "Of cotton",
      path: [],
      unit: "KG",
      secondaryUnit: "STK",
      validFrom: "1988-01-01",
      validTo: null,
      seasonFrom: "0101",
      seasonTo: "1231",
      classifications: [],
    },
    country: { code: "TR", name: "Tyrkia" },
    countryGroups: [{ code: "TTYR", name: "Toll fra Tyrkia", preferenceCode: "P" }],
    rates: [rate("TALL", 10.7, "P"), rate("TTYR", 0, "P")],
    fees: [
      { feeType: "MV", feeTypeDescription: "Merverdiavgift", feeGroup: 1, feeGroupDescription: "Merverdiavgift", rateValue: 25, rateUnit: "P", isOreRate: false },
    ],
    restrictions: [],
    exchangeRates: [{ currency: "EUR", rate: 10.454, unit: 1, validFrom: "2026-11-12", validTo: "2026-11-25" }],
    ...overrides,
  };
}

function input(overrides: Partial<DutyInput> = {}): DutyInput {
  return {
    commodityCode: "61091000",
    originCountry: "TR",
    date: "2026-11-21",
    value: { amount: 10000, currency: "EUR" },
    hasProofOfOrigin: false,
    ...overrides,
  };
}

describe("toNok", () => {
  it("uses the rate per unit", () => {
    expect(toNok({ amount: 1000, currency: "SEK" }, [{ currency: "SEK", rate: 93.86, unit: 100, validFrom: "x", validTo: null }])).toBeCloseTo(938.6);
    expect(toNok({ amount: 5, currency: "NOK" }, [])).toBe(5);
  });

  it("fails without a rate for the currency", () => {
    expect(() => toNok({ amount: 1, currency: "TRY" }, [])).toThrow(MissingExchangeRateError);
  });
});

describe("calculateDuty", () => {
  it("adds freight and insurance to the customs value", () => {
    const result = calculateDuty(
      input({ freight: { amount: 300, currency: "EUR" }, insurance: { amount: 1000, currency: "NOK" } }),
      data(),
    );
    expect(result.customsValueNok).toBe(108676.2);
  });

  it("applies the ordinary rate without a proof of origin and shows the saving", () => {
    const result = calculateDuty(input(), data());

    expect(result.duty.applied).toBe("ordinary");
    expect(result.duty.amountNok).toBe(11185.78);
    expect(result.duty.preferential?.group).toBe("TTYR");
    expect(result.duty.possibleSavingNok).toBe(11185.78);
    expect(result.vat.baseNok).toBe(115725.78);
    expect(result.vat.amountNok).toBe(28931.45);
    expect(result.totalNok).toBe(40117.23);
  });

  it("applies the preferential rate with a proof of origin", () => {
    const result = calculateDuty(input({ hasProofOfOrigin: true }), data());

    expect(result.duty.applied).toBe("preferential");
    expect(result.duty.amountNok).toBe(0);
    expect(result.duty.possibleSavingNok).toBeNull();
    expect(result.totalNok).toBe(26135);
  });

  it("ignores preferential rates of groups the country is not in", () => {
    const result = calculateDuty(input(), data({ rates: [rate("TALL", 10.7, "P"), rate("TEF", 0, "P")] }));

    expect(result.duty.preferential).toBeNull();
  });

  it("compares amounts, not rates, when the units differ", () => {
    const result = calculateDuty(
      input({ pieces: 1, netWeightKg: 500, hasProofOfOrigin: true }),
      data({
        countryGroups: [{ code: "TEF", name: "Toll fra EU- land", preferenceCode: "B" }],
        rates: [rate("TALL", 5000, "S"), rate("TEF", 2, "K")],
      }),
    );

    expect(result.duty.ordinary?.amountNok).toBe(5000);
    expect(result.duty.preferential?.amountNok).toBe(1000);
    expect(result.duty.amountNok).toBe(1000);
  });

  it("asks for the quantity a per-kg rate needs and leaves the total open", () => {
    const result = calculateDuty(input(), data({ rates: [rate("TALL", 12, "K")] }));

    expect(result.duty.ordinary?.amountNok).toBeNull();
    expect(result.duty.ordinary?.missing).toBe("netWeightKg");
    expect(result.totalNok).toBeNull();
    expect(result.warnings.some((w) => w.includes("netWeightKg"))).toBe(true);
    expect(result.notes).toContainEqual({
      code: "quantityMissing",
      values: expect.objectContaining({ quantity: "netWeightKg" }),
    });
  });

  it("needs no quantity for a zero rate", () => {
    const result = calculateDuty(input({ hasProofOfOrigin: true }), data({ rates: [rate("TALL", 0, "K")] }));

    expect(result.duty.amountNok).toBe(0);
  });

  it("never uses a placeholder rate", () => {
    const result = calculateDuty(
      input(),
      data({ rates: [rate("TALL", null, null, { isSpecialValue: true })] }),
    );

    expect(result.duty.amountNok).toBeNull();
    expect(result.warnings.some((w) => w.includes("placeholder"))).toBe(true);
    expect(result.notes.map((n) => n.code)).toContain("placeholderRate");
  });

  it("adds additional duty for the origin's groups", () => {
    const result = calculateDuty(
      input({ originCountry: "RU", value: { amount: 100000, currency: "NOK" } }),
      data({
        country: { code: "RU", name: "Russland" },
        countryGroups: [{ code: "TRB", name: "Toll fra Russland og Belarus", preferenceCode: "P" }],
        rates: [rate("TALL", 10, "P"), rate("TRB", 10, "P"), rate("TRB", 50, "P", { dutyKind: "additional" })],
      }),
    );

    expect(result.duty.preferential).toBeNull();
    expect(result.duty.amountNok).toBe(10000);
    expect(result.additionalDuty.map((d) => d.amountNok)).toEqual([50000]);
    expect(result.vat.baseNok).toBe(160000);
    expect(result.totalNok).toBe(100000);
  });

  it("uses the reduced VAT rate for food", () => {
    const fees = [
      { feeType: "MV", feeTypeDescription: "Merverdiavgift", feeGroup: 1, feeGroupDescription: "Merverdiavgift", rateValue: 25, rateUnit: "P", isOreRate: false },
      { feeType: "MV", feeTypeDescription: "Merverdiavgift", feeGroup: 2, feeGroupDescription: "Merverdiavgift lav sats", rateValue: 15, rateUnit: "P", isOreRate: false },
    ];
    const food = calculateDuty(input({ hasProofOfOrigin: true }), data({
      fees,
      commodity: { ...data().commodity, classifications: ["NA"] },
    }));
    const notFood = calculateDuty(input({ hasProofOfOrigin: true }), data({ fees }));

    expect(food.vat.rate).toBe(15);
    expect(notFood.vat.rate).toBe(25);
    expect(notFood.warnings.some((w) => w.includes("reduced VAT"))).toBe(true);
    expect(notFood.notes).toContainEqual({ code: "reducedVat", values: { rate: expect.any(Number) } });
  });

  it("lists other fees and restrictions for the origin, without adding them", () => {
    const result = calculateDuty(input(), data({
      fees: [
        ...data().fees,
        { feeType: "MP", feeTypeDescription: "Miljøavgift: plast", feeGroup: 1, feeGroupDescription: null, rateValue: 1.5, rateUnit: "S", isOreRate: false },
      ],
      restrictions: [
        { groupCode: "RALL", groupName: "Restriksjon fra alle land", appliesTo: "avsenderland", restrictionType: "V5", restrictionTypeDescription: "Veterinæravtalen", restrictionGroupDescription: "Varsel Mattilsynet" },
        { groupCode: "RCN", groupName: "Restriksjon fra Kina", appliesTo: "opprinnelsesland", restrictionType: "VT", restrictionTypeDescription: "Veterinæravtalen", restrictionGroupDescription: null },
      ],
    }));

    expect(result.otherFees.map((f) => f.feeType)).toEqual(["MP"]);
    expect(result.restrictions.map((r) => r.groupCode)).toEqual(["RALL"]);
    expect(result.totalNok).toBe(40117.23);
  });

  it("warns when the code is not valid on the date or out of season", () => {
    const result = calculateDuty(input(), data({
      commodity: { ...data().commodity, validTo: "2025-12-31", seasonFrom: "0501", seasonTo: "0831" },
    }));

    expect(result.warnings.some((w) => w.includes("not valid"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("seasonal"))).toBe(true);
    // Every warning has a note with the same meaning, for apps in other languages
    expect(result.notes.map((n) => n.code)).toEqual(expect.arrayContaining(["notValid", "outOfSeason"]));
    expect(result.notes).toHaveLength(result.warnings.length);
  });
});

describe("inSeason", () => {
  it("handles normal and year-crossing seasons", () => {
    expect(inSeason("2026-06-15", "0501", "0831")).toBe(true);
    expect(inSeason("2026-11-21", "0501", "0831")).toBe(false);
    expect(inSeason("2026-01-10", "1201", "0228")).toBe(true);
    expect(inSeason("2026-11-21", null, null)).toBe(true);
  });
});
