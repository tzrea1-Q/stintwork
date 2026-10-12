// SPDX-License-Identifier: Apache-2.0
import type { Brief, BriefHandoff } from "./brief.js";
import { isReviewFindings, type ReviewFindings } from "./findings.js";
import type { RepoFiles, Warning } from "./work-items.js";
import { isPermissionLevel } from "./permission-levels.js";
import {
  isRichStintEvent,
  type RichStintEvent,
  type StintToolUpdate,
} from "./rich-stint-events.js";

export type StintStatus = "running" | "finished" | "stopped" | "failed" | "interrupted";
export type CheckpointWarning = {
  path: string;
  reasons: ("likely-secret" | "large-file" | "generated-directory")[];
} & ({ excluded: true } | { excluded: false; committed: true; commits: string[] });

export type RiskyPath = Pick<CheckpointWarning, "path" | "reasons"> & { blob: string };

export function isRiskyPaths(value: unknown): value is RiskyPath[] {
  return (
    Array.isArray(value) &&
    value.every(
      (risk) =>
        risk &&
        typeof risk === "object" &&
        typeof risk.blob === "string" &&
        /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(risk.blob) &&
        Object.keys(risk).every((key) => ["path", "reasons", "blob"].includes(key)) &&
        isCheckpointWarnings([{ path: risk.path, reasons: risk.reasons, excluded: true }]),
    )
  );
}

export function isCheckpointWarnings(value: unknown): value is CheckpointWarning[] {
  return (
    Array.isArray(value) &&
    value.every(
      (warning) =>
        warning &&
        typeof warning === "object" &&
        typeof warning.path === "string" &&
        warning.path.length > 0 &&
        !warning.path.startsWith("/") &&
        !warning.path.includes("\0") &&
        !warning.path.split("/").some((part: string) => part === ".." || part === ".") &&
        (warning.excluded === true ||
          (warning.excluded === false &&
            warning.committed === true &&
            Array.isArray(warning.commits) &&
            warning.commits.length > 0 &&
            warning.commits.every(
              (commit: unknown) =>
                typeof commit === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit),
            ))) &&
        Array.isArray(warning.reasons) &&
        warning.reasons.length > 0 &&
        warning.reasons.every(
          (reason: unknown) =>
            typeof reason === "string" &&
            ["likely-secret", "large-file", "generated-directory"].includes(reason),
        ) &&
        Object.keys(warning).every((key) =>
          (warning.excluded
            ? ["path", "reasons", "excluded"]
            : ["path", "reasons", "excluded", "committed", "commits"]
          ).includes(key),
        ),
    )
  );
}
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
  checkpointWarnings?: CheckpointWarning[];
  brief: Brief;
  events: StintEvent[];
  handoff: BriefHandoff | null;
  handoffAnswer?: { at: string; note: string | null };
  handoffError?: string;
  findings?: ReviewFindings;
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
  | "checkpointWarnings"
  | "handoff"
  | "handoffError"
  | "handoffAnswer"
  | "findings"
> & { lastHandoffStintId?: string };
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
  | { type: "handoff_answered"; at: string; note: string | null }
  | {
      type: "ended";
      at: string;
      status: Exclude<StintStatus, "running">;
      stopReason?: string;
      error?: string;
      checkpointCommit?: string;
      checkpointWarnings?: CheckpointWarning[];
      handoff?: BriefHandoff | null;
      handoffError?: string;
      findings?: ReviewFindings;
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
  if (entry.type === "handoff_answered")
    return stint && stint.status !== "running" && stint.handoff && !stint.handoffAnswer
      ? { ...stint, handoffAnswer: { at: entry.at, note: entry.note } }
      : stint;
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
    ...(entry.checkpointWarnings ? { checkpointWarnings: entry.checkpointWarnings } : {}),
    handoff: entry.handoff ?? null,
    ...(entry.findings ? { findings: entry.findings } : {}),
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
    ...(stint.checkpointWarnings ? { checkpointWarnings: stint.checkpointWarnings } : {}),
    handoff: stint.handoff,
    ...(stint.findings ? { findings: stint.findings } : {}),
    ...(stint.brief.lastHandoff ? { lastHandoffStintId: stint.brief.lastHandoff.stint } : {}),
    ...(stint.handoffAnswer ? { handoffAnswer: stint.handoffAnswer } : {}),
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
  if (entry.type === "handoff_answered")
    return (
      !Number.isNaN(Date.parse(entry.at)) &&
      (entry.note === null || (typeof entry.note === "string" && entry.note.trim().length > 0))
    );
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
      (entry.checkpointWarnings === undefined || isCheckpointWarnings(entry.checkpointWarnings)) &&
      (entry.findings === undefined || isReviewFindings(entry.findings)) &&
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
    (brief.permissionLevel === undefined || isPermissionLevel(brief.permissionLevel)) &&
    (brief.developerNotes === undefined ||
      (Array.isArray(brief.developerNotes) &&
        brief.developerNotes.every(
          (note) =>
            note &&
            typeof note === "object" &&
            ["id", "at", "text"].every((key) => typeof note[key] === "string") &&
            (note.source === undefined || note.source === "review"),
        ))) &&
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
