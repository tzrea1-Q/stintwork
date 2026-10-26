// SPDX-License-Identifier: Apache-2.0
import type { AgentAvailability, AgentProfile, AgentSelection, StintLaunch } from "@stintwork/core";
import type { AgentPreparationOptions, PreparedAgent } from "./adapter-cache.js";
import type { AgentLauncher } from "./index.js";
import { createCodexAgent } from "./codex.js";
import { createClaudeCodeAgent } from "./claude-code.js";
import { createGrokAgent } from "./grok.js";

export type RegisteredAgent = AgentProfile & {
  launch: AgentLauncher;
  prepare?: (
    options: Omit<AgentPreparationOptions, "agent">,
  ) => Promise<PreparedAgent | AgentSelection>;
  verifyRecovery?: (launch: StintLaunch, cwd: string) => Promise<PreparedAgent>;
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
  const agents = [createCodexAgent(), createClaudeCodeAgent(), createGrokAgent()];
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
    ({
      launch: _launch,
      prepare: _prepare,
      verifyRecovery: _verify,
      detectAvailability: _detect,
      ...profile
    }) => profile,
  );
}
