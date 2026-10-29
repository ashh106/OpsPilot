import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

// Rate limiter for authentication endpoints (registration, login)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: env.NODE_ENV === "test" ? 1000 : 20, // generous in tests, strict in production
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many authentication attempts. Please try again after 15 minutes.",
    },
  },
});
