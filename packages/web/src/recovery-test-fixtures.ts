// SPDX-License-Identifier: Apache-2.0
import {
  createMemoryRepoFiles,
  deriveAttentionItems,
  foldStintLog,
  indexProject,
  type Stint,
  type StintLaunch,
  type StintRecovery,
  summarizeStint,
} from "@stintwork/core";

export const recoveryPath = `/worktrees/${"long-directory-工程/".repeat(14)}agent`;
export const recoveryLaunch: StintLaunch = {
  agent: "codex",
  source: "installed",
  reason: "compatible",
  executable: { path: recoveryPath, version: "0.163.0", identity: "fixture" },
  adapterVersion: "2.1.1",
  adapterEntry: `${recoveryPath}/adapter.js`,
  cacheKey: "a".repeat(64),
  lockDigest: "b".repeat(64),
  host: { os: "darwin", arch: "arm64", libc: "none", node: "22", abi: "127" },
  permissionLevel: "ask",
};
export function recoveryStint(
  state: Exclude<StintRecovery["state"], undefined> = "resuming",
): Stint & { recovery: StintRecovery } {
  const stint = foldStintLog([
    {
      type: "started",
      at: "2026-10-26T10:00:00Z",
      stint: {
        id: "recovery-stint",
        workItem: "recovery",
        stage: "do",
        ticket: null,
        agent: "codex",
        worktree: { path: recoveryPath, branch: "stintwork/recovery" },
        baseCommit: "base",
        brief: {
          skill: null,
          pointers: [],
          lastHandoff: null,
          changedPaths: [],
          prompt: "Original brief 原文",
        },
      },
    },
    {
      type: "event",
      at: "2026-10-26T10:00:01Z",
      event: { type: "message_delta", id: "old:message", text: "Agent content 原文" },
    },
    {
      type: "recovery",
      version: 1,
      at: "2026-10-26T10:01:00Z",
      kind: "launch",
      launch: recoveryLaunch,
    },
    { type: "recovery", version: 1, at: "2026-10-26T10:02:00Z", kind: "resume", state },
  ]);
  if (!stint?.recovery) throw new Error("Expected recorded recovery fixture");
  return { ...stint, recovery: stint.recovery };
}
export function recoverySnapshot(stint: Stint = recoveryStint()) {
  const snapshot = indexProject(
    createMemoryRepoFiles({
      ".scratch/recovery/workflow.yaml": "workflow: quick\nstage: do\n",
      ".scratch/recovery/spec.md": "# Recovery 原文\n\nSpecification 原文",
    }),
    { name: "Recovery fixture" },
  );
  snapshot.workItems[0].activeStint = stint.status === "running" ? stint : null;
  snapshot.workItems[0].stints = [summarizeStint(stint)];
  snapshot.workItems[0].worktreePath = recoveryPath;
  snapshot.attentionItems = deriveAttentionItems(snapshot);
  return snapshot;
}
export function recoveryPermission(binding: "reconnecting" | "live" = "reconnecting") {
  return {
    type: "permission_request" as const,
    requestId: "permission",
    logicalRequestId: "logical",
    attemptId: binding === "live" ? "current" : "old",
    binding,
    toolCallId: "tool",
    title: "Agent command 原文",
    kind: "execute",
    raisedAt: "2026-10-26T10:00:02Z",
    automatic: false,
    at: "2026-10-26T10:00:02Z",
    details: JSON.stringify({ rawInput: { command: "echo 原文", cwd: recoveryPath } }),
    options: [
      { optionId: "yes", name: "Proceed 原文", kind: "allow_once" },
      { optionId: "no", name: "Reject 原文", kind: "reject_once" },
    ],
  };
}
