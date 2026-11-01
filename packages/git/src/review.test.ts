// SPDX-License-Identifier: Apache-2.0
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { checkpointChangedPaths, checkpointFileDiff, commitWorkItemReview } from "./review.js";

const roots: string[] = [];
function git(root: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "stintwork-review-"));
  roots.push(root);
  git(root, "init", "--quiet", "--initial-branch=stintwork/first");
  git(root, "config", "user.name", "Developer");
  git(root, "config", "user.email", "developer@example.invalid");
  mkdirSync(join(root, ".scratch/first"), { recursive: true });
  writeFileSync(join(root, ".scratch/first/spec.md"), "# First");
  writeFileSync(join(root, "GLOSSARY.md"), "Original\n");
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Base");
  return { root, base: git(root, "rev-parse", "HEAD") };
}
function commit(root: string) {
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Agent change");
  return git(root, "rev-parse", "HEAD");
}
const review = ".scratch/first/review.yaml";
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

test("creates a review directory for a GitHub work item", async () => {
  const { root } = fixture();
  git(root, "branch", "-m", "stintwork/github-1");
  await commitWorkItemReview(root, "github-1", "decisions: []\n", "Record decision");
  expect(git(root, "show", "HEAD:.scratch/github-1/review.yaml")).toBe("decisions: []");
});

test("checkpoint paths and diffs are pinned, including both sides of a rename and binary files", () => {
  const { root, base } = fixture();
  git(root, "mv", "GLOSSARY.md", "CLAUDE.md");
  writeFileSync(join(root, "binary.dat"), Buffer.from([0, 1, 2, 3]));
  const checkpoint = commit(root);
  git(root, "config", "color.ui", "always");
  writeFileSync(join(root, "CLAUDE.md"), "Later dirty change");
  expect(checkpointChangedPaths(root, base, checkpoint)).toEqual([
    "CLAUDE.md",
    "GLOSSARY.md",
    "binary.dat",
  ]);
  expect(checkpointFileDiff(root, base, checkpoint, "GLOSSARY.md")).toContain("-Original");
  expect(checkpointFileDiff(root, base, checkpoint, "GLOSSARY.md")).not.toContain("\u001b");
  expect(checkpointFileDiff(root, base, checkpoint, "CLAUDE.md")).toContain("+Original");
  expect(checkpointFileDiff(root, base, checkpoint, "CLAUDE.md")).not.toContain(
    "Later dirty change",
  );
  expect(checkpointFileDiff(root, base, checkpoint, "binary.dat")).toContain("Binary files");
  expect(() => checkpointChangedPaths(root, "HEAD", checkpoint)).toThrow("Invalid commit");
});

test("accept commits only the review; reject commits the whole file's base and review atomically", async () => {
  const { root, base } = fixture();
  writeFileSync(join(root, "GLOSSARY.md"), "Proposal\n");
  const checkpoint = commit(root);
  writeFileSync(join(root, "unrelated.txt"), "Preserve staged work");
  git(root, "add", "unrelated.txt");
  await commitWorkItemReview(root, "first", "decisions: []\n", "Accept proposal for first");
  expect(git(root, "log", "-1", "--format=%s")).toBe("Accept proposal for first");
  expect(git(root, "diff", "--name-only", checkpoint, "HEAD")).toBe(review);
  expect(readFileSync(join(root, "GLOSSARY.md"), "utf8")).toBe("Proposal\n");
  const rejected = await commitWorkItemReview(
    root,
    "first",
    "decisions: [{id: rejected-proposal}]\n",
    "Reject proposal for first",
    { path: "GLOSSARY.md", baseCommit: base },
  );
  expect(git(root, "show", `${rejected}:GLOSSARY.md`)).toBe("Original");
  expect(git(root, "log", "-1", "--format=%s")).toBe("Reject proposal for first");
  expect(git(root, "diff", "--cached", "--name-only")).toBe("unrelated.txt");
  expect(git(root, "ls-tree", "HEAD", "unrelated.txt")).toBe("");
});

test.each(["created", "deleted"])("reject restores a %s memory file", async (kind) => {
  const { root, base } = fixture();
  const path = kind === "created" ? "docs/adr/new.md" : "GLOSSARY.md";
  if (kind === "created") {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), "New record");
  } else rmSync(join(root, path));
  commit(root);
  await commitWorkItemReview(root, "first", "decisions: []\n", kind, { path, baseCommit: base });
  expect(existsSync(join(root, path))).toBe(kind === "deleted");
  expect(git(root, "status", "--porcelain")).toBe("");
});

test("failed commits restore both scoped files and index, preserving unrelated changes", async () => {
  const { root, base } = fixture();
  writeFileSync(join(root, "GLOSSARY.md"), "Proposal\n");
  const checkpoint = commit(root);
  writeFileSync(join(root, "unrelated.txt"), "Keep");
  git(root, "add", "unrelated.txt");
  writeFileSync(join(root, ".git/hooks/pre-commit"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  await expect(
    commitWorkItemReview(root, "first", "decisions: []\n", "proposal", {
      path: "GLOSSARY.md",
      baseCommit: base,
    }),
  ).rejects.toThrow();
  expect(git(root, "rev-parse", "HEAD")).toBe(checkpoint);
  expect(readFileSync(join(root, "GLOSSARY.md"), "utf8")).toBe("Proposal\n");
  expect(existsSync(join(root, review))).toBe(false);
  expect(git(root, "diff", "--cached", "--name-only")).toBe("unrelated.txt");
});

test("an ignored review file is refused rather than overwritten or deleted after a failed add", async () => {
  const { root } = fixture();
  writeFileSync(join(root, ".gitignore"), `${review}\n`);
  commit(root);
  writeFileSync(join(root, review), "Ignored developer record\n");
  const head = git(root, "rev-parse", "HEAD");
  await expect(commitWorkItemReview(root, "first", "decisions: []\n", "proposal")).rejects.toThrow(
    "Commit or discard",
  );
  expect(readFileSync(join(root, review), "utf8")).toBe("Ignored developer record\n");
  expect(git(root, "rev-parse", "HEAD")).toBe(head);
});

test("refuses dirty target files, wrong branches, unsafe paths and symlink parents", async () => {
  const { root, base } = fixture();
  writeFileSync(join(root, "GLOSSARY.md"), "Keep uncommitted edits");
  await expect(
    commitWorkItemReview(root, "first", "decisions: []\n", "proposal", {
      path: "GLOSSARY.md",
      baseCommit: base,
    }),
  ).rejects.toThrow("Commit or discard");
  expect(readFileSync(join(root, "GLOSSARY.md"), "utf8")).toBe("Keep uncommitted edits");
  await expect(
    commitWorkItemReview(root, "first", "decisions: []\n", "proposal", {
      path: "docs/adr/../../secret",
      baseCommit: base,
    }),
  ).rejects.toThrow("Invalid project memory path");
  git(root, "branch", "-m", "main");
  await expect(commitWorkItemReview(root, "first", "decisions: []\n", "proposal")).rejects.toThrow(
    "not on the work item's branch",
  );
  git(root, "branch", "-m", "stintwork/first");
  rmSync(join(root, ".scratch/first"), { recursive: true });
  symlinkSync(root, join(root, ".scratch/first"));
  await expect(commitWorkItemReview(root, "first", "decisions: []\n", "proposal")).rejects.toThrow(
    "real directories",
  );
});
