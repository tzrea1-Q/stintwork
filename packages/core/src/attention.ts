import type { ProjectSnapshot } from "./project.js";
import type { StintEvent } from "./stints.js";
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

export type GateAttentionItem = AttentionItemSource & { kind: "gate-ready"; stage: StageId };
export type AttentionItem = PermissionAttentionItem | GateAttentionItem;

export function deriveAttentionItems(
  snapshot: Pick<ProjectSnapshot, "workItems">,
): AttentionItem[] {
  return snapshot.workItems
    .flatMap((item): AttentionItem[] => {
      const stint = item.activeStint;
      if (stint?.status !== "running") return [];
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
      return [...requests.values()]
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
        );
    })
    .concat(deriveGateAttentionItems(snapshot))
    .sort(
      (first, second) =>
        first.raisedAt.localeCompare(second.raisedAt) || first.id.localeCompare(second.id),
    );
}
