// SPDX-License-Identifier: Apache-2.0
import type { AgentProfile, AgentSkillLocation } from "./agents.js";
import type { WorkflowDefinitions } from "./workflows.js";

export type StageSkillAvailability = {
  workflowId: string;
  stageId: string;
  workflow: string;
  stage: string;
  skill: string;
  status: "found" | "missing" | "unknown";
  installationHint?: string;
};
export type AgentSkillAvailability = {
  agent: string;
  displayName: string;
  skills: StageSkillAvailability[];
};

export function knownSkillLocation(location: AgentSkillLocation): boolean {
  return location.kind === "skills"
    ? (location.base === "home" &&
        [".claude/skills", ".codex/skills", ".agents/skills"].includes(location.path)) ||
        (location.base === "project" &&
          [".claude/skills", ".agents/skills"].includes(location.path))
    : location.kind === "prompts" && location.base === "home" && location.path === ".codex/prompts";
}

export function skillAvailability(
  workflows: WorkflowDefinitions,
  agents: readonly AgentProfile[],
  list: (location: AgentSkillLocation) => readonly string[] | null,
): AgentSkillAvailability[] {
  return agents.map((agent) => {
    const locations = (agent.skillLocations ?? []).map((location) => {
      let paths: readonly string[] | null = null;
      try {
        if (knownSkillLocation(location)) paths = list(location);
      } catch {
        paths = null;
      }
      return { kind: location.kind, paths };
    });
    return {
      agent: agent.id,
      displayName: agent.displayName,
      skills: Object.values(workflows).flatMap((workflow) =>
        workflow.stages.flatMap((stage): StageSkillAvailability[] => {
          if (!stage.skill) return [];
          const name = /^\/([a-zA-Z0-9][a-zA-Z0-9._-]*)$/.exec(stage.skill)?.[1];
          const found =
            name &&
            locations.some(({ kind, paths }) =>
              paths?.includes(kind === "skills" ? `${name}/SKILL.md` : `${name}.md`),
            );
          const status = found
            ? "found"
            : !name || !locations.length || locations.some(({ paths }) => paths === null)
              ? "unknown"
              : "missing";
          return [
            {
              workflowId: workflow.id,
              stageId: stage.id,
              workflow: workflow.name,
              stage: stage.name,
              skill: stage.skill,
              status,
              ...(status === "missing"
                ? {
                    installationHint: `Use npx skills@latest add mattpocock/skills, select ${agent.displayName} and ${stage.skill}. Expected locations: ${(agent.skillLocations ?? []).map(({ base, path }) => `${base === "home" ? "~/" : "<project>/"}${path}/`).join(", ")}. For a custom skill, use its own source. Stintwork does not install skills.`,
                  }
                : {}),
            },
          ];
        }),
      ),
    };
  });
}
