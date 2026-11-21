import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

// Binding tariff classification rulings (BKU). Empty until Tolletaten
// makes them available as data.
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.createTable("bku_rulings", {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    // The ruling number
    reference: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    commodity_code: { type: DataTypes.CHAR(8), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    justification: { type: DataTypes.TEXT, allowNull: true },
    decided_at: { type: DataTypes.DATEONLY, allowNull: false },
    valid_to: { type: DataTypes.DATEONLY, allowNull: true },
    source_url: { type: DataTypes.TEXT, allowNull: true },
  });
  await queryInterface.addIndex("bku_rulings", ["commodity_code"]);
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.dropTable("bku_rulings");
}
