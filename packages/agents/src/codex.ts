// SPDX-License-Identifier: Apache-2.0
import type { AgentAvailability } from "@stintwork/core";
import { AgentAuthenticationError } from "./authentication.js";
import { findExecutable } from "./executable.js";
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
  const launch = options.launch ?? startAgentStint;
  return {
    ...codexProfile,
    launch,
    async detectAvailability(): Promise<AgentAvailability> {
      const checkedAt = new Date().toISOString();
      if (!findExecutable("codex", options.env ?? process.env))
        return {
          available: false,
          kind: "missing-executable",
          reason: `Codex not found. ${codexProfile.installationHint}`,
          checkedAt,
        };
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const stint = launch({
          agent: codexProfile.id,
          cwd: options.cwd ?? process.cwd(),
          prompt: "",
          onEvent: () => {},
          checkAvailability: true,
        });
        const timeout = new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            reject(new Error("Codex availability check timed out. Refresh agent availability."));
            void stint.cancel().catch(() => {});
          }, options.timeoutMs ?? 20_000);
        });
        await Promise.race([stint.done, timeout]);
        return { available: true, checkedAt };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return {
          available: false,
          kind:
            error instanceof AgentAuthenticationError || /authentication required/i.test(reason)
              ? "login-required"
              : /not found/i.test(reason)
                ? "missing-executable"
                : "check-failed",
          reason,
          checkedAt,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
