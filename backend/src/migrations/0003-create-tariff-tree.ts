import { DataTypes } from "sequelize";
import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

export const NODE_TYPES = [
  "section",
  "chapter",
  "subchapter",
  "heading",
  "subheading",
  "group",
  "commodity",
];

export const NOTE_KINDS = [
  "general_rule",
  "section_note",
  "chapter_note",
  "subheading_note",
  "additional_note",
];

// The customs tariff as a tree (Norwegian and English text in one row),
// the reference codes used in it, and the legal notes (filled later from
// the tariff PDF; they are not in the open data).
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.createTable("tariff_nodes", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    parent_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "tariff_nodes", key: "id" },
      onDelete: "CASCADE",
    },
    node_type: { type: DataTypes.STRING(20), allowNull: false },
    // Section "01", chapter "01", heading "0101", commodity "01012100";
    // null for unnumbered groups such as "andre:"
    code: { type: DataTypes.STRING(8), allowNull: true },
    hs_code: { type: DataTypes.STRING(6), allowNull: true },
    description_nb: { type: DataTypes.TEXT, allowNull: true },
    description_en: { type: DataTypes.TEXT, allowNull: true },
    // blv / pap: raw material duty may be set by Landbruksdirektoratet
    agri_reduction: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    sort_order: { type: DataTypes.INTEGER, allowNull: false },
    depth: { type: DataTypes.INTEGER, allowNull: false },
    // e.g. "01/01/0101/01012/01012100", for subtree queries
    path: { type: DataTypes.TEXT, allowNull: false },
  });

  await queryInterface.addConstraint("tariff_nodes", {
    type: "check",
    fields: ["node_type"],
    name: "tariff_nodes_node_type_check",
    where: { node_type: NODE_TYPES },
  });
  await queryInterface.addIndex("tariff_nodes", ["code"]);
  await queryInterface.addIndex("tariff_nodes", ["hs_code"]);
  await queryInterface.addIndex("tariff_nodes", ["parent_id", "sort_order"]);
  await queryInterface.sequelize.query(
    "CREATE INDEX tariff_nodes_path_idx ON tariff_nodes (path text_pattern_ops)",
  );
  // Full-text search in both languages
  await queryInterface.sequelize.query(
    "CREATE INDEX tariff_nodes_description_nb_fts ON tariff_nodes USING gin (to_tsvector('norwegian', coalesce(description_nb, '')))",
  );
  await queryInterface.sequelize.query(
    "CREATE INDEX tariff_nodes_description_en_fts ON tariff_nodes USING gin (to_tsvector('english', coalesce(description_en, '')))",
  );

  // "references" is a reserved word in SQL, so the table has a prefix
  await queryInterface.createTable("tariff_references", {
    code: { type: DataTypes.STRING(50), primaryKey: true },
    expression: { type: DataTypes.TEXT, allowNull: true },
    definition_nb_html: { type: DataTypes.TEXT, allowNull: true },
    definition_en_html: { type: DataTypes.TEXT, allowNull: true },
  });

  await queryInterface.createTable("tariff_node_references", {
    node_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: { model: "tariff_nodes", key: "id" },
      onDelete: "CASCADE",
    },
    reference_code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      primaryKey: true,
      references: { model: "tariff_references", key: "code" },
      onDelete: "CASCADE",
    },
  });
  await queryInterface.addIndex("tariff_node_references", ["reference_code"]);

  await queryInterface.createTable("tariff_notes", {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    // Null for the general interpretation rules
    node_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "tariff_nodes", key: "id" },
      onDelete: "CASCADE",
    },
    note_kind: { type: DataTypes.STRING(20), allowNull: false },
    note_number: { type: DataTypes.STRING(20), allowNull: true },
    text_nb: { type: DataTypes.TEXT, allowNull: false },
    text_en: { type: DataTypes.TEXT, allowNull: true },
    tariff_year: { type: DataTypes.INTEGER, allowNull: false },
    // Document and page the note was taken from
    source: { type: DataTypes.TEXT, allowNull: true },
  });
  await queryInterface.addConstraint("tariff_notes", {
    type: "check",
    fields: ["note_kind"],
    name: "tariff_notes_note_kind_check",
    where: { note_kind: NOTE_KINDS },
  });
  await queryInterface.addIndex("tariff_notes", ["node_id"]);
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.dropTable("tariff_notes");
  await queryInterface.dropTable("tariff_node_references");
  await queryInterface.dropTable("tariff_references");
  await queryInterface.dropTable("tariff_nodes");
}
