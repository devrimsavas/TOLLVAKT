import { describe, expect, it } from "vitest";
import { QueryTypes } from "sequelize";
import { sequelize } from "../src/config/database.js";
import { migrator } from "../src/config/migrator.js";

const TARIFF_TABLES = [
  "import_runs",
  "tariff_nodes",
  "tariff_references",
  "tariff_node_references",
  "tariff_notes",
  "commodities",
  "commodity_classifications",
  "countries",
  "country_groups",
  "country_group_members",
  "duty_rates",
  "trade_agreement_rates",
  "fees",
  "restrictions",
  "exchange_rates",
  "destination_tariff_lines",
  "destination_duty_rates",
  "bku_rulings",
  "text_embeddings",
];

async function tableNames(): Promise<string[]> {
  const rows = await sequelize.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    { type: QueryTypes.SELECT },
  );
  return rows.map((row) => row.tablename);
}

describe("tariff schema", () => {
  it("creates every table of the data model", async () => {
    const names = await tableNames();

    for (const table of TARIFF_TABLES) {
      expect(names).toContain(table);
    }
  });

  it("stores a tariff tree with codes, references and Norwegian full-text search", async () => {
    const [[section]] = (await sequelize.query(
      `INSERT INTO tariff_nodes (node_type, code, description_nb, description_en, sort_order, depth, path)
       VALUES ('section', '01', 'Levende dyr; animalske produkter', 'Live animals; animal products', 0, 0, '01')
       RETURNING id`,
    )) as [[{ id: number }], unknown];
    await sequelize.query(
      `INSERT INTO tariff_nodes (parent_id, node_type, code, hs_code, description_nb, sort_order, depth, path)
       VALUES (:parent, 'commodity', '01012100', '010121', 'hester til avl', 0, 1, '01/01012100')`,
      { replacements: { parent: section.id } },
    );
    await sequelize.query(
      "INSERT INTO tariff_references (code, expression) VALUES ('TKV 031', 'TKV 031')",
    );

    const found = await sequelize.query<{ code: string }>(
      `SELECT code FROM tariff_nodes
       WHERE to_tsvector('norwegian', coalesce(description_nb, '')) @@ plainto_tsquery('norwegian', 'hest')`,
      { type: QueryTypes.SELECT },
    );
    expect(found.map((row) => row.code)).toEqual(["01012100"]);
  });

  it("rejects an unknown node type", async () => {
    await expect(
      sequelize.query(
        `INSERT INTO tariff_nodes (node_type, sort_order, depth, path)
         VALUES ('planet', 0, 0, 'x')`,
      ),
    ).rejects.toThrow(/tariff_nodes_node_type_check/);
  });

  it("rejects a duty rate for a country group that does not exist", async () => {
    await expect(
      sequelize.query(
        `INSERT INTO duty_rates (commodity_code, duty_kind, country_group_code, rate_raw, valid_from)
         VALUES ('01012100', 'customs', 'NOPE', '0,00', '2026-01-01')`,
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("stores a duty rate with its raw value next to the parsed one", async () => {
    await sequelize.query(
      "INSERT INTO country_groups (code, name_nb, valid_from) VALUES ('TALL', 'Toll fra alle land', '1996-01-01')",
    );
    await sequelize.query(
      `INSERT INTO duty_rates (commodity_code, duty_kind, country_group_code, rate_unit, rate_value, rate_raw, valid_from)
       VALUES ('61091000', 'customs', 'TALL', 'P', 10.7, '10,70', '2026-01-01')`,
    );

    const [rate] = await sequelize.query<{
      rate_value: string;
      rate_raw: string;
      is_special_value: boolean;
    }>("SELECT rate_value, rate_raw, is_special_value FROM duty_rates", {
      type: QueryTypes.SELECT,
    });
    expect(rate).toEqual({
      rate_value: "10.7000",
      rate_raw: "10,70",
      is_special_value: false,
    });
  });

  it("rejects an unknown duty kind and direction", async () => {
    await sequelize.query(
      "INSERT INTO country_groups (code, name_nb, valid_from) VALUES ('TALL', 'Toll fra alle land', '1996-01-01')",
    );
    await expect(
      sequelize.query(
        `INSERT INTO duty_rates (commodity_code, duty_kind, country_group_code, rate_raw, valid_from)
         VALUES ('61091000', 'magic', 'TALL', '0,00', '2026-01-01')`,
      ),
    ).rejects.toThrow(/duty_rates_duty_kind_check/);
    await expect(
      sequelize.query(
        `INSERT INTO fees (direction, commodity_code, country_group_code, fee_type, rate_raw, valid_from)
         VALUES ('sideways', '61091000', 'ALLE', 'MV', '25,00', '2026-01-01')`,
      ),
    ).rejects.toThrow(/fees_direction_check/);
  });
});

describe("exchange rates", () => {
  it("accepts a rate without an end date", async () => {
    await sequelize.query(
      `INSERT INTO exchange_rates (currency_code, valid_from, valid_to, rate, rate_raw, unit)
       VALUES ('NOK', '1993-01-01', NULL, 100, '100,000', 100)`,
    );

    const [row] = await sequelize.query<{ valid_to: string | null }>(
      "SELECT valid_to FROM exchange_rates WHERE currency_code = 'NOK'",
      { type: QueryTypes.SELECT },
    );
    expect(row?.valid_to).toBeNull();
  });
});

describe("migrations", () => {
  it("can be rolled back and applied again", async () => {
    // "to" is the last migration undone, inclusive
    await migrator.down({ to: "0003-create-tariff-tree.js" });
    expect(await tableNames()).not.toContain("tariff_nodes");
    expect(await tableNames()).toEqual(
      expect.arrayContaining(["users", "import_runs"]),
    );

    await migrator.up();
    expect(await tableNames()).toEqual(expect.arrayContaining(TARIFF_TABLES));
  });
});
