// SPDX-License-Identifier: Apache-2.0
import type { BoardColumn, ProjectSnapshot } from "@stintwork/core";
import { richSnapshot } from "./rich.fixture";

export function moveMotionCard(snapshot: ProjectSnapshot, index: number, column: BoardColumn) {
  const item = snapshot.workItems[index];
  const stage = snapshot.workflows[item.workflow].stages.find((entry) => entry.column === column);
  if (!stage) throw new Error(`Missing stage for ${column}`);
  item.column = column;
  item.stage = stage.id;
}

export function motionBoardSnapshot() {
  const snapshot = structuredClone(richSnapshot);
  const template = snapshot.workItems.find((item) => item.column === "spec" && !item.merged);
  if (!template) throw new Error("Missing fixture card");
  snapshot.attentionItems = [];
  snapshot.workItems = Array.from({ length: 60 }, (_, index) => ({
    ...structuredClone(template),
    slug: `motion-${index}`,
    activeStint: null,
    stints: [],
    milestone: "active",
  }));
  snapshot.workItems.forEach((_, index) => {
    moveMotionCard(snapshot, index, index < 30 ? "spec" : "tickets");
  });
  snapshot.milestones.forEach((milestone) => {
    milestone.workItemSlugs =
      milestone.id === "active" ? snapshot.workItems.map((item) => item.slug) : [];
  });
  return { snapshot, template: structuredClone(snapshot.workItems[0]) };
}
