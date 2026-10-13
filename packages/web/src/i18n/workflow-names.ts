// SPDX-License-Identifier: Apache-2.0
import { builtInWorkflows, type WorkflowDefinition, type WorkflowStage } from "@stintwork/core";
import type { Catalog } from "./en";

export function uncustomisedBuiltIn(workflow: WorkflowDefinition) {
  const id = workflow.id;
  if (id !== "feature" && id !== "bug" && id !== "quick") return null;
  const builtIn = builtInWorkflows[id];
  return workflow.name === builtIn.name &&
    workflow.defaultAgent === builtIn.defaultAgent &&
    workflow.stages.length === builtIn.stages.length &&
    workflow.stages.every((stage, index) => {
      const original = builtIn.stages[index];
      return (
        stage.id === original.id &&
        stage.name === original.name &&
        stage.column === original.column &&
        stage.skill === original.skill &&
        stage.gate === original.gate &&
        stage.agent === original.agent
      );
    })
    ? id
    : null;
}

export function workflowName(workflow: WorkflowDefinition, t: Catalog) {
  const id = uncustomisedBuiltIn(workflow);
  return id ? t.workflows[id].name : workflow.name;
}

export function stageName(workflow: WorkflowDefinition, stage: WorkflowStage, t: Catalog) {
  const id = uncustomisedBuiltIn(workflow);
  if (!id) return stage.name;
  const stages = t.workflows[id].stages;
  return Object.hasOwn(stages, stage.id) ? stages[stage.id as keyof typeof stages] : stage.name;
}
