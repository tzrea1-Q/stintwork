import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { RequestPermissionRequest } from "@agentclientprotocol/sdk";
import { type AgentLauncher, createAgentLauncher } from "./index.js";
import { fakeAgentProfiles } from "./profiles.js";

export { fakeAgentProfiles } from "./profiles.js";

export type FakeAgentStep =
  | { type: "message" | "thought"; text: string }
  | { type: "delay"; milliseconds: number }
  | { type: "update"; update: Record<string, unknown> }
  | { type: "write"; path: string; content: string }
  | { type: "expect-file"; path: string; includes: string }
  | { type: "commit"; message: string }
  | { type: "expect-prompt"; includes: string }
  | { type: "expect-mode"; mode: string | null }
  | { type: "crash" }
  | { type: "hang"; ignoreCancellation?: boolean }
  | { type: "error"; message: string }
  | ({
      type: "permission";
      expectedOptionId?: string;
      options?: RequestPermissionRequest["options"];
    } & Pick<RequestPermissionRequest, "toolCall">)
  | { type: "end"; stopReason?: string };

export function createFakeAgentLauncher(
  script: readonly FakeAgentStep[],
  handoff: readonly FakeAgentStep[] = [],
  options: {
    authRequired?: boolean;
    startupError?: string;
    additionalDirectories?: boolean;
    verifyGitDirectories?: boolean;
    handoffFailures?: number;
    afterTurnRequests?: readonly (readonly FakeAgentStep[])[];
    profile?: keyof typeof fakeAgentProfiles;
    agentId?: string;
  } = {},
): AgentLauncher {
  const profile = fakeAgentProfiles[options.profile ?? "codex"];
  const source = import.meta.url.endsWith(".ts");
  const entry = fileURLToPath(
    new URL(source ? "./fake-agent.ts" : "./fake-agent.js", import.meta.url),
  );
  return createAgentLauncher(
    (cwd) =>
      spawn(
        process.execPath,
        [...(source ? ["--import", createRequire(import.meta.url).resolve("tsx")] : []), entry],
        {
          cwd,
          stdio: "pipe",
          env: {
            ...process.env,
            STINTWORK_FAKE_SCRIPT: JSON.stringify(script),
            STINTWORK_FAKE_HANDOFF: JSON.stringify(handoff),
            STINTWORK_FAKE_OPTIONS: JSON.stringify(options),
          },
        },
      ),
    { ...profile, id: options.agentId ?? profile.id },
  );
}
