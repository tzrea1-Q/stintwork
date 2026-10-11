// SPDX-License-Identifier: Apache-2.0
export type WorkflowId = "feature" | "bug" | "quick";
export type BoardColumn = "clarify" | "spec" | "tickets" | "implement" | "review" | "ship";
export type StageId = BoardColumn | "diagnose" | "fix" | "do";

export type WorkflowStage = {
  id: StageId;
  name: string;
  column: BoardColumn;
  skill: string | null;
};
export type WorkflowDefinition = {
  id: WorkflowId;
  name: string;
  defaultAgent: string;
  stages: readonly WorkflowStage[];
};

export const builtInWorkflows = {
  feature: {
    id: "feature",
    name: "Feature",
    defaultAgent: "codex",
    stages: [
      { id: "clarify", name: "Clarify", column: "clarify", skill: "/grill-with-docs" },
      { id: "spec", name: "Spec", column: "spec", skill: "/to-spec" },
      { id: "tickets", name: "Tickets", column: "tickets", skill: "/to-tickets" },
      { id: "implement", name: "Implement", column: "implement", skill: "/implement" },
      { id: "review", name: "Review", column: "review", skill: "/code-review" },
      { id: "ship", name: "Ship", column: "ship", skill: null },
    ],
  },
  bug: {
    id: "bug",
    name: "Bug",
    defaultAgent: "codex",
    stages: [
      { id: "diagnose", name: "Diagnose", column: "clarify", skill: "/diagnosing-bugs" },
      { id: "fix", name: "Fix", column: "implement", skill: "/tdd" },
      { id: "review", name: "Review", column: "review", skill: "/code-review" },
      { id: "ship", name: "Ship", column: "ship", skill: null },
    ],
  },
  quick: {
    id: "quick",
    name: "Quick",
    defaultAgent: "codex",
    stages: [
      { id: "do", name: "Do", column: "implement", skill: null },
      { id: "review", name: "Review", column: "review", skill: "/code-review" },
      { id: "ship", name: "Ship", column: "ship", skill: null },
    ],
  },
} as const satisfies Record<WorkflowId, WorkflowDefinition>;
