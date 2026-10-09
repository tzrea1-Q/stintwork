import { execFileSync, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, expect, test } from "vitest";
import { listenOnAvailablePort } from "./port.js";
import { findGitRoot } from "./project.js";

const directories: string[] = [];
const servers: Server[] = [];

function temporaryDirectory() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "stintwork-cli-")));
  directories.push(directory);
  return directory;
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
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href,
      "--conditions=development",
      fileURLToPath(new URL("./bin.ts", import.meta.url)),
      "--no-open",
    ],
    {
      cwd: directory,
      env: { ...process.env, INIT_CWD: directory },
      encoding: "utf8",
      timeout: 5000,
    },
  );
  expect(result.error).toBeUndefined();
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
