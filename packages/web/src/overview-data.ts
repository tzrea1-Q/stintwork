// SPDX-License-Identifier: Apache-2.0
import type { ProjectSnapshot } from "@stintwork/core";

export function viewFromSearch(search: string): "overview" | "pipeline" {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  return view === "pipeline" || (view === null && params.has("item")) ? "pipeline" : "overview";
}

export function ticketsUnavailable(item: ProjectSnapshot["workItems"][number]) {
  return (
    item.github?.ticketsKnown === false ||
    !!item.github?.ticketsStale ||
    !!item.github?.dependenciesUnknown
  );
}

export function workItemDone(item: ProjectSnapshot["workItems"][number]): boolean {
  return (
    !!item.merged ||
    (!ticketsUnavailable(item) &&
      item.tickets.length > 0 &&
      item.tickets.every((ticket) => ticket.resolved))
  );
}

export function overviewData(snapshot: ProjectSnapshot) {
  const active = snapshot.workItems.filter((item) => !item.merged);
  const milestones = snapshot.milestones
    .map((milestone) => {
      const items = snapshot.workItems.filter((item) => item.milestone === milestone.id);
      return {
        milestone,
        total: items.length,
        resolved: items.filter(workItemDone).length,
        incomplete: items.some(ticketsUnavailable),
      };
    })
    .sort((a, b) => {
      const rank = { active: 0, planned: 1, shipped: 2 };
      return rank[a.milestone.status] - rank[b.milestone.status];
    });
  const columns = (["clarify", "spec", "tickets", "implement", "review", "ship"] as const)
    .map((column) => ({ column, count: active.filter((item) => item.column === column).length }))
    .filter(({ count }) => count > 0);
  // Rank by milestone status, then roadmap order, then snapshot order.
  const ordered = [...snapshot.workItems].sort((a, b) => {
    const rank = (id: string | undefined) => {
      const index = snapshot.milestones.findIndex((milestone) => milestone.id === id);
      const milestone = snapshot.milestones[index];
      return {
        status: milestone ? { active: 0, planned: 1, shipped: 3 }[milestone.status] : 2,
        index,
      };
    };
    const left = rank(a.milestone);
    const right = rank(b.milestone);
    return left.status - right.status || left.index - right.index;
  });
  const next = ordered.find(
    (item) =>
      !item.merged &&
      !item.activeStint &&
      item.stints.length === 0 &&
      !snapshot.attentionItems.some((attention) => attention.workItem === item.slug) &&
      (item.tickets.length === 0 ||
        item.tickets.some((ticket) => !ticket.resolved && !ticket.blocked)),
  );
  const running = active.filter((item) => item.activeStint);
  const activity = snapshot.workItems
    .flatMap((item) =>
      item.stints.map((stint) => ({ item, stint, at: stint.endedAt || stint.startedAt })),
    )
    .filter(({ at }) => at && Number.isFinite(Date.parse(at)))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 5);
  return {
    milestones,
    columns,
    next,
    running,
    activity,
    attention: snapshot.attentionItems.slice(0, 3),
  };
}
