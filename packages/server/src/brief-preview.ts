import { briefUnavailableReason, compileBrief, indexProject } from "@stintwork/core";
import type { Hono } from "hono";
import { changedSince } from "@stintwork/git";
import type { ProjectFilesReader } from "./work-item-files.js";

export function addBriefPreviewRoute(
  app: Hono,
  readProjectFiles: ProjectFilesReader,
  root: string,
) {
  app.get("/api/work-items/:slug/tickets/:ticket/brief-preview", async (context) => {
    context.header("Cache-Control", "no-store");
    const number = context.req.param("ticket");
    const result = await prepareStintBrief(
      readProjectFiles,
      context.req.param("slug"),
      /^\d+$/.test(number) ? Number(number) : NaN,
      root,
    );
    if ("reason" in result) return context.json({ reason: result.reason }, result.status);
    return context.json(result.brief);
  });
}

export async function prepareStintBrief(
  readProjectFiles: ProjectFilesReader,
  slug: string,
  number: number,
  root: string,
) {
  const project = readProjectFiles();
  const files = project.files;
  const snapshot = indexProject(files, { name: "" });
  const workItem = snapshot.workItems.find((item) => item.slug === slug);
  if (!workItem) return { reason: "Work item not found.", status: 404 as const };
  const ticket = workItem.tickets.find((candidate) => candidate.number === number);
  if (!ticket) return { reason: "Ticket not found.", status: 404 as const };
  const reason = briefUnavailableReason(workItem, ticket);
  if (reason) return { reason, status: 409 as const };
  if (workItem.activeStint)
    return { reason: "A stint is already active for this work item.", status: 409 as const };
  const stage = snapshot.workflows[workItem.workflow].stages.find(
    (candidate) => candidate.id === workItem.stage,
  );
  if (!stage) return { reason: "Stage not found.", status: 409 as const };
  // Stints are newest first. Resume from this ticket's last stint; a ticket's first stint
  // starts from the work item's last stint instead (spec: "for that ticket, or the work item").
  const ended = workItem.stints.filter((stint) => stint.status !== "running");
  const previous = ended.find((stint) => stint.ticket === number) ?? ended[0];
  const checkpointCommit = previous?.checkpointCommit ?? null;
  let changedPaths: string[] = [];
  try {
    if (checkpointCommit)
      changedPaths = await changedSince(
        project.worktreePaths.get(slug) ?? root,
        checkpointCommit,
        slug,
      );
  } catch (error) {
    return {
      reason: `Could not compare the last checkpoint: ${error instanceof Error ? error.message : String(error)}`,
      status: 503 as const,
    };
  }
  return {
    workItem,
    ticket,
    stage,
    brief: compileBrief({
      files,
      workItem,
      stage,
      ticket,
      lastHandoff: previous?.handoff,
      checkpointCommit,
      changedPaths,
    }),
  };
}
