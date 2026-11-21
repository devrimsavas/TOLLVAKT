import { defineConfig } from "vitest/config";
import { config } from "dotenv";

// Tests use their own database and settings from .env.test,
// never the development database in .env
const testEnv = config({ path: ".env.test", quiet: true }).parsed ?? {};

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The rate limit is set out of reach, so tests can call the API freely
    env: {
      ...testEnv,
      REQUESTS_PER_ADDRESS: "1000000",
    },
    globalSetup: ["tests/helpers/globalSetup.ts"],
    setupFiles: ["tests/helpers/setup.ts"],
    // All test files share one database, so they must not run at the same time
    fileParallelism: false,
  },
});
