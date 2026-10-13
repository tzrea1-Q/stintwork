// SPDX-License-Identifier: Apache-2.0
import { parse } from "yaml";
import { expect, test } from "vitest";
import { stageAgent, workflowStageAgent } from "./stage-agent.js";
import { agentUnavailable, type AgentProfile } from "./agents.js";

const item = { workflow: "feature" as const, stage: "implement" as const, stages: {} };

test("stage choices take precedence over workflow defaults and never silently replace an unavailable choice", () => {
  const agents = [{ id: "claude" }, { id: "codex" }];
  expect(stageAgent(item, "review", agents)).toBe("codex");
  expect(stageAgent({ ...item, stages: { review: { agent: "grok" } } }, "review", agents)).toBe(
    "grok",
  );
  expect(stageAgent(item, "review", [{ id: "fake" }])).toBe("fake");
});

test("changing a future stage's agent preserves the current stage, gate approval, milestone and YAML comments", () => {
  const text =
    "# Keep this\nworkflow: feature\nstage: implement\nmilestone: M3\nstages:\n  spec:\n    approved: true\n  review:\n    agent: codex\n    skill: /review\n";
  const updated = workflowStageAgent(text, item, "review", "claude");
  expect(updated).toContain("# Keep this");
  expect(parse(updated)).toEqual({
    workflow: "feature",
    stage: "implement",
    milestone: "M3",
    stages: { spec: { approved: true }, review: { agent: "claude", skill: "/review" } },
  });
  expect(workflowStageAgent(updated, item, "review", "claude")).toBe(updated);
});

test("first selection declares the inferred workflow and current stage; broken YAML is refused", () => {
  expect(parse(workflowStageAgent(undefined, item, "review", "claude"))).toEqual({
    workflow: "feature",
    stage: "implement",
    stages: { review: { agent: "claude" } },
  });
  expect(() => workflowStageAgent("workflow: [", item, "review", "claude")).toThrow("valid YAML");
});

test("unavailable agents expose their reason and login hint", () => {
  const profile = {
    displayName: "Agent",
    capabilities: { authenticationRequired: { loginCommand: "agent login" } },
  } as AgentProfile;
  expect(agentUnavailable(profile)).toBeNull();
  expect(
    agentUnavailable({
      ...profile,
      availability: {
        available: false,
        reason: { text: "Authentication required. Use agent login." },
      },
    }),
  ).toEqual({ text: "Authentication required. Use agent login." });
  expect(agentUnavailable({ ...profile, availability: { available: false } })).toMatchObject({
    text: expect.stringContaining("agent login"),
  });
  expect(
    agentUnavailable({ ...profile, availability: { available: false, reason: { text: "" } } }),
  ).toMatchObject({ text: expect.stringContaining("agent login") });
});
