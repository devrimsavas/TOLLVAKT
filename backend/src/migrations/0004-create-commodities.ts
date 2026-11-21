import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

// Commodity codes (varenummer) with their units and validity, and their
// classifications (e.g. NA = næringsmiddel, which gets the food VAT rate).
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.createTable("commodities", {
    code: { type: DataTypes.CHAR(8), primaryKey: true },
    // The matching commodity leaf in the tariff tree
    node_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "tariff_nodes", key: "id" },
      onDelete: "SET NULL",
    },
    unit: { type: DataTypes.STRING(20), allowNull: true },
    unit_description: { type: DataTypes.TEXT, allowNull: true },
    secondary_unit: { type: DataTypes.STRING(20), allowNull: true },
    secondary_unit_description: { type: DataTypes.TEXT, allowNull: true },
    valid_from: { type: DataTypes.DATEONLY, allowNull: false },
    valid_to: { type: DataTypes.DATEONLY, allowNull: true },
    // Seasonal codes: MMDD
    season_from: { type: DataTypes.CHAR(4), allowNull: true },
    season_to: { type: DataTypes.CHAR(4), allowNull: true },
  });
  await queryInterface.addIndex("commodities", ["node_id"]);

  await queryInterface.createTable("commodity_classifications", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    commodity_code: {
      type: DataTypes.CHAR(8),
      allowNull: false,
      references: { model: "commodities", key: "code" },
      onDelete: "CASCADE",
    },
    code: { type: DataTypes.STRING(20), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    valid_from: { type: DataTypes.DATEONLY, allowNull: false },
    valid_to: { type: DataTypes.DATEONLY, allowNull: true },
  });
  await queryInterface.addIndex("commodity_classifications", [
    "commodity_code",
    "code",
  ]);
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.dropTable("commodity_classifications");
  await queryInterface.dropTable("commodities");
}
