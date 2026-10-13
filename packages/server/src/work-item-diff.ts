// SPDX-License-Identifier: Apache-2.0
import { indexProject } from "@stintwork/core";
import { workItemDiff } from "@stintwork/git";
import type { Hono } from "hono";
import type { ProjectFilesReader } from "./work-item-files.js";

export function addWorkItemDiffRoute(
  app: Hono,
  root: string,
  readProjectFiles: ProjectFilesReader,
) {
  app.get("/api/work-items/:slug/diff", async (context) => {
    context.header("Cache-Control", "no-store");
    const slug = context.req.param("slug");
    const project = readProjectFiles();
    const discoveryFailure = project.warnings.find(({ path }) => path === ".git");
    if (discoveryFailure) return context.json({ reason: discoveryFailure.message }, 503);
    if (!indexProject(project.files, { name: "" }).workItems.some((item) => item.slug === slug))
      return context.json({ reason: "Work item not found." }, 404);
    if (!project.worktreePaths.has(slug))
      return context.json({ reason: "This work item has no worktree to review." }, 409);
    try {
      return context.json(await workItemDiff(root, slug));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return context.json(
        {
          reason: `Could not read the work item diff: ${detail}`,
          reasonMessage: { code: "server.diffFailed", params: { detail } },
        },
        503,
      );
    }
  });
}
