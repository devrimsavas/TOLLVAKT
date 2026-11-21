import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

// Countries, country groups (free trade agreements, restriction groups and
// so on) and which country belongs to which group when.
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.createTable("countries", {
    code: { type: DataTypes.CHAR(2), primaryKey: true },
    name_nb: { type: DataTypes.TEXT, allowNull: false },
  });

  await queryInterface.createTable("country_groups", {
    code: { type: DataTypes.STRING(20), primaryKey: true },
    name_nb: { type: DataTypes.TEXT, allowNull: false },
    preference_code: { type: DataTypes.STRING(10), allowNull: true },
    valid_from: { type: DataTypes.DATEONLY, allowNull: false },
    valid_to: { type: DataTypes.DATEONLY, allowNull: true },
  });

  await queryInterface.createTable("country_group_members", {
    country_code: {
      type: DataTypes.CHAR(2),
      allowNull: false,
      primaryKey: true,
      references: { model: "countries", key: "code" },
      onDelete: "CASCADE",
    },
    group_code: {
      type: DataTypes.STRING(20),
      allowNull: false,
      primaryKey: true,
      references: { model: "country_groups", key: "code" },
      onDelete: "CASCADE",
    },
    valid_from: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      primaryKey: true,
    },
    valid_to: { type: DataTypes.DATEONLY, allowNull: true },
  });
  await queryInterface.addIndex("country_group_members", ["group_code"]);
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.dropTable("country_group_members");
  await queryInterface.dropTable("country_groups");
  await queryInterface.dropTable("countries");
}
