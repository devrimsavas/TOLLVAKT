// Reads everything the duty calculator needs for one request.
import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/database.js";
import type {
  CommodityInfo,
  CountryGroupInfo,
  DutyData,
  ExchangeRateRow,
  FeeRow,
  RateRow,
  RestrictionRow,
} from "./types.js";

export class UnknownCommodityError extends Error {}
export class UnknownCountryError extends Error {}

// A row is valid on :date when the date is inside its range
const VALID_ON = (alias: string) =>
  `${alias}.valid_from <= :date AND (${alias}.valid_to IS NULL OR ${alias}.valid_to >= :date)`;

async function select<T extends object>(
  sql: string,
  replacements: Record<string, unknown>,
): Promise<T[]> {
  return sequelize.query<T>(sql, { type: QueryTypes.SELECT, replacements });
}

const num = (value: string | number | null): number | null =>
  value === null ? null : Number(value);

async function loadCommodity(code: string, date: string): Promise<CommodityInfo> {
  const [row] = await select<{
    code: string;
    node_id: number | null;
    unit: string | null;
    secondary_unit: string | null;
    valid_from: string;
    valid_to: string | null;
    season_from: string | null;
    season_to: string | null;
    description_nb: string | null;
    description_en: string | null;
    path: string | null;
  }>(
    `SELECT c.code, c.node_id, c.unit, c.secondary_unit, c.valid_from, c.valid_to,
            c.season_from, c.season_to, n.description_nb, n.description_en, n.path
       FROM commodities c
       LEFT JOIN tariff_nodes n ON n.id = c.node_id
      WHERE c.code = :code`,
    { code },
  );
  if (!row) throw new UnknownCommodityError(`Unknown commodity code ${code}`);

  // The texts above the code in the tree, e.g. "hester:" > "andre:", which
  // give short texts like "andre" their meaning
  const path = row.node_id
    ? await select<{ code: string | null; description_nb: string | null; description_en: string | null }>(
        `WITH RECURSIVE up AS (
           SELECT id, parent_id, code, description_nb, description_en, depth
             FROM tariff_nodes WHERE id = :id
           UNION ALL
           SELECT n.id, n.parent_id, n.code, n.description_nb, n.description_en, n.depth
             FROM tariff_nodes n JOIN up ON n.id = up.parent_id
         )
         SELECT code, description_nb, description_en FROM up WHERE id <> :id ORDER BY depth`,
        { id: row.node_id },
      )
    : [];

  const classifications = await select<{ code: string }>(
    `SELECT code FROM commodity_classifications cc
      WHERE cc.commodity_code = :code AND ${VALID_ON("cc")}`,
    { code, date },
  );

  return {
    code: row.code,
    descriptionNb: row.description_nb,
    descriptionEn: row.description_en,
    path: path.map((p) => ({
      code: p.code,
      descriptionNb: p.description_nb,
      descriptionEn: p.description_en,
    })),
    unit: row.unit,
    secondaryUnit: row.secondary_unit,
    validFrom: row.valid_from,
    validTo: row.valid_to,
    seasonFrom: row.season_from,
    seasonTo: row.season_to,
    classifications: classifications.map((c) => c.code),
  };
}

export async function loadDutyData(
  commodityCode: string,
  originCountry: string,
  date: string,
  currencies: string[],
): Promise<DutyData> {
  const commodity = await loadCommodity(commodityCode, date);

  const [country] = await select<{ code: string; name_nb: string }>(
    "SELECT code, name_nb FROM countries WHERE code = :code",
    { code: originCountry },
  );
  if (!country) throw new UnknownCountryError(`Unknown country code ${originCountry}`);

  const groups = await select<{ code: string; name_nb: string; preference_code: string | null }>(
    `SELECT g.code, g.name_nb, g.preference_code
       FROM country_group_members m
       JOIN country_groups g ON g.code = m.group_code
      WHERE m.country_code = :country AND ${VALID_ON("m")} AND ${VALID_ON("g")}
      ORDER BY g.code`,
    { country: originCountry, date },
  );

  const rates = await select<{
    duty_kind: RateRow["dutyKind"];
    country_group_code: string;
    rate_unit: string | null;
    rate_value: string | null;
    rate_raw: string;
    is_special_value: boolean;
    valid_from: string;
    valid_to: string | null;
  }>(
    `SELECT duty_kind, country_group_code, rate_unit, rate_value, rate_raw,
            is_special_value, valid_from, valid_to
       FROM duty_rates d
      WHERE d.commodity_code = :code AND ${VALID_ON("d")}`,
    { code: commodityCode, date },
  );

  const fees = await select<{
    fee_type: string;
    fee_type_description: string | null;
    fee_group: number | null;
    fee_group_description: string | null;
    rate_value: string | null;
    rate_unit: string | null;
    is_ore_rate: boolean;
  }>(
    `SELECT fee_type, fee_type_description, fee_group, fee_group_description,
            rate_value, rate_unit, is_ore_rate
       FROM fees f
      WHERE f.commodity_code = :code AND f.direction = 'import' AND ${VALID_ON("f")}
      ORDER BY fee_type, fee_group`,
    { code: commodityCode, date },
  );

  const restrictions = await select<{
    country_group_code: string;
    group_name: string | null;
    applies_to: string | null;
    restriction_type: string;
    restriction_type_description: string | null;
    restriction_group_description: string | null;
  }>(
    `SELECT r.country_group_code, g.name_nb AS group_name, r.applies_to, r.restriction_type,
            r.restriction_type_description, r.restriction_group_description
       FROM restrictions r
       LEFT JOIN country_groups g ON g.code = r.country_group_code
      WHERE r.commodity_code = :code AND r.direction = 'import' AND ${VALID_ON("r")}
      ORDER BY r.restriction_type`,
    { code: commodityCode, date },
  );

  const wanted = currencies.map((c) => c.toUpperCase()).filter((c) => c !== "NOK");
  const exchangeRates = wanted.length
    ? await select<{
        currency_code: string;
        rate: string;
        unit: number;
        valid_from: string;
        valid_to: string | null;
      }>(
        `SELECT currency_code, rate, unit, valid_from, valid_to
           FROM exchange_rates e
          WHERE e.currency_code IN (:currencies) AND ${VALID_ON("e")}`,
        { currencies: wanted, date },
      )
    : [];

  const toGroup = (g: (typeof groups)[number]): CountryGroupInfo => ({
    code: g.code,
    name: g.name_nb,
    preferenceCode: g.preference_code,
  });

  return {
    commodity,
    country: { code: country.code, name: country.name_nb },
    countryGroups: groups.map(toGroup),
    rates: rates.map(
      (r): RateRow => ({
        dutyKind: r.duty_kind,
        groupCode: r.country_group_code,
        rateUnit: r.rate_unit,
        rateValue: num(r.rate_value),
        rateRaw: r.rate_raw,
        isSpecialValue: r.is_special_value,
        validFrom: r.valid_from,
        validTo: r.valid_to,
      }),
    ),
    fees: fees.map(
      (f): FeeRow => ({
        feeType: f.fee_type,
        feeTypeDescription: f.fee_type_description,
        feeGroup: f.fee_group,
        feeGroupDescription: f.fee_group_description,
        rateValue: num(f.rate_value),
        rateUnit: f.rate_unit,
        isOreRate: f.is_ore_rate,
      }),
    ),
    restrictions: restrictions.map(
      (r): RestrictionRow => ({
        groupCode: r.country_group_code,
        groupName: r.group_name,
        appliesTo: r.applies_to,
        restrictionType: r.restriction_type,
        restrictionTypeDescription: r.restriction_type_description,
        restrictionGroupDescription: r.restriction_group_description,
      }),
    ),
    exchangeRates: exchangeRates.map(
      (e): ExchangeRateRow => ({
        currency: e.currency_code,
        rate: Number(e.rate),
        unit: e.unit,
        validFrom: e.valid_from,
        validTo: e.valid_to,
      }),
    ),
  };
}
