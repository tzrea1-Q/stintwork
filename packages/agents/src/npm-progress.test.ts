// SPDX-License-Identifier: Apache-2.0
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { runNpm } from "./npm.js";

const npm = vi.hoisted(() => ({
  started: () => {},
  finish: () => {},
  bytes: [0, 0],
}));
vi.mock("node:child_process", () => ({
  execFile(...args: unknown[]) {
    const options = args[2] as { signal: AbortSignal };
    const callback = args[3] as (error: Error | null) => void;
    npm.finish = () => callback(null);
    options.signal.addEventListener("abort", () => callback(new Error("Aborted")), { once: true });
    npm.started();
  },
}));
vi.mock("node:fs/promises", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:fs/promises")>()),
  async readdir(directory: string) {
    return [{ isFile: () => true, parentPath: directory, name: "progress" }];
  },
  async lstat(path: string) {
    return { size: npm.bytes[path.includes("/cache/") ? 1 : 0], mtimeMs: 0 };
  },
}));

const directories: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  npm.bytes = [0, 0];
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function install(signal?: AbortSignal) {
  const cwd = await mkdtemp(join(tmpdir(), "stintwork-npm-progress-"));
  directories.push(cwd);
  const entry = join(cwd, "npm-cli.js");
  const cache = join(cwd, "cache");
  await writeFile(entry, "");
  await mkdir(cache);
  const started = new Promise<void>((resolve) => {
    npm.started = resolve;
  });
  vi.useFakeTimers();
  const pending = runNpm(["ci"], {
    cwd,
    env: { PATH: "", npm_execpath: entry },
    signal,
    stallTimeoutMs: 60_000,
    progressDirectories: [cwd, cache],
  });
  void pending.catch(() => {});
  await started;
  return { pending };
}

test.each([0, 1])(
  "progress in install/download directory %s survives more than 300 seconds",
  async (directory) => {
    const { pending } = await install();
    for (let chunk = 0; chunk < 9; chunk++) {
      npm.bytes[directory]++;
      await vi.advanceTimersByTimeAsync(40_000);
    }
    npm.finish();
    await expect(pending).resolves.toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  },
);

test("no progress for 60 seconds aborts npm and clears progress polling", async () => {
  const { pending } = await install();
  const rejected = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
  await vi.advanceTimersByTimeAsync(60_000);
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
});

test("cancellation still aborts an actively progressing install", async () => {
  const controller = new AbortController();
  const { pending } = await install(controller.signal);
  npm.bytes[0]++;
  controller.abort(new Error("Developer cancelled"));
  await expect(pending).rejects.toThrow("Developer cancelled");
  expect(vi.getTimerCount()).toBe(0);
});
