// SPDX-License-Identifier: Apache-2.0
import type { AgentProfile, CoreTextMessage } from "@stintwork/core";

export class AgentAuthenticationError extends Error {
  readonly reasonMessage: CoreTextMessage;
  constructor(profile: AgentProfile) {
    super(
      `${profile.displayName} authentication required. Sign in with ${profile.capabilities.authenticationRequired.loginCommand}, then start another stint.`,
    );
    this.reasonMessage = {
      code: "agent.loginRequired",
      params: {
        agent: profile.displayName,
        command: profile.capabilities.authenticationRequired.loginCommand,
      },
    };
  }
}
