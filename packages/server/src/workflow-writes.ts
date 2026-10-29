// SPDX-License-Identifier: Apache-2.0
import { CoreTextError, createMemoryRepoFiles, githubWorkflowPath } from "@stintwork/core";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitStintworkSetup, withRepoLock } from "@stintwork/git";
import { stringify } from "yaml";
import {
  GithubReadError,
  validateGithubIdentities,
  type GithubDiscovery,
} from "./github-discovery.js";

function checkWorkflowIndex(root: string, relative: string) {
  const indexEntry = execFileSync("git", ["ls-files", "--stage", "--", relative], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (indexEntry && !/^\d+ [a-f\d]+ 0\t[^\n]+$/.test(indexEntry))
    throw new CoreTextError({ code: "workflow.resolveIndexConflict" });
  for (const args of [["--cached"], []])
    if (
      execFileSync("git", ["diff", "--no-ext-diff", "--name-only", "-z", ...args, "--", relative], {
        cwd: root,
      }).length
    )
      throw new CoreTextError({ code: "workflow.dirtyFile" });
  return indexEntry;
}

export function assertWorkflowUnchanged(root: string, relative: string) {
  const indexEntry = checkWorkflowIndex(root, relative);
  const stat = lstatSync(join(root, relative), { throwIfNoEntry: false });
  if (stat && (!stat.isFile() || stat.isSymbolicLink()))
    throw new CoreTextError({ code: "workflow.regularFile" });
  if (stat && !indexEntry) throw new CoreTextError({ code: "workflow.dirtyFile" });
  return indexEntry;
}

export async function saveGithubWorkflow(
  root: string,
  discovery: GithubDiscovery,
  item: GithubDiscovery["items"][number],
  workflow: string,
  stage: string,
  update?: (text: string) => string,
  message?: string,
) {
  const relative = `.stintwork/github/${discovery.repository.toLowerCase()}/${item.number}/workflow.yaml`;
  if (
    !githubWorkflowPath(relative) ||
    !discovery.repositoryId ||
    !item.id ||
    item.url !== `https://github.com/${discovery.repository}/issues/${item.number}`
  )
    throw new GithubReadError("identity");
  return withRepoLock(root, async () => {
    const indexEntry = checkWorkflowIndex(root, relative);
    let directory = root;
    for (const part of relative.split("/").slice(0, -1)) {
      directory = join(directory, part);
      const stat = lstatSync(directory, { throwIfNoEntry: false });
      if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
        throw new CoreTextError({ code: "server.workItemDirectories" });
      if (!stat) mkdirSync(directory);
    }
    const path = join(root, relative);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (stat && (!stat.isFile() || stat.isSymbolicLink()))
      throw new CoreTextError({ code: "workflow.regularFile" });
    if (stat && !indexEntry) throw new CoreTextError({ code: "workflow.dirtyFile" });
    const validate = (text: string) => {
      validateGithubIdentities(createMemoryRepoFiles({ [relative]: text }), {
        ...discovery,
        complete: false,
        items: [item],
      });
    };
    const existing = stat ? readFileSync(path, "utf8") : undefined;
    if (existing !== undefined) validate(existing);
    const initial =
      existing ??
      stringify({
        workflow,
        stage,
        github: {
          host: "github.com",
          repositoryId: discovery.repositoryId,
          repository: discovery.repository,
          issueId: item.id,
          number: item.number,
          url: item.url,
        },
      });
    const text = update ? update(initial) : initial;
    validate(text);
    if (text === existing) return null;
    if (!stat && indexEntry) throw new CoreTextError({ code: "workflow.resolveIndexConflict" });
    writeFileSync(path, text, { flag: stat ? "w" : "wx" });
    try {
      const commit = await commitStintworkSetup(root, `github-${item.number}`, [relative], message);
      if (!commit) throw new CoreTextError({ code: "workflow.commitIgnored" });
      return commit;
    } catch (error) {
      if (readFileSync(path, "utf8") === text) {
        if (existing === undefined) rmSync(path);
        else writeFileSync(path, existing);
      }
      if (indexEntry) {
        const [mode, hash] = indexEntry.split(" ");
        execFileSync("git", ["update-index", "--cacheinfo", `${mode},${hash},${relative}`], {
          cwd: root,
        });
      } else execFileSync("git", ["update-index", "--force-remove", "--", relative], { cwd: root });
      throw error;
    }
  });
}

export function writeWorkItemWorkflow(
  root: string,
  slug: string,
  update: (existing: string | undefined) => string,
): boolean {
  let directory = root;
  for (const part of [".scratch", slug]) {
    directory = join(directory, part);
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new CoreTextError({ code: "server.workItemDirectories" });
  }
  const path = join(directory, "workflow.yaml");
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat && (!stat.isFile() || stat.isSymbolicLink()))
    throw new CoreTextError({ code: "workflow.regularFile" });
  const existing = stat ? readFileSync(path, "utf8") : undefined;
  const text = update(existing);
  if (text === existing) return false;
  writeFileSync(path, text, { flag: stat ? "w" : "wx" });
  return true;
}

export async function saveWorkItemWorkflow(
  root: string,
  slug: string,
  update: (existing: string | undefined) => string,
  message: string,
) {
  const relative = `.scratch/${slug}/workflow.yaml`;
  const path = join(root, relative);
  let existing: string | undefined;
  let written = "";
  const indexEntry = assertWorkflowUnchanged(root, relative);
  const changed = writeWorkItemWorkflow(root, slug, (text) => {
    existing = text;
    written = update(text);
    return written;
  });
  try {
    const commit = await commitStintworkSetup(root, slug, [relative], message);
    if (changed && commit === null) throw new CoreTextError({ code: "workflow.commitIgnored" });
    return commit;
  } catch (error) {
    if (changed && readFileSync(path, "utf8") === written) {
      if (existing === undefined) rmSync(path);
      else writeFileSync(path, existing);
    }
    if (indexEntry) {
      const [mode, hash] = indexEntry.split(" ");
      execFileSync("git", ["update-index", "--cacheinfo", `${mode},${hash},${relative}`], {
        cwd: root,
      });
    } else execFileSync("git", ["update-index", "--force-remove", "--", relative], { cwd: root });
    throw error;
  }
}
