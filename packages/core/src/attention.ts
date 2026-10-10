import type { ProjectSnapshot } from "./project.js";
import type { StintEvent } from "./stints.js";
import { hasUnresolvedHandoff } from "./developer-notes.js";
import type { StageId } from "./workflows.js";
import { deriveGateAttentionItems } from "./gates.js";

export type AttentionItemSource = {
  id: string;
  workItem: string;
  ticket: number | null;
  stintId: string | null;
  agent: string | null;
  title: string;
  details: string;
  raisedAt: string;
};

export type PermissionAttentionItem = AttentionItemSource & {
  kind: "permission";
  stintId: string;
  agent: string;
  requestId: string;
  options: Extract<StintEvent, { type: "permission_request" }>["options"];
};

export type HandoffUnresolvedAttentionItem = AttentionItemSource & {
  kind: "handoff-unresolved";
  stintId: string;
  agent: string;
};

export type GateAttentionItem = AttentionItemSource & { kind: "gate-ready"; stage: StageId };
export type AttentionItem =
  | PermissionAttentionItem
  | HandoffUnresolvedAttentionItem
  | GateAttentionItem;

export function deriveAttentionItems(
  snapshot: Pick<ProjectSnapshot, "workItems">,
): AttentionItem[] {
  return snapshot.workItems
    .flatMap<AttentionItem>((item) => {
      const stintsById = new Map(item.stints.map((stint) => [stint.id, stint]));
      const supersededHandoffs = new Set(
        item.stints.flatMap((later) => {
          const earlier = later.lastHandoffStintId && stintsById.get(later.lastHandoffStintId);
          return earlier &&
            later.id !== earlier.id &&
            later.workItem === earlier.workItem &&
            later.ticket === earlier.ticket &&
            (earlier.ticket !== null || later.stage === earlier.stage) &&
            Date.parse(later.startedAt) >= Date.parse(earlier.endedAt ?? earlier.startedAt)
            ? [earlier.id]
            : [];
        }),
      );
      const handoffs: HandoffUnresolvedAttentionItem[] = item.stints
        .filter(
          (stint) =>
            stint.status !== "running" &&
            !stint.handoffAnswer &&
            !supersededHandoffs.has(stint.id) &&
            stint.handoff &&
            hasUnresolvedHandoff(stint.handoff.unresolved),
        )
        .map((stint) => ({
          kind: "handoff-unresolved",
          id: `handoff-unresolved:${stint.id}`,
          workItem: item.slug,
          ticket: stint.ticket,
          stintId: stint.id,
          agent: stint.agent,
          title: "Unresolved handoff",
          details: stint.handoff?.unresolved ?? "",
          raisedAt: stint.endedAt ?? stint.startedAt,
        }));
      const stint = item.activeStint;
      if (stint?.status !== "running") return handoffs;
      const answered = new Set(
        stint.events.flatMap((event) =>
          event.type === "permission" && event.requestId ? [event.requestId] : [],
        ),
      );
      const requests = new Map(
        stint.events.flatMap((event) =>
          event.type === "permission_request" ? [[event.requestId, event] as const] : [],
        ),
      );
      return [
        ...handoffs,
        ...[...requests.values()]
          .filter((request) => !answered.has(request.requestId))
          .map(
            (request): PermissionAttentionItem => ({
              kind: "permission",
              id: `permission:${JSON.stringify([stint.id, request.requestId])}`,
              workItem: item.slug,
              ticket: stint.ticket,
              stintId: stint.id,
              agent: stint.agent,
              requestId: request.requestId,
              title: request.title ?? "Permission requested",
              details: request.details ?? request.title ?? request.toolCallId,
              raisedAt: request.raisedAt ?? stint.startedAt,
              options: request.options,
            }),
          ),
      ];
    })
    .concat(deriveGateAttentionItems(snapshot))
    .sort(
      (first, second) =>
        first.raisedAt.localeCompare(second.raisedAt) || first.id.localeCompare(second.id),
    );
}
