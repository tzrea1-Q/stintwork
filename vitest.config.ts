import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["development"],
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["packages/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "packages/web/**"],
          testTimeout: 10_000,
        },
      },
      "packages/web/vitest.config.ts",
    ],
  },
});
