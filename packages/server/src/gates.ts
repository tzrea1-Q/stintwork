// SPDX-License-Identifier: Apache-2.0
import {
  coreTextWire,
  errorText,
  coreText,
  gateReadiness,
  workflowGate,
  type GateRecord,
} from "@stintwork/core";

import { execFileSync } from "node:child_process";

import type { Hono } from "hono";
import type { ProjectFilesReader } from "./work-item-files.js";
import { resolveProjectSnapshot } from "./project-snapshot.js";
import type { ProjectSnapshot } from "@stintwork/core";
import { saveWorkItemWorkflow } from "./workflow-writes.js";
import type { ReviewEvidenceReader } from "./review-evidence.js";
import { createMemoryProposalReader } from "./memory-proposals.js";

export function addGateRoutes(
  app: Hono,
  readProjectFiles: ProjectFilesReader,
  root: string,
  refresh: () => void,
  isStintActive: (slug: string) => boolean,
  writing: Set<string>,
  readReviewEvidence?: ReviewEvidenceReader,
  getSnapshot?: () => ProjectSnapshot,
) {
  const readMemoryProposals = createMemoryProposalReader(root);
  for (const action of ["approve", "reopen"] as const) {
    app.post(`/api/work-items/:slug/gates/:stage/${action}`, async (context) => {
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
        return context.json(coreTextWire({ reason: coreText({ code: "server.jsonGate" }) }), 400);
      try {
        const body: unknown = await context.req.json();
        if (!body || typeof body !== "object" || Array.isArray(body))
          return context.json(coreTextWire({ reason: coreText({ code: "server.jsonGate" }) }), 400);
      } catch {
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.invalidJson" }) }),
          400,
        );
      }
      const slug = context.req.param("slug");
      const project = readProjectFiles();
      const discoveryFailure = project.warnings.find(({ path }) => path === ".git");
      if (discoveryFailure)
        return context.json(coreTextWire({ reason: discoveryFailure.message }), 503);
      const snapshot = resolveProjectSnapshot(project, getSnapshot);
      if (snapshot.setup.tracker === "github-issues" && /^github-[1-9]\d*$/.test(slug))
        return context.json(
          {
            reason: "Use the GitHub gate routes at /api/github/items/:number/gates/:action.",
            reasonCode: "github-gate-route",
          },
          409,
        );
      const item = snapshot.workItems.find((item) => item.slug === slug);
      if (!item)
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.workItemNotFound" }) }),
          404,
        );
      if (item.merged)
        return context.json(coreTextWire({ reason: coreText({ code: "workItem.shipped" }) }), 409);
      const stages = snapshot.workflows[item.workflow].stages;
      const position = stages.findIndex(({ id }) => id === context.req.param("stage"));
      const stage = stages[position];
      if (!stage || !item.stage)
        return context.json(
          coreTextWire({ reason: coreText({ code: "server.stageNotFound" }) }),
          400,
        );
      if (
        snapshot.warnings.some(
          ({ path, message }) =>
            path === `.scratch/${slug}/workflow.yaml` &&
            message.startsWith("Invalid workflow.yaml:"),
        )
      )
        return context.json(
          coreTextWire({ reason: coreText({ code: "gate.validWorkflowRequired" }) }),
          409,
        );
      if (item.activeStint || isStintActive(slug) || writing.has(slug))
        return context.json(coreTextWire({ reason: coreText({ code: "gate.activeWrite" }) }), 409);
      if (action === "approve" && stage.gate === "evidence")
        readReviewEvidence?.(project, snapshot);
      else if (action === "approve" && stage.column === "clarify")
        readMemoryProposals(project.files, snapshot);
      const gate = gateReadiness(item, snapshot.workflows);
      if (action === "approve" && (item.stage !== stage.id || !gate.ready)) {
        refresh();
        return context.json(
          coreTextWire({
            reason:
              item.stage !== stage.id ? coreText({ code: "gate.notCurrentStage" }) : gate.reason,
            conditions: gate.conditions,
          }),
          409,
        );
      }
      if (
        action === "reopen" &&
        (position >= stages.findIndex(({ id }) => id === item.stage) ||
          !item.stages[stage.id]?.approved)
      )
        return context.json(
          coreTextWire({ reason: coreText({ code: "gate.reopenEarlier" }) }),
          409,
        );
      writing.add(slug);
      try {
        const worktree = project.worktreePaths.get(slug);
        const directory = worktree ?? root;
        const commit = execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: directory,
          encoding: "utf8",
        }).trim();
        let by = "Developer";
        try {
          by = execFileSync("git", ["config", "--get", "user.name"], {
            cwd: directory,
            encoding: "utf8",
          }).trim();
        } catch (error) {
          if ((error as { status?: number }).status !== 1) throw error;
        }
        const record: GateRecord = { by: by || "Developer", at: new Date().toISOString(), commit };
        const workflowCommit = await saveWorkItemWorkflow(
          directory,
          slug,
          (text) => workflowGate(text, item, stage.id, action, record, snapshot.workflows),
          `${action === "approve" ? "Approve" : "Reopen"} ${stage.id} gate for ${slug}`,
        );
        const headChanged =
          action === "approve" &&
          workflowCommit !== null &&
          execFileSync("git", ["rev-parse", `${workflowCommit}^`], {
            cwd: directory,
            encoding: "utf8",
          }).trim() !== record.commit;
        refresh();
        return context.json(
          coreTextWire({
            ...(headChanged ? { approval: "stale", reason: "head-changed" } : {}),
            stage: action === "approve" ? gate.nextStage : stage.id,
            record,
            commit: workflowCommit,
          }),
        );
      } catch (error) {
        refresh();
        return context.json(coreTextWire({ reason: errorText(error) }), 503);
      } finally {
        writing.delete(slug);
      }
    });
  }
}
