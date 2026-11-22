import type { QueryInterface } from "sequelize";

type MigrationParams = { context: QueryInterface };

// Daily quotas for the calls that cost money (the language and embedding
// models), the classifications members keep, and what admins need to
// manage both.
export async function up({ context: queryInterface }: MigrationParams) {
  const sql = (text: string) => queryInterface.sequelize.query(text);

  // daily_limit: this user's classifications and model-backed searches per
  // day; empty means the default (USER_DAILY_LIMIT). is_active: an admin can
  // close an account without deleting its data.
  await sql(`
    ALTER TABLE users
      ADD COLUMN daily_limit integer CHECK (daily_limit >= 0),
      ADD COLUMN is_active boolean NOT NULL DEFAULT true
  `);

  // One row per call that uses a model. Quotas count today's rows; the admin
  // statistics read the older ones. A guest is known only by client_hash, a
  // keyed hash of the IP address: the address itself is never stored.
  await sql(`
    CREATE TABLE usage_events (
      id bigserial PRIMARY KEY,
      user_id integer REFERENCES users (id) ON DELETE SET NULL,
      client_hash char(64),
      kind varchar(20) NOT NULL CHECK (kind IN ('classify', 'search')),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (user_id IS NOT NULL OR client_hash IS NOT NULL)
    )
  `);
  await sql("CREATE INDEX usage_events_created_at_idx ON usage_events (created_at)");
  await sql("CREATE INDEX usage_events_user_idx ON usage_events (user_id, created_at)");
  await sql("CREATE INDEX usage_events_client_idx ON usage_events (client_hash, created_at)");

  // A member's classifications, saved as they were answered: the tariff and
  // the model change, but the member can always see and print what they got.
  await sql(`
    CREATE TABLE classifications (
      id serial PRIMARY KEY,
      public_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      description text NOT NULL,
      lang varchar(2) NOT NULL CHECK (lang IN ('nb', 'en')),
      model varchar(100) NOT NULL,
      rewritten jsonb,
      suggestions jsonb NOT NULL,
      missing_information jsonb NOT NULL,
      candidates jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await sql("CREATE INDEX classifications_user_idx ON classifications (user_id, created_at DESC)");
}

export async function down({ context: queryInterface }: MigrationParams) {
  const sql = (text: string) => queryInterface.sequelize.query(text);
  await sql("DROP TABLE classifications");
  await sql("DROP TABLE usage_events");
  await sql("ALTER TABLE users DROP COLUMN is_active, DROP COLUMN daily_limit");
}
