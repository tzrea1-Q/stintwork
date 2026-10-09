import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";
import { type AgentLauncher, createAgentLauncher } from "./index.js";

export type FakeAgentStep =
  | { type: "message" | "thought"; text: string }
  | { type: "delay"; milliseconds: number }
  | { type: "update"; update: Record<string, unknown> }
  | ({ type: "permission" } & Pick<RequestPermissionRequest, "toolCall" | "options">)
  | { type: "end"; stopReason?: string };

export function createFakeAgentLauncher(script: readonly FakeAgentStep[]): AgentLauncher {
  const source = import.meta.url.endsWith(".ts");
  const entry = fileURLToPath(
    new URL(source ? "./fake-agent.ts" : "./fake-agent.js", import.meta.url),
  );
  return createAgentLauncher((cwd) =>
    spawn(
      process.execPath,
      [...(source ? ["--import", createRequire(import.meta.url).resolve("tsx")] : []), entry],
      {
        cwd,
        stdio: "pipe",
        env: { ...process.env, STINTWORK_FAKE_SCRIPT: JSON.stringify(script) },
      },
    ),
  );
}
