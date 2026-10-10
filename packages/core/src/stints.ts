import type { Brief, BriefHandoff } from "./brief.js";
import type { RepoFiles, Warning } from "./work-items.js";
import {
  isRichStintEvent,
  type RichStintEvent,
  type StintToolUpdate,
} from "./rich-stint-events.js";

export type StintStatus = "running" | "finished" | "stopped" | "failed" | "interrupted";
export type StintEvent =
  | RichStintEvent
  | { type: "message" | "thought"; id: string; text: string }
  | {
      type: "permission";
      requestId?: string;
      toolCallId: string;
      title: string | null;
      kind: string | null;
      automatic: boolean;
      decision:
        | { outcome: "selected"; optionId: string; kind: string }
        | { outcome: "cancelled" }
        | { outcome: "failed"; reason: string };
    }
  | { type: "other"; kind: string; update: Record<string, unknown> };
export type StintLogEvent =
  | StintToolUpdate
  | { type: "message_delta" | "thought_delta"; id: string; text: string }
  | StintEvent;
export type Stint = {
  id: string;
  workItem: string;
  stage: string;
  ticket: number | null;
  agent: string;
  status: StintStatus;
  startedAt: string;
  endedAt: string | null;
  worktree: { path: string; branch: string };
  baseCommit: string;
  checkpointCommit: string | null;
  brief: Brief;
  events: StintEvent[];
  handoff: BriefHandoff | null;
  handoffError?: string;
  error?: string;
};
export type StintSummary = Pick<
  Stint,
  | "id"
  | "workItem"
  | "stage"
  | "ticket"
  | "agent"
  | "status"
  | "startedAt"
  | "endedAt"
  | "error"
  | "checkpointCommit"
  | "handoff"
  | "handoffError"
>;
export type StintLogEntry =
  | {
      type: "started";
      at: string;
      stint: Pick<
        Stint,
        "id" | "workItem" | "stage" | "ticket" | "agent" | "worktree" | "baseCommit" | "brief"
      >;
    }
  | { type: "event"; at: string; event: StintLogEvent }
  | {
      type: "ended";
      at: string;
      status: Exclude<StintStatus, "running">;
      stopReason?: string;
      error?: string;
      checkpointCommit?: string;
      handoff?: BriefHandoff | null;
      handoffError?: string;
    };
export type StintLiveMessage = {
  type: "stint";
  stintId: string;
  workItem: string;
  sequence: number;
  entry: StintLogEntry;
};

export function mergeStintEvent(events: readonly StintEvent[], event: StintLogEvent): StintEvent[] {
  if (event.type === "other" || event.type === "permission" || event.type === "permission_request")
    return [...events, event];
  if (
    event.type === "plan" ||
    event.type === "file_edit" ||
    event.type === "tool_call" ||
    event.type === "tool_call_update"
  ) {
    const normalized: StintEvent =
      event.type === "tool_call_update" ? { ...event, type: "tool_call" } : event;
    const index = events.findIndex((previous) =>
      normalized.type === "plan"
        ? previous.type === "plan" && previous.id === normalized.id
        : normalized.type === "file_edit"
          ? previous.type === "file_edit" &&
            previous.toolCallId === normalized.toolCallId &&
            previous.path === normalized.path
          : previous.type === "tool_call" && previous.toolCallId === normalized.toolCallId,
    );
    return index < 0
      ? [...events, normalized]
      : events.map((previous, position) =>
          position === index ? ({ ...previous, ...normalized } as StintEvent) : previous,
        );
  }
  const delta = event.type === "message_delta" || event.type === "thought_delta";
  const type =
    event.type === "message_delta"
      ? "message"
      : event.type === "thought_delta"
        ? "thought"
        : event.type;
  const message: Extract<StintEvent, { text: string }> = { type, id: event.id, text: event.text };
  const index = events.findIndex(
    (previous) => previous.type === type && "id" in previous && previous.id === event.id,
  );
  return index < 0
    ? [...events, message]
    : events.map((previous, position) =>
        position === index
          ? {
              ...message,
              text: delta && "text" in previous ? previous.text + event.text : event.text,
            }
          : previous,
      );
}

export function applyStintLogEntry(stint: Stint | null, entry: StintLogEntry): Stint | null {
  if (entry.type === "started") {
    return (
      stint ?? {
        ...entry.stint,
        status: "running",
        startedAt: entry.at,
        endedAt: null,
        checkpointCommit: null,
        handoff: null,
        events: [],
      }
    );
  }
  if (stint?.status !== "running") return stint;
  if (entry.type === "event")
    return {
      ...stint,
      events: mergeStintEvent(
        stint.events,
        entry.event.type === "permission_request"
          ? { ...entry.event, raisedAt: entry.event.raisedAt ?? entry.at }
          : entry.event,
      ),
    };
  return {
    ...stint,
    status: entry.status,
    endedAt: entry.at,
    checkpointCommit: entry.checkpointCommit ?? null,
    handoff: entry.handoff ?? null,
    ...(entry.handoffError ? { handoffError: entry.handoffError } : {}),
    ...(entry.error ? { error: entry.error } : {}),
  };
}

export function foldStintLog(entries: readonly StintLogEntry[]): Stint | null {
  return entries.reduce<Stint | null>(applyStintLogEntry, null);
}

export function summarizeStint(stint: Stint): StintSummary {
  const { id, workItem, stage, ticket, agent, status, startedAt, endedAt, error } = stint;
  return {
    id,
    workItem,
    stage,
    ticket,
    agent,
    status,
    startedAt,
    endedAt,
    checkpointCommit: stint.checkpointCommit,
    handoff: stint.handoff,
    ...(stint.handoffError ? { handoffError: stint.handoffError } : {}),
    ...(error ? { error } : {}),
  };
}

export function isStintEvent(value: unknown): value is StintEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  if (isRichStintEvent(event)) return true;
  if (event.type === "permission") {
    const decision = event.decision as Record<string, unknown> | undefined;
    return (
      typeof event.toolCallId === "string" &&
      (event.title === null || typeof event.title === "string") &&
      (event.kind === null || typeof event.kind === "string") &&
      typeof event.automatic === "boolean" &&
      (event.requestId === undefined || typeof event.requestId === "string") &&
      !!decision &&
      (decision.outcome === "cancelled" ||
        (decision.outcome === "failed" && typeof decision.reason === "string") ||
        (decision.outcome === "selected" &&
          typeof decision.optionId === "string" &&
          typeof decision.kind === "string"))
    );
  }
  return event.type === "other"
    ? typeof event.kind === "string" &&
        !!event.update &&
        typeof event.update === "object" &&
        !Array.isArray(event.update)
    : (event.type === "message" || event.type === "thought") &&
        typeof event.id === "string" &&
        typeof event.text === "string";
}

export function isStintLogEntry(value: unknown): value is StintLogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.at !== "string") return false;
  if (entry.type === "event") {
    if (isStintEvent(entry.event)) return true;
    if (!entry.event || typeof entry.event !== "object") return false;
    const event = entry.event as Record<string, unknown>;
    if (isRichStintEvent(event, true)) return true;
    return (
      (event.type === "message_delta" || event.type === "thought_delta") &&
      typeof event.id === "string" &&
      typeof event.text === "string"
    );
  }
  if (entry.type === "ended")
    return (
      ["finished", "stopped", "failed", "interrupted"].includes(String(entry.status)) &&
      ["error", "stopReason", "checkpointCommit", "handoffError"].every(
        (key) => entry[key] === undefined || typeof entry[key] === "string",
      ) &&
      (entry.handoff === undefined || entry.handoff === null || isBriefHandoff(entry.handoff))
    );
  if (entry.type !== "started" || !entry.stint || typeof entry.stint !== "object") return false;
  const stint = entry.stint as Record<string, unknown>;
  const worktree = stint.worktree as Record<string, unknown> | undefined;
  const brief = stint.brief as Record<string, unknown> | undefined;
  return (
    ["id", "workItem", "stage", "agent", "baseCommit"].every(
      (key) => typeof stint[key] === "string",
    ) &&
    (stint.ticket === null ||
      (Number.isSafeInteger(stint.ticket) && (stint.ticket as number) > 0)) &&
    typeof worktree?.path === "string" &&
    typeof worktree.branch === "string" &&
    typeof brief?.prompt === "string" &&
    (brief.checkpointCommit == null || typeof brief.checkpointCommit === "string") &&
    (brief.skill === null || typeof brief.skill === "string") &&
    (brief.lastHandoff === null || isBriefHandoff(brief.lastHandoff)) &&
    Array.isArray(brief.changedPaths) &&
    brief.changedPaths.every((path) => typeof path === "string") &&
    Array.isArray(brief.pointers) &&
    brief.pointers.every(
      (pointer) =>
        pointer &&
        typeof pointer === "object" &&
        typeof pointer.path === "string" &&
        typeof pointer.reason === "string",
    )
  );
}

export function isBriefHandoff(value: unknown): value is BriefHandoff {
  return (
    !!value &&
    typeof value === "object" &&
    ["stint", "agent", "stoppedAt", "unresolved", "nextStep"].every(
      (key) => typeof (value as Record<string, unknown>)[key] === "string",
    )
  );
}

export function indexStints(files: RepoFiles): { stints: Stint[]; warnings: Warning[] } {
  const stints: Stint[] = [];
  const warnings: Warning[] = [];
  const prefix = ".stintwork/local/stints/";
  try {
    for (const path of files.list(prefix).filter((path) => path.endsWith(".jsonl"))) {
      try {
        const entries: StintLogEntry[] = [];
        for (const line of (files.read(path) ?? "").split("\n").filter(Boolean)) {
          try {
            const entry: unknown = JSON.parse(line);
            if (!isStintLogEntry(entry)) throw new Error("Invalid stint log entry");
            entries.push(entry);
          } catch {
            warnings.push({ path, message: "Invalid stint log entry; skipped" });
          }
        }
        const stint = foldStintLog(entries);
        if (stint) stints.push(stint);
      } catch (error) {
        warnings.push({ path, message: `Cannot read stint log: ${String(error)}` });
      }
    }
  } catch (error) {
    warnings.push({ path: prefix, message: `Cannot list stint logs: ${String(error)}` });
  }
  stints.sort(
    (first, second) =>
      second.startedAt.localeCompare(first.startedAt) || second.id.localeCompare(first.id),
  );
  return { stints, warnings };
}
