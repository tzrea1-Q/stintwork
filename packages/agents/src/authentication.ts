import type { AgentProfile } from "@stintwork/core";

export class AgentAuthenticationError extends Error {
  constructor(profile: AgentProfile) {
    super(
      `${profile.displayName} authentication required. Sign in with ${profile.capabilities.authenticationRequired.loginCommand}, then start another stint.`,
    );
  }
}
