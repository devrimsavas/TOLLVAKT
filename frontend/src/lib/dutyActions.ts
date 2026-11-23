"use server";

import { apiFetch } from "./api";
import { text } from "./formData";
import type { DutyResult } from "./duty";

export type DutyErrorKey =
  | "countryRequired"
  | "valueInvalid"
  | "numberInvalid"
  | "noExchangeRate"
  | "unknown"
  | "unavailable";

export interface DutyState {
  result?: DutyResult;
  error?: DutyErrorKey;
  // What was typed, so the form keeps it
  values?: Record<string, string>;
}

const FIELDS = [
  "originCountry",
  "currency",
  "value",
  "freight",
  "insurance",
  "netWeightKg",
  "liters",
  "pieces",
  "hasProofOfOrigin",
];

// "1 234,50" or "1234.50" -> 1234.5; undefined when empty; NaN when not a number
function amount(value: string): number | undefined {
  const cleaned = value.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return undefined;
  const number = Number(cleaned);
  return Number.isFinite(number) && number >= 0 ? number : Number.NaN;
}

// Customs duty and VAT for one code, origin and value, from the API. All
// amounts are in the currency chosen for the value.
export async function calculateDutyAction(
  _previous: DutyState,
  formData: FormData,
): Promise<DutyState> {
  const values = Object.fromEntries(FIELDS.map((field) => [field, text(formData, field)]));
  const code = text(formData, "commodityCode");
  if (!values.originCountry) return { values, error: "countryRequired" };
  const value = amount(values.value ?? "");
  if (value === undefined || Number.isNaN(value)) return { values, error: "valueInvalid" };
  const optional = ["freight", "insurance", "netWeightKg", "liters", "pieces"].map((field) =>
    amount(values[field] ?? ""),
  );
  if (optional.some((number) => Number.isNaN(number))) return { values, error: "numberInvalid" };
  const [freight, insurance, netWeightKg, liters, pieces] = optional;
  const currency = values.currency || "NOK";

  const result = await apiFetch<DutyResult>("/api/duty/calculate", {
    method: "POST",
    body: {
      commodityCode: code,
      originCountry: values.originCountry,
      value: { amount: value, currency },
      ...(freight !== undefined ? { freight: { amount: freight, currency } } : {}),
      ...(insurance !== undefined ? { insurance: { amount: insurance, currency } } : {}),
      ...(netWeightKg !== undefined ? { netWeightKg } : {}),
      ...(liters !== undefined ? { liters } : {}),
      ...(pieces !== undefined ? { pieces } : {}),
      hasProofOfOrigin: values.hasProofOfOrigin === "on",
    },
    auth: false,
  });

  if (result.ok) return { values, result: result.data };
  if (result.status === 422) return { values, error: "noExchangeRate" };
  if (result.status === 404 || result.status === 400) return { values, error: "unknown" };
  return { values, error: "unavailable" };
}
