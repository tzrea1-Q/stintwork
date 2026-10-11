// SPDX-License-Identifier: Apache-2.0
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["development"],
  },
  test: {
    reporters: ["default"],
    // expect.poll waits for setup (child processes, git, file events) under a loaded test run.
    // Product deadlines such as the 1-second live update are measured separately in their tests.
    expect: { poll: { timeout: 5000 } },
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          setupFiles: ["packages/agents/test/setup.ts"],
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
          setupFiles: ["packages/agents/test/setup.ts", "packages/server/test/setup.ts"],
          // Leave room for fixture setup and a 10-second observation deadline, not slower work.
          testTimeout: 30_000,
          expect: { poll: { timeout: 10_000 } },
          fileParallelism: false,
          // Run after the other projects so wall-clock assertions don't compete with them.
          sequence: { groupOrder: 1 },
        },
      },
      "packages/web/vitest.config.ts",
    ],
  },
});
