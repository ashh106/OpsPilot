import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./routes/auth.js";
import { businessRouter } from "./routes/business.js";
import { webhookRouter } from "./routes/webhook.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  // Needed so rate limiting sees the real client IP behind a host's proxy.
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(",").map((o) => o.trim()) }));

  // Capture original raw request bytes for webhook HMAC-SHA-256 signature verification
  app.use(
    express.json({
      limit: "100kb",
      verify: (req, _res, buf) => {
        (req as unknown as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  app.use("/api/health", healthRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/businesses", businessRouter);
  app.use("/api/webhook", webhookRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
