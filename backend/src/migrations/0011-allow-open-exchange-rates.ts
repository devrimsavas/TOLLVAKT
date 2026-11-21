import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

// Some conversion rates have no end date (NOK has one fixed rate from 1993),
// so valid_to may be empty, like every other date range in the schema.
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.changeColumn("exchange_rates", "valid_to", {
    type: DataTypes.DATEONLY,
    allowNull: true,
  });
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.sequelize.query(
    "DELETE FROM exchange_rates WHERE valid_to IS NULL",
  );
  await queryInterface.changeColumn("exchange_rates", "valid_to", {
    type: DataTypes.DATEONLY,
    allowNull: false,
  });
}
