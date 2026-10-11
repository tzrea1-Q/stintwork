// SPDX-License-Identifier: Apache-2.0
import { expect, test, vi } from "vitest";
import {
  skillAvailability,
  type AgentProfile,
  type AgentSkillLocation,
  type WorkflowDefinitions,
} from "./index.js";

const workflows: WorkflowDefinitions = {
  team: {
    id: "team",
    name: "Team",
    defaultAgent: "codex",
    stages: [
      { id: "spec", name: "Spec", column: "spec", skill: "/to-spec", gate: "spec" },
      { id: "review", name: "Review", column: "review", skill: "/code-review", gate: "evidence" },
      { id: "ship", name: "Ship", column: "ship", skill: null, gate: "merge" },
    ],
  },
};
function profile(skillLocations?: AgentSkillLocation[]): AgentProfile {
  return {
    id: "fixture",
    displayName: "Fixture agent",
    installationHint: "Unused",
    skillLocations,
    capabilities: {
      modes: [],
      defaultMode: null,
      additionalDirectories: false,
      permissionOptions: null,
      declineEndsTurn: null,
      authenticationRequired: { message: "Login", loginCommand: "login" },
      configOptions: [],
    },
  };
}
const home: AgentSkillLocation = { base: "home", path: ".claude/skills", kind: "skills" };
const project: AgentSkillLocation = { base: "project", path: ".claude/skills", kind: "skills" };
const codex: AgentSkillLocation = { base: "home", path: ".codex/skills", kind: "skills" };
const prompts: AgentSkillLocation = { base: "home", path: ".codex/prompts", kind: "prompts" };

test.each([home, project, codex, prompts])(
  "classifies found and missing from declared $base $path fixture listings",
  (location) => {
    const report = skillAvailability(workflows, [profile([location])], () => [
      location.kind === "skills" ? "to-spec/SKILL.md" : "to-spec.md",
    ]);
    expect(report[0].skills).toEqual([
      {
        workflowId: "team",
        stageId: "spec",
        workflow: "Team",
        stage: "Spec",
        skill: "/to-spec",
        status: "found",
      },
      {
        workflowId: "team",
        stageId: "review",
        workflow: "Team",
        stage: "Review",
        skill: "/code-review",
        status: "missing",
        installationHint: expect.stringContaining("npx skills@latest add mattpocock/skills"),
      },
    ]);
  },
);

test("checks project and home locations independently, not another agent's directories", () => {
  const report = skillAvailability(
    workflows,
    [profile([home, project]), { ...profile([codex, prompts]), id: "codex" }],
    (location) => (location.base === "project" ? ["to-spec/SKILL.md", "code-review/SKILL.md"] : []),
  );
  expect(report[0].skills.map(({ status }) => status)).toEqual(["found", "found"]);
  expect(report[1].skills.map(({ status }) => status)).toEqual(["missing", "missing"]);
});

test.each([
  undefined,
  [],
  [{ base: "home", path: ".other/skills", kind: "skills" }],
  [{ base: "project", path: ".codex/skills", kind: "skills" }],
] satisfies (AgentSkillLocation[] | undefined)[])(
  "unknown locations are can't tell and are not inspected: %j",
  (locations) => {
    const list = vi.fn(() => ["to-spec/SKILL.md"]);
    expect(
      skillAvailability(workflows, [profile(locations)], list)[0].skills.every(
        ({ status }) => status === "unknown",
      ),
    ).toBe(true);
    expect(list).not.toHaveBeenCalled();
  },
);

test("inaccessible listings are can't tell, while a positive match wins over an inaccessible directory", () => {
  const report = skillAvailability(workflows, [profile([home, project])], (location) =>
    location.base === "home" ? null : ["to-spec/SKILL.md"],
  );
  expect(report[0].skills.map(({ status }) => status)).toEqual(["found", "unknown"]);
  expect(
    skillAvailability(workflows, [profile([home])], () => {
      throw new Error("Denied");
    })[0].skills.every(({ status }) => status === "unknown"),
  ).toBe(true);
});

test("all loaded workflows and their stage skills are reported, with unsafe skill names classified can't tell", () => {
  const extra = {
    ...workflows.team,
    id: "custom",
    name: "Custom",
    stages: [{ ...workflows.team.stages[0], skill: "/../secret" }],
  };
  const report = skillAvailability({ ...workflows, custom: extra }, [profile([home])], () => []);
  expect(report[0].skills).toHaveLength(3);
  expect(report[0].skills[2]).toMatchObject({ workflow: "Custom", status: "unknown" });
});
