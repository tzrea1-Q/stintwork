#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { promisify } from "node:util";
import { createProjectServer } from "@stintwork/server";
import { parseCliArguments, usage } from "./arguments.js";
import { listenOnAvailablePort } from "./port.js";
import { findGitRoot } from "./project.js";

async function start(open: boolean) {
  const repoRoot = findGitRoot(process.env.INIT_CWD ?? process.cwd());
  const project = createProjectServer(repoRoot);
  let port: number;
  try {
    const server = await project.start();
    port = await listenOnAvailablePort(server);
  } catch (error) {
    await project.stop();
    throw error;
  }
  const url = `http://localhost:${port}`;
  console.log(`Stintwork: ${url}`);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      project.stop().catch((error) => {
        console.error(`Stintwork: ${String(error)}`);
        process.exitCode = 1;
      });
    });
  }

  if (open) {
    const command =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
    const openArgs = process.platform === "win32" ? ["/c", "start", "", url] : [url];
    try {
      await promisify(execFile)(command, openArgs);
    } catch {
      console.warn(`Could not open the browser. Open ${url} manually.`);
    }
  }
}

// Set exitCode rather than calling process.exit(), so piped output is flushed before exit.
try {
  const cli = parseCliArguments(process.argv.slice(2));
  if (cli.action === "unknown-option") {
    process.stderr.write(`Unknown option: ${cli.option}\n\n${usage}`);
    process.exitCode = 2;
  } else if (cli.action === "help") {
    process.stdout.write(usage);
  } else if (cli.action === "version") {
    // The CLI package root, from both src/bin.ts and dist/bin.js.
    const packageJson = new URL("../package.json", import.meta.url);
    const { version } = JSON.parse(readFileSync(packageJson, "utf8")) as { version: string };
    process.stdout.write(`${version}\n`);
  } else {
    await start(cli.open);
  }
} catch (error) {
  console.error(`Stintwork: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
