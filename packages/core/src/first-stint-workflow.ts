// SPDX-License-Identifier: Apache-2.0
import { parseDocument } from "yaml";
import {
  builtInWorkflows,
  type StageId,
  type WorkflowId,
  type WorkflowDefinitions,
} from "./workflows.js";

export function firstStintWorkflow(
  text: string | undefined,
  workflow: WorkflowId,
  stage: StageId,
  agent?: string,
  workflows: WorkflowDefinitions = builtInWorkflows,
): string {
  const chosen =
    agent ?? workflows[workflow]?.defaultAgent ?? builtInWorkflows.feature.defaultAgent;
  const document = parseDocument(text ?? "");
  if (document.errors.length || document.warnings.length)
    throw new Error("workflow.yaml must be valid YAML before starting a stint.");
  if (text !== undefined && document.getIn(["stages", stage, "agent"]) === chosen) return text;
  document.set("workflow", workflow);
  document.set("stage", stage);
  document.setIn(["stages", stage, "agent"], chosen);
  return document.toString();
}
