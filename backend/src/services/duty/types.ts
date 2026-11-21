// Types shared by the duty data layer and the calculator.

export type RateUnit = "P" | "K" | "L" | "S";

export interface Money {
  amount: number;
  currency: string;
}

export interface DutyInput {
  commodityCode: string;
  originCountry: string;
  // Day the goods are declared; decides which rates and exchange rates apply
  date: string;
  value: Money;
  freight?: Money;
  insurance?: Money;
  netWeightKg?: number;
  liters?: number;
  pieces?: number;
  // Whether the importer has a valid proof of origin for preferential duty
  hasProofOfOrigin: boolean;
}

export interface CommodityInfo {
  code: string;
  descriptionNb: string | null;
  descriptionEn: string | null;
  path: { code: string | null; descriptionNb: string | null; descriptionEn: string | null }[];
  unit: string | null;
  secondaryUnit: string | null;
  validFrom: string;
  validTo: string | null;
  seasonFrom: string | null;
  seasonTo: string | null;
  classifications: string[];
}

export interface CountryGroupInfo {
  code: string;
  name: string;
  preferenceCode: string | null;
}

export interface RateRow {
  dutyKind: "customs" | "additional" | "raw_material";
  groupCode: string;
  rateUnit: string | null;
  rateValue: number | null;
  rateRaw: string;
  isSpecialValue: boolean;
  validFrom: string;
  validTo: string | null;
}

export interface FeeRow {
  feeType: string;
  feeTypeDescription: string | null;
  feeGroup: number | null;
  feeGroupDescription: string | null;
  rateValue: number | null;
  rateUnit: string | null;
  isOreRate: boolean;
}

export interface RestrictionRow {
  groupCode: string;
  groupName: string | null;
  appliesTo: string | null;
  restrictionType: string;
  restrictionTypeDescription: string | null;
  restrictionGroupDescription: string | null;
}

export interface ExchangeRateRow {
  currency: string;
  rate: number;
  unit: number;
  validFrom: string;
  validTo: string | null;
}

// Everything the calculator needs, read from the database for one request
export interface DutyData {
  commodity: CommodityInfo;
  country: { code: string; name: string };
  // Groups the origin country belongs to on the date (not "all countries")
  countryGroups: CountryGroupInfo[];
  rates: RateRow[];
  fees: FeeRow[];
  restrictions: RestrictionRow[];
  exchangeRates: ExchangeRateRow[];
}
