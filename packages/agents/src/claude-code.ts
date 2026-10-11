// SPDX-License-Identifier: Apache-2.0
import { execFile, spawn } from "node:child_process";
import { accessSync, constants, statSync } from "node:fs";
import { delimiter, isAbsolute, resolve } from "node:path";
import { promisify } from "node:util";
import type { AgentAvailability } from "@stintwork/core";
import { AgentAuthenticationError } from "./authentication.js";
import { createAgentLauncher } from "./index.js";
import { claudeProfile } from "./profiles.js";
import type { RegisteredAgent } from "./registry.js";
import { adapterEntry } from "./adapter-entry.js";

const execFileAsync = promisify(execFile);

function claudeExecutable(env: NodeJS.ProcessEnv): string | undefined {
  const command = env.CLAUDE_CODE_EXECUTABLE || "claude";
  const candidates = isAbsolute(command)
    ? [command]
    : command.includes("/")
      ? [resolve(command)]
      : (env.PATH ?? "").split(delimiter).map((directory) => resolve(directory, command));
  return candidates.find((path) => {
    try {
      accessSync(path, constants.X_OK);
      return statSync(path).isFile();
    } catch {
      return false;
    }
  });
}

export function createClaudeCodeAgent(env: NodeJS.ProcessEnv = process.env): RegisteredAgent {
  return {
    ...claudeProfile,
    launch: createAgentLauncher((cwd) => {
      const executable = claudeExecutable(env);
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
      const executable = claudeExecutable(env);
      if (!executable)
        return {
          available: false,
          kind: "missing-executable",
          reason: `Claude Code not found. ${claudeProfile.installationHint}`,
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
            reason:
              "Claude Code login check failed. Check claude auth status, then refresh agent availability.",
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
          reason:
            "Claude Code returned an invalid login status. Check claude auth status, then refresh agent availability.",
          checkedAt,
        };
      return status.loggedIn
        ? { available: true, checkedAt }
        : {
            available: false,
            kind: "login-required",
            reason: new AgentAuthenticationError(claudeProfile).message,
            checkedAt,
          };
    },
  };
}
