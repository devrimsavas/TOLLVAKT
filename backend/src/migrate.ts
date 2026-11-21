// Applies pending migrations and exits. Used where the schema is needed
// without starting the API: the ETL's CI job, and deployments.
import "dotenv/config";
import { sequelize } from "./config/database.js";
import { runMigrations } from "./config/migrator.js";
import { logger } from "./config/logger.js";

try {
  await runMigrations();
  await sequelize.close();
} catch (error) {
  logger.fatal({ err: error }, "Migrations failed");
  await sequelize.close();
  process.exit(1);
}
