// SPDX-License-Identifier: Apache-2.0
import { coreText, type AgentAvailability } from "@stintwork/core";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

import { AgentAuthenticationError } from "./authentication.js";
import { createAgentLauncher } from "./index.js";
import { claudeProfile } from "./profiles.js";
import type { RegisteredAgent } from "./registry.js";
import { adapterEntry } from "./adapter-entry.js";
import { findExecutable } from "./executable.js";

const execFileAsync = promisify(execFile);

export function createClaudeCodeAgent(env: NodeJS.ProcessEnv = process.env): RegisteredAgent {
  return {
    ...claudeProfile,
    launch: createAgentLauncher((cwd) => {
      const executable = findExecutable(env.CLAUDE_CODE_EXECUTABLE || "claude", env);
      if (!executable) throw new Error(`Claude Code not found. ${claudeProfile.installationHint}`);
      return spawn(process.execPath, [adapterEntry("claude-agent-acp")], {
        cwd,
        stdio: "pipe",
        env: {
          ...env,
          CLAUDE_CODE_EXECUTABLE: executable,
        },
      });
    }, claudeProfile),
    async detectAvailability(): Promise<AgentAvailability> {
      const checkedAt = new Date().toISOString();
      const executable = findExecutable(env.CLAUDE_CODE_EXECUTABLE || "claude", env);
      if (!executable)
        return {
          available: false,
          kind: "missing-executable",
          reason: { text: `Claude Code not found. ${claudeProfile.installationHint}` },
          checkedAt,
        };
      let stdout: string;
      try {
        ({ stdout } = await execFileAsync(executable, ["auth", "status", "--json"], {
          env,
          timeout: 5000,
          maxBuffer: 64 * 1024,
        }));
      } catch (error) {
        const failure = error as { code?: unknown; stdout?: string };
        if (failure.code !== 1 || typeof failure.stdout !== "string")
          return {
            available: false,
            kind: "check-failed",
            reason: coreText({ code: "agent.claudeLoginCheckFailed" }),
            checkedAt,
          };
        stdout = failure.stdout;
      }
      let status: unknown;
      try {
        status = JSON.parse(stdout);
      } catch {}
      if (
        !status ||
        typeof status !== "object" ||
        !("loggedIn" in status) ||
        typeof status.loggedIn !== "boolean"
      )
        return {
          available: false,
          kind: "check-failed",
          reason: coreText({ code: "agent.claudeInvalidLogin" }),
          checkedAt,
        };
      const authError = new AgentAuthenticationError(claudeProfile);
      return status.loggedIn
        ? { available: true, checkedAt }
        : {
            available: false,
            kind: "login-required",
            reason: authError.coreText,
            checkedAt,
          };
    },
  };
}
