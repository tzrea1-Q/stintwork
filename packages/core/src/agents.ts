// SPDX-License-Identifier: Apache-2.0
import { coreTextReason, type CoreTextMessage } from "./core-text.js";
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
  warnings?: readonly string[];
  warningMessages?: readonly (CoreTextMessage | null)[];
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
  reason?: string;
  reasonMessage?: CoreTextMessage;
  kind?: "login-required" | "missing-executable" | "check-failed";
  checkedAt?: string;
};

export function agentUnavailableReason(agent: AgentProfile): string | null {
  return agent.availability?.available === false
    ? agent.availability.reason?.trim() ||
        `${agent.displayName} is unavailable. ${agent.capabilities.authenticationRequired.loginCommand}`
    : null;
}

export function agentUnavailable(agent: AgentProfile) {
  const reason = agentUnavailableReason(agent);
  if (!reason) return coreTextReason(null);
  if (!agent.availability?.reason?.trim())
    return coreTextReason(reason, {
      code: "agent.unavailable",
      params: {
        agent: agent.displayName,
        command: agent.capabilities.authenticationRequired.loginCommand,
      },
    });
  return coreTextReason(reason, agent.availability?.reasonMessage);
}
