// SPDX-License-Identifier: Apache-2.0
import type { AgentRegistry } from "@stintwork/agents";
import {
  agentUnavailableReason,
  builtInWorkflows,
  indexProject,
  workflowStageAgent,
  type StagedWorkItem,
  type StageId,
} from "@stintwork/core";
import type { Hono } from "hono";
import type { ProjectFilesReader } from "./work-item-files.js";
import { saveWorkItemWorkflow, writeWorkItemWorkflow } from "./workflow-writes.js";

export function writeStageAgentWorkflow(
  root: string,
  item: Pick<StagedWorkItem, "slug" | "workflow" | "stage">,
  stage: StageId,
  agent: string,
): boolean {
  return writeWorkItemWorkflow(root, item.slug, (existing) =>
    workflowStageAgent(existing, item, stage, agent),
  );
}

export function addStageAgentRoute(
  app: Hono,
  readProjectFiles: ProjectFilesReader,
  root: string,
  registry: AgentRegistry,
  refresh: () => void,
  isStintActive: (slug: string) => boolean,
  writing = new Set<string>(),
) {
  app.post("/api/work-items/:slug/stages/:stage/agent", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json({ reason: "Origin must match the project server." }, 403);
    if (
      context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return context.json({ reason: "A JSON agent choice is required." }, 400);
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json({ reason: "Invalid JSON." }, 400);
    }
    if (!body || typeof body !== "object" || !("agent" in body) || typeof body.agent !== "string")
      return context.json({ reason: "Choose a registered agent." }, 400);
    const agent = registry.get(body.agent);
    if (!agent) return context.json({ reason: `Agent is not registered: ${body.agent}.` }, 400);
    const unavailable = agentUnavailableReason(agent);
    if (unavailable) return context.json({ reason: unavailable }, 409);
    const slug = context.req.param("slug");
    const project = readProjectFiles();
    const discoveryFailure = project.warnings.find(({ path }) => path === ".git");
    if (discoveryFailure) return context.json({ reason: discoveryFailure.message }, 503);
    const snapshot = indexProject(project.files, { name: "" });
    const item = snapshot.workItems.find((item) => item.slug === slug);
    if (!item) return context.json({ reason: "Work item not found." }, 404);
    if (item.merged) return context.json({ reason: "This work item is shipped." }, 409);
    const stage = builtInWorkflows[item.workflow].stages.find(
      (stage) => stage.id === context.req.param("stage"),
    );
    if (!stage || !item.stage) return context.json({ reason: "Stage not found." }, 400);
    if (
      snapshot.warnings.some(
        ({ path, message }) =>
          path === `.scratch/${slug}/workflow.yaml` && message.startsWith("Invalid workflow.yaml:"),
      )
    )
      return context.json({ reason: "workflow.yaml must be valid before choosing an agent." }, 409);
    if (item.activeStint || isStintActive(slug) || writing.has(slug))
      return context.json(
        { reason: "A stint or workflow write is already active for this work item." },
        409,
      );
    writing.add(slug);
    try {
      const worktree = project.worktreePaths.get(slug);
      const commit = await saveWorkItemWorkflow(
        worktree ?? root,
        slug,
        (text) => workflowStageAgent(text, item, stage.id, agent.id),
        !!worktree,
        `Set ${stage.id} agent to ${agent.id} for ${slug}`,
      );
      refresh();
      return context.json({ stage: stage.id, agent: agent.id, commit });
    } catch (error) {
      refresh();
      return context.json({ reason: error instanceof Error ? error.message : String(error) }, 503);
    } finally {
      writing.delete(slug);
    }
  });
  return { isWriting: (slug: string) => writing.has(slug) };
}
