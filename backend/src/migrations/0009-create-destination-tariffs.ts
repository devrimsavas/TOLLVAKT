import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

export const DESTINATIONS = ["EU", "UK", "US"];
export const DESTINATION_RATE_TYPES = [
  "ad_valorem",
  "specific",
  "compound",
  "free",
];

// Tariffs of export destinations (phase 2). Linked to Norwegian codes
// through the 6-digit HS code.
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.createTable("destination_tariff_lines", {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    destination: { type: DataTypes.STRING(5), allowNull: false },
    // The national code (EU, UK and US use 10 digits)
    code: { type: DataTypes.STRING(12), allowNull: false },
    hs_code: { type: DataTypes.STRING(6), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    valid_from: { type: DataTypes.DATEONLY, allowNull: false },
    valid_to: { type: DataTypes.DATEONLY, allowNull: true },
  });
  await queryInterface.addConstraint("destination_tariff_lines", {
    type: "check",
    fields: ["destination"],
    name: "destination_tariff_lines_destination_check",
    where: { destination: DESTINATIONS },
  });
  await queryInterface.addIndex("destination_tariff_lines", [
    "destination",
    "hs_code",
  ]);
  await queryInterface.addIndex("destination_tariff_lines", [
    "destination",
    "code",
  ]);

  await queryInterface.createTable("destination_duty_rates", {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    line_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      references: { model: "destination_tariff_lines", key: "id" },
      onDelete: "CASCADE",
    },
    // ERGA_OMNES, NO, or an agreement code
    origin: { type: DataTypes.STRING(30), allowNull: false },
    rate_type: { type: DataTypes.STRING(20), allowNull: false },
    ad_valorem_percent: { type: DataTypes.DECIMAL(8, 4), allowNull: true },
    specific_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    specific_currency: { type: DataTypes.CHAR(3), allowNull: true },
    specific_unit: { type: DataTypes.STRING(20), allowNull: true },
    minimum_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    maximum_amount: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    rate_raw: { type: DataTypes.TEXT, allowNull: false },
    valid_from: { type: DataTypes.DATEONLY, allowNull: false },
    valid_to: { type: DataTypes.DATEONLY, allowNull: true },
  });
  await queryInterface.addConstraint("destination_duty_rates", {
    type: "check",
    fields: ["rate_type"],
    name: "destination_duty_rates_rate_type_check",
    where: { rate_type: DESTINATION_RATE_TYPES },
  });
  await queryInterface.addIndex("destination_duty_rates", ["line_id"]);
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.dropTable("destination_duty_rates");
  await queryInterface.dropTable("destination_tariff_lines");
}
