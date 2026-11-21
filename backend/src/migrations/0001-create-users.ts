import { DataTypes, literal } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.createTable("users", {
    // Internal primary key, never exposed outside the database
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    // Public user number, used in the API and in tokens
    public_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      defaultValue: literal("gen_random_uuid()"),
    },
    first_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    last_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    password_hash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "user",
    },
    // The user's language in the web app: nb or en
    language: {
      type: DataTypes.STRING(2),
      allowNull: false,
      defaultValue: "nb",
    },
    last_login_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // When the password was last changed; sessions started before it are
    // no longer accepted
    password_changed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.dropTable("users");
}
