// SPDX-License-Identifier: Apache-2.0
import {
  briefAvailability,
  compileBrief,
  indexProject,
  indexStints,
  pendingDeveloperNotes,
  parseReviewDeveloperNotes,
  stageAgent,
  projectPermissionLevel,
  permissionPolicy,
  type PermissionLevel,
  type DeveloperNote,
  coreTextReason,
} from "@stintwork/core";
import { type AgentRegistry, refreshAgentAvailability, findingsFormat } from "@stintwork/agents";
import type { Hono } from "hono";
import { changedSince, workItemDiff } from "@stintwork/git";
import type { ProjectFilesReader } from "./work-item-files.js";

export function addBriefPreviewRoute(
  app: Hono,
  readProjectFiles: ProjectFilesReader,
  root: string,
  registry: AgentRegistry,
  refresh: () => void = () => {},
) {
  app.get("/api/work-items/:slug/brief-preview", async (context) => {
    context.header("Cache-Control", "no-store");
    const result = await prepareStintBrief(
      readProjectFiles,
      context.req.param("slug"),
      null,
      root,
      registry,
    );
    refresh();
    if ("reason" in result)
      return context.json(
        { reason: result.reason, reasonMessage: result.reasonMessage },
        result.status,
      );
    return context.json(result.brief);
  });
  app.get("/api/work-items/:slug/tickets/:ticket/brief-preview", async (context) => {
    context.header("Cache-Control", "no-store");
    const number = context.req.param("ticket");
    const result = await prepareStintBrief(
      readProjectFiles,
      context.req.param("slug"),
      /^\d+$/.test(number) ? Number(number) : NaN,
      root,
      registry,
    );
    refresh();
    if ("reason" in result)
      return context.json(
        { reason: result.reason, reasonMessage: result.reasonMessage },
        result.status,
      );
    return context.json(result.brief);
  });
}

export async function prepareStintBrief(
  readProjectFiles: ProjectFilesReader,
  slug: string,
  number: number | null,
  root: string,
  registry: AgentRegistry,
  chosenAgent?: string,
  chosenLevel?: PermissionLevel,
) {
  const project = readProjectFiles();
  const files = project.files;
  const snapshot = indexProject(files, { name: "" });
  const workItem = snapshot.workItems.find((item) => item.slug === slug);
  if (!workItem) return { ...coreTextReason("Work item not found."), status: 404 as const };
  const ticket =
    number === null ? null : workItem.tickets.find((candidate) => candidate.number === number);
  if (ticket === undefined) return { ...coreTextReason("Ticket not found."), status: 404 as const };
  const unavailable = briefAvailability(workItem, ticket, snapshot.workflows);
  if (unavailable.reason)
    return {
      ...coreTextReason(unavailable.reason, unavailable.reasonMessage),
      status: 409 as const,
    };
  if (workItem.activeStint)
    return {
      ...coreTextReason("A stint is already active for this work item."),
      status: 409 as const,
    };
  const stage = snapshot.workflows[workItem.workflow].stages.find(
    (candidate) => candidate.id === workItem.stage,
  );
  if (!stage) return { ...coreTextReason("Stage not found."), status: 409 as const };
  const agent =
    chosenAgent ?? stageAgent(workItem, stage.id, [...registry.values()], snapshot.workflows);
  const registered = registry.get(agent);
  if (registered) await refreshAgentAvailability(registered);
  let permissionLevel: PermissionLevel;
  try {
    permissionLevel = chosenLevel ?? projectPermissionLevel(files.read(".stintwork/config"));
  } catch (error) {
    return { ...coreTextReason(String(error)), status: 409 as const };
  }
  // Stints are newest first. Resume from this ticket's last stint; a ticket's first stint
  // starts from the work item's last stint instead (spec: "for that ticket, or the work item").
  const ended = workItem.stints.filter((stint) => stint.status !== "running");
  const previous =
    number === null ? ended[0] : (ended.find((stint) => stint.ticket === number) ?? ended[0]);
  const checkpointCommit = previous?.checkpointCommit ?? null;
  let changedPaths: string[] = [];
  let reviewRange: { mergeBase: string; headCommit: string } | undefined;
  try {
    if (stage.gate === "evidence" && project.worktreePaths.has(slug))
      reviewRange = await workItemDiff(root, slug);
    if (checkpointCommit)
      changedPaths = await changedSince(
        project.worktreePaths.get(slug) ?? root,
        checkpointCommit,
        slug,
      );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ...coreTextReason(
        `${stage.gate === "evidence" ? "Could not prepare the Review diff" : "Could not compare the last checkpoint"}: ${detail}`,
        {
          code:
            stage.gate === "evidence"
              ? "server.reviewDiffFailed"
              : "server.checkpointCompareFailed",
          params: { detail },
        },
      ),
      status: 503 as const,
    };
  }
  let reviewNotes: DeveloperNote[];
  try {
    reviewNotes =
      stage.column === "implement"
        ? parseReviewDeveloperNotes(files.read(`.scratch/${slug}/review.yaml`))
        : [];
  } catch (error) {
    return { ...coreTextReason(String(error)), status: 409 as const };
  }
  const brief = compileBrief({
    files,
    workItem,
    stage,
    ticket,
    lastHandoff: previous?.handoff,
    developerNotes: pendingDeveloperNotes(
      indexStints(files).stints.filter((stint) => stint.workItem === slug),
      reviewNotes,
    ),
    checkpointCommit,
    changedPaths,
    reviewRange,
  });
  const policy = registered ? permissionPolicy(registered, permissionLevel) : undefined;
  return {
    workItem,
    ticket,
    stage,
    workflows: snapshot.workflows,
    brief: {
      ...brief,
      agent,
      permissionLevel,
      warnings: policy?.warnings ?? [],
      warningMessages: policy?.warningMessages ?? [],
      ...(stage.gate === "evidence"
        ? {
            prompt: `${brief.prompt}\n\nAfter-turn findings format for ${stage.skill}:\n${findingsFormat}`,
          }
        : {}),
    },
  };
}
