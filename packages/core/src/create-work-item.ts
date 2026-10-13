// SPDX-License-Identifier: Apache-2.0
import { CoreTextError } from "./core-text.js";
import { stringify } from "yaml";
import { editRoadmap } from "./roadmap-editing.js";
import type { WorkflowDefinitions } from "./workflows.js";

export type WorkItemCreation = {
  slug: string;
  workflowText: string;
  roadmapText?: string;
};

export function deriveWorkItemSlug(title: unknown, explicitSlug?: unknown): string {
  if (typeof title !== "string" || !title.trim() || /[\p{Cc}\u2028\u2029\uFFFD]/u.test(title))
    throw new CoreTextError({ code: "workItem.titleSingleLine" });
  if (explicitSlug !== undefined) {
    if (
      typeof explicitSlug !== "string" ||
      explicitSlug.length > 48 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(explicitSlug)
    )
      throw new CoreTextError({ code: "creation.invalidSlug" });
    return explicitSlug;
  }
  const slug = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-/, "")
    .slice(0, 48)
    .replace(/-$/, "");
  if (!slug) throw new CoreTextError({ code: "workItem.titleSlug" });
  return slug;
}

export function prepareWorkItemCreation(
  input: unknown,
  workflows: WorkflowDefinitions,
  roadmap: string,
): WorkItemCreation {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new CoreTextError({ code: "workItem.creationRequired" });
  if (!("title" in input)) throw new CoreTextError({ code: "workItem.titleRequired" });
  const slug = deriveWorkItemSlug(input.title, "slug" in input ? input.slug : undefined);
  if (
    !("workflow" in input) ||
    typeof input.workflow !== "string" ||
    !Object.hasOwn(workflows, input.workflow)
  )
    throw new CoreTextError({ code: "workItem.workflowLoaded" });
  const workflow = workflows[input.workflow];
  if (!workflow.stages.length) throw new CoreTextError({ code: "workItem.firstStage" });
  const intent = "intent" in input ? input.intent : undefined;
  if (
    intent !== undefined &&
    (typeof intent !== "string" || /[\p{Cc}\uFFFD]/u.test(intent.replace(/[\t\r\n]/g, "")))
  )
    throw new CoreTextError({ code: "workItem.intentText" });
  const milestone = "milestone" in input ? input.milestone : undefined;
  if (milestone !== undefined && milestone !== null && typeof milestone !== "string")
    throw new CoreTextError({ code: "workItem.milestoneChoice" });
  return {
    slug,
    workflowText: stringify({
      title: (input.title as string).trim(),
      workflow: workflow.id,
      stage: workflow.stages[0].id,
      ...(intent === undefined || !intent.trim() ? {} : { intent }),
    }),
    ...(milestone === undefined || milestone === null
      ? {}
      : {
          roadmapText: editRoadmap(roadmap, { kind: "move", workItem: slug, milestone }).text,
        }),
  };
}
