// Entry point: loads .env, connects to the database, runs migrations,
// creates the admin account if needed and starts the HTTP server.
import "dotenv/config";
import app from "./app.js";
import { sequelize } from "./config/database.js";
import { runMigrations } from "./config/migrator.js";
import { ensureAdmin } from "./config/ensureAdmin.js";
import { logger } from "./config/logger.js";
import { startRetention } from "./services/retentionService.js";

const log = logger.child({ module: "server" });

const PORT = process.env.PORT || 3000;

// A promise that failed with no one to catch it is a bug, but the app can
// go on; an exception no one caught leaves it in an unknown state, so it
// stops and the process manager (Docker) starts it again
process.on("unhandledRejection", (reason) => {
  log.error({ err: reason }, "Unhandled promise rejection");
});
process.on("uncaughtException", (error) => {
  log.fatal({ err: error }, "Uncaught exception, stopping");
  process.exit(1);
});

const startServer = async () => {
  try {
    await sequelize.authenticate();
    log.info("Database connected");
    await runMigrations();
    await ensureAdmin();
    startRetention();
    app.listen(PORT, () => {
      log.info(`listening at ${PORT}`);
    });
  } catch (error) {
    log.fatal({ err: error }, "Could not start");
    process.exit(1);
  }
};

startServer();
