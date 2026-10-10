import type { AgentProfile } from "@stintwork/core";
import { type AgentLauncher, startAgentStint } from "./index.js";
import { codexProfile } from "./profiles.js";

export type RegisteredAgent = AgentProfile & { launch: AgentLauncher };
export type AgentRegistry = ReadonlyMap<string, RegisteredAgent>;

export function createAgentRegistry(
  agents: readonly RegisteredAgent[] = [{ ...codexProfile, launch: startAgentStint }],
): AgentRegistry {
  const registry = new Map<string, RegisteredAgent>();
  for (const agent of agents) {
    if (!agent.id.trim() || agent.id !== agent.id.trim() || !agent.displayName.trim())
      throw new Error("Registered agents need a nonempty id and display name.");
    if (registry.has(agent.id)) throw new Error(`Agent id is already registered: ${agent.id}.`);
    registry.set(agent.id, agent);
  }
  return registry;
}

export function describeAgents(registry: AgentRegistry): AgentProfile[] {
  return [...registry.values()].map(({ launch: _launch, ...profile }) => profile);
}
