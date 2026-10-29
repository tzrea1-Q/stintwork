// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryRepoFiles, indexProject } from "@stintwork/core";
import { afterEach, expect, test } from "vitest";
import { approvalHeadChanged, projectLocalApprovals } from "./approval-head.js";
import { createNodeRepoFiles } from "./repo-files.js";
import { createProjectFiles } from "./work-item-files.js";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "approval-head-"));
  roots.push(root);
  git(root, "init", "-q");
  git(root, "config", "user.name", "Tests");
  git(root, "config", "user.email", "tests@example.invalid");
  writeFileSync(join(root, "initial"), "initial");
  git(root, "add", ".");
  git(root, "commit", "-qm", "initial");
  const commit = git(root, "rev-parse", "HEAD");
  const path = ".scratch/item/workflow.yaml";
  const approval = { at: "2026-01-01T00:00:00Z", commit };
  const text = `stages:\n  spec:\n    approved:\n      at: '${approval.at}'\n      commit: '${commit}'\n`;
  const write = (directory = root) => {
    mkdirSync(join(directory, ".scratch/item"), { recursive: true });
    writeFileSync(join(directory, path), text);
  };
  const check = (directory = root, checkoutText?: () => string | undefined) =>
    approvalHeadChanged({ directory, root, path, stage: "spec", approval, checkoutText });
  const commitWorkflow = (directory = root) => {
    git(directory, "add", path);
    git(directory, "commit", "-qm", "approval");
  };
  const advance = () => {
    writeFileSync(join(root, "other"), "other");
    git(root, "add", "other");
    git(root, "commit", "-qm", "other");
  };
  return { root, write, check, commitWorkflow, advance, text };
}

test("the introducing commit must have the reviewed HEAD as parent", () => {
  const current = fixture();
  current.write();
  current.commitWorkflow();
  expect(current.check()).toBe(false);
  const raced = fixture();
  raced.advance();
  raced.write();
  raced.commitWorkflow();
  expect(raced.check()).toBe(true);
});

test("a record copied into a worktree follows the checkout history", () => {
  const f = fixture();
  const worktree = `${f.root}-worktree`;
  roots.push(worktree);
  git(f.root, "worktree", "add", "-qb", "work", worktree);
  f.write();
  f.commitWorkflow();
  writeFileSync(join(worktree, "worktree-change"), "change");
  git(worktree, "add", "worktree-change");
  git(worktree, "commit", "-qm", "worktree change");
  f.write(worktree);
  f.commitWorkflow(worktree);
  expect(f.check(worktree, () => f.text)).toBe(false);
});

test("an uncommitted record is rechecked after it is committed", () => {
  const f = fixture();
  f.write();
  expect(f.check()).toBe(false);
  f.advance();
  f.commitWorkflow();
  expect(f.check()).toBe(true);
});

test("a rebased introducing commit is re-checked", () => {
  const f = fixture();
  f.write();
  f.commitWorkflow();
  const path = ".scratch/item/workflow.yaml";
  const reviewed = git(f.root, "rev-parse", "HEAD^");
  const check = () =>
    approvalHeadChanged({
      directory: f.root,
      root: f.root,
      path,
      stage: "spec",
      approval: { at: "2026-01-01T00:00:00Z", commit: reviewed },
      historyKey: [git(f.root, "log", "-1", "--format=%H", "--", path)],
    });
  const project = createProjectFiles(f.root, createNodeRepoFiles(f.root))();
  const projected = () => {
    const files = createMemoryRepoFiles({
      ".scratch/item/spec.md": "# Item",
      [path]: `workflow: feature\nstage: review\n${f.text}`,
    });
    const snapshot = indexProject(files, { name: "test" });
    projectLocalApprovals(snapshot, f.root, project);
    return snapshot.workItems[0].stages.spec.approved;
  };
  expect(check()).toBe(false);
  expect(projected()).not.toHaveProperty("state");
  git(f.root, "reset", "--hard", reviewed);
  f.advance();
  f.write();
  f.commitWorkflow();
  expect(projected()).toMatchObject({ state: "stale", stateReason: "head-changed" });
  expect(check()).toBe(true);
});

test("an uncommitted checkout copy keeps the worktree's head-changed result", () => {
  const f = fixture();
  const worktree = `${f.root}-worktree`;
  roots.push(worktree);
  git(f.root, "worktree", "add", "-qb", "work", worktree);
  writeFileSync(join(worktree, "change"), "change");
  git(worktree, "add", "change");
  git(worktree, "commit", "-qm", "change");
  f.write(worktree);
  f.commitWorkflow(worktree);
  f.write();
  expect(f.check(worktree, () => f.text)).toBe(true);
});

test("a root-commit record does not hide a raced record in another stage", () => {
  const root = mkdtempSync(join(tmpdir(), "approval-root-"));
  roots.push(root);
  git(root, "init", "-q");
  git(root, "config", "user.name", "Tests");
  git(root, "config", "user.email", "tests@example.invalid");
  const path = ".scratch/item/workflow.yaml";
  mkdirSync(join(root, ".scratch/item"), { recursive: true });
  writeFileSync(join(root, ".scratch/item/spec.md"), "# Item");
  const first =
    "workflow: feature\nstage: review\nstages:\n  clarify:\n    approved: { by: Tests, at: '2026-01-01T00:00:00Z', commit: root }\n";
  writeFileSync(join(root, path), first);
  git(root, "add", ".");
  git(root, "commit", "-qm", "root approval");
  const reviewed = git(root, "rev-parse", "HEAD");
  writeFileSync(join(root, "change"), "change");
  git(root, "add", "change");
  git(root, "commit", "-qm", "change");
  writeFileSync(
    join(root, path),
    `${first}  spec:\n    approved: { by: Tests, at: '2026-01-02T00:00:00Z', commit: '${reviewed}' }\n`,
  );
  git(root, "add", path);
  git(root, "commit", "-qm", "raced approval");
  const project = createProjectFiles(root, createNodeRepoFiles(root))();
  const snapshot = indexProject(project.files, { name: "test" });
  projectLocalApprovals(snapshot, root, project);
  expect(snapshot.workItems[0].stages.clarify.approved).toEqual({
    by: "Tests",
    at: "2026-01-01T00:00:00Z",
    commit: "root",
  });
  expect(snapshot.workItems[0].stages.spec.approved).toEqual({
    by: "Tests",
    at: "2026-01-02T00:00:00Z",
    commit: reviewed,
    state: "stale",
    stateReason: "head-changed",
  });
});
