// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.STINTWORK_SKIP_AGENT_DETECTION = "1";
const { createProjectServer } = await import("../../server/src/index.js");
const root = await mkdtemp(join(tmpdir(), "stintwork-e2e-"));
let project: ReturnType<typeof createProjectServer> | undefined;
let stopping: Promise<void> | undefined;

function stop() {
  stopping ??= (async () => {
    try {
      await project?.stop();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  })();
  return stopping;
}

process.once("SIGTERM", () => void stop());
process.once("SIGINT", () => void stop());

try {
  await cp(fileURLToPath(new URL("./fixtures/project/", import.meta.url)), root, {
    recursive: true,
  });
  const git = (args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
    });
  git(["init", "--quiet", "--initial-branch=main"]);
  git(["add", "."]);
  git([
    "-c",
    "user.name=Browser fixture",
    "-c",
    "user.email=e2e@example.invalid",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "--quiet",
    "-m",
    "Browser fixture",
  ]);
  project = createProjectServer(root);
  const server = await project.start();
  server.listen(Number(process.env.PLAYWRIGHT_PORT ?? 4178), "127.0.0.1");
  await once(server, "listening");
  console.log(`Browser fixture server ready: ${root}`);
} catch (error) {
  await stop();
  throw error;
}
