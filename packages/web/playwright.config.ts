// SPDX-License-Identifier: Apache-2.0
import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { sourceNodeArgs } from "../agents/src/source-node-args";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4178);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  outputDir: "./coverage/e2e/test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "coverage/e2e/report" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    channel: process.env.CI ? undefined : (process.env.PLAYWRIGHT_CHROME_CHANNEL ?? "chrome"),
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: ["project", "github-project"].map((fixture, index) => ({
    command: [
      process.execPath,
      ...sourceNodeArgs(fileURLToPath(new URL("./e2e/server.ts", import.meta.url))),
    ]
      .map((argument) => JSON.stringify(argument))
      .join(" "),
    url: `http://127.0.0.1:${port + index}/api/health`,
    env: {
      PLAYWRIGHT_PORT: String(port + index),
      PLAYWRIGHT_FIXTURE: fixture,
      STINTWORK_SKIP_AGENT_DETECTION: "1",
    },
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
  })),
});
