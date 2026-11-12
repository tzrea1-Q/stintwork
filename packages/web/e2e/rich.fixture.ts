// SPDX-License-Identifier: Apache-2.0
import { type ProjectSnapshot, summarizeStint } from "@stintwork/core";
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
