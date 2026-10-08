import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:5432/opspilot_test",
      JWT_SECRET: "test-secret-test-secret-test-secret-123",
      AI_PROVIDER: "mock",
    },
    // DB-backed tests share one database, so run files sequentially.
    fileParallelism: false,
  },
});
