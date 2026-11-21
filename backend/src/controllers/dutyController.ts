import type { Request, Response } from "express";
import { calculateDuty, MissingExchangeRateError } from "../services/duty/calculator.js";
import {
  loadDutyData,
  UnknownCommodityError,
  UnknownCountryError,
} from "../services/duty/dutyData.js";
import type { DutyInput, Money } from "../services/duty/types.js";

const COMMODITY_CODE = /^\d{8}$/;
const COUNTRY_CODE = /^[A-Z]{2}$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Today in Norway, as YYYY-MM-DD
export function todayInOslo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Oslo" }).format(new Date());
}

class InvalidInputError extends Error {}

function isValidDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

function readMoney(value: unknown, field: string, required: boolean): Money | undefined {
  if (value === undefined || value === null) {
    if (required) throw new InvalidInputError(`${field} is required`);
    return undefined;
  }
  const money = value as Record<string, unknown>;
  const amount = money.amount;
  const currency = typeof money.currency === "string" ? money.currency.toUpperCase() : undefined;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    throw new InvalidInputError(`${field}.amount must be a number of 0 or more`);
  }
  if (!currency || !CURRENCY_CODE.test(currency)) {
    throw new InvalidInputError(`${field}.currency must be a 3-letter currency code`);
  }
  return { amount, currency };
}

function readQuantity(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new InvalidInputError(`${field} must be a number of 0 or more`);
  }
  return value;
}

export function readDutyInput(body: unknown): DutyInput {
  const b = (body ?? {}) as Record<string, unknown>;

  const commodityCode = typeof b.commodityCode === "string" ? b.commodityCode.replace(/\./g, "") : "";
  if (!COMMODITY_CODE.test(commodityCode)) {
    throw new InvalidInputError("commodityCode must be an 8-digit commodity code (dots are allowed)");
  }
  const originCountry = typeof b.originCountry === "string" ? b.originCountry.toUpperCase() : "";
  if (!COUNTRY_CODE.test(originCountry)) {
    throw new InvalidInputError("originCountry must be a 2-letter country code");
  }
  const date = b.date === undefined ? todayInOslo() : b.date;
  if (typeof date !== "string" || !isValidDate(date)) {
    throw new InvalidInputError("date must be a valid date (YYYY-MM-DD)");
  }
  if (b.hasProofOfOrigin !== undefined && typeof b.hasProofOfOrigin !== "boolean") {
    throw new InvalidInputError("hasProofOfOrigin must be true or false");
  }

  const input: DutyInput = {
    commodityCode,
    originCountry,
    date,
    value: readMoney(b.value, "value", true)!,
    hasProofOfOrigin: b.hasProofOfOrigin === true,
  };
  const freight = readMoney(b.freight, "freight", false);
  const insurance = readMoney(b.insurance, "insurance", false);
  const netWeightKg = readQuantity(b.netWeightKg, "netWeightKg");
  const liters = readQuantity(b.liters, "liters");
  const pieces = readQuantity(b.pieces, "pieces");
  if (freight) input.freight = freight;
  if (insurance) input.insurance = insurance;
  if (netWeightKg !== undefined) input.netWeightKg = netWeightKg;
  if (liters !== undefined) input.liters = liters;
  if (pieces !== undefined) input.pieces = pieces;
  return input;
}

// POST /api/duty/calculate
export const calculate = async (req: Request, res: Response) => {
  // #swagger.tags = ["Duty"]
  /* #swagger.summary = "Customs duty and VAT for an import to Norway"
     #swagger.description = "Calculates the ordinary and the cheapest preferential customs duty, additional duty and import VAT for one commodity code and origin country, with Tolletaten's rates and exchange rates for the date. Other fees and import restrictions are listed. A suggestion, not a binding decision."
     #swagger.requestBody = {
       required: true,
       content: { "application/json": { example: {
         commodityCode: "61091000",
         originCountry: "TR",
         date: "2026-11-21",
         value: { amount: 10000, currency: "EUR" },
         freight: { amount: 300, currency: "EUR" },
         insurance: { amount: 50, currency: "EUR" },
         netWeightKg: 120,
         hasProofOfOrigin: true
       } } }
     } */
  let input: DutyInput;
  try {
    input = readDutyInput(req.body);
  } catch (error) {
    if (error instanceof InvalidInputError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  try {
    const currencies = [input.value, input.freight, input.insurance]
      .filter((m): m is Money => m !== undefined)
      .map((m) => m.currency);
    const data = await loadDutyData(input.commodityCode, input.originCountry, input.date, currencies);
    res.json(calculateDuty(input, data));
  } catch (error) {
    if (error instanceof UnknownCommodityError || error instanceof UnknownCountryError) {
      res.status(404).json({ error: error.message });
      return;
    }
    if (error instanceof MissingExchangeRateError) {
      res.status(422).json({ error: error.message });
      return;
    }
    req.log.error({ err: error }, "Request failed");
    res.status(500).json({ error: "Could not calculate the duty" });
  }
};
