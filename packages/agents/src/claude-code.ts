// SPDX-License-Identifier: Apache-2.0
import { prepareAgentForStint } from "./prepare-agent.js";
import { inspectAgentAvailability } from "./availability.js";
import { spawn } from "node:child_process";
import { createAgentLauncher } from "./index.js";
import { claudeProfile } from "./profiles.js";
import type { RegisteredAgent } from "./registry.js";
import { adapterEntry } from "./adapter-entry.js";
import { findExecutable } from "./executable.js";

export function createClaudeCodeAgent(env: NodeJS.ProcessEnv = process.env): RegisteredAgent {
  return {
    ...claudeProfile,
    launch: createAgentLauncher(
      (cwd, launchEnv = env, nativeExecutable) => {
        const executable = findExecutable(
          nativeExecutable ?? (launchEnv.CLAUDE_CODE_EXECUTABLE || "claude"),
          launchEnv,
        );
        if (!executable)
          throw new Error(`Claude Code not found. ${claudeProfile.installationHint}`);
        return spawn(process.execPath, [adapterEntry("claude-agent-acp")], {
          cwd,
          stdio: "pipe",
          env: {
            ...launchEnv,
            CLAUDE_CODE_EXECUTABLE: executable,
          },
        });
      },
      claudeProfile,
      env,
    ),
    prepare: (preparation) => prepareAgentForStint({ ...preparation, agent: "claude", env: env }),
    async detectAvailability() {
      return inspectAgentAvailability("claude", env, this.availability);
    },
  };
}
