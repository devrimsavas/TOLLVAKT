// The shapes of the API's duty calculation. No server-only imports: shown
// by client components.

export interface DutyLine {
  group: string;
  groupName: string | null;
  rate: number | null;
  rateRaw: string;
  // P: percent of the customs value; K: per kg; L: per litre; S: per piece
  rateUnit: string | null;
  amountNok: number | null;
  missing: "netWeightKg" | "liters" | "pieces" | null;
}

export type DutyNote =
  | { code: "notValid"; values: { commodityCode: string; date: string } }
  | { code: "outOfSeason"; values: { commodityCode: string; from: string; to: string; date: string } }
  | { code: "noOrdinaryRate"; values: { commodityCode: string; date: string } }
  | { code: "quantityMissing"; values: { group: string; quantity: string } }
  | { code: "placeholderRate"; values: { group: string; rate: string } }
  | { code: "rawMaterial"; values: Record<string, never> }
  | { code: "reducedVat"; values: { rate: number } }
  | { code: "otherFees"; values: Record<string, never> };

export interface DutyResult {
  date: string;
  origin: { code: string; name: string };
  exchangeRates: { currency: string; rate: number; unit: number; validFrom: string }[];
  customsValueNok: number;
  duty: {
    ordinary: DutyLine | null;
    preferential: (DutyLine & { requiresProofOfOrigin: true }) | null;
    applied: "ordinary" | "preferential" | null;
    amountNok: number | null;
    possibleSavingNok: number | null;
  };
  additionalDuty: DutyLine[];
  vat: { rate: number; reducedRateAvailable: boolean; baseNok: number | null; amountNok: number | null };
  otherFees: {
    feeType: string;
    feeTypeDescription: string | null;
    feeGroupDescription: string | null;
  }[];
  restrictions: {
    restrictionType: string;
    restrictionTypeDescription: string | null;
    restrictionGroupDescription: string | null;
    appliesTo: string | null;
  }[];
  totalNok: number | null;
  notes: DutyNote[];
}

export interface Country {
  code: string;
  nameNb: string;
  nameEn: string;
}

// The currencies offered; Tolletaten publishes rates for these and more
export const CURRENCIES = ["NOK", "EUR", "USD", "GBP", "SEK", "DKK", "CNY", "TRY", "JPY", "CHF", "PLN"];
