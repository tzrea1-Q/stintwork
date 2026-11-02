// SPDX-License-Identifier: Apache-2.0
import type { WorkflowStage } from "@stintwork/core";
export { githubGateIncludesTickets } from "@stintwork/core";

export function githubGateIgnoresBody(stages: readonly WorkflowStage[], stage: string): boolean {
  const spec = stages.findIndex((entry) => entry.column === "spec");
  const position = stages.findIndex((entry) => entry.id === stage);
  return spec !== -1 && position !== -1 && position < spec;
}
