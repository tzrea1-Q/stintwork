// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { createNodeRepoFiles } from "./repo-files.js";

const directories: string[] = [];

function fixture(contents: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "stintwork-files-"));
  directories.push(root);
  for (const [path, text] of Object.entries(contents)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test("filesystem adapter lists and reads only the project paths", () => {
  const contents = {
    ".scratch/board/spec.md": "# Board",
    ".scratch/board/issues/01-ticket.md": "# Ticket",
    ".stintwork/roadmap.md": "# Roadmap",
    ".stintwork/local/stints/first.jsonl": '{"type":"event"}\n',
    "docs/agents/issue-tracker.md": "Local Markdown",
    "docs/adr/0001-files.md": "# Files",
    "AGENTS.md": "# Agents",
    "CLAUDE.md": "See AGENTS.md",
    "GLOSSARY.md": "# Glossary",
  };
  const root = fixture({
    ...contents,
    "package.json": "{}",
    "docs/brief.md": "Private brief",
    ".scratch-other/secret.md": "Secret",
    ".env": "Secret",
  });
  const files = createNodeRepoFiles(root);
  expect(files.list("")).toEqual(Object.keys(contents).sort());
  expect(files.list(".scratch/")).toEqual([
    ".scratch/board/issues/01-ticket.md",
    ".scratch/board/spec.md",
  ]);
  expect(files.list(".scratch/board/issues/")).toEqual([".scratch/board/issues/01-ticket.md"]);
  expect(files.list(".stintwork/local/stints/")).toEqual([".stintwork/local/stints/first.jsonl"]);
  for (const [path, text] of Object.entries(contents)) expect(files.read(path)).toBe(text);
  for (const path of [".env", "docs/brief.md", "package.json", ".scratch-other/secret.md"]) {
    expect(files.read(path)).toBeUndefined();
    expect(files.list(path)).toEqual([]);
  }
});

test("filesystem adapter tolerates missing paths and rejects path traversal", () => {
  const files = createNodeRepoFiles(fixture({}));
  expect(files.list("")).toEqual([]);
  for (const path of [
    ".scratch/missing.md",
    "AGENTS.md",
    ".scratch",
    "../AGENTS.md",
    ".scratch/../AGENTS.md",
    ".scratch//file",
    ".scratch\\file",
    "/AGENTS.md",
    ".scratch/\0file",
  ]) {
    expect(files.read(path)).toBeUndefined();
  }
});

test("filesystem adapter never follows file, directory or ancestor symlinks", () => {
  const root = fixture({ ".scratch/board/spec.md": "# Board", "outside/secret.md": "Secret" });
  const files = createNodeRepoFiles(root);
  symlinkSync(join(root, "outside/secret.md"), join(root, "CLAUDE.md"));
  symlinkSync(join(root, "outside"), join(root, ".scratch/linked"));
  symlinkSync(join(root, "outside"), join(root, "docs"));
  symlinkSync(join(root, ".scratch/board/spec.md"), join(root, ".scratch/board/link.md"));
  expect(files.list("")).toEqual([".scratch/board/spec.md"]);
  for (const path of [
    "CLAUDE.md",
    ".scratch/linked/secret.md",
    "docs/adr/secret.md",
    ".scratch/board/link.md",
  ]) {
    expect(files.read(path)).toBeUndefined();
  }
});

test("filesystem adapter reads the latest contents rather than retaining a stale file cache", () => {
  const root = fixture({ ".scratch/board/spec.md": "# Board" });
  const files = createNodeRepoFiles(root);
  writeFileSync(join(root, ".scratch/board/spec.md"), "# Changed");
  expect(files.read(".scratch/board/spec.md")).toBe("# Changed");
  mkdirSync(join(root, ".scratch/new"));
  writeFileSync(join(root, ".scratch/new/spec.md"), "# New");
  expect(files.list(".scratch/")).toContain(".scratch/new/spec.md");
});
