import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

// A text of its own for semantic search. 0013 embedded the search text: the
// path from the section down to the code. A code's own text is often short
// ("koffeinholdig", "ellers"), so the long general titles decided its vector
// and close codes could not be told apart. The embedding text has the own
// text first, then the levels above it up to the chapter (the ETL builds it).
//
// The vectors are linked through the md5 of this text now. Old vectors are
// no longer linked to any node; the ETL removes them on its next run.
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.sequelize.query(`
    ALTER TABLE tariff_nodes
      DROP COLUMN search_hash_nb,
      DROP COLUMN search_hash_en,
      ADD COLUMN embedding_text_nb text,
      ADD COLUMN embedding_text_en text,
      ADD COLUMN embedding_hash_nb char(32) GENERATED ALWAYS AS (md5(embedding_text_nb)) STORED,
      ADD COLUMN embedding_hash_en char(32) GENERATED ALWAYS AS (md5(embedding_text_en)) STORED
  `);
  await queryInterface.sequelize.query(
    "CREATE INDEX tariff_nodes_embedding_hash_nb_idx ON tariff_nodes (embedding_hash_nb)",
  );
  await queryInterface.sequelize.query(
    "CREATE INDEX tariff_nodes_embedding_hash_en_idx ON tariff_nodes (embedding_hash_en)",
  );
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.sequelize.query(`
    ALTER TABLE tariff_nodes
      DROP COLUMN embedding_hash_nb,
      DROP COLUMN embedding_hash_en,
      DROP COLUMN embedding_text_nb,
      DROP COLUMN embedding_text_en,
      ADD COLUMN search_hash_nb char(32) GENERATED ALWAYS AS (md5(search_text_nb)) STORED,
      ADD COLUMN search_hash_en char(32) GENERATED ALWAYS AS (md5(search_text_en)) STORED
  `);
  await queryInterface.sequelize.query(
    "CREATE INDEX tariff_nodes_search_hash_nb_idx ON tariff_nodes (search_hash_nb)",
  );
  await queryInterface.sequelize.query(
    "CREATE INDEX tariff_nodes_search_hash_en_idx ON tariff_nodes (search_hash_en)",
  );
}
