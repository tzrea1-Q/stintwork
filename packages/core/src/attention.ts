import type { ProjectSnapshot } from "./project.js";
import type { StintEvent } from "./stints.js";

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
  loginCommand: string;
};

export type AttentionItem = PermissionAttentionItem | LoginRequiredAttentionItem;

export function deriveAttentionItems(
  snapshot: Pick<ProjectSnapshot, "workItems"> & Partial<Pick<ProjectSnapshot, "agents">>,
): AttentionItem[] {
  const permissions = snapshot.workItems.flatMap((item) => {
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
  });
  const logins = (snapshot.agents ?? []).flatMap((agent): LoginRequiredAttentionItem[] => {
    const latest = snapshot.workItems
      .flatMap((item) => item.stints)
      .filter((stint) => stint.agent === agent.id)
      .sort((first, second) => second.startedAt.localeCompare(first.startedAt))[0];
    const authFailure =
      latest?.status === "failed" && /authentication required/i.test(latest.error ?? "");
    const availability = agent.availability;
    const checkedAfter =
      availability?.checkedAt && availability.checkedAt >= (latest?.endedAt ?? "");
    if (availability?.status !== "login-required" && (!authFailure || checkedAfter)) return [];
    const source = authFailure ? latest : undefined;
    const raisedAt =
      source?.endedAt ??
      (availability?.status === "login-required" ? availability.checkedAt : undefined);
    if (!raisedAt) return [];
    return [
      {
        kind: "login-required",
        id: `login-required:${JSON.stringify(agent.id)}`,
        workItem: source?.workItem ?? null,
        ticket: source?.ticket ?? null,
        stintId: source?.id ?? null,
        agent: agent.id,
        title: `${agent.displayName} needs you to log in`,
        details: `Sign in with ${agent.capabilities.authenticationRequired.loginCommand}, then refresh the agent’s availability.`,
        loginCommand: agent.capabilities.authenticationRequired.loginCommand,
        raisedAt,
      },
    ];
  });
  return [...permissions, ...logins].sort(
    (first, second) =>
      first.raisedAt.localeCompare(second.raisedAt) || first.id.localeCompare(second.id),
  );
}
