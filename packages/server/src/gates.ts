import { execFileSync } from "node:child_process";
import { gateReadiness, indexProject, workflowGate, type GateRecord } from "@stintwork/core";
import type { Hono } from "hono";
import type { ProjectFilesReader } from "./work-item-files.js";
import { saveWorkItemWorkflow } from "./workflow-writes.js";

export function addGateRoutes(
  app: Hono,
  readProjectFiles: ProjectFilesReader,
  root: string,
  refresh: () => void,
  isStintActive: (slug: string) => boolean,
  writing: Set<string>,
) {
  for (const action of ["approve", "reopen"] as const) {
    app.post(`/api/work-items/:slug/gates/:stage/${action}`, async (context) => {
      const origin = context.req.header("origin");
      if (origin && origin !== new URL(context.req.url).origin)
        return context.json({ reason: "Origin must match the project server." }, 403);
      if (
        context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !==
        "application/json"
      )
        return context.json({ reason: "A JSON gate action is required." }, 400);
      try {
        const body: unknown = await context.req.json();
        if (!body || typeof body !== "object" || Array.isArray(body))
          return context.json({ reason: "A JSON gate action is required." }, 400);
      } catch {
        return context.json({ reason: "Invalid JSON." }, 400);
      }
      const slug = context.req.param("slug");
      const project = readProjectFiles();
      const discoveryFailure = project.warnings.find(({ path }) => path === ".git");
      if (discoveryFailure) return context.json({ reason: discoveryFailure.message }, 503);
      const snapshot = indexProject(project.files, { name: "" });
      const item = snapshot.workItems.find((item) => item.slug === slug);
      if (!item) return context.json({ reason: "Work item not found." }, 404);
      const stages = snapshot.workflows[item.workflow].stages;
      const position = stages.findIndex(({ id }) => id === context.req.param("stage"));
      const stage = stages[position];
      if (!stage || !item.stage) return context.json({ reason: "Stage not found." }, 400);
      if (
        snapshot.warnings.some(
          ({ path, message }) =>
            path === `.scratch/${slug}/workflow.yaml` &&
            message.startsWith("Invalid workflow.yaml:"),
        )
      )
        return context.json({ reason: "workflow.yaml must be valid before changing a gate." }, 409);
      if (item.activeStint || isStintActive(slug) || writing.has(slug))
        return context.json(
          { reason: "A stint or workflow write is active for this work item." },
          409,
        );
      const gate = gateReadiness(item);
      if (action === "approve" && (item.stage !== stage.id || !gate.ready))
        return context.json(
          { reason: item.stage !== stage.id ? "This is not the current stage." : gate.reason },
          409,
        );
      if (
        action === "reopen" &&
        (position >= stages.findIndex(({ id }) => id === item.stage) ||
          !item.stages[stage.id]?.approved)
      )
        return context.json({ reason: "Only an approved earlier stage can be reopened." }, 409);
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
          (text) => workflowGate(text, item, stage.id, action, record),
          !!worktree,
        );
        refresh();
        return context.json({
          stage: action === "approve" ? gate.nextStage : stage.id,
          record,
          commit: workflowCommit,
        });
      } catch (error) {
        refresh();
        return context.json(
          { reason: error instanceof Error ? error.message : String(error) },
          503,
        );
      } finally {
        writing.delete(slug);
      }
    });
  }
}
