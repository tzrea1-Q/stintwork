// SPDX-License-Identifier: Apache-2.0
import { type AttentionItem, type ProjectSnapshot, summarizeStint } from "@stintwork/core";
import { attentionSnapshot } from "../src/attention-test-fixtures";
import { recoveryStint } from "../src/recovery-test-fixtures";
import { dialogSnapshot } from "./dialogs.fixture";

export const richClock = "2026-11-12T12:00:00Z";
export const richSnapshot: ProjectSnapshot = structuredClone(dialogSnapshot);
const base = richSnapshot.workItems[0];
const columns = ["clarify", "spec", "tickets", "implement", "review", "ship"] as const;
richSnapshot.workItems = columns.map((column, index) => {
  const slug = `rich-${column}`;
  const startedAt = new Date(Date.parse(richClock) - index * 86400000).toISOString();
  const stint = {
    ...recoveryStint(),
    id: `rich-stint-${index}`,
    workItem: slug,
    stage:
      richSnapshot.workflows[base.workflow].stages.find((stage) => stage.column === column)?.id ??
      column,
    startedAt,
  };
  return {
    ...structuredClone(base),
    slug,
    title: `Long work item ${column} with detailed acceptance criteria 工作项详细标题与验收标准`,
    column,
    stage: stint.stage,
    milestone: index < 3 ? "active" : "planned",
    activeStint: index === 0 ? stint : null,
    stints:
      index === 3
        ? []
        : [
            {
              ...summarizeStint(stint),
              status: index === 5 ? "stopped" : "finished",
              endedAt: startedAt,
            },
          ],
    tickets: [],
  };
});
const older = richSnapshot.workItems[0].stints[0];
richSnapshot.workItems[0].stints.push({
  ...older,
  id: "rich-stint-older",
  startedAt: "2026-11-06T12:00:00Z",
  endedAt: "2026-11-06T12:05:00Z",
});
richSnapshot.workItems[3].tickets = [
  {
    number: 1,
    slug: "ready",
    title: "Ready ticket",
    status: "ready-for-agent",
    resolved: false,
    blockedBy: [],
    blocked: false,
    comments: [],
    body: "Ready",
    path: ".scratch/rich-implement/issues/01-ready.md",
  },
];
const waiting = attentionSnapshot();
const waitingItem = waiting.workItems[0];
richSnapshot.workItems[1].activeStint = waitingItem.activeStint && {
  ...waitingItem.activeStint,
  workItem: richSnapshot.workItems[1].slug,
  startedAt: "2026-11-12T11:30:00Z",
};
richSnapshot.attentionItems = waiting.attentionItems
  .filter((item) => item.kind === "permission")
  .map((item) => ({
    ...item,
    workItem: richSnapshot.workItems[1].slug,
  }));
richSnapshot.workItems[2].tickets = [
  {
    number: 2,
    slug: "blocked",
    title: "Blocked ticket",
    status: "ready-for-agent",
    resolved: false,
    blockedBy: [1],
    blocked: true,
    comments: [],
    body: "Blocked",
    path: ".scratch/rich-tickets/issues/02-blocked.md",
  },
];
richSnapshot.milestones = [
  {
    id: "active",
    name: "Active milestone 活跃里程碑",
    status: "active",
    target: "2026-12-01",
    workItemSlugs: richSnapshot.workItems.slice(0, 3).map((item) => item.slug),
  },
  {
    id: "planned",
    name: "Planned milestone 计划里程碑",
    status: "planned",
    workItemSlugs: richSnapshot.workItems.slice(3).map((item) => item.slug),
  },
  { id: "shipped-1", name: "Shipped one 已交付一", status: "shipped", workItemSlugs: [] },
  { id: "shipped-2", name: "Shipped two 已交付二", status: "shipped", workItemSlugs: [] },
];

export function richSnapshotWithEveryKind(): ProjectSnapshot {
  const snapshot = structuredClone(richSnapshot);
  const [a0, a1, a2, a3] = snapshot.workItems;
  if (!a2.stage || !a3.stage) throw new Error("Rich fixture work items require stages");
  const agent = snapshot.attentionItems[0]?.agent ?? "claude";
  const raisedAt = "2026-11-12T09:10:00Z";
  const additions: AttentionItem[] = [
    {
      id: "handoff-1",
      kind: "handoff-unresolved",
      workItem: a2.slug,
      ticket: 2,
      stintId: a2.stints[0]?.id ?? "s",
      agent,
      title: "Unresolved handoff",
      details: "**Which export format?** The agent stopped before choosing CSV or JSON.",
      raisedAt,
    },
    {
      id: "checkpoint-1",
      kind: "checkpoint-warning",
      workItem: a0.slug,
      ticket: null,
      stintId: a0.stints[0]?.id ?? "s",
      agent,
      title: "Checkpoint warnings",
      details: "The checkpoint committed files that look risky.",
      raisedAt,
      warnings: [
        {
          path: ".env.local",
          reasons: ["likely-secret"],
          excluded: false,
          committed: true,
          commits: ["a".repeat(40), "b".repeat(40)],
        },
        { path: "dist/bundle.js", reasons: ["large-file", "generated-directory"], excluded: true },
      ],
    },
    {
      id: "memory-1",
      kind: "memory-proposal",
      workItem: a1.slug,
      ticket: null,
      stintId: a1.stints[0]?.id ?? "s",
      agent,
      title: "Memory proposal: AGENTS.md",
      details: "Record that e2e runs need port 4500.",
      raisedAt,
      path: "AGENTS.md",
      diff: "@@ -1,3 +1,4 @@\n # Working\n+Use port 4500 for parallel e2e runs.\n",
      baseCommit: "abc1234",
      checkpointCommit: "def5678",
    },
    {
      id: "gate-1",
      kind: "gate-ready",
      workItem: a3.slug,
      ticket: null,
      stintId: null,
      agent: null,
      title: "Gate ready",
      details: "",
      raisedAt,
      stage: a3.stage,
    },
    {
      id: "stale-1",
      kind: "approval-stale",
      workItem: a2.slug,
      ticket: null,
      stintId: null,
      agent: null,
      title: "Approval stale",
      details: "",
      raisedAt: "2026-11-09T09:10:00Z",
      stage: a2.stage,
    },
    {
      id: "login-1",
      kind: "login-required",
      workItem: null,
      ticket: null,
      stintId: null,
      agent,
      title: "Login required",
      details: "Run the login command, then refresh availability.",
      raisedAt,
      loginCommand: "claude /login",
    },
  ];
  const existing = new Set(snapshot.attentionItems.map((item) => item.kind));
  snapshot.attentionItems.push(...additions.filter((item) => !existing.has(item.kind)));
  return snapshot;
}
