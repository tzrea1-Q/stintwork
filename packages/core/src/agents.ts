// SPDX-License-Identifier: Apache-2.0
import { coreText, type CoreText } from "./core-text.js";
export type AgentPermissionOption = {
  optionId: string;
  name: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always";
};

export type AgentCapabilityProfile = {
  modes: readonly string[];
  defaultMode: string | null;
  additionalDirectories: boolean;
  permissionOptions: readonly AgentPermissionOption[] | null;
  declineEndsTurn: boolean | null;
  authenticationRequired: { message: string; loginCommand: string };
  configOptions: readonly string[];
  permissionMode?: string | null;
};

export type AgentProfile = {
  id: string;
  displayName: string;
  capabilities: AgentCapabilityProfile;
  installationHint: string;
  warnings?: readonly CoreText[];
  availability?: AgentAvailability;
  skillLocations?: readonly AgentSkillLocation[];
};

export type AgentSkillLocation = {
  base: "home" | "project";
  path: string;
  kind: "skills" | "prompts";
};

export type AgentAvailability = {
  available: boolean;
  reason?: CoreText;
  kind?: "login-required" | "missing-executable" | "check-failed";
  checkedAt?: string;
};

export function agentUnavailable(agent: AgentProfile): CoreText | null {
  if (agent.availability?.available !== false) return null;
  if (agent.availability.reason?.text.trim()) return agent.availability.reason;
  return coreText({
    code: "agent.unavailable",
    params: {
      agent: agent.displayName,
      command: agent.capabilities.authenticationRequired.loginCommand,
    },
  });
}
