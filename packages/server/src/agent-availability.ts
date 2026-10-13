// SPDX-License-Identifier: Apache-2.0
import { coreTextWire } from "@stintwork/core";
import { type AgentRegistry, describeAgents, refreshAgentAvailability } from "@stintwork/agents";
import type { Hono } from "hono";

export async function refreshAgentRegistry(registry: AgentRegistry, refresh = false) {
  await Promise.all(
    [...registry.values()].map((agent) => refreshAgentAvailability(agent, refresh)),
  );
}

export function addAgentAvailabilityRoute(
  app: Hono,
  registry: AgentRegistry,
  refreshSnapshot: () => void,
) {
  app.get("/api/agents", async (context) => {
    await refreshAgentRegistry(registry, context.req.query("refresh") === "true");
    refreshSnapshot();
    context.header("Cache-Control", "no-store");
    return context.json(coreTextWire({ agents: describeAgents(registry) }));
  });
}
