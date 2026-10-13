// SPDX-License-Identifier: Apache-2.0
import {
  coreTextWire,
  errorText,
  coreText,
  CoreTextError,
  editRoadmap,
  indexProject,
  type Milestone,
} from "@stintwork/core";

import { commitRoadmap, RoadmapWriteRefusal } from "@stintwork/git";
import type { Hono } from "hono";
import type { ProjectFilesReader } from "./work-item-files.js";

export function addRoadmapRoute(
  app: Hono,
  root: string,
  readProjectFiles: ProjectFilesReader,
  refresh: () => void,
) {
  app.post("/api/roadmap", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.originMismatch" }) }),
        403,
      );
    if (
      context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return context.json(coreTextWire({ reason: coreText({ code: "server.jsonRoadmap" }) }), 400);
    let change: unknown;
    try {
      change = await context.req.json();
    } catch {
      return context.json(coreTextWire({ reason: coreText({ code: "server.invalidJson" }) }), 400);
    }
    let milestones: Milestone[] = [];
    let validated = false;
    try {
      const commit = await commitRoadmap(root, (text) => {
        const edited = editRoadmap(text, change);
        if (change && typeof change === "object" && "kind" in change && change.kind === "move") {
          const project = readProjectFiles();
          if (project.warnings.some(({ path }) => path === ".git"))
            throw new RoadmapWriteRefusal({ code: "roadmap.worktreesUnreadable" });
          const item = indexProject(project.files, { name: "" }).workItems.find(
            (item) => "workItem" in change && item.slug === change.workItem,
          );
          if (!item) throw new CoreTextError({ code: "server.workItemNotFound" });
          if (
            item.declaredMilestone !== undefined &&
            "milestone" in change &&
            item.declaredMilestone !== change.milestone
          )
            throw new RoadmapWriteRefusal({ code: "roadmap.declaredMilestone" });
        }
        milestones = edited.milestones;
        validated = true;
        return edited;
      });
      refresh();
      return context.json(coreTextWire({ milestones, commit }));
    } catch (error) {
      return context.json(
        coreTextWire({ reason: errorText(error) }),
        error instanceof RoadmapWriteRefusal ? 409 : validated ? 503 : 400,
      );
    }
  });
}
