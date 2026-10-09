import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["development"],
  },
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
