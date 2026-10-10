import type { AgentProfile } from "@stintwork/core";

export const codexProfile: AgentProfile = {
  id: "codex",
  displayName: "Codex",
  installationHint: "Install @agentclientprotocol/codex-acp@2.1.1 and sign in with codex login.",
  capabilities: {
    modes: ["read-only", "workspace-write", "agent", "agent-full-access"],
    defaultMode: "workspace-write",
    additionalDirectories: true,
    permissionOptions: [
      { optionId: "allow_once", name: "Yes, proceed", kind: "allow_once" },
      {
        optionId: "allow_always",
        name: "Yes, and always allow this prefix",
        kind: "allow_always",
      },
      {
        optionId: "cancel",
        name: "No, and tell Codex what to do differently",
        kind: "reject_once",
      },
    ],
    declineEndsTurn: true,
    authenticationRequired: { message: "Authentication required", loginCommand: "codex login" },
    configOptions: [],
  },
};

export const fakeAgentProfiles: Record<"codex" | "claude" | "grok", AgentProfile> = {
  codex: codexProfile,
  claude: {
    id: "claude",
    displayName: "Claude Code",
    installationHint: "Install the Claude Code ACP adapter and sign in with claude.",
    capabilities: {
      modes: ["default", "acceptEdits", "plan", "auto", "bypassPermissions"],
      defaultMode: "default",
      additionalDirectories: false,
      permissionOptions: [
        { optionId: "allow_once", name: "Yes", kind: "allow_once" },
        { optionId: "reject_once", name: "No", kind: "reject_once" },
      ],
      declineEndsTurn: false,
      authenticationRequired: {
        message: "Authentication required",
        loginCommand: "claude",
      },
      configOptions: [],
    },
  },
  grok: {
    id: "grok",
    displayName: "Grok Build",
    installationHint: "Install Grok Build and sign in with grok.",
    capabilities: {
      modes: [],
      defaultMode: null,
      additionalDirectories: false,
      permissionOptions: null,
      declineEndsTurn: null,
      authenticationRequired: { message: "Authentication required", loginCommand: "grok" },
      configOptions: ["model", "reasoning_effort"],
    },
  },
};
