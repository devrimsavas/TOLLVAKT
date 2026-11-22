// The countries in Tolletaten's data, for the origin country choice.
import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.js";

export interface Country {
  code: string;
  nameNb: string;
  nameEn: string;
}

// English names come from the runtime's country name data; Tolletaten only
// has Norwegian names. Tolletaten uses a few codes of its own, which the
// runtime does not know or names wrongly (XB is "Pseudo-Bidi" there).
const englishNames = new Intl.DisplayNames(["en"], { type: "region" });

const OWN_CODES: Record<string, string> = {
  XB: "Canary Islands",
  XC: "Ceuta and Melilla",
};

function englishName(code: string, fallback: string): string {
  if (OWN_CODES[code]) return OWN_CODES[code];
  try {
    const name = englishNames.of(code);
    return name && name !== code ? name : fallback;
  } catch {
    return fallback;
  }
}

export async function listCountries(): Promise<Country[]> {
  const rows = await sequelize.query<{ code: string; name_nb: string }>(
    "SELECT code, name_nb FROM countries ORDER BY name_nb",
    { type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    code: r.code,
    nameNb: r.name_nb,
    nameEn: englishName(r.code, r.name_nb),
  }));
}
