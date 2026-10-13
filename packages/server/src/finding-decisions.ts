// SPDX-License-Identifier: Apache-2.0
import {
  coreTextWire,
  errorText,
  coreText,
  indexProject,
  latestReviewStint,
  workflowGate,
  type ReviewDecision,
} from "@stintwork/core";

import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import type { Hono } from "hono";
import { saveWorkItemReview } from "./review-writes.js";
import type { ProjectFilesReader } from "./work-item-files.js";
import type { ReviewEvidenceReader } from "./review-evidence.js";

export function addFindingDecisionRoutes(
  app: Hono,
  readProjectFiles: ProjectFilesReader,
  refresh: () => void,
  isStintActive: (slug: string) => boolean,
  writing: Set<string>,
  isChecking: (slug: string) => boolean,
  readReviewEvidence?: ReviewEvidenceReader,
) {
  for (const action of ["decision", "send-back", "accept-risky-path"] as const) {
    const route = action === "accept-risky-path" ? "risky-paths/accept" : `findings/${action}`;
    app.post(`/api/work-items/:slug/${route}`, async (context) => {
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
          coreTextWire({ reason: coreText({ code: "server.jsonFinding" }) }),
          400,
        );
      let body: unknown;
      try {
        body = await context.req.json();
      } catch {
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.invalidJson" }) }),
          400,
        );
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.jsonFinding" }) }),
          400,
        );
      const request = body as Record<string, unknown>;
      if (
        action === "accept-risky-path" &&
        (typeof request.id !== "string" ||
          typeof request.blob !== "string" ||
          !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(request.blob) ||
          typeof request.reason !== "string" ||
          !request.reason.trim())
      )
        return context.json(coreTextWire({ reason: coreText({ code: "review.chooseRisk" }) }), 400);
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
          coreTextWire({
            reason: coreText({ code: "review.chooseFinding" }),
          }),
          400,
        );
      const slug = context.req.param("slug");
      const project = readProjectFiles();
      if (project.warnings.some(({ path }) => path === ".git"))
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.branchesUnavailable" }) }),
          503,
        );
      const snapshot = indexProject(project.files, { name: "" });
      const item = snapshot.workItems.find((entry) => entry.slug === slug);
      if (!item)
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.workItemNotFound" }) }),
          404,
        );
      if (item.merged)
        return context.json(coreTextWire({ reason: coreText({ code: "workItem.shipped" }) }), 409);
      if (item.activeStint || isStintActive(slug) || writing.has(slug) || isChecking(slug))
        return context.json(
          coreTextWire({ reason: coreText({ code: "review.activeWrite" }) }),
          409,
        );
      if (action === "accept-risky-path") {
        readReviewEvidence?.(project, snapshot);
        if (item.reviewEvidenceError || item.riskyPaths === undefined)
          return context.json(
            coreTextWire({
              reason: item.reviewEvidenceError ?? coreText({ code: "review.riskyPathsUnreadable" }),
            }),
            503,
          );
        if (!item.riskyPaths.some((risk) => risk.path === request.id && risk.blob === request.blob))
          return context.json(
            coreTextWire({ reason: coreText({ code: "review.riskyPathChanged" }) }),
            409,
          );
        const worktree = project.worktreePaths.get(slug);
        if (!worktree)
          return context.json(
            coreTextWire({ reason: coreText({ code: "server.worktreeUnavailable" }) }),
            409,
          );
        writing.add(slug);
        try {
          let by = "Developer";
          try {
            by =
              execFileSync("git", ["config", "--get", "user.name"], {
                cwd: worktree,
                encoding: "utf8",
                stdio: "pipe",
              }).trim() || by;
          } catch (error) {
            if ((error as { status?: number }).status !== 1) throw error;
          }
          const decision: ReviewDecision = {
            id: request.id as string,
            blob: request.blob as string,
            kind: "risky-path",
            status: "accepted",
            reason: (request.reason as string).trim(),
            by,
            at: new Date().toISOString(),
          };
          const commit = await saveWorkItemReview(worktree, slug, decision);
          refresh();
          return context.json(coreTextWire({ decision, commit }));
        } catch (error) {
          return context.json(coreTextWire({ reason: errorText(error) }), 503);
        } finally {
          writing.delete(slug);
        }
      }
      const reviewPath = `.scratch/${slug}/review.yaml`;
      const workflowPath = `.scratch/${slug}/workflow.yaml`;
      if (
        snapshot.warnings.some(
          ({ path }) => path === reviewPath || (action === "send-back" && path === workflowPath),
        )
      )
        return context.json(
          coreTextWire({ reason: coreText({ code: "review.validFilesRequired" }) }),
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
          coreTextWire({
            reason:
              action === "decision"
                ? coreText({ code: "review.findingNotFound" })
                : coreText({ code: "review.noOpenFindings" }),
          }),
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
          coreTextWire({ reason: coreText({ code: "review.sendBackStages" }) }),
          409,
        );
      const worktree = project.worktreePaths.get(slug);
      if (!worktree)
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.worktreeUnavailable" }) }),
          409,
        );
      const reason = typeof request.reason === "string" ? request.reason.trim() : "";
      const status =
        action === "send-back" ? "sent-back" : (request.status as ReviewDecision["status"]);
      const previous = item.reviewDecisions?.find(
        (entry) => entry.kind === "finding" && entry.id === request.id,
      );
      if (action === "decision" && previous?.status === status && previous.reason === reason)
        return context.json(coreTextWire({ decision: previous }));
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
          coreTextWire(
            action === "decision"
              ? { decision: decisions[0], commit }
              : {
                  decisions,
                  stage: implementation?.id,
                  stageName: implementation?.name,
                  record,
                  commit,
                },
          ),
        );
      } catch (error) {
        refresh();
        return context.json(coreTextWire({ reason: errorText(error) }), 409);
      } finally {
        writing.delete(slug);
      }
    });
  }
}
