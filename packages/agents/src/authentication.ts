// SPDX-License-Identifier: Apache-2.0
import { CoreTextError, type AgentProfile } from "@stintwork/core";
export class AgentAuthenticationError extends CoreTextError {
  constructor(profile: AgentProfile) {
    super(
      profile.loginMessageCode
        ? { code: profile.loginMessageCode }
        : {
            code: "agent.loginRequired",
            params: {
              agent: profile.displayName,
              command: profile.capabilities.authenticationRequired.loginCommand,
            },
          },
    );
  }
}
