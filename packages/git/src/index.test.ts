// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { ensureWorktree } from "./index.js";

const fixtures: string[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "stintwork-git-")));
  fixtures.push(parent);
  const root = join(parent, "project");
  execFileSync("git", ["init", "--quiet", "--initial-branch=main", root]);
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Tests",
      "-c",
      "user.email=tests@example.invalid",
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      "Fixture",
    ],
    { cwd: root },
  );
  return { root, parent };
}

test("creates a sibling worktree and branch from HEAD and reuses it without discarding work", async () => {
  const { root, parent } = await fixture();
  const worktree = await ensureWorktree(root, "first-stint");
  expect(worktree).toEqual({
    path: join(parent, "project-worktrees/first-stint"),
    branch: "stintwork/first-stint",
  });
  expect(
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: worktree.path, encoding: "utf8" }),
  ).toEqual(execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }));
  await writeFile(join(worktree.path, "uncommitted.txt"), "Keep this");
  expect(await ensureWorktree(root, "first-stint")).toEqual(worktree);
  expect(await readFile(join(worktree.path, "uncommitted.txt"), "utf8")).toBe("Keep this");
});

test.each(["../escape", ".", "bad..ref", "/absolute", "-option", "nested/item"])(
  "rejects unsafe slug %s without creating a branch",
  async (slug) => {
    const { root } = await fixture();
    await expect(ensureWorktree(root, slug)).rejects.toThrow();
    expect(
      execFileSync("git", ["branch", "--format=%(refname:short)"], {
        cwd: root,
        encoding: "utf8",
      }).trim(),
    ).toBe("main");
  },
);

test("does not reuse an existing worktree switched to the wrong branch", async () => {
  const { root } = await fixture();
  const worktree = await ensureWorktree(root, "first");
  execFileSync("git", ["switch", "--quiet", "-c", "different"], { cwd: worktree.path });
  await expect(ensureWorktree(root, "first")).rejects.toThrow("different branch");
});
