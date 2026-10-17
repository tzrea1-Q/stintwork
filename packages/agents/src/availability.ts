// SPDX-License-Identifier: Apache-2.0
import { coreText, type AgentAvailability } from "@stintwork/core";
import { lstatSync, realpathSync } from "node:fs";
import { findExecutable } from "./executable.js";
import { adapterPins } from "./adapter-profiles.js";

export function installedAgentIdentity(agent: string, env: NodeJS.ProcessEnv = process.env) {
  const command =
    agent === "claude"
      ? env.CLAUDE_CODE_EXECUTABLE || "claude"
      : agent === "codex"
        ? env.CODEX_PATH || "codex"
        : "grok";
  const found = findExecutable(command, env);
  return found ? readExecutableIdentity(found) : undefined;
}

export function readExecutableIdentity(executable: string) {
  try {
    const path = realpathSync(executable);
    const stat = lstatSync(path);
    return {
      path,
      identity: `${path}:${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`,
    };
  } catch {
    return undefined;
  }
}

export function inspectAgentAvailability(
  agent: "claude" | "codex" | "grok",
  env: NodeJS.ProcessEnv,
  previous?: AgentAvailability,
): AgentAvailability {
  const installed = installedAgentIdentity(agent, env);
  const selected = previous?.selection?.executable;
  const selectedUnchanged =
    !previous?.available ||
    !selected?.identity ||
    selected.identity === readExecutableIdentity(selected.path)?.identity;
  if (previous && previous.installedIdentity === installed?.identity && selectedUnchanged)
    return previous;
  return {
    available: false,
    canStart: agent !== "grok" || !!installed,
    kind: installed ? "not-prepared" : "missing-executable",
    ...(agent === "grok" && !installed ? { reason: coreText({ code: "agent.grokMissing" }) } : {}),
    installedIdentity: installed?.identity,
    checkedAt: new Date().toISOString(),
    selection: {
      source: agent === "grok" ? "installed" : installed ? "pending" : "bundled",
      reason: agent === "grok" ? "native" : installed ? "unverified" : "missing",
      ...(agent === "grok"
        ? { executable: installed }
        : { adapterVersion: adapterPins[agent].version }),
    },
  };
}
