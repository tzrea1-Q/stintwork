import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["development"],
  },
  test: {
    // expect.poll waits for setup (child processes, git, file events) under a loaded test run.
    // Product deadlines such as the 1-second live update use explicit timers in their tests.
    expect: { poll: { timeout: 5000 } },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["packages/**/*.test.ts"],
          exclude: [...configDefaults.exclude, "packages/web/**", "packages/server/**"],
          testTimeout: 10_000,
        },
      },
      {
        extends: true,
        test: {
          // Server tests run real file watchers and git. Running their files in parallel lets
          // file-event delivery lag behind the 1-second live-update assertions, so these files
          // run one at a time.
          name: "server",
          environment: "node",
          include: ["packages/server/**/*.test.ts"],
          testTimeout: 10_000,
          fileParallelism: false,
          // Run after the other projects so wall-clock assertions don't compete with them.
          sequence: { groupOrder: 1 },
        },
      },
      "packages/web/vitest.config.ts",
    ],
  },
});
