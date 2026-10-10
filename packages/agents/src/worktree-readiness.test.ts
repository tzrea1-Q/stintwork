import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createFakeAgentLauncher } from "./testing.js";

const fixtures: string[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), "stintwork-agent-roots-"));
  fixtures.push(parent);
  const cwd = join(parent, "worktree");
  const common = join(parent, "project/.git");
  const gitdir = join(common, "worktrees/first");
  await mkdir(cwd);
  await mkdir(gitdir, { recursive: true });
  return { parent, cwd, common, gitdir };
}

test("the ACP file boundary allows the granted git roots but not their parent checkout", async () => {
  const { cwd, common, gitdir, parent } = await fixture();
  const stint = createFakeAgentLauncher([
    { type: "write", path: join(common, "probe"), content: "Common git directory" },
    { type: "write", path: join(gitdir, "probe"), content: "Worktree git directory" },
  ])({
    agent: "codex",
    cwd,
    additionalDirectories: [common, gitdir],
    prompt: "Work",
    onEvent: () => {},
  });
  await stint.ready;
  expect(await stint.done).toEqual({ stopReason: "end_turn" });
  expect(await readFile(join(common, "probe"), "utf8")).toBe("Common git directory");
  expect(await readFile(join(gitdir, "probe"), "utf8")).toBe("Worktree git directory");
  const outside = join(parent, "project/keep.txt");
  await writeFile(outside, "Keep");
  const denied = createFakeAgentLauncher([{ type: "write", path: outside, content: "Overwrite" }])({
    agent: "codex",
    cwd,
    additionalDirectories: [common, gitdir],
    prompt: "Work",
    onEvent: () => {},
  });
  await expect(denied.done).rejects.toThrow();
  expect(await readFile(outside, "utf8")).toBe("Keep");
});

test("additional roots cannot escape through a symlink", async () => {
  const { cwd, common, parent } = await fixture();
  await writeFile(join(parent, "keep.txt"), "Keep");
  await symlink(parent, join(common, "escape"));
  const stint = createFakeAgentLauncher([
    { type: "write", path: join(common, "escape/keep.txt"), content: "Overwrite" },
  ])({ agent: "codex", cwd, additionalDirectories: [common], prompt: "Work", onEvent: () => {} });
  await expect(stint.done).rejects.toThrow();
  expect(await readFile(join(parent, "keep.txt"), "utf8")).toBe("Keep");
});

test("refuses unsupported additional-directory grants instead of starting with a silently unwritable index", async () => {
  const { cwd, common } = await fixture();
  const stint = createFakeAgentLauncher(
    [{ type: "write", path: "must-not-exist", content: "No work" }],
    [],
    { additionalDirectories: false },
  )({ agent: "codex", cwd, additionalDirectories: [common], prompt: "Work", onEvent: () => {} });
  await expect(stint.ready).rejects.toThrow("additional writable directories");
  await expect(stint.done).rejects.toThrow("additional writable directories");
  await expect(readFile(join(cwd, "must-not-exist"))).rejects.toMatchObject({ code: "ENOENT" });
});
