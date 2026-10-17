// SPDX-License-Identifier: Apache-2.0
import { prepareAgentForStint } from "./prepare-agent.js";
import { inspectAgentAvailability } from "./availability.js";
import { type AgentLauncher, startAgentStint } from "./index.js";
import { codexProfile } from "./profiles.js";
import type { RegisteredAgent } from "./registry.js";

export function createCodexAgent(
  options: {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    launch?: AgentLauncher;
    timeoutMs?: number;
  } = {},
): RegisteredAgent {
  const launch =
    options.launch ??
    (options.env
      ? (stint) => startAgentStint({ ...stint, env: stint.env ?? options.env })
      : startAgentStint);
  return {
    ...codexProfile,
    launch,
    prepare: (preparation) =>
      prepareAgentForStint({ ...preparation, agent: "codex", env: options.env ?? process.env }),
    async detectAvailability() {
      return inspectAgentAvailability("codex", options.env ?? process.env, this.availability);
    },
  };
}
