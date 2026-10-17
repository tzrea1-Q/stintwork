// SPDX-License-Identifier: Apache-2.0
import { CoreTextError } from "@stintwork/core";
import { installedAgentIdentity, inspectAgentAvailability } from "./availability.js";
import { promisify } from "node:util";
import { execFile, spawn } from "node:child_process";

import { type AgentLauncher, createAgentLauncher } from "./index.js";
import { readGrokConfig } from "./grok-config.js";
import { grokProfile } from "./profiles.js";
import type { RegisteredAgent } from "./registry.js";

export function createGrokAgent(
  options: {
    configPath?: string;
    launch?: AgentLauncher;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {},
): RegisteredAgent {
  const env = options.env ?? process.env;
  const launch =
    options.launch ??
    createAgentLauncher(
      (cwd, env, executable) =>
        spawn(executable ?? "grok", ["agent", "stdio"], { cwd, env, stdio: "pipe" }),
      grokProfile,
      env,
    );
  return {
    ...grokProfile,
    launch,
    async prepare({ signal, cwd }) {
      const executable = installedAgentIdentity("grok", env);
      if (!executable) throw new CoreTextError({ code: "agent.grokMissing" });
      const { stdout } = await promisify(execFile)(executable.path, ["--version"], {
        signal,
        env,
        timeout: 60_000,
        maxBuffer: 65536,
      });
      if (installedAgentIdentity("grok", env)?.identity !== executable.identity)
        throw new CoreTextError({ code: "agent.cliChanged" });
      signal?.throwIfAborted();
      const check = launch({
        agent: "grok",
        cwd,
        prompt: "",
        onEvent: () => {},
        checkAvailability: true,
        nativeExecutable: executable.path,
      });
      let cancellation: Promise<void> | undefined;
      const cancel = () => {
        cancellation ??= check.cancel().catch(() => {});
      };
      signal?.addEventListener("abort", cancel, { once: true });
      try {
        signal?.throwIfAborted();
        await check.done;
        signal?.throwIfAborted();
      } catch (error) {
        cancel();
        await cancellation;
        throw error;
      } finally {
        signal?.removeEventListener("abort", cancel);
      }
      return {
        source: "installed",
        reason: "native",
        executable: { ...executable, version: stdout.trim() },
      };
    },
    get capabilities() {
      return {
        ...grokProfile.capabilities,
        permissionMode: readGrokConfig(options.configPath).permissionMode,
      };
    },
    get warnings() {
      return readGrokConfig(options.configPath).warnings;
    },
    async detectAvailability() {
      return inspectAgentAvailability("grok", env, this.availability);
    },
  };
}
