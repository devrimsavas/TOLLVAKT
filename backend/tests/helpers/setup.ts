// Runs before every test file.
import { afterAll, beforeEach } from "vitest";
import { QueryTypes } from "sequelize";
import { sequelize } from "../../src/config/database.js";
import { setLogSink } from "../../src/config/logger.js";
import { retrySettings } from "../../src/services/http.js";

// Logs are not written during tests
setLogSink(() => {});

// Retries against model providers do not wait during tests
retrySettings.sleep = async () => {};

// Every table except "migrations", where umzug records the applied
// migrations: emptying it would make the next run apply them again
async function dataTables(): Promise<string[]> {
  const rows = await sequelize.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations'",
    { type: QueryTypes.SELECT },
  );
  return rows.map((row) => `"${row.tablename}"`);
}

// Every test starts with empty tables, so tests cannot affect each other
beforeEach(async () => {
  const tables = await dataTables();
  if (tables.length > 0) {
    await sequelize.query(
      `TRUNCATE ${tables.join(", ")} RESTART IDENTITY CASCADE`,
    );
  }
});

// Close the connection pool so Vitest can exit cleanly
afterAll(async () => {
  await sequelize.close();
});
