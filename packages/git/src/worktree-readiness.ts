// SPDX-License-Identifier: Apache-2.0
import { coreText } from "@stintwork/core";
import type { CoreText } from "@stintwork/core";
import { execFile, spawn } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

export async function worktreeGitDirectories(worktree: string): Promise<string[]> {
  const { stdout } = await execute(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir", "--git-dir"],
    { cwd: worktree },
  );
  return [...new Set(stdout.trim().split("\n"))];
}

export async function installWorktreeDependencies(
  worktree: string,
  progress: (text: CoreText) => void,
  reinstall = false,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const exists = async (path: string) =>
    lstat(join(worktree, path)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    });
  const manager = (await exists("pnpm-lock.yaml"))
    ? "pnpm"
    : (await exists("package-lock.json")) || (await exists("npm-shrinkwrap.json"))
      ? "npm"
      : (await exists("yarn.lock"))
        ? "yarn"
        : undefined;
  if (!manager || (!reinstall && (await exists("node_modules")))) return;
  const modernYarn =
    manager === "yarn" &&
    (!!(await exists(".yarnrc.yml")) ||
      Number(
        /^yarn@(\d+)/.exec(
          JSON.parse(await readFile(join(worktree, "package.json"), "utf8")).packageManager ?? "",
        )?.[1] ?? 1,
      ) >= 2);
  if (!reinstall && modernYarn && (await exists(".pnp.cjs"))) return;
  const args =
    manager === "npm"
      ? ["ci"]
      : modernYarn
        ? ["install", "--immutable"]
        : ["install", "--frozen-lockfile"];
  async function install(offline: boolean) {
    progress(
      coreText({
        code: "stream.installDependencies",
        params: { manager: manager as string, connection: offline ? "offline" : "online" },
      }),
    );
    const child = spawn(
      manager as string,
      [...args, ...(offline && !modernYarn ? ["--offline"] : [])],
      {
        cwd: worktree,
        signal,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          ...(modernYarn ? { YARN_ENABLE_NETWORK: offline ? "0" : "1" } : {}),
        },
      },
    );
    child.stdout.setEncoding("utf8").on("data", (text: string) => progress({ text }));
    child.stderr.setEncoding("utf8").on("data", (text: string) => progress({ text }));
    await new Promise<void>((resolveInstall, reject) => {
      let failure: Error | undefined;
      child.on("error", (error) => {
        failure = error;
      });
      child.on("close", (code, signal) =>
        code === 0 && !failure
          ? resolveInstall()
          : reject(
              failure ?? new Error(`${manager} dependency install failed (${code ?? signal}).`),
            ),
      );
    });
  }
  try {
    await install(true);
  } catch {
    signal?.throwIfAborted();
    progress(coreText({ code: "stream.offlineUnavailable" }));
    await install(false);
  }
  signal?.throwIfAborted();
  progress(coreText({ code: "stream.dependenciesReady" }));
}
