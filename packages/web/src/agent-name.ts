// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";

export function agentName(id: string, agents: ProjectSnapshot["agents"]): string {
  return (
    agents.find((agent) => agent.id === id)?.displayName ?? id.charAt(0).toUpperCase() + id.slice(1)
  );
}
