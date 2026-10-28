// SPDX-License-Identifier: Apache-2.0
import {
  coreTextWire,
  errorText,
  coreText,
  detectSetup,
  deriveWorkItemSlug,
  indexProject,
  prepareWorkItemCreation,
} from "@stintwork/core";

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
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.originMismatch" }) }),
          403,
        );
      if (
        context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !==
        "application/json"
      )
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.jsonWorkItem" }) }),
          400,
        );
      let input: unknown;
      try {
        input = await context.req.json();
      } catch {
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.invalidJson" }) }),
          400,
        );
      }
      let validated = false;
      try {
        const prepare = () => {
          if (detectSetup(createNodeRepoFiles(root)).tracker === "github-issues")
            throw new WorkItemCreationRefusal({ code: "creation.githubTracker" });
          const slug = deriveWorkItemSlug(
            input && typeof input === "object" && "title" in input ? input.title : undefined,
            input && typeof input === "object" && "slug" in input ? input.slug : undefined,
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
            throw new WorkItemCreationRefusal({ code: "roadmap.worktreesUnreadable" });
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
            throw new WorkItemCreationRefusal({
              code: "creation.exists",
              params: { slug: creation.slug },
            });
          validated = true;
          return creation;
        };
        if (preview) return context.json(coreTextWire({ slug: prepare().slug }));
        const result = await commitWorkItemCreation(root, prepare);
        refresh();
        return context.json(coreTextWire(result), 201);
      } catch (error) {
        return context.json(
          coreTextWire({ reason: errorText(error) }),
          error instanceof WorkItemCreationRefusal ? 409 : validated ? 503 : 400,
        );
      }
    });
  }
}
