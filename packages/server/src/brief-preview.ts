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
    const snapshot = indexProject(files, { name: "" });
    const workItem = snapshot.workItems.find((item) => item.slug === context.req.param("slug"));
    if (!workItem) return context.json({ reason: "Work item not found." }, 404);
    const number = context.req.param("ticket");
    const ticket = /^\d+$/.test(number)
      ? workItem.tickets.find((candidate) => candidate.number === Number(number))
      : undefined;
    if (!ticket) return context.json({ reason: "Ticket not found." }, 404);
    const reason = briefUnavailableReason(workItem, ticket);
    if (reason) return context.json({ reason }, 409);
    const stage = snapshot.workflows[workItem.workflow].stages.find(
      (candidate) => candidate.id === workItem.stage,
    );
    if (!stage) return context.json({ reason: "Stage not found." }, 409);
    return context.json(compileBrief({ files, workItem, stage, ticket }));
  });
}
