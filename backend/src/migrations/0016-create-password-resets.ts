import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

// Password reset links, and the change that lets a member delete their
// account while today's quota counts stay right.
export async function up({ context: queryInterface }: MigrationParams) {
  const sql = (text: string) => queryInterface.sequelize.query(text);

  // Only the SHA-256 of the token in the link is stored, so a copy of the
  // database cannot be used to reset passwords. A row is deleted when the
  // link is used, and with its user.
  await sql(`
    CREATE TABLE password_reset_tokens (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      token_hash char(64) NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await sql("CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens (user_id)");

  // When a member deletes their account, their usage rows lose the user
  // (ON DELETE SET NULL) and keep nothing that points to a person, while
  // still counting towards the global limit and the statistics. A row with
  // neither a user nor a guest hash is therefore allowed now.
  await sql("ALTER TABLE usage_events DROP CONSTRAINT IF EXISTS usage_events_check");
}

export async function down({ context: queryInterface }: MigrationParams) {
  const sql = (text: string) => queryInterface.sequelize.query(text);
  await sql("DELETE FROM usage_events WHERE user_id IS NULL AND client_hash IS NULL");
  await sql(
    "ALTER TABLE usage_events ADD CONSTRAINT usage_events_check CHECK (user_id IS NOT NULL OR client_hash IS NOT NULL)",
  );
  await sql("DROP TABLE password_reset_tokens");
}
