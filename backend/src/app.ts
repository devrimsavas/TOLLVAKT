// The Express application: middleware, routes and API docs.
// It does not connect to the database or listen on a port;
// that happens in server.ts, so tests can import the app safely.
import express from "express";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { logger } from "./config/logger.js";
import { requestLogger } from "./middlewares/requestLogger.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandling.js";
import { apiLimit } from "./middlewares/rateLimits.js";
import indexRouter from "./routes/index.js";
import healthRouter from "./routes/health.js";
import authRouter from "./routes/auth.js";
import dutyRouter from "./routes/duty.js";
import commoditiesRouter from "./routes/commodities.js";
import countriesRouter from "./routes/countries.js";
import classifyRouter from "./routes/classify.js";
import classificationsRouter from "./routes/classifications.js";
import usageRouter from "./routes/usage.js";
import adminRouter from "./routes/admin.js";
import tariffRouter from "./routes/tariff.js";

const app = express();

// The proxies in front of the API whose X-Forwarded-For header is trusted
// for the client's address (req.ip), which the rate limits count by. The
// default trusts this machine and private networks: the web app on the
// same machine or in the same Docker network. A request straight from the
// internet is never trusted, so it cannot pretend to be someone else.
const trustProxy =
  process.env.TRUST_PROXY ?? "loopback, linklocal, uniquelocal";
app.set(
  "trust proxy",
  /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
);

// One log line per request, with a request id sent back in X-Request-Id
app.use(requestLogger);

// Security headers. The API answers with JSON; the content security policy
// still allows what the Swagger UI at /api/docs needs.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "img-src": ["'self'", "data:"],
        // HTTPS is enforced by the HSTS header instead, so the docs also
        // work over plain http://localhost
        "upgrade-insecure-requests": null,
      },
    },
  }),
);

app.use("/api", apiLimit);
app.use(express.json());

app.use("/", indexRouter);
app.use("/api/health", healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/duty", dutyRouter);
app.use("/api/commodities", commoditiesRouter);
app.use("/api/countries", countriesRouter);
app.use("/api/classify", classifyRouter);
app.use("/api/classifications", classificationsRouter);
app.use("/api/usage", usageRouter);
app.use("/api/admin", adminRouter);
app.use("/api/tariff", tariffRouter);

const swaggerPath = path.join(process.cwd(), "swagger_output.json");

if (existsSync(swaggerPath)) {
  const swaggerDocument = JSON.parse(readFileSync(swaggerPath, "utf-8"));
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
} else {
  logger.warn(
    "swagger_output.json not found. Run 'npm run swagger' to generate API docs.",
  );
}

app.use("/api", notFoundHandler);
app.use(errorHandler);

export default app;
