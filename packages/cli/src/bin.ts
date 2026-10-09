#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createProjectServer } from "@stintwork/server";
import { listenOnAvailablePort } from "./port.js";
import { findGitRoot } from "./project.js";

try {
  const args = process.argv.slice(2);
  if (args.some((argument) => argument !== "--no-open")) {
    throw new Error("Usage: stintwork [--no-open]");
  }

  const repoRoot = findGitRoot(process.env.INIT_CWD ?? process.cwd());
  const server = createProjectServer(repoRoot);
  const port = await listenOnAvailablePort(server);
  const url = `http://localhost:${port}`;
  console.log(`Stintwork: ${url}`);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => server.close());
  }

  if (!args.includes("--no-open")) {
    const command =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const openArgs = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    try {
      await promisify(execFile)(command, openArgs);
    } catch {
      console.warn(`Could not open the browser. Open ${url} manually.`);
    }
  }
} catch (error) {
  console.error(`Stintwork: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
