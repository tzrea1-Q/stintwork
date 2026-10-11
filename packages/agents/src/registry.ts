// SPDX-License-Identifier: Apache-2.0
import type { AgentAvailability, AgentProfile } from "@stintwork/core";
import { type AgentLauncher, startAgentStint } from "./index.js";
import { codexProfile } from "./profiles.js";
import { createClaudeCodeAgent } from "./claude-code.js";
import { createGrokAgent } from "./grok.js";

export type RegisteredAgent = AgentProfile & {
  launch: AgentLauncher;
  detectAvailability?: () => Promise<AgentAvailability>;
};
export type AgentRegistry = ReadonlyMap<string, RegisteredAgent>;
const availabilityChecks = new WeakMap<RegisteredAgent, Promise<void>>();

export async function refreshAgentAvailability(
  agent: RegisteredAgent,
  refresh = false,
): Promise<void> {
  const pending = availabilityChecks.get(agent);
  if (pending) return pending;
  if (!agent.detectAvailability || (agent.availability && !refresh)) return;
  const checking = agent.detectAvailability().then((availability) => {
    agent.availability = availability;
  });
  availabilityChecks.set(agent, checking);
  try {
    await checking;
  } finally {
    availabilityChecks.delete(agent);
  }
}

function defaultAgents(): RegisteredAgent[] {
  const agents = [
    { ...codexProfile, launch: startAgentStint },
    createClaudeCodeAgent(),
    createGrokAgent(),
  ];
  // Test runs set this so the default registry never probes the agents installed on the machine.
  // Tests of detection itself build registries with their own detectors.
  if (process.env.STINTWORK_SKIP_AGENT_DETECTION !== "1") return agents;
  return agents.map(({ detectAvailability: _detect, ...agent }) => agent);
}

export function createAgentRegistry(
  agents: readonly RegisteredAgent[] = defaultAgents(),
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
  return [...registry.values()].map(
    ({ launch: _launch, detectAvailability: _detect, ...profile }) => profile,
  );
}
