// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { ensureWorktree } from "@stintwork/git";
import { afterEach, expect, test } from "vitest";
import { addMarkShippedRoute } from "./mark-shipped.js";
import { createProjectFiles } from "./work-item-files.js";

const roots: string[] = [];
function fixture(options: { running?: boolean; github?: boolean; merged?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "mark-shipped-"));
  roots.push(root);
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "--quiet", "--initial-branch=main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.invalid");
  mkdirSync(join(root, ".scratch/first"), { recursive: true });
  writeFileSync(join(root, ".scratch/first/spec.md"), "# First\n");
  writeFileSync(
    join(root, ".scratch/first/workflow.yaml"),
    `workflow: feature\nstage: review\n${options.merged ? `merged: {at: '2026-01-01T00:00:00Z', commit: ${"a".repeat(40)}}\n` : ""}`,
  );
  if (options.github) {
    mkdirSync(join(root, "docs/agents"), { recursive: true });
    writeFileSync(join(root, "docs/agents/issue-tracker.md"), "# Issue tracker: GitHub\n");
  }
  git("add", ".");
  git("commit", "--quiet", "-m", "initial");
  const head = git("rev-parse", "HEAD");
  const app = new Hono();
  addMarkShippedRoute(
    app,
    root,
    createProjectFiles(root),
    () => {},
    () => !!options.running,
    new Set(),
  );
  const post = (commit: string) =>
    app.request("/api/work-items/first/mark-shipped", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commit }),
    });
  return { root, git, head, post };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
test("records the resolved commit in exactly one workflow-only commit", async () => {
  const { root, git, head, post } = fixture();
  const response = await post(head.slice(0, 8));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ merged: { commit: head, outside: true } });
  expect(readFileSync(join(root, ".scratch/first/workflow.yaml"), "utf8")).toContain(
    "outside: true",
  );
  expect(git("rev-list", "--count", `${head}..HEAD`)).toBe("1");
  expect(git("show", "--format=", "--name-only", "HEAD")).toBe(".scratch/first/workflow.yaml");
  expect(git("log", "-1", "--format=%s")).toBe("Record outside merge of first");
});
test.each([
  [{ merged: true }, "ship.alreadyShipped"],
  [{ running: true }, "ship.running"],
  [{ github: true }, "outside.github"],
])("refuses unavailable items", async (options, code) => {
  const { head, post } = fixture(options);
  const response = await post(head);
  expect(response.status).toBe(409);
  expect((await response.json()).reasonMessage.code).toBe(code);
});
test("refuses unknown and unreachable commits", async () => {
  const { git, post } = fixture();
  expect((await (await post("missing-commit")).json()).reasonMessage.code).toBe(
    "outside.unknownCommit",
  );
  git("checkout", "--quiet", "--orphan", "other");
  git("commit", "--quiet", "--allow-empty", "-m", "other");
  const other = git("rev-parse", "HEAD");
  git("checkout", "--quiet", "main");
  expect((await (await post(other)).json()).reasonMessage.code).toBe("outside.unreachable");
});

test("refuses a work item with a Stintwork worktree", async () => {
  const { root, git, head, post } = fixture();
  await ensureWorktree(root, "first");
  roots.push(`${root}-worktrees`);
  const response = await post(head);
  expect(response.status).toBe(409);
  expect((await response.json()).reasonMessage.code).toBe("outside.worktree");
  expect(git("rev-parse", "HEAD")).toBe(head);
  expect(readFileSync(join(root, ".scratch/first/workflow.yaml"), "utf8")).not.toContain("merged:");
});
