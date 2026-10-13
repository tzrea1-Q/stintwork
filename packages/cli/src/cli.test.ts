// SPDX-License-Identifier: Apache-2.0
import { execFileSync, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vitest";
import { sourceNodeArgs } from "../../agents/src/source-node-args.js";
import { parseCliArguments } from "./arguments.js";
import { listenOnAvailablePort } from "./port.js";
import { findGitRoot } from "./project.js";

const directories: string[] = [];
const servers: Server[] = [];

function temporaryDirectory() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "stintwork-cli-")));
  directories.push(directory);
  return directory;
}

// Runs the CLI from a directory outside any Git repository, so starting the server would fail
// with "Not inside a Git repository" and exit 1.
function runCli(directory: string, args: string[]) {
  const result = spawnSync(
    process.execPath,
    sourceNodeArgs(fileURLToPath(new URL("./bin.ts", import.meta.url)), ...args),
    {
      cwd: directory,
      env: { ...process.env, INIT_CWD: directory },
      encoding: "utf8",
      timeout: 5000,
    },
  );
  expect(result.error).toBeUndefined();
  return result;
}

afterEach(async () => {
  for (const server of servers.splice(0)) {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  }
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cli finds the git root from a nested directory", () => {
  const repoRoot = temporaryDirectory();
  execFileSync("git", ["init", "--quiet", repoRoot]);
  const nestedDirectory = join(repoRoot, "nested", "directory");
  mkdirSync(nestedDirectory, { recursive: true });
  expect(findGitRoot(nestedDirectory)).toBe(repoRoot);
});

test("cli exits non-zero outside a git repo", () => {
  const directory = temporaryDirectory();
  expect(() => findGitRoot(directory)).toThrow("Not inside a Git repository");
  const result = runCli(directory, ["--no-open"]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Not inside a Git repository");
});

test("cli falls back to the next free port when 4317 is busy", async () => {
  const blocker = createServer();
  servers.push(blocker);
  try {
    blocker.listen(4317, "127.0.0.1");
    await once(blocker, "listening");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") {
      throw error;
    }
  }

  const server = createServer();
  servers.push(server);
  const port = await listenOnAvailablePort(server);
  expect(port).toBeGreaterThan(4317);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP address");
  }
  expect(address.port).toBe(port);
  expect(address.address).toBe("127.0.0.1");
  expect(server.listenerCount("error")).toBe(0);
  expect(server.listenerCount("listening")).toBe(0);
});

test("cli rejects invalid preferred ports", async () => {
  const server = createServer();
  for (const port of [0, -1, 65536, 4317.5, Number.NaN]) {
    await expect(listenOnAvailablePort(server, port)).rejects.toThrow("Port must be an integer");
  }
});

test("prints help and exits 0 without starting the server", () => {
  expect(parseCliArguments(["-h"])).toEqual({ action: "help" });
  const result = runCli(temporaryDirectory(), ["--help"]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Usage: stintwork [options]");
  for (const option of ["--no-open", "-h, --help", "-v, --version"]) {
    expect(result.stdout).toContain(option);
  }
  expect(result.stderr).toBe("");
});

test("prints only the version and exits 0", () => {
  expect(parseCliArguments(["-v"])).toEqual({ action: "version" });
  const result = runCli(temporaryDirectory(), ["--version"]);
  expect(result.status).toBe(0);
  const { version } = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };
  expect(version).toMatch(/^\d+\.\d+\.\d+/);
  expect(result.stdout).toBe(`${version}\n`);
  expect(result.stderr).toBe("");
});

test("rejects an unknown option with usage on stderr and exit code 2", () => {
  expect(parseCliArguments(["--no-opne"])).toEqual({
    action: "unknown-option",
    option: "--no-opne",
  });
  expect(parseCliArguments(["--help", "--bogus"])).toEqual({
    action: "unknown-option",
    option: "--bogus",
  });
  const result = runCli(temporaryDirectory(), ["--no-opne"]);
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("Unknown option: --no-opne\n");
  expect(result.stderr).toContain("Usage: stintwork [options]");
});

test("--no-open still prevents opening the browser", () => {
  expect(parseCliArguments(["--no-open"])).toEqual({ action: "start", open: false });
  expect(parseCliArguments([])).toEqual({ action: "start", open: true });
});
