export type WorkflowId = "feature" | "bug" | "quick";
export type BoardColumn = "clarify" | "spec" | "tickets" | "implement" | "review" | "ship";
export type StageId = BoardColumn | "diagnose" | "fix" | "do";

export type WorkflowStage = { id: StageId; name: string; column: BoardColumn };
export type WorkflowDefinition = {
  id: WorkflowId;
  name: string;
  stages: readonly WorkflowStage[];
};

export const builtInWorkflows = {
  feature: {
    id: "feature",
    name: "Feature",
    stages: [
      { id: "clarify", name: "Clarify", column: "clarify" },
      { id: "spec", name: "Spec", column: "spec" },
      { id: "tickets", name: "Tickets", column: "tickets" },
      { id: "implement", name: "Implement", column: "implement" },
      { id: "review", name: "Review", column: "review" },
      { id: "ship", name: "Ship", column: "ship" },
    ],
  },
  bug: {
    id: "bug",
    name: "Bug",
    stages: [
      { id: "diagnose", name: "Diagnose", column: "clarify" },
      { id: "fix", name: "Fix", column: "implement" },
      { id: "review", name: "Review", column: "review" },
      { id: "ship", name: "Ship", column: "ship" },
    ],
  },
  quick: {
    id: "quick",
    name: "Quick",
    stages: [
      { id: "do", name: "Do", column: "implement" },
      { id: "review", name: "Review", column: "review" },
      { id: "ship", name: "Ship", column: "ship" },
    ],
  },
} as const satisfies Record<WorkflowId, WorkflowDefinition>;
