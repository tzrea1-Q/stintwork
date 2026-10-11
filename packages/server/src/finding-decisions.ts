import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  indexProject,
  latestReviewStint,
  workflowGate,
  type ReviewDecision,
} from "@stintwork/core";
import type { Hono } from "hono";
import { saveWorkItemReview } from "./review-writes.js";
import type { ProjectFilesReader } from "./work-item-files.js";

export function addFindingDecisionRoutes(
  app: Hono,
  readProjectFiles: ProjectFilesReader,
  refresh: () => void,
  isStintActive: (slug: string) => boolean,
  writing: Set<string>,
  isChecking: (slug: string) => boolean,
) {
  for (const action of ["decision", "send-back"] as const) {
    app.post(`/api/work-items/:slug/findings/${action}`, async (context) => {
      const origin = context.req.header("origin");
      if (origin && origin !== new URL(context.req.url).origin)
        return context.json({ reason: "Origin must match the project server." }, 403);
      if (
        context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !==
        "application/json"
      )
        return context.json({ reason: "A JSON finding action is required." }, 400);
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json({ reason: "Invalid JSON." }, 400);
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        return context.json({ reason: "A JSON finding action is required." }, 400);
      const request = body as Record<string, unknown>;
      if (
        action === "decision" &&
        (typeof request.id !== "string" ||
          !request.id.trim() ||
          typeof request.status !== "string" ||
          !["open", "resolved", "accepted"].includes(request.status) ||
          (request.reason !== undefined && typeof request.reason !== "string") ||
          (request.status === "accepted" &&
            (typeof request.reason !== "string" || !request.reason.trim())))
      )
        return context.json(
          {
            reason:
              "Choose a finding id and open, resolved or accepted status; acceptance needs a reason.",
          },
          400,
        );
      const slug = context.req.param("slug");
      const project = readProjectFiles();
      if (project.warnings.some(({ path }) => path === ".git"))
        return context.json({ reason: "Cannot discover work item branches." }, 503);
      const snapshot = indexProject(project.files, { name: "" });
      const item = snapshot.workItems.find((entry) => entry.slug === slug);
      if (!item) return context.json({ reason: "Work item not found." }, 404);
      if (item.activeStint || isStintActive(slug) || writing.has(slug) || isChecking(slug))
        return context.json(
          { reason: "A stint, check or review write is active for this work item." },
          409,
        );
      const reviewPath = `.scratch/${slug}/review.yaml`;
      const workflowPath = `.scratch/${slug}/workflow.yaml`;
      if (
        snapshot.warnings.some(
          ({ path }) => path === reviewPath || (action === "send-back" && path === workflowPath),
        )
      )
        return context.json(
          { reason: "Review and workflow files must be valid before changing findings." },
          409,
        );
      const findings =
        action === "send-back"
          ? (latestReviewStint(
              item.stints,
              snapshot.workflows[item.workflow].stages.find((stage) => stage.gate === "evidence")
                ?.id,
            )?.findings?.findings ?? [])
          : item.stints.flatMap((stint) => stint.findings?.findings ?? []);
      const selected =
        action === "decision"
          ? findings.filter((finding) => finding.id === request.id)
          : findings.filter(
              (finding) =>
                !item.reviewDecisions?.some(
                  (entry) =>
                    entry.kind === "finding" && entry.id === finding.id && entry.status !== "open",
                ),
            );
      if (!selected.length)
        return context.json(
          {
            reason:
              action === "decision"
                ? "Finding not found."
                : "There are no open findings to send back.",
          },
          action === "decision" ? 404 : 409,
        );
      const implementation = snapshot.workflows[item.workflow].stages.find(
        (stage) => stage.column === "implement",
      );
      if (
        action === "send-back" &&
        (snapshot.workflows[item.workflow].stages.find(({ id }) => id === item.stage)?.gate !==
          "evidence" ||
          !implementation)
      )
        return context.json(
          { reason: "Send back requires Review and an implementation stage." },
          409,
        );
      const worktree = project.worktreePaths.get(slug);
      if (!worktree)
        return context.json({ reason: "The work item's worktree is unavailable." }, 409);
      const reason = typeof request.reason === "string" ? request.reason.trim() : "";
      const status =
        action === "send-back" ? "sent-back" : (request.status as ReviewDecision["status"]);
      const previous = item.reviewDecisions?.find(
        (entry) => entry.kind === "finding" && entry.id === request.id,
      );
      if (action === "decision" && previous?.status === status && previous.reason === reason)
        return context.json({ decision: previous });
      writing.add(slug);
      try {
        let by = "Developer";
        try {
          by =
            execFileSync("git", ["config", "--get", "user.name"], {
              cwd: worktree,
              encoding: "utf8",
            }).trim() || by;
        } catch (error) {
          if ((error as { status?: number }).status !== 1) throw error;
        }
        const at = new Date().toISOString();
        const decisions: ReviewDecision[] = selected.map((finding) => ({
          id: finding.id,
          kind: "finding",
          status,
          reason: action === "send-back" ? "" : reason,
          by,
          at,
        }));
        const record = {
          by,
          at,
          source: "review" as const,
          commit: execFileSync("git", ["rev-parse", "HEAD"], {
            cwd: worktree,
            encoding: "utf8",
          }).trim(),
        };
        const sendBack =
          action === "send-back" && implementation
            ? {
                workflow: workflowGate(
                  project.files.read(workflowPath),
                  item,
                  implementation.id,
                  "reopen",
                  record,
                  snapshot.workflows,
                ),
                note: {
                  id: `review:${randomUUID()}`,
                  at,
                  source: "review" as const,
                  text: [
                    "## Review findings",
                    `From review — address these findings in ${implementation.name}:`,
                    ...selected.map(
                      (finding) =>
                        `### ${finding.title}\nFinding ${finding.id} · ${finding.axis} · ${finding.severity}\n${finding.path}:${finding.line}\n${finding.body}`,
                    ),
                  ].join("\n\n"),
                },
              }
            : undefined;
        const commit = await saveWorkItemReview(worktree, slug, decisions, undefined, sendBack);
        refresh();
        return context.json(
          action === "decision"
            ? { decision: decisions[0], commit }
            : {
                decisions,
                stage: implementation?.id,
                stageName: implementation?.name,
                record,
                commit,
              },
        );
      } catch (error) {
        refresh();
        return context.json(
          { reason: error instanceof Error ? error.message : String(error) },
          409,
        );
      } finally {
        writing.delete(slug);
      }
    });
  }
}
