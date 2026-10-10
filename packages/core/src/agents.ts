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
};

export type AgentProfile = {
  id: string;
  displayName: string;
  capabilities: AgentCapabilityProfile;
  installationHint: string;
};
