import { DataTypes, literal } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

// One row per ETL run, so every import can be traced: where the data came
// from (manifest), how many rows were written and what validation found.
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.createTable("import_runs", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    // Which source was imported, e.g. "norway"
    source: { type: DataTypes.STRING(50), allowNull: false },
    started_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: literal("now()"),
    },
    finished_at: { type: DataTypes.DATE, allowNull: true },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "running",
    },
    // The download manifest: URLs, source dates and sha256 of each file
    manifest: { type: DataTypes.JSONB, allowNull: true },
    // Rows written per table
    row_counts: { type: DataTypes.JSONB, allowNull: true },
    // Warnings and errors from validation
    validation_report: { type: DataTypes.JSONB, allowNull: true },
    error: { type: DataTypes.TEXT, allowNull: true },
  });

  await queryInterface.addConstraint("import_runs", {
    type: "check",
    fields: ["status"],
    name: "import_runs_status_check",
    where: { status: ["running", "succeeded", "failed"] },
  });
  await queryInterface.addIndex("import_runs", ["source", "started_at"]);
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.dropTable("import_runs");
}
