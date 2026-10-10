import { spawn } from "node:child_process";
import { type AgentLauncher, createAgentLauncher } from "./index.js";
import { readGrokConfig } from "./grok-config.js";
import { grokProfile } from "./profiles.js";
import type { RegisteredAgent } from "./registry.js";

export function createGrokAgent(
  options: { configPath?: string; launch?: AgentLauncher } = {},
): RegisteredAgent {
  const launch =
    options.launch ??
    createAgentLauncher(
      (cwd) => spawn("grok", ["agent", "stdio"], { cwd, stdio: "pipe" }),
      grokProfile,
    );
  const agent: RegisteredAgent = { ...grokProfile, launch, refresh };
  let checking: Promise<void> | undefined;
  function refresh(cwd: string): Promise<void> {
    checking ??= (async () => {
      const config = readGrokConfig(options.configPath);
      agent.capabilities = { ...grokProfile.capabilities, permissionMode: config.permissionMode };
      agent.warnings = config.warnings;
      let available = true;
      let reason: string | undefined;
      let status: NonNullable<RegisteredAgent["availability"]>["status"];
      try {
        await launch({
          agent: agent.id,
          cwd,
          prompt: "",
          onEvent: () => {},
          checkAvailability: true,
        }).done;
      } catch (error) {
        available = false;
        reason = error instanceof Error ? error.message : String(error);
        status = /authentication required/i.test(reason)
          ? "login-required"
          : /not found/i.test(reason)
            ? "not-installed"
            : "error";
      }
      const unchanged =
        agent.availability?.available === available && agent.availability?.reason === reason;
      agent.availability = {
        available,
        ...(reason ? { reason } : {}),
        ...(status ? { status } : {}),
        checkedAt:
          unchanged && !available ? agent.availability?.checkedAt : new Date().toISOString(),
      };
    })().finally(() => {
      checking = undefined;
    });
    return checking;
  }
  return agent;
}
