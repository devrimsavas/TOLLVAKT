import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

// Tolletaten's conversion rates. Kept over time, so an old calculation can
// be repeated with the rate that applied then.
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.createTable("exchange_rates", {
    currency_code: { type: DataTypes.CHAR(3), primaryKey: true },
    valid_from: { type: DataTypes.DATEONLY, primaryKey: true },
    valid_to: { type: DataTypes.DATEONLY, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    // NOK per "unit" units of the currency
    rate: { type: DataTypes.DECIMAL(14, 6), allowNull: false },
    rate_raw: { type: DataTypes.STRING(30), allowNull: false },
    unit: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  });
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.dropTable("exchange_rates");
}
