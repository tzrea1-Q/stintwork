import {
  createMemoryRepoFiles,
  indexProject,
  type AgentProfile,
  type StintLogEntry,
} from "@stintwork/core";

export const attentionProfile: AgentProfile = {
  id: "custom-agent",
  displayName: "Test Agent",
  installationHint: "Install the test agent",
  capabilities: {
    modes: [],
    defaultMode: null,
    additionalDirectories: false,
    permissionOptions: null,
    declineEndsTurn: true,
    authenticationRequired: {
      message: "Authentication required",
      loginCommand: "test-agent login",
    },
    configOptions: [],
  },
};
export const attentionOptions = [
  { optionId: "allow_once", name: "Yes, proceed", kind: "allow_once" },
  { optionId: "allow_always", name: "Yes, always allow this prefix", kind: "allow_always" },
  { optionId: "cancel", name: "No, do something different", kind: "reject_once" },
];

export function attentionSnapshot(requestIds = ["request"], profile = attentionProfile) {
  const entries: StintLogEntry[] = [
    {
      type: "started",
      at: "2026-10-09T10:00:00Z",
      stint: {
        id: "stint",
        workItem: "first",
        stage: "implement",
        ticket: 1,
        agent: profile.id,
        worktree: { path: "/worktree", branch: "stintwork/first" },
        baseCommit: "base",
        brief: { prompt: "Work", skill: null, pointers: [], changedPaths: [], lastHandoff: null },
      },
    },
    ...requestIds.map(
      (requestId): StintLogEntry => ({
        type: "event",
        at: "2026-10-09T10:15:00Z",
        event: {
          type: "permission_request",
          requestId,
          toolCallId: "tool",
          title: `Check project ${requestId}`,
          kind: "execute",
          automatic: false,
          details: "pnpm test --filter /full/path/to/project\n/full/path/to/file.ts",
          options: attentionOptions,
        },
      }),
    ),
  ];
  return indexProject(
    createMemoryRepoFiles({
      ".scratch/first/spec.md": "# First work item",
      ".scratch/first/issues/01-first.md":
        "# First ticket\nStatus: ready-for-agent\nBlocked by: none",
      ".stintwork/local/stints/stint.jsonl": entries
        .map((entry) => JSON.stringify(entry))
        .join("\n"),
    }),
    { name: "Project", agents: [profile] },
  );
}
