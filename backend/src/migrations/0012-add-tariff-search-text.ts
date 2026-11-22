import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

// Full-text search over the tariff tree. A code's own text is often short
// ("av bomull"); its meaning comes from the texts above it ("T-skjorter …").
// The ETL writes the whole path into search_text_*, and a weighted search
// vector is kept up to date by PostgreSQL: the node's own text weighs most
// (A), the path less (B).
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.sequelize.query(`
    ALTER TABLE tariff_nodes
      ADD COLUMN search_text_nb text,
      ADD COLUMN search_text_en text,
      ADD COLUMN search_vector_nb tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('norwegian', coalesce(description_nb, '')), 'A') ||
        setweight(to_tsvector('norwegian', coalesce(search_text_nb, '')), 'B')
      ) STORED,
      ADD COLUMN search_vector_en tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(description_en, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(search_text_en, '')), 'B')
      ) STORED
  `);
  await queryInterface.sequelize.query(
    "CREATE INDEX tariff_nodes_search_vector_nb_idx ON tariff_nodes USING gin (search_vector_nb)",
  );
  await queryInterface.sequelize.query(
    "CREATE INDEX tariff_nodes_search_vector_en_idx ON tariff_nodes USING gin (search_vector_en)",
  );
  // Replaced by the search vectors
  await queryInterface.sequelize.query("DROP INDEX IF EXISTS tariff_nodes_description_nb_fts");
  await queryInterface.sequelize.query("DROP INDEX IF EXISTS tariff_nodes_description_en_fts");
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.sequelize.query(`
    ALTER TABLE tariff_nodes
      DROP COLUMN search_vector_nb,
      DROP COLUMN search_vector_en,
      DROP COLUMN search_text_nb,
      DROP COLUMN search_text_en
  `);
  await queryInterface.sequelize.query(
    "CREATE INDEX tariff_nodes_description_nb_fts ON tariff_nodes USING gin (to_tsvector('norwegian', coalesce(description_nb, '')))",
  );
  await queryInterface.sequelize.query(
    "CREATE INDEX tariff_nodes_description_en_fts ON tariff_nodes USING gin (to_tsvector('english', coalesce(description_en, '')))",
  );
}
