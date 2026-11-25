// SPDX-License-Identifier: Apache-2.0
import { expect, test } from "vitest";
import { attentionProfile } from "./attention-test-fixtures";
import { agentName } from "./agent-name";

test("uses the agent display name or capitalises an unknown id", () => {
  const agents = [attentionProfile];
  expect(agentName(agents[0].id, agents)).toBe(agents[0].displayName);
  expect(agentName("unknown-agent", agents)).toBe("Unknown-agent");
});
