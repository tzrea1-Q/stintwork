import type { ProjectSnapshot } from "./project.js";
import type { StintEvent } from "./stints.js";
import { hasUnresolvedHandoff } from "./developer-notes.js";
import type { StageId } from "./workflows.js";
import { deriveGateAttentionItems } from "./gates.js";
import type { MemoryProposalAttentionItem } from "./memory-proposals.js";

export type AttentionItemSource = {
  id: string;
  workItem: string | null;
  ticket: number | null;
  stintId: string | null;
  agent: string | null;
  title: string;
  details: string;
  raisedAt: string;
};

export type PermissionAttentionItem = AttentionItemSource & {
  kind: "permission";
  workItem: string;
  stintId: string;
  agent: string;
  requestId: string;
  options: Extract<StintEvent, { type: "permission_request" }>["options"];
};

export type LoginRequiredAttentionItem = AttentionItemSource & {
  kind: "login-required";
  agent: string;
  workItem: null;
  ticket: null;
  stintId: null;
  loginCommand: string;
};

export type HandoffUnresolvedAttentionItem = AttentionItemSource & {
  kind: "handoff-unresolved";
  workItem: string;
  stintId: string;
  agent: string;
};

export type GateAttentionItem = AttentionItemSource & {
  kind: "gate-ready";
  workItem: string;
  stage: StageId;
};
export type AttentionItem =
  | PermissionAttentionItem
  | HandoffUnresolvedAttentionItem
  | GateAttentionItem
  | MemoryProposalAttentionItem
  | LoginRequiredAttentionItem;

export function deriveAttentionItems(
  snapshot: Pick<ProjectSnapshot, "workItems"> &
    Partial<Pick<ProjectSnapshot, "agents" | "workflows">>,
): AttentionItem[] {
  const workItemAttention = snapshot.workItems.flatMap<AttentionItem>((item) => {
    if (item.merged) return [];
    // An unresolved handoff is answered by a later stint that started from it (same ticket,
    // or same stage for stage-level stints); that later stint raises its own item if needed.
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
    const proposals = item.memoryProposals ?? [];
    if (stint?.status !== "running") return [...handoffs, ...proposals];
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
      ...proposals,
      ...[...requests.values()]
        .filter((request) => !request.automatic && !answered.has(request.requestId))
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
  });
  const logins: LoginRequiredAttentionItem[] = (snapshot.agents ?? [])
    .filter(
      (agent) =>
        agent.availability?.available === false && agent.availability.kind === "login-required",
    )
    .map((agent) => ({
      kind: "login-required",
      id: `login-required:${JSON.stringify(agent.id)}`,
      agent: agent.id,
      workItem: null,
      ticket: null,
      stintId: null,
      title: `${agent.displayName} needs a login`,
      details:
        agent.availability?.reason ??
        `Sign in with ${agent.capabilities.authenticationRequired.loginCommand}.`,
      raisedAt: agent.availability?.checkedAt ?? "1970-01-01T00:00:00.000Z",
      loginCommand: agent.capabilities.authenticationRequired.loginCommand,
    }));
  return [...workItemAttention, ...deriveGateAttentionItems(snapshot), ...logins].sort(
    (first, second) =>
      first.raisedAt.localeCompare(second.raisedAt) || first.id.localeCompare(second.id),
  );
}
