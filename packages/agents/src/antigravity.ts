// SPDX-License-Identifier: Apache-2.0
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { CoreTextError, coreText } from "@stintwork/core";
import { installedAgentIdentity, inspectAgentAvailability } from "./availability.js";
import { antigravityVersionReason } from "./executable.js";
import { type AgentLauncher, createAgentLauncher } from "./index.js";
import { antigravityProfile } from "./profiles.js";
import type { RegisteredAgent } from "./registry.js";

export function createAntigravityAgent(
  options: { env?: NodeJS.ProcessEnv; launch?: AgentLauncher } = {},
): RegisteredAgent {
  const env = options.env ?? process.env;
  const launch =
    options.launch ??
    createAgentLauncher(
      (cwd, childEnv, executable) =>
        spawn(executable ?? "agy", ["acp"], { cwd, env: childEnv, stdio: "pipe" }),
      antigravityProfile,
      env,
    );
  async function version(path: string, signal?: AbortSignal, timeout = 60_000) {
    try {
      const { stdout } = await promisify(execFile)(path, ["--version"], {
        signal,
        env,
        timeout,
        killSignal: "SIGKILL",
        maxBuffer: 65536,
      });
      return stdout.trim();
    } catch (error) {
      signal?.throwIfAborted();
      if (error && typeof error === "object" && "killed" in error && error.killed) return undefined;
      return "";
    }
  }
  return {
    ...antigravityProfile,
    launch,
    async detectAvailability() {
      const availability = inspectAgentAvailability("antigravity", env, this.availability);
      const executable = installedAgentIdentity("antigravity", env);
      if (!executable || availability.available) return availability;
      const detected = await version(executable.path, undefined, 5_000);
      const reason = detected === undefined ? "timeout" : antigravityVersionReason(detected);
      if (installedAgentIdentity("antigravity", env)?.identity !== executable.identity)
        return inspectAgentAvailability("antigravity", env);
      if (reason === "compatible")
        return availability.kind === "incompatible" || availability.kind === "check-failed"
          ? inspectAgentAvailability("antigravity", env)
          : availability;
      return {
        ...availability,
        canStart: false,
        kind: reason === "timeout" ? "check-failed" : "incompatible",
        reason:
          reason === "timeout"
            ? coreText({ code: "agent.antigravityVersionTimeout" })
            : coreText({ code: "agent.antigravityVersion", params: { reason } }),
        selection: {
          source: "installed",
          reason: reason === "timeout" ? "unverified" : reason,
          executable: { ...executable, version: detected ?? "" },
        },
      };
    },
    async prepare({ signal, cwd }) {
      const executable = installedAgentIdentity("antigravity", env);
      if (!executable) throw new CoreTextError({ code: "agent.antigravityMissing" });
      const detected = await version(executable.path, signal);
      const reason = antigravityVersionReason(detected ?? "");
      if (reason !== "compatible")
        throw new CoreTextError({ code: "agent.antigravityVersion", params: { reason } });
      if (installedAgentIdentity("antigravity", env)?.identity !== executable.identity)
        throw new CoreTextError({ code: "agent.cliChanged" });
      signal?.throwIfAborted();
      const check = launch({
        agent: "antigravity",
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
        executable: { ...executable, version: detected ?? "" },
      };
    },
  };
}
