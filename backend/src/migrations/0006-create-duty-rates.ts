import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

export const DUTY_KINDS = ["customs", "additional", "raw_material"];

// Customs duty, additional customs duty and raw material duty share one
// table (same source shape). trade_agreement_rates is the English snapshot
// of free trade agreement rates, used to cross-check duty_rates.
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.createTable("duty_rates", {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    // Not a foreign key: rate files may contain codes missing from
    // commodities; the ETL reports them
    commodity_code: { type: DataTypes.CHAR(8), allowNull: false },
    duty_kind: { type: DataTypes.STRING(20), allowNull: false },
    country_group_code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      references: { model: "country_groups", key: "code" },
    },
    measure_unit: { type: DataTypes.STRING(20), allowNull: true },
    measure_secondary_unit: { type: DataTypes.STRING(20), allowNull: true },
    // e.g. P (percent of value), K (per kg); null when blank in the source
    rate_unit: { type: DataTypes.STRING(10), allowNull: true },
    rate_unit_description: { type: DataTypes.TEXT, allowNull: true },
    rate_value: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    // The original value, e.g. "24,67"
    rate_raw: { type: DataTypes.STRING(30), allowNull: false },
    // Placeholder values such as 999999,99: never used in calculations
    // until their meaning is confirmed
    is_special_value: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    valid_from: { type: DataTypes.DATEONLY, allowNull: false },
    valid_to: { type: DataTypes.DATEONLY, allowNull: true },
  });
  await queryInterface.addConstraint("duty_rates", {
    type: "check",
    fields: ["duty_kind"],
    name: "duty_rates_duty_kind_check",
    where: { duty_kind: DUTY_KINDS },
  });
  await queryInterface.addIndex("duty_rates", [
    "commodity_code",
    "duty_kind",
    "country_group_code",
    "valid_from",
  ]);

  await queryInterface.createTable("trade_agreement_rates", {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    commodity_code: { type: DataTypes.CHAR(8), allowNull: false },
    // landCodes, e.g. {EU}
    agreement_codes: {
      type: DataTypes.ARRAY(DataTypes.STRING(20)),
      allowNull: false,
    },
    value: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    // e.g. "pr.item"
    value_type: { type: DataTypes.STRING(30), allowNull: true },
    // e.g. "FREE"
    classifier: { type: DataTypes.STRING(30), allowNull: false },
  });
  await queryInterface.addIndex("trade_agreement_rates", ["commodity_code"]);
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.dropTable("trade_agreement_rates");
  await queryInterface.dropTable("duty_rates");
}
