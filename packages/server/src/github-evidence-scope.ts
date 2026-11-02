// SPDX-License-Identifier: Apache-2.0
import type { WorkflowStage } from "@stintwork/core";

export function githubGateIncludesTickets(
  stages: readonly WorkflowStage[],
  stage: string,
): boolean {
  const tickets = stages.findIndex((entry) => entry.gate === "tickets");
  // Workflows without a Tickets gate have always included tickets in every approval.
  return tickets === -1 || stages.findIndex((entry) => entry.id === stage) >= tickets;
}

export function githubGateIgnoresBody(stages: readonly WorkflowStage[], stage: string): boolean {
  const spec = stages.findIndex((entry) => entry.column === "spec");
  const position = stages.findIndex((entry) => entry.id === stage);
  return spec !== -1 && position !== -1 && position < spec;
}
