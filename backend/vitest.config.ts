import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      JWT_SECRET: "test-secret-test-secret-test-secret-123",
      AI_PROVIDER: "mock",
    },
    fileParallelism: false,
  },
});