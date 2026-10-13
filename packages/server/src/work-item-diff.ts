// SPDX-License-Identifier: Apache-2.0
import { coreTextWire, coreText, indexProject } from "@stintwork/core";

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
    if (discoveryFailure)
      return context.json(coreTextWire({ reason: discoveryFailure.message }), 503);
    if (!indexProject(project.files, { name: "" }).workItems.some((item) => item.slug === slug))
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.workItemNotFound" }) }),
        404,
      );
    if (!project.worktreePaths.has(slug))
      return context.json(
        coreTextWire({ reason: coreText({ code: "review.worktreeMissing" }) }),
        409,
      );
    try {
      return context.json(coreTextWire(await workItemDiff(root, slug)));
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return context.json(
        coreTextWire({
          reason: coreText({ code: "server.diffFailed", params: { detail } }),
        }),
        503,
      );
    }
  });
}
