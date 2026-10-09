import {
  briefUnavailableReason,
  compileBrief,
  indexProject,
  type RepoFiles,
} from "@stintwork/core";
import type { Hono } from "hono";

export function addBriefPreviewRoute(app: Hono, files: RepoFiles) {
  app.get("/api/work-items/:slug/tickets/:ticket/brief-preview", (context) => {
    context.header("Cache-Control", "no-store");
    const number = context.req.param("ticket");
    const result = prepareStintBrief(
      files,
      context.req.param("slug"),
      /^\d+$/.test(number) ? Number(number) : NaN,
    );
    if ("reason" in result) return context.json({ reason: result.reason }, result.status);
    return context.json(result.brief);
  });
}

export function prepareStintBrief(files: RepoFiles, slug: string, number: number) {
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
  return { workItem, ticket, stage, brief: compileBrief({ files, workItem, stage, ticket }) };
}
