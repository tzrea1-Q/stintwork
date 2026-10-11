// SPDX-License-Identifier: Apache-2.0
import type { AgentProfile } from "./agents.js";
import type { StagedWorkItem } from "./stages.js";
import { builtInWorkflows, type StageId } from "./workflows.js";
import { parseDocument } from "yaml";

export function stageAgent(
  item: Pick<StagedWorkItem, "workflow" | "stages">,
  stage: StageId,
  agents: readonly Pick<AgentProfile, "id">[],
): string {
  const chosen = item.stages[stage]?.agent;
  if (typeof chosen === "string") return chosen;
  const defaultAgent = builtInWorkflows[item.workflow].defaultAgent;
  return agents.some(({ id }) => id === defaultAgent)
    ? defaultAgent
    : (agents[0]?.id ?? defaultAgent);
}

export function workflowStageAgent(
  text: string | undefined,
  item: Pick<StagedWorkItem, "workflow" | "stage">,
  stage: StageId,
  agent: string,
): string {
  const document = parseDocument(text ?? "");
  if (document.errors.length || document.warnings.length)
    throw new Error("workflow.yaml must be valid YAML before choosing an agent.");
  if (text === undefined) {
    document.set("workflow", item.workflow);
    document.set("stage", item.stage);
  }
  document.setIn(["stages", stage, "agent"], agent);
  return document.toString();
}
