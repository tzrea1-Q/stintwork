// SPDX-License-Identifier: Apache-2.0
import { stringify } from "yaml";
import { editRoadmap } from "./roadmap-editing.js";
import type { WorkflowDefinitions } from "./workflows.js";

export type WorkItemCreation = {
  slug: string;
  workflowText: string;
  roadmapText?: string;
};

export function deriveWorkItemSlug(title: unknown): string {
  if (typeof title !== "string" || !title.trim() || /[\p{Cc}\u2028\u2029\uFFFD]/u.test(title))
    throw new Error("Title must be nonempty, single-line text.");
  const slug = title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-/, "")
    .slice(0, 48)
    .replace(/-$/, "");
  if (!slug) throw new Error("Title must produce a valid ASCII work item slug.");
  return slug;
}

export function prepareWorkItemCreation(
  input: unknown,
  workflows: WorkflowDefinitions,
  roadmap: string,
): WorkItemCreation {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("A work item creation is required.");
  if (!("title" in input)) throw new Error("A title is required.");
  const slug = deriveWorkItemSlug(input.title);
  if (
    !("workflow" in input) ||
    typeof input.workflow !== "string" ||
    !Object.hasOwn(workflows, input.workflow)
  )
    throw new Error("Choose a loaded workflow.");
  const workflow = workflows[input.workflow];
  if (!workflow.stages.length) throw new Error("The workflow needs a first stage.");
  const intent = "intent" in input ? input.intent : undefined;
  if (
    intent !== undefined &&
    (typeof intent !== "string" || /[\p{Cc}\uFFFD]/u.test(intent.replace(/[\t\r\n]/g, "")))
  )
    throw new Error("Intent must be text.");
  const milestone = "milestone" in input ? input.milestone : undefined;
  if (milestone !== undefined && milestone !== null && typeof milestone !== "string")
    throw new Error("Choose a milestone or no milestone.");
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
