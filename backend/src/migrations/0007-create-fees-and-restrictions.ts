import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

export const DIRECTIONS = ["import", "export"];

// Other fees (VAT, fish export fee and so on) and import/export
// restrictions (permits, notifications, bans), for both directions.
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.createTable("fees", {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    direction: { type: DataTypes.STRING(10), allowNull: false },
    commodity_code: { type: DataTypes.CHAR(8), allowNull: false },
    country_group_code: { type: DataTypes.STRING(20), allowNull: false },
    // e.g. MV (VAT), FF (fish export fee)
    fee_type: { type: DataTypes.STRING(10), allowNull: false },
    fee_type_description: { type: DataTypes.TEXT, allowNull: true },
    fee_group: { type: DataTypes.INTEGER, allowNull: true },
    fee_group_description: { type: DataTypes.TEXT, allowNull: true },
    rate_value: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    rate_raw: { type: DataTypes.STRING(30), allowNull: false },
    // oresats: the rate is in øre
    is_ore_rate: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    rate_unit: { type: DataTypes.STRING(10), allowNull: true },
    rate_unit_description: { type: DataTypes.TEXT, allowNull: true },
    valid_from: { type: DataTypes.DATEONLY, allowNull: false },
    valid_to: { type: DataTypes.DATEONLY, allowNull: true },
  });
  await queryInterface.addConstraint("fees", {
    type: "check",
    fields: ["direction"],
    name: "fees_direction_check",
    where: { direction: DIRECTIONS },
  });
  await queryInterface.addIndex("fees", [
    "commodity_code",
    "direction",
    "fee_type",
  ]);

  await queryInterface.createTable("restrictions", {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    direction: { type: DataTypes.STRING(10), allowNull: false },
    commodity_code: { type: DataTypes.CHAR(8), allowNull: false },
    country_group_code: { type: DataTypes.STRING(20), allowNull: false },
    // gjelder: e.g. "avsenderland" (import only)
    applies_to: { type: DataTypes.STRING(30), allowNull: true },
    restriction_type: { type: DataTypes.STRING(10), allowNull: false },
    restriction_type_description: { type: DataTypes.TEXT, allowNull: true },
    restriction_group: { type: DataTypes.INTEGER, allowNull: true },
    restriction_group_description: { type: DataTypes.TEXT, allowNull: true },
    valid_from: { type: DataTypes.DATEONLY, allowNull: false },
    valid_to: { type: DataTypes.DATEONLY, allowNull: true },
  });
  await queryInterface.addConstraint("restrictions", {
    type: "check",
    fields: ["direction"],
    name: "restrictions_direction_check",
    where: { direction: DIRECTIONS },
  });
  await queryInterface.addIndex("restrictions", [
    "commodity_code",
    "direction",
  ]);
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.dropTable("restrictions");
  await queryInterface.dropTable("fees");
}
