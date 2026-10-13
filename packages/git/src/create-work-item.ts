// SPDX-License-Identifier: Apache-2.0
import { CoreTextError } from "@stintwork/core";
import { execFileSync } from "node:child_process";
import { lstatSync, mkdirSync, readFileSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { commitWithIdentity } from "./checkpoints.js";
import { withRepoLock } from "./index.js";

export class WorkItemCreationRefusal extends CoreTextError {}

type Creation = { slug: string; workflowText: string; roadmapText?: string };

function git(root: string, args: string[]) {
  return execFileSync("git", ["--literal-pathspecs", ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function checkWorkItemCreation(
  root: string,
  creation: Pick<Creation, "slug" | "roadmapText">,
) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(creation.slug) || creation.slug.length > 48)
    throw new WorkItemCreationRefusal({ code: "git.invalidSlug" });
  for (const directory of [
    ".scratch",
    ...(creation.roadmapText === undefined ? [] : [".stintwork"]),
  ]) {
    const stat = lstatSync(join(root, directory), { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink()))
      throw new WorkItemCreationRefusal(
        directory === ".scratch"
          ? { code: "creation.scratchDirectory" }
          : { code: "server.projectDirectory" },
      );
  }
  const folder = `.scratch/${creation.slug}`;
  if (lstatSync(join(root, folder), { throwIfNoEntry: false }))
    throw new WorkItemCreationRefusal({ code: "creation.exists", params: { slug: creation.slug } });
  const targets = [
    folder,
    ...(creation.roadmapText === undefined ? [] : [".stintwork/roadmap.md"]),
  ];
  if (git(root, ["status", "--porcelain=v1", "--untracked-files=all", "--", ...targets]))
    throw new WorkItemCreationRefusal({ code: "creation.commitPaths" });
  if (git(root, ["ls-files", "--", folder]))
    throw new WorkItemCreationRefusal({
      code: "creation.existsInGit",
      params: { slug: creation.slug },
    });
  if (creation.roadmapText !== undefined) {
    const relative = ".stintwork/roadmap.md";
    const path = join(root, relative);
    const stat = lstatSync(path, { throwIfNoEntry: false });
    if (stat && (!stat.isFile() || stat.isSymbolicLink()))
      throw new WorkItemCreationRefusal({ code: "roadmap.regularFile" });
    if (
      stat &&
      (!git(root, ["ls-files", "--", relative]) ||
        git(root, ["hash-object", `--path=${relative}`, path]) !==
          git(root, ["rev-parse", `HEAD:${relative}`]))
    )
      throw new WorkItemCreationRefusal({ code: "creation.roadmapEdits" });
  }
}

export function commitWorkItemCreation(root: string, prepare: () => Creation) {
  return withRepoLock(root, async () => {
    const creation = prepare();
    checkWorkItemCreation(root, creation);
    const workflow = `.scratch/${creation.slug}/workflow.yaml`;
    const writes = [
      { relative: workflow, text: creation.workflowText },
      ...(creation.roadmapText === undefined
        ? []
        : [{ relative: ".stintwork/roadmap.md", text: creation.roadmapText }]),
    ];
    const originals = writes.map(({ relative }) => {
      const path = join(root, relative);
      return lstatSync(path, { throwIfNoEntry: false }) ? readFileSync(path, "utf8") : undefined;
    });
    const written: number[] = [];
    try {
      for (const [index, { relative, text }] of writes.entries()) {
        mkdirSync(join(root, relative, ".."), { recursive: true });
        writeFileSync(join(root, relative), text, {
          flag: originals[index] === undefined ? "wx" : "w",
        });
        written.push(index);
      }
      const paths = writes.map(({ relative }) => relative);
      git(root, ["add", "--", ...paths]);
      await commitWithIdentity(
        async (args) => git(root, args),
        ["--only", "-m", `Create work item ${creation.slug}`, "--", ...paths],
      );
      return { slug: creation.slug, commit: git(root, ["rev-parse", "HEAD"]) };
    } catch (error) {
      for (const index of written) {
        const { relative, text } = writes[index];
        const path = join(root, relative);
        const stat = lstatSync(path, { throwIfNoEntry: false });
        if (stat?.isFile() && !stat.isSymbolicLink() && readFileSync(path, "utf8") === text) {
          if (originals[index] === undefined) rmSync(path);
          else writeFileSync(path, originals[index]);
        }
        if (originals[index] === undefined)
          git(root, ["update-index", "--force-remove", "--", relative]);
        else git(root, ["reset", "-q", "HEAD", "--", relative]);
      }
      const folder = join(root, ".scratch", creation.slug);
      if (lstatSync(folder, { throwIfNoEntry: false })?.isDirectory()) {
        try {
          rmdirSync(folder);
        } catch {}
      }
      throw error;
    }
  });
}
