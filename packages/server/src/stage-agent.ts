// SPDX-License-Identifier: Apache-2.0
import {
  coreTextWire,
  errorText,
  coreText,
  agentUnavailable,
  workflowStageAgent,
  type StagedWorkItem,
  type StageId,
} from "@stintwork/core";

import type { AgentRegistry } from "@stintwork/agents";

import type { Hono } from "hono";
import type { ProjectFilesReader } from "./work-item-files.js";
import { resolveProjectSnapshot } from "./project-snapshot.js";
import type { ProjectSnapshot } from "@stintwork/core";
import type { GithubDiscovery } from "./github-discovery.js";
import { resolveGithubWorkflow } from "./github-snapshot.js";
import {
  saveGithubWorkflow,
  saveWorkItemWorkflow,
  writeWorkItemWorkflow,
} from "./workflow-writes.js";

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
  getSnapshot?: () => ProjectSnapshot,
  getGithub?: () => GithubDiscovery | undefined,
) {
  app.post("/api/work-items/:slug/stages/:stage/agent", async (context) => {
    const origin = context.req.header("origin");
    if (origin && origin !== new URL(context.req.url).origin)
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.originMismatch" }) }),
        403,
      );
    if (
      context.req.header("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    )
      return context.json(coreTextWire({ reason: coreText({ code: "server.jsonAgent" }) }), 400);
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json(coreTextWire({ reason: coreText({ code: "server.invalidJson" }) }), 400);
    }
    if (!body || typeof body !== "object" || !("agent" in body) || typeof body.agent !== "string")
      return context.json(
        coreTextWire({ reason: coreText({ code: "agent.chooseRegistered" }) }),
        400,
      );
    const agent = registry.get(body.agent);
    if (!agent)
      return context.json(
        coreTextWire({
          reason: coreText({ code: "agent.notRegistered", params: { agent: body.agent } }),
        }),
        400,
      );
    const unavailable = agentUnavailable(agent);
    if (unavailable) return context.json(coreTextWire({ reason: unavailable }), 409);
    const slug = context.req.param("slug");
    const project = readProjectFiles();
    const discoveryFailure = project.warnings.find(({ path }) => path === ".git");
    if (discoveryFailure)
      return context.json(coreTextWire({ reason: discoveryFailure.message }), 503);
    const snapshot = resolveProjectSnapshot(project, getSnapshot);
    const item = snapshot.workItems.find((item) => item.slug === slug);
    if (!item)
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.workItemNotFound" }) }),
        404,
      );
    if (item.merged)
      return context.json(coreTextWire({ reason: coreText({ code: "workItem.shipped" }) }), 409);
    const stage = snapshot.workflows[item.workflow].stages.find(
      (stage) => stage.id === context.req.param("stage"),
    );
    if (!stage || !item.stage)
      return context.json(
        coreTextWire({ reason: coreText({ code: "server.stageNotFound" }) }),
        400,
      );
    const workflowPath = item.github
      ? `.stintwork/github/${item.github.repository.toLowerCase()}/${item.github.number}/workflow.yaml`
      : `.scratch/${slug}/workflow.yaml`;
    if (
      snapshot.warnings.some(
        ({ path, message }) =>
          path === workflowPath && message.startsWith("Invalid workflow.yaml:"),
      )
    )
      return context.json(
        coreTextWire({ reason: coreText({ code: "agent.validWorkflowRequired" }) }),
        409,
      );
    if (item.activeStint || isStintActive(slug) || writing.has(slug))
      return context.json(coreTextWire({ reason: coreText({ code: "agent.activeWrite" }) }), 409);
    writing.add(slug);
    try {
      const worktree = project.worktreePaths.get(slug);
      const message = `Set ${stage.id} agent to ${agent.id} for ${slug}`;
      let commit: string | null;
      if (item.github) {
        const github = getGithub?.();
        const remote = github?.items.find(
          (entry) => entry.id === item.github?.issueId && entry.number === item.github.number,
        );
        const text = resolveGithubWorkflow(project, workflowPath, worktree);
        if (
          !github ||
          !remote ||
          snapshot.github?.errorCode === "identity" ||
          (worktree && text !== undefined && !item.github.bound)
        )
          return context.json(
            coreTextWire({ reason: coreText({ code: "gate.identityAmbiguous" }) }),
            409,
          );
        commit = await saveGithubWorkflow(
          worktree ?? root,
          github,
          remote,
          item.workflow,
          item.stage,
          (initial) => {
            if (resolveGithubWorkflow(project, workflowPath, worktree) !== text)
              throw new Error("Workflow changed.");
            return workflowStageAgent(text ?? initial, item, stage.id, agent.id);
          },
          message,
        );
      } else {
        commit = await saveWorkItemWorkflow(
          worktree ?? root,
          slug,
          (text) => workflowStageAgent(text, item, stage.id, agent.id),
          message,
        );
      }
      refresh();
      return context.json(coreTextWire({ stage: stage.id, agent: agent.id, commit }));
    } catch (error) {
      refresh();
      return context.json(coreTextWire({ reason: errorText(error) }), 503);
    } finally {
      writing.delete(slug);
    }
  });
  return { isWriting: (slug: string) => writing.has(slug) };
}
