// SPDX-License-Identifier: Apache-2.0
import { errorText, type AgentAvailability } from "@stintwork/core";
import { spawn } from "node:child_process";

import { type AgentLauncher, createAgentLauncher } from "./index.js";
import { readGrokConfig } from "./grok-config.js";
import { grokProfile } from "./profiles.js";
import type { RegisteredAgent } from "./registry.js";

export function createGrokAgent(
  options: { configPath?: string; launch?: AgentLauncher; cwd?: string } = {},
): RegisteredAgent {
  const launch =
    options.launch ??
    createAgentLauncher(
      (cwd) => spawn("grok", ["agent", "stdio"], { cwd, stdio: "pipe" }),
      grokProfile,
    );
  return {
    ...grokProfile,
    launch,
    get capabilities() {
      return {
        ...grokProfile.capabilities,
        permissionMode: readGrokConfig(options.configPath).permissionMode,
      };
    },
    get warnings() {
      return readGrokConfig(options.configPath).warnings;
    },
    async detectAvailability(): Promise<AgentAvailability> {
      const checkedAt = new Date().toISOString();
      try {
        await launch({
          agent: grokProfile.id,
          cwd: options.cwd ?? process.cwd(),
          prompt: "",
          onEvent: () => {},
          checkAvailability: true,
        }).done;
        return { available: true, checkedAt };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
          available: false,
          reason: errorText(error),
          kind: /authentication required/i.test(reason)
            ? "login-required"
            : /not found/i.test(reason)
              ? "missing-executable"
              : "check-failed",
          checkedAt,
        };
      }
    },
  };
}
