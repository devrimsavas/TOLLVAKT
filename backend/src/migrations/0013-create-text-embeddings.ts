import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

// Vectors for semantic search, from an embedding model.
//
// Vectors are kept per text, not per tree node: node ids change on every
// import, but most texts do not. The ETL embeds only texts it has no vector
// for yet, so a re-import costs nothing when the tariff is unchanged, and two
// nodes with the same text share one vector.
//
// The model is part of the key: vectors from different models cannot be
// compared, and a database may hold vectors from more than one while
// switching. The dimension is fixed by the column type; both models in use
// (embeddinggemma locally, gemini-embedding-001 in production) give 768.
export async function up({ context: queryInterface }: MigrationParams) {
  await queryInterface.sequelize.query("CREATE EXTENSION IF NOT EXISTS vector");

  // md5 of the search text, kept up to date by PostgreSQL. It links a node to
  // the vector of its text; md5 is only an index here, not a security measure.
  await queryInterface.sequelize.query(`
    ALTER TABLE tariff_nodes
      ADD COLUMN search_hash_nb char(32) GENERATED ALWAYS AS (md5(search_text_nb)) STORED,
      ADD COLUMN search_hash_en char(32) GENERATED ALWAYS AS (md5(search_text_en)) STORED
  `);
  await queryInterface.sequelize.query(
    "CREATE INDEX tariff_nodes_search_hash_nb_idx ON tariff_nodes (search_hash_nb)",
  );
  await queryInterface.sequelize.query(
    "CREATE INDEX tariff_nodes_search_hash_en_idx ON tariff_nodes (search_hash_en)",
  );

  await queryInterface.sequelize.query(`
    CREATE TABLE text_embeddings (
      model varchar(100) NOT NULL,
      text_hash char(32) NOT NULL,
      embedding vector(768) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (model, text_hash)
    )
  `);
  // Approximate nearest-neighbour index for cosine distance (the <=> operator)
  await queryInterface.sequelize.query(
    "CREATE INDEX text_embeddings_embedding_idx ON text_embeddings USING hnsw (embedding vector_cosine_ops)",
  );
}

export async function down({ context: queryInterface }: MigrationParams) {
  await queryInterface.sequelize.query("DROP TABLE text_embeddings");
  await queryInterface.sequelize.query(`
    ALTER TABLE tariff_nodes
      DROP COLUMN search_hash_nb,
      DROP COLUMN search_hash_en
  `);
  await queryInterface.sequelize.query("DROP EXTENSION IF EXISTS vector");
}
