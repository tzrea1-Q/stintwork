// SPDX-License-Identifier: Apache-2.0
import { deriveWorkItemSlug, indexProject, prepareWorkItemCreation } from "@stintwork/core";
import {
  checkWorkItemCreation,
  commitWorkItemCreation,
  WorkItemCreationRefusal,
} from "@stintwork/git";
import type { Hono } from "hono";
import { createNodeRepoFiles } from "./repo-files.js";
import type { ProjectFilesReader } from "./work-item-files.js";

export function addWorkItemCreationRoutes(
  app: Hono,
  root: string,
  readProjectFiles: ProjectFilesReader,
  refresh: () => void,
) {
  for (const preview of [true, false]) {
    app.post(preview ? "/api/work-items/preview" : "/api/work-items", async (context) => {
      const origin = context.req.header("origin");
      if (origin && origin !== new URL(context.req.url).origin)
        return context.json({ reason: "Origin must match the project server." }, 403);
      if (
        context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !==
        "application/json"
      )
        return context.json({ reason: "A JSON work item creation is required." }, 400);
      let input: unknown;
      try {
        input = await context.req.json();
      } catch {
        return context.json({ reason: "Invalid JSON." }, 400);
      }
      let validated = false;
      try {
        const prepare = () => {
          const slug = deriveWorkItemSlug(
            input && typeof input === "object" && "title" in input ? input.title : undefined,
          );
          checkWorkItemCreation(root, {
            slug,
            ...(input &&
            typeof input === "object" &&
            "milestone" in input &&
            input.milestone != null
              ? { roadmapText: "" }
              : {}),
          });
          const project = readProjectFiles();
          if (project.warnings.some(({ path }) => path === ".git"))
            throw new WorkItemCreationRefusal("Cannot discover work item worktrees.");
          const snapshot = indexProject(project.files, { name: "" });
          const creation = prepareWorkItemCreation(
            input,
            snapshot.workflows,
            createNodeRepoFiles(root).read(".stintwork/roadmap.md") ?? "",
          );
          if (
            project.worktreePaths.has(creation.slug) ||
            snapshot.workItems.some(({ slug }) => slug === creation.slug)
          )
            throw new WorkItemCreationRefusal(`Work item ${creation.slug} already exists.`);
          validated = true;
          return creation;
        };
        if (preview) return context.json({ slug: prepare().slug });
        const result = await commitWorkItemCreation(root, prepare);
        refresh();
        return context.json(result, 201);
      } catch (error) {
        return context.json(
          { reason: error instanceof Error ? error.message : String(error) },
          error instanceof WorkItemCreationRefusal ? 409 : validated ? 503 : 400,
        );
      }
    });
  }
}
