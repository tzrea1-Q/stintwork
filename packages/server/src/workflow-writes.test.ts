// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createNodeRepoFiles } from "./repo-files.js";
import { validateGithubIdentities } from "./github-discovery.js";
import { saveGithubWorkflow, saveWorkItemWorkflow } from "./workflow-writes.js";
import { commitStintworkSetup } from "@stintwork/git";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function repo() {
  const root = mkdtempSync(join(tmpdir(), "github-workflow-"));
  roots.push(root);
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", [
    "-C",
    root,
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.com",
    "commit",
    "--allow-empty",
    "-qm",
    "initial",
  ]);
  return root;
}
const item = {
  id: "I_1",
  number: 1,
  title: "Parent",
  url: "https://github.com/Example/Project/issues/1",
  complete: true,
};
const discovery = {
  repository: "Example/Project",
  repositoryId: "R_1",
  items: [item],
  scanned: 1,
  cursor: null,
  complete: true,
  pages: [],
  warnings: [],
};
test("creates and commits an identity that can be revalidated", async () => {
  const root = repo();
  const commit = await saveGithubWorkflow(root, discovery, item, "feature", "spec");
  expect(commit).toMatch(/^[a-f0-9]{40,64}$/);
  const path = ".stintwork/github/example/project/1/workflow.yaml";
  expect(execFileSync("git", ["-C", root, "show", `HEAD:${path}`], { encoding: "utf8" })).toBe(
    readFileSync(join(root, path), "utf8"),
  );
  expect(validateGithubIdentities(createNodeRepoFiles(root), discovery).items[0].bound).toBe(true);
});

test("creates the identity and approval in one commit, and rolls back a failed update", async () => {
  const root = repo();
  const path = ".stintwork/github/example/project/1/workflow.yaml";
  const approval = (text: string) =>
    `${text}stages:\n  spec:\n    approved:\n      by: Developer\n`;
  await saveGithubWorkflow(root, discovery, item, "feature", "spec", approval, "Approve spec");
  const initial = readFileSync(join(root, path), "utf8");
  expect(initial).toContain("approved:");
  expect(
    execFileSync("git", ["-C", root, "rev-list", "--count", "HEAD"], { encoding: "utf8" }).trim(),
  ).toBe("2");
  writeFileSync(join(root, ".git/hooks/pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  await expect(
    saveGithubWorkflow(
      root,
      discovery,
      item,
      "feature",
      "spec",
      (text) => `${text}extra: true\n`,
      "Update",
    ),
  ).rejects.toThrow();
  expect(readFileSync(join(root, path), "utf8")).toBe(initial);
  expect(
    execFileSync("git", ["-C", root, "diff", "--cached", "--name-only"], { encoding: "utf8" }),
  ).toBe("");
});

test("refuses unsafe paths and identity changes", async () => {
  const root = repo();
  for (const repository of ["../repo", "-bad/repo", "owner/..", "owner/x/y"]) {
    await expect(
      saveGithubWorkflow(
        root,
        { ...discovery, repository },
        { ...item, url: `https://github.com/${repository}/issues/1` },
        "feature",
        "spec",
      ),
    ).rejects.toThrow();
  }
  await expect(
    saveGithubWorkflow(root, discovery, { ...item, number: 0 }, "feature", "spec"),
  ).rejects.toThrow();
  await saveGithubWorkflow(root, discovery, item, "feature", "spec");
  await expect(
    saveGithubWorkflow(root, discovery, { ...item, id: "I_changed" }, "feature", "spec"),
  ).rejects.toThrow();
});

test("refuses symlinks and invalid YAML", async () => {
  const root = repo();
  mkdirSync(join(root, ".stintwork"));
  symlinkSync(tmpdir(), join(root, ".stintwork/github"));
  await expect(saveGithubWorkflow(root, discovery, item, "feature", "spec")).rejects.toThrow();
  rmSync(join(root, ".stintwork/github"));
  const dir = join(root, ".stintwork/github/example/project/1");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "workflow.yaml"), "github: [\n");
  await expect(saveGithubWorkflow(root, discovery, item, "feature", "spec")).rejects.toThrow();
});

test("serializes concurrent creates and rolls back a failed commit", async () => {
  const root = repo();
  const results = await Promise.all([
    saveGithubWorkflow(root, discovery, item, "feature", "spec"),
    saveGithubWorkflow(root, discovery, item, "feature", "spec"),
  ]);
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(
    execFileSync("git", ["-C", root, "rev-list", "--count", "HEAD"], { encoding: "utf8" }).trim(),
  ).toBe("2");
  const other = repo();
  const hook = join(other, ".git/hooks/pre-commit");
  writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  await expect(saveGithubWorkflow(other, discovery, item, "feature", "spec")).rejects.toThrow();
  expect(() =>
    readFileSync(join(other, ".stintwork/github/example/project/1/workflow.yaml")),
  ).toThrow();
  expect(
    execFileSync("git", ["-C", other, "diff", "--cached", "--name-only"], { encoding: "utf8" }),
  ).toBe("");
});

test("local workflow bytes are unchanged and unrelated setup paths remain forbidden", async () => {
  const root = repo();
  mkdirSync(join(root, ".scratch/local"), { recursive: true });
  const bytes = "workflow: feature\nstage: spec\nstages:\n  spec:\n    agent: codex\n";
  await saveWorkItemWorkflow(root, "local", () => bytes, "local setup");
  expect(readFileSync(join(root, ".scratch/local/workflow.yaml"), "utf8")).toBe(bytes);
  expect(
    execFileSync("git", ["-C", root, "show", "HEAD:.scratch/local/workflow.yaml"], {
      encoding: "utf8",
    }),
  ).toBe(bytes);
  for (const path of [
    ".stintwork/github/owner/../1/workflow.yaml",
    ".stintwork/github/owner/repo/1/other.yaml",
    ".stintwork/github/owner/repo/01/workflow.yaml",
  ]) {
    await expect(commitStintworkSetup(root, "github-1", [path])).rejects.toThrow();
  }
});
